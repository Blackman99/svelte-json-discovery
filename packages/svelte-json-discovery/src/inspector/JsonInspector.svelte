<script lang='ts'>
    import type { JsonPath, JsonViewerHandle, JsonViewerSearchState, StructOptions } from '../types.js';
    import type { StrictJsonResult } from './strict-json.js';
    import type { JsonInspectorProps, JsonInspectorView, RawDiagnostic } from './types.js';
    import { tick } from 'svelte';
    import JsonViewer from '../JsonViewer.svelte';
    import { normalizeSearchQuery } from '../search.js';
    import { intOption, listLimit } from '../struct-helpers.js';
    import { isRegExp } from '../utils.js';
    import RawView from './RawView.svelte';
    import { DEFAULT_MAX_RAW_BYTES, generateStrictJson } from './strict-json.js';
    import { createTableWindow } from './table-model.js';
    import TableView from './TableView.svelte';
    import './inspector.css';

    type ViewRegistration = {
        id: JsonInspectorView;
        label: string;
        disabledReason: string | null;
    };

    const BUILT_IN_VIEWS: readonly ViewRegistration[] = [
        { id: 'tree', label: 'Tree', disabledReason: null },
        { id: 'raw', label: 'Raw', disabledReason: null },
        { id: 'table', label: 'Table', disabledReason: null },
        { id: 'diff', label: 'Diff', disabledReason: 'Diff view is not available in this build.' },
    ];
    const DEFAULT_VIEWS = BUILT_IN_VIEWS.map(view => view.id);
    const inspectorId = $props.id();

    const {
        data,
        view,
        defaultView = 'tree',
        views = DEFAULT_VIEWS,
        onViewChange,
        search,
        onSearchChange,
        onSearchStateChange,
        selectedPath,
        onSelectedPathChange,
        maxRawBytes = DEFAULT_MAX_RAW_BYTES,
        tableColumns,
        tableSort,
        onTableSortChange,
        ...viewerProps
    }: JsonInspectorProps = $props();

    let viewer = $state<JsonViewerHandle>();
    let toolbar = $state<HTMLElement>();
    // svelte-ignore state_referenced_locally
    let internalView = $state<JsonInspectorView>(initialView(defaultView, views));
    // svelte-ignore state_referenced_locally
    let toolbarFocusView = $state<JsonInspectorView>(initialView(defaultView, views));
    let internalSearch = $state('');
    let internalSelectedPath = $state<JsonPath | null>(null);
    let searchState = $state<JsonViewerSearchState>({
        query: null,
        currentIndex: -1,
        totalCount: 0,
        truncated: false,
        currentPath: null,
    });
    let viewStatus = $state('');
    let rawGeneration = 0;
    let rawRestart = $state(0);
    let rawController: AbortController | undefined;
    let rawCancellationAnnounced = $state(false);
    let tableVersion = $state(0);
    let rawResult = $state<StrictJsonResult | { status: 'pending'; text: null; diagnostics: readonly []; bytes: 0; reason: string }>({
        status: 'pending',
        text: null,
        diagnostics: [],
        bytes: 0,
        reason: 'Raw generation is in progress.',
    });
    // svelte-ignore state_referenced_locally
    let previousData = data;
    // svelte-ignore state_referenced_locally
    let previousControlledView = view;

    const hasTableView = $derived(views.includes('table'));
    const tableBatchSize = $derived(viewerProps.limit === false ? Number.MAX_SAFE_INTEGER : intOption(viewerProps.limit, 50));
    const tableModel = $derived(createTableWindow(hasTableView ? data : null, tableBatchSize));
    const tableSnapshot = $derived.by(() => {
        void tableVersion;
        return tableModel.snapshot();
    });
    const registeredViews = $derived(resolveViews(views, rawResult.reason, tableSnapshot.disabledReason));
    const activeView = $derived(resolveActiveView(view, internalView, registeredViews));
    const sharedSearch = $derived(search === undefined ? internalSearch : search);
    const sharedSelectedPath = $derived(selectedPath === undefined ? internalSelectedPath : selectedPath);
    const activePath = $derived(searchState.currentPath ?? sharedSelectedPath);
    const hasRawView = $derived(views.includes('raw'));
    const rawStatus = $derived(hasRawView ? rawAnnouncement(rawResult) : '');
    const inspectorTheme = $derived(viewerProps.theme === 'light' || viewerProps.theme === 'dark' ? viewerProps.theme : 'auto');
    const tableOptions = $derived<StructOptions>({
        match: normalizedTableMatch(sharedSearch, viewerProps.match),
        matchIgnoreCase: typeof sharedSearch === 'string' && sharedSearch.trim() !== '',
        limit: listLimit(viewerProps.limit, 50),
        limitCollapsed: listLimit(viewerProps.limitCollapsed, 4),
        limitCompactObjectEntries: listLimit(viewerProps.limitCompactObjectEntries, 0),
        maxStringLength: intOption(viewerProps.maxStringLength, 150),
        maxCompactStringLength: intOption(viewerProps.maxCompactStringLength, 40),
        allowedExcessStringLength: intOption(viewerProps.allowedExcessStringLength, 10),
        maxPropertyLength: intOption(viewerProps.maxPropertyLength, Infinity),
        maxCompactPropertyLength: intOption(viewerProps.maxCompactPropertyLength, 35),
    });

    $effect(() => {
        const source = data;
        const byteLimit = maxRawBytes;
        const shouldGenerate = hasRawView;
        const restart = rawRestart;
        void restart;
        if (!shouldGenerate) {
            rawResult = {
                status: 'cancelled',
                text: null,
                diagnostics: [],
                bytes: 0,
                reason: 'Raw view is not registered.',
            };
            rawCancellationAnnounced = false;
            return;
        }
        const generation = ++rawGeneration;
        const controller = new AbortController();
        rawController = controller;
        rawResult = {
            status: 'pending',
            text: null,
            diagnostics: [],
            bytes: 0,
            reason: 'Raw generation is in progress.',
        };
        void generateStrictJson(source, { signal: controller.signal, maxBytes: byteLimit }).then((result) => {
            if (generation === rawGeneration && !controller.signal.aborted) {
                rawResult = result;
                rawCancellationAnnounced = false;
            }
        });
        return () => {
            controller.abort();
            if (rawController === controller) {
                rawController = undefined;
            }
        };
    });

    $effect(() => {
        if (rawResult.status !== 'pending' && !isAvailable(internalView, registeredViews)) {
            internalView = firstAvailable(registeredViews);
        }
        if (!registeredViews.some(registration => registration.id === toolbarFocusView)) {
            toolbarFocusView = activeView;
        }
        if (viewStatus !== '' && !registeredViews.some(registration => registration.disabledReason === viewStatus)) {
            viewStatus = '';
        }
    });

    $effect.pre(() => {
        if (data !== previousData) {
            previousData = data;
            if (rawResult.status === 'pending') {
                rawCancellationAnnounced = true;
            }
            if (selectedPath === undefined && internalSelectedPath !== null) {
                internalSelectedPath = null;
                onSelectedPathChange?.(null);
            }
        }
        if (view !== previousControlledView) {
            previousControlledView = view;
            if (rawResult.status === 'pending') {
                rawCancellationAnnounced = true;
                rawController?.abort();
                rawRestart++;
            }
        }
    });

    function resolveViews(
        ids: readonly JsonInspectorView[],
        rawDisabledReason: string | null,
        tableDisabledReason: string | null,
    ): ViewRegistration[] {
        const unique = new Set(ids);
        const resolved = BUILT_IN_VIEWS
            .filter(candidate => unique.has(candidate.id))
            .map((candidate) => {
                if (candidate.id === 'raw') {
                    return { ...candidate, disabledReason: rawDisabledReason };
                }
                if (candidate.id === 'table') {
                    return { ...candidate, disabledReason: tableDisabledReason };
                }
                return candidate;
            });
        if (!resolved.some(candidate => candidate.id === 'tree')) {
            resolved.unshift(BUILT_IN_VIEWS[0]);
        }
        return resolved;
    }

    function initialView(candidate: JsonInspectorView, ids: readonly JsonInspectorView[]): JsonInspectorView {
        return ids.includes(candidate) ? candidate : 'tree';
    }

    function firstAvailable(registry: readonly ViewRegistration[]): JsonInspectorView {
        return registry.find(candidate => candidate.disabledReason === null)?.id ?? 'tree';
    }

    function isAvailable(candidate: JsonInspectorView, registry: readonly ViewRegistration[]): boolean {
        return registry.some(entry => entry.id === candidate && entry.disabledReason === null);
    }

    function resolveActiveView(
        controlled: JsonInspectorView | undefined,
        internal: JsonInspectorView,
        registry: readonly ViewRegistration[],
    ): JsonInspectorView {
        if (controlled !== undefined && isAvailable(controlled, registry)) {
            return controlled;
        }
        return isAvailable(internal, registry) ? internal : firstAvailable(registry);
    }

    function activateView(registration: ViewRegistration) {
        if (registration.disabledReason !== null) {
            viewStatus = registration.disabledReason;
            return;
        }
        if (registration.id === activeView) {
            return;
        }
        viewStatus = '';
        if (view === undefined) {
            internalView = registration.id;
        }
        onViewChange?.(registration.id);
    }

    async function navigateDiagnostic(diagnostic: RawDiagnostic) {
        viewStatus = '';
        if (view === undefined) {
            internalView = 'tree';
        }
        if (activeView !== 'tree') {
            onViewChange?.('tree');
        }
        await tick();
        for (let length = diagnostic.path.length; length >= 0; length--) {
            if (await viewer?.focus(diagnostic.path.slice(0, length))) {
                break;
            }
        }
    }

    function rawAnnouncement(result: typeof rawResult): string {
        if (result.status === 'pending') {
            return rawCancellationAnnounced ? 'Raw generation cancelled. Generating Raw…' : 'Generating Raw…';
        }
        if (result.status === 'invalid') {
            const count = result.diagnostics.length;
            return `Raw generation failed with ${count} diagnostic${count === 1 ? '' : 's'}.`;
        }
        return result.status === 'capped' || result.status === 'cancelled' ? result.reason : '';
    }

    function normalizedTableMatch(primary: unknown, fallback: unknown): RegExp | string | null {
        const query = normalizeSearchQuery(primary);
        if (query !== null) {
            return query;
        }
        return isRegExp(fallback) || typeof fallback === 'string' ? fallback : null;
    }

    function updateTableWindow() {
        tableVersion++;
        const disabledReason = tableModel.snapshot().disabledReason;
        if (disabledReason) {
            viewStatus = disabledReason;
        }
    }

    function viewReasonId(candidate: JsonInspectorView): string {
        return `${inspectorId}-view-reason-${candidate}`;
    }

    function onToolbarKeydown(event: KeyboardEvent) {
        if (!toolbar || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button')];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let target = 0;
        if (event.key === 'End') {
            target = buttons.length - 1;
        }
        else if (event.key === 'ArrowLeft') {
            target = (current - 1 + buttons.length) % buttons.length;
        }
        else if (event.key === 'ArrowRight') {
            target = (current + 1) % buttons.length;
        }
        const targetButton = buttons[target];
        if (targetButton) {
            toolbarFocusView = targetButton.dataset.view as JsonInspectorView;
            targetButton.focus();
        }
    }

    function updateSearch(query: string) {
        if (search === undefined) {
            internalSearch = query;
        }
        onSearchChange?.(query);
    }

    function updateSearchState(state: JsonViewerSearchState) {
        searchState = state;
        onSearchStateChange?.(state);
    }

    function updateSelectedPath(path: JsonPath | null) {
        if (selectedPath === undefined) {
            internalSelectedPath = path;
        }
        onSelectedPathChange?.(path);
    }

    export function expand(path: JsonPath): Promise<boolean> {
        return viewer?.expand(path) ?? Promise.resolve(false);
    }

    export function collapse(path: JsonPath): Promise<boolean> {
        return viewer?.collapse(path) ?? Promise.resolve(false);
    }

    export function focus(path: JsonPath): Promise<boolean> {
        return viewer?.focus(path) ?? Promise.resolve(false);
    }

    export function scrollTo(path: JsonPath): Promise<boolean> {
        return viewer?.scrollTo(path) ?? Promise.resolve(false);
    }

    export function select(path: JsonPath | null): Promise<boolean> {
        return viewer?.select(path) ?? Promise.resolve(false);
    }

    export function nextMatch(): Promise<JsonPath | null> {
        return viewer?.nextMatch() ?? Promise.resolve(null);
    }

    export function previousMatch(): Promise<JsonPath | null> {
        return viewer?.previousMatch() ?? Promise.resolve(null);
    }
</script>

<div class='sjd-inspector' data-active-view={activeView} data-active-path={JSON.stringify(activePath)}>
    <div
        class='sjd-inspector-toolbar'
        bind:this={toolbar}
        role='toolbar'
        aria-label='Inspector views'
        tabindex='-1'
        onkeydown={onToolbarKeydown}
    >
        {#each registeredViews as registration (registration.id)}
            <button
                type='button'
                data-view={registration.id}
                aria-pressed={registration.id === activeView}
                aria-disabled={registration.disabledReason !== null || undefined}
                aria-describedby={registration.disabledReason === null ? undefined : viewReasonId(registration.id)}
                tabindex={registration.id === toolbarFocusView ? 0 : -1}
                onclick={() => activateView(registration)}
                onfocus={() => toolbarFocusView = registration.id}
            >
                {registration.label}
            </button>
            {#if registration.disabledReason !== null}
                <span id={viewReasonId(registration.id)} class='sjd-visually-hidden'>{registration.disabledReason}</span>
            {/if}
        {/each}
    </div>
    {#if viewStatus}<div class='sjd-inspector-status' role='status'>{viewStatus}</div>{/if}
    {#if rawStatus}
        <div class='sjd-inspector-status' role={viewStatus ? undefined : 'status'} aria-live='polite'>{rawStatus}</div>
    {/if}
    {#if rawResult.status === 'invalid'}
        <div class='sjd-raw-diagnostics' aria-label='Raw diagnostics'>
            {#each rawResult.diagnostics as diagnostic (`${diagnostic.code}:${diagnostic.pointer}`)}
                <button
                    type='button'
                    aria-label={`Raw diagnostic at ${diagnostic.pointer || '<root>'}: ${diagnostic.message}`}
                    onclick={() => navigateDiagnostic(diagnostic)}
                >
                    <code>{diagnostic.pointer || '<root>'}</code>
                    <span>{diagnostic.message}</span>
                </button>
            {/each}
        </div>
    {/if}
    <div
        class='sjd-inspector-view'
        data-view-panel='tree'
        aria-label='Tree view'
        hidden={activeView !== 'tree'}
    >
        <JsonViewer
            bind:this={viewer}
            {...viewerProps}
            {data}
            search={sharedSearch}
            onSearchChange={updateSearch}
            onSearchStateChange={updateSearchState}
            selectedPath={sharedSelectedPath}
            onSelectedPathChange={updateSelectedPath}
        />
    </div>
    {#if rawResult.status === 'valid'}
        <div
            class='sjd-inspector-view'
            data-view-panel='raw'
            aria-label='Raw view'
            hidden={activeView !== 'raw'}
        >
            <RawView text={rawResult.text} />
        </div>
    {/if}
    {#if tableSnapshot.disabledReason === null}
        <div
            class='sjd-inspector-view'
            data-view-panel='table'
            aria-label='Table view'
            hidden={activeView !== 'table'}
        >
            <TableView
                columns={tableColumns}
                currentSearchPath={searchState.currentPath}
                model={tableModel}
                onSelect={updateSelectedPath}
                onSortChange={onTableSortChange}
                onWindowChange={updateTableWindow}
                options={tableOptions}
                selectedPath={sharedSelectedPath}
                snapshot={tableSnapshot}
                sort={tableSort}
                theme={inspectorTheme}
            />
        </div>
    {/if}
</div>
