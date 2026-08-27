<script lang='ts'>
    import type { JsonPath, JsonViewerHandle, JsonViewerSearchState } from '../types.js';
    import type { JsonInspectorProps, JsonInspectorView } from './types.js';
    import JsonViewer from '../JsonViewer.svelte';
    import RawView from './RawView.svelte';
    import { serializeStrictJson } from './strict-json.js';
    import './inspector.css';

    type ViewRegistration = {
        id: JsonInspectorView;
        label: string;
        disabledReason: string | null;
    };

    const BUILT_IN_VIEWS: readonly ViewRegistration[] = [
        { id: 'tree', label: 'Tree', disabledReason: null },
        { id: 'raw', label: 'Raw', disabledReason: null },
        { id: 'table', label: 'Table', disabledReason: 'Table view is not available in this build.' },
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
    // svelte-ignore state_referenced_locally
    let previousData = data;

    const rawResult = $derived(serializeStrictJson(data));
    const registeredViews = $derived(resolveViews(views, rawResult.reason));
    const activeView = $derived(resolveActiveView(view, internalView, registeredViews));
    const sharedSearch = $derived(search === undefined ? internalSearch : search);
    const sharedSelectedPath = $derived(selectedPath === undefined ? internalSelectedPath : selectedPath);
    const activePath = $derived(searchState.currentPath ?? sharedSelectedPath);

    $effect(() => {
        if (!isAvailable(internalView, registeredViews)) {
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
            if (selectedPath === undefined && internalSelectedPath !== null) {
                internalSelectedPath = null;
                onSelectedPathChange?.(null);
            }
        }
    });

    function resolveViews(ids: readonly JsonInspectorView[], rawDisabledReason: string | null): ViewRegistration[] {
        const unique = new Set(ids);
        const resolved = BUILT_IN_VIEWS
            .filter(candidate => unique.has(candidate.id))
            .map(candidate => candidate.id === 'raw' ? { ...candidate, disabledReason: rawDisabledReason } : candidate);
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
    {#if rawResult.text !== null}
        <div
            class='sjd-inspector-view'
            data-view-panel='raw'
            aria-label='Raw view'
            hidden={activeView !== 'raw'}
        >
            <RawView text={rawResult.text} />
        </div>
    {/if}
</div>
