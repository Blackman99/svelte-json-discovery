<!-- JSON viewer — Svelte port of the `struct` view from discoveryjs/discovery -->
<script lang='ts'>
    import type { SchemaFieldInfo } from './schema.js';
    import type { JsonPath, JsonViewerActionMatch, JsonViewerHandle, JsonViewerNode, JsonViewerPlugin, JsonViewerPluginError, JsonViewerPluginOperation, JsonViewerRendererMatch, JsonViewerSearchState, PopupAction, StructOptions, ValueContext } from './types.js';
    import { onDestroy, setContext, tick } from 'svelte';
    import ActionsPopup from './ActionsPopup.svelte';
    import { safeErrorMessage } from './collection.js';
    import { createJsonViewerNode } from './node.js';
    import SchemaTooltip from './SchemaTooltip.svelte';
    import { searchJson } from './search.js';
    import { intOption, isValueExpandable, listLimit } from './struct-helpers.js';
    import { CONTEXT_KEY } from './types.js';
    import { copyText, isRegExp, objectToString, pathKey, pathStartsWith, pathToPointer, pathToQuery, samePath } from './utils.js';
    import ValueNode from './ValueNode.svelte';
    import './struct.css';

    type Props = {
        /** The value to display */
        data: unknown;
        /** Number of levels to auto-expand (true = 1); 0/false renders a collapsed preview */
        expanded?: boolean | number;
        /** Max entries rendered per expand/"show more" step (false = no limit) */
        limit?: number | false;
        /** Max entries shown in a collapsed preview (false = no limit) */
        limitCollapsed?: number | false;
        /** Entries shown for nested objects in a preview (0 renders {…}, false = no limit) */
        limitCompactObjectEntries?: number | false;
        /** Max string length before it becomes expandable */
        maxStringLength?: number;
        /** Max string length inside nested previews */
        maxCompactStringLength?: number;
        /** Extra characters a string may exceed the limit by before truncation */
        allowedExcessStringLength?: number;
        /** Max property name length for expanded entries */
        maxPropertyLength?: number;
        /** Max property name length inside previews */
        maxCompactPropertyLength?: number;
        /** Substring or RegExp to highlight in strings */
        match?: RegExp | string | null;
        /** Search query for keys and primitive values */
        search?: RegExp | string | null;
        /** Show the built-in search controls */
        showSearch?: boolean;
        /** Maximum stored search results */
        maxSearchResults?: number;
        /** Called when a controlled search input changes */
        onSearchChange?: (query: string) => void;
        /** Called when search results or navigation change */
        onSearchStateChange?: (state: JsonViewerSearchState) => void;
        /** Controlled list of expanded paths */
        expandedPaths?: readonly JsonPath[];
        /** Called when the expanded path list changes */
        onExpandedPathsChange?: (paths: readonly JsonPath[]) => void;
        /** Controlled selected path */
        selectedPath?: JsonPath | null;
        /** Called when selection changes */
        onSelectedPathChange?: (path: JsonPath | null) => void;
        /** Color scheme */
        theme?: 'light' | 'dark' | 'auto';
        /** JSON Schema describing `data`; documented fields get a hover tooltip */
        schema?: Record<string, unknown> | null;
        /** Ordered, instance-scoped custom renderers */
        plugins?: readonly JsonViewerPlugin[];
        /** Reports localized renderer and action failures */
        onPluginError?: (failure: JsonViewerPluginError) => void;
    };

    const {
        data,
        expanded = 1,
        limit,
        limitCollapsed,
        limitCompactObjectEntries,
        maxStringLength,
        maxCompactStringLength,
        allowedExcessStringLength,
        maxPropertyLength,
        maxCompactPropertyLength,
        match = null,
        search,
        showSearch = false,
        maxSearchResults = 1000,
        onSearchChange,
        onSearchStateChange,
        expandedPaths,
        onExpandedPathsChange,
        selectedPath,
        onSelectedPathChange,
        theme = 'auto',
        schema = null,
        plugins = [],
        onPluginError,
    }: Props = $props();

    const expandDepth = $derived(
        expanded === true ? 1 : typeof expanded === 'number' ? Math.max(0, Math.trunc(expanded)) : 0,
    );
    const themeName = $derived(theme === 'light' || theme === 'dark' ? theme : 'auto');
    const scheme = $derived(themeName === 'auto' ? 'light dark' : themeName);
    const rootContext = $derived<ValueContext>({
        parent: null,
        host: { '': data },
        key: '',
        index: 0,
        path: [],
        jsonCompatible: isJsonCompatibleRoot(data),
    });

    let rootEl = $state<HTMLElement>();
    let localSearch = $state('');
    let internalExpansion = $state<Record<string, boolean>>({});
    let internalSelectedPath = $state<JsonPath | null>(null);
    let searchMatches = $state<JsonPath[]>([]);
    let searchIndex = $state(-1);
    let searchTruncated = $state(false);
    let searchGeneration = 0;
    let requestedPath = $state<JsonPath | null>(null);
    let focusedPath = $state<JsonPath>([]);
    let typeahead = '';
    let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;
    // svelte-ignore state_referenced_locally
    let previousData = data;
    // svelte-ignore state_referenced_locally
    let previousPluginData = data;
    let popup = $state<{ x: number; y: number; actions: PopupAction[]; anchor: HTMLElement } | null>(null);
    let schemaTip = $state<{ x: number; y: number; info: SchemaFieldInfo } | null>(null);
    let activePluginAction: { controller: AbortController } | null = null;
    let pluginStatus = $state<string | null>(null);
    const reportedPredicateFailures: string[] = [];
    let pluginLifecycleGeneration = 0;
    let pluginDisposed = false;

    const controller: JsonViewerHandle = Object.freeze({
        expand,
        collapse,
        focus,
        scrollTo,
        select,
        nextMatch,
        previousMatch,
    });

    setContext(CONTEXT_KEY, {
        controller,
        resolveRenderer,
        hasPluginActions,
        reportPluginError,
        openActions,
        openSchemaTip,
        closeSchemaTip,
        isExpanded,
        setExpanded: setPathExpanded,
        isSelected,
        select: selectPath,
        isSearchMatch,
        isCurrentSearchMatch,
        revealPath: () => requestedPath,
        isFocused,
        setFocused,
    });

    function resolveRenderer(node: JsonViewerNode): JsonViewerRendererMatch | null {
        for (const plugin of plugins) {
            for (const renderer of plugin.renderers ?? []) {
                try {
                    if (renderer.when(node)) {
                        return { pluginId: plugin.id, renderer };
                    }
                }
                catch (error) {
                    // Predicate evaluation happens inside a derived value. Defer the
                    // observable report so renderer resolution stays side-effect free.
                    reportPredicateError(plugin.id, node, 'renderer-predicate', error);
                }
            }
        }

        return null;
    }

    function pluginActions(node: JsonViewerNode): JsonViewerActionMatch[] {
        const matches: JsonViewerActionMatch[] = [];

        for (const plugin of plugins) {
            for (const action of plugin.actions ?? []) {
                try {
                    if (action.when(node)) {
                        matches.push({ pluginId: plugin.id, action });
                    }
                }
                catch (error) {
                    reportPredicateError(plugin.id, node, 'action-predicate', error, action.id);
                }
            }
        }

        return matches;
    }

    function hasPluginActions(node: JsonViewerNode): boolean {
        return pluginActions(node).length > 0;
    }

    async function runPluginAction(match: JsonViewerActionMatch, node: JsonViewerNode): Promise<void> {
        activePluginAction?.controller.abort();
        const execution = { controller: new AbortController() };
        activePluginAction = execution;
        pluginStatus = null;

        try {
            await match.action.run({ node, signal: execution.controller.signal });
        }
        catch (error) {
            if (activePluginAction === execution && !execution.controller.signal.aborted) {
                reportPluginError(match.pluginId, node, 'action', error, match.action.id);
                pluginStatus = `${match.action.label} failed: ${safeErrorMessage(error)}`;
            }
        }
        finally {
            if (activePluginAction === execution) {
                activePluginAction = null;
            }
        }
    }

    function cancelPluginAction() {
        activePluginAction?.controller.abort();
        activePluginAction = null;
    }

    function reportPluginError(
        pluginId: string,
        node: JsonViewerNode,
        operation: JsonViewerPluginOperation,
        error: unknown,
        operationId?: string,
    ) {
        onPluginError?.(Object.freeze({ pluginId, node, operation, operationId, error }));
    }

    function reportPredicateError(
        pluginId: string,
        node: JsonViewerNode,
        operation: 'action-predicate' | 'renderer-predicate',
        error: unknown,
        operationId?: string,
    ) {
        const key = `${pluginId}:${operation}:${operationId ?? ''}:${pathKey(node.path)}`;
        if (reportedPredicateFailures.includes(key)) {
            return;
        }
        reportedPredicateFailures.push(key);
        const generation = pluginLifecycleGeneration;
        const source = data;
        queueMicrotask(() => {
            if (pluginDisposed || generation !== pluginLifecycleGeneration || source !== data) {
                return;
            }
            reportPluginError(pluginId, node, operation, error, operationId);
            pluginStatus = `${operation === 'renderer-predicate' ? 'Renderer' : 'Action'} predicate failed: ${safeErrorMessage(error)}`;
        });
    }

    onDestroy(() => {
        pluginDisposed = true;
        pluginLifecycleGeneration++;
        cancelPluginAction();
    });

    const effectiveSearch = $derived<RegExp | string | null>(
        search === undefined
            ? (localSearch.trim() === '' ? null : localSearch)
            : (isRegExp(search) || typeof search === 'string') && String(search) !== '' ? search : null,
    );

    const options: StructOptions = $derived({
        match: effectiveSearch ?? (isRegExp(match) || typeof match === 'string' ? match : null),
        matchIgnoreCase: typeof effectiveSearch === 'string',
        limit: listLimit(limit, 50),
        limitCollapsed: listLimit(limitCollapsed, 4),
        limitCompactObjectEntries: listLimit(limitCompactObjectEntries, 0),
        maxStringLength: intOption(maxStringLength, 150),
        maxCompactStringLength: intOption(maxCompactStringLength, 40),
        allowedExcessStringLength: intOption(allowedExcessStringLength, 10),
        maxPropertyLength: intOption(maxPropertyLength, Infinity),
        maxCompactPropertyLength: intOption(maxCompactPropertyLength, 35),
    });

    const searchState = $derived<JsonViewerSearchState>({
        query: effectiveSearch,
        currentIndex: searchIndex,
        totalCount: searchMatches.length,
        truncated: searchTruncated,
        currentPath: searchIndex >= 0 ? searchMatches[searchIndex] ?? null : null,
    });

    $effect(() => {
        const query = effectiveSearch;
        const source = data;
        const limit = Math.max(1, Math.trunc(maxSearchResults) || 1000);
        const generation = ++searchGeneration;

        searchMatches = [];
        searchIndex = -1;
        searchTruncated = false;

        if (query === null) {
            requestedPath = null;
            return;
        }

        void searchJson(source, query, limit, () => generation !== searchGeneration).then(async (result) => {
            if (generation !== searchGeneration) {
                return;
            }

            searchMatches = result.matches;
            searchTruncated = result.truncated;
            searchIndex = result.matches.length > 0 ? 0 : -1;
            if (searchIndex >= 0) {
                await navigateToSearchIndex(searchIndex, false);
            }
        });
    });

    $effect(() => {
        onSearchStateChange?.(searchState);
    });

    $effect.pre(() => {
        if (data !== previousPluginData) {
            previousPluginData = data;
            pluginLifecycleGeneration++;
            reportedPredicateFailures.length = 0;
        }
    });

    $effect(() => {
        if (data !== previousData) {
            const hadInternalSelection = internalSelectedPath !== null;
            cancelPluginAction();
            popup = null;
            pluginStatus = null;
            previousData = data;
            internalExpansion = {};
            internalSelectedPath = null;
            requestedPath = null;
            focusedPath = [];
            if (selectedPath === undefined && hadInternalSelection) {
                onSelectedPathChange?.(null);
            }
            else if (selectedPath !== undefined && selectedPath !== null && !resolvePath(selectedPath).found) {
                onSelectedPathChange?.(null);
            }

            if (expandedPaths !== undefined) {
                const validPaths = expandedPaths.filter(isExpandablePath);
                if (validPaths.length !== expandedPaths.length) {
                    onExpandedPathsChange?.(validPaths);
                }
            }
        }
    });

    function controlledExpanded(path: JsonPath): boolean | undefined {
        if (expandedPaths === undefined) {
            return undefined;
        }

        return expandedPaths.some(candidate => samePath(candidate, path)) && isExpandablePath(path);
    }

    function isExpanded(path: JsonPath, initial: boolean): boolean {
        const controlled = controlledExpanded(path);

        return controlled ?? internalExpansion[pathKey(path)] ?? initial;
    }

    function nextExpandedPaths(paths: readonly JsonPath[], value: boolean): JsonPath[] {
        const source = expandedPaths ?? Object.entries(internalExpansion)
            .filter(([, expandedValue]) => expandedValue)
            .map(([key]) => JSON.parse(key) as JsonPath);
        const validSource = source.filter(isExpandablePath);
        const next = validSource.filter(candidate => !paths.some(path => samePath(candidate, path)));

        if (value) {
            for (const path of paths) {
                if (!next.some(candidate => samePath(candidate, path))) {
                    next.push([...path]);
                }
            }
        }

        return next;
    }

    function setPathsExpanded(paths: readonly JsonPath[], value: boolean) {
        if (paths.length === 0) {
            return;
        }

        if (expandedPaths !== undefined) {
            onExpandedPathsChange?.(nextExpandedPaths(paths, value));
            return;
        }

        const next = { ...internalExpansion };

        for (const path of paths) {
            next[pathKey(path)] = value;
        }
        internalExpansion = next;
        onExpandedPathsChange?.(nextExpandedPaths(paths, value));
    }

    function setPathExpanded(path: JsonPath, value: boolean) {
        setPathsExpanded([path], value);
    }

    function currentSelectedPath(): JsonPath | null {
        const current = selectedPath === undefined ? internalSelectedPath : selectedPath;
        return current === null || resolvePath(current).found ? current : null;
    }

    function isSelected(path: JsonPath): boolean {
        return samePath(currentSelectedPath(), path);
    }

    function selectPath(path: JsonPath | null) {
        if (selectedPath === undefined) {
            internalSelectedPath = path ? [...path] : null;
        }

        onSelectedPathChange?.(path ? [...path] : null);
    }

    function isSearchMatch(path: JsonPath): boolean {
        return searchMatches.some(candidate => samePath(candidate, path));
    }

    function isFocused(path: JsonPath): boolean {
        return samePath(focusedPath, path);
    }

    function setFocused(path: JsonPath) {
        focusedPath = [...path];
    }

    function isCurrentSearchMatch(path: JsonPath): boolean {
        return searchIndex >= 0 && samePath(searchMatches[searchIndex], path);
    }

    function resolvePath(path: JsonPath): { found: boolean; value?: unknown } {
        let value = data;

        try {
            for (const part of path) {
                if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
                    return { found: false };
                }

                const tag = Object.prototype.toString.call(value);
                if (tag === '[object Set]' || tag === '[object Map]') {
                    if (typeof part !== 'number' || part < 0) {
                        return { found: false };
                    }
                    const iterator = tag === '[object Map]'
                        ? (value as Map<unknown, unknown>).entries()
                        : (value as Set<unknown>).values();
                    let current: IteratorResult<unknown> | undefined;
                    for (let index = 0; index <= part; index++) {
                        current = iterator.next();
                        if (current.done) {
                            return { found: false };
                        }
                    }
                    value = current?.value;
                    continue;
                }

                if (!(part in value)) {
                    return { found: false };
                }
                value = (value as Record<string | number, unknown>)[part];
            }
        }
        catch {
            return { found: false };
        }

        return { found: true, value };
    }

    function canRenderPathWithoutReading(path: JsonPath): boolean {
        let value = data;

        try {
            for (let index = 0; index < path.length; index++) {
                if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
                    return false;
                }
                const part = path[index];
                let descriptor: PropertyDescriptor | undefined;
                if (Array.isArray(value) && typeof part === 'number') {
                    const length = Object.getOwnPropertyDescriptor(value, 'length');
                    if (!Number.isInteger(part) || !length || !('value' in length) || part < 0 || part >= length.value) {
                        return false;
                    }
                    descriptor = Object.getOwnPropertyDescriptor(value, String(part));
                    if (!descriptor) {
                        return index === path.length - 1;
                    }
                }
                else {
                    descriptor = Object.getOwnPropertyDescriptor(value, part);
                    if (!descriptor?.enumerable) {
                        return false;
                    }
                }
                if (!('value' in descriptor)) {
                    return index === path.length - 1;
                }
                value = descriptor.value;
            }
        }
        catch {
            return false;
        }

        return true;
    }

    function isExpandablePath(path: JsonPath): boolean {
        const resolved = resolvePath(path);
        return resolved.found && isValueExpandable(resolved.value, options);
    }

    function reveal(path: JsonPath, includeTarget = false) {
        requestedPath = [...path];
        const paths: JsonPath[] = [];
        for (let index = 0; index < path.length; index++) {
            paths.push(path.slice(0, index));
        }
        if (includeTarget) {
            paths.push(path);
        }
        setPathsExpanded(paths, true);
    }

    function findNode(path: JsonPath): HTMLElement | null {
        return rootEl?.querySelector<HTMLElement>(`[data-json-path='${CSS.escape(pathKey(path))}']`) ?? null;
    }

    function nodePath(element: Element): JsonPath | null {
        const encoded = element.getAttribute('data-json-path');
        if (encoded === null) {
            return null;
        }

        try {
            return JSON.parse(encoded) as JsonPath;
        }
        catch {
            return null;
        }
    }

    function visibleTreeItems(): HTMLElement[] {
        return rootEl ? [...rootEl.querySelectorAll<HTMLElement>('[role="treeitem"]')] : [];
    }

    async function focusTreeItem(element: HTMLElement | undefined) {
        if (!element) {
            return;
        }

        const path = nodePath(element);
        if (path) {
            setFocused(path);
            await tick();
        }
        element.focus();
    }

    async function onTreeKeydown(event: KeyboardEvent) {
        if (!(event.target instanceof Element) || event.target.closest('.struct-action-button, button, input')) {
            return;
        }

        const current = event.target.closest<HTMLElement>('[role="treeitem"]');
        if (!current) {
            return;
        }

        const items = visibleTreeItems();
        const index = items.indexOf(current);
        const path = nodePath(current);
        if (!path) {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                await focusTreeItem(items[index + 1]);
                return;
            case 'ArrowUp':
                event.preventDefault();
                await focusTreeItem(items[index - 1]);
                return;
            case 'Home':
                event.preventDefault();
                await focusTreeItem(items[0]);
                return;
            case 'End':
                event.preventDefault();
                await focusTreeItem(items.at(-1));
                return;
            case 'ArrowRight': {
                event.preventDefault();
                if (current.getAttribute('aria-expanded') === 'false') {
                    setPathExpanded(path, true);
                    await tick();
                    await focusTreeItem(findNode(path) ?? undefined);
                    return;
                }
                if (current.getAttribute('aria-expanded') === 'true') {
                    const child = visibleTreeItems().find((item) => {
                        const childPath = nodePath(item);
                        return childPath && childPath.length === path.length + 1 && pathStartsWith(childPath, path);
                    });
                    await focusTreeItem(child);
                }
                return;
            }
            case 'ArrowLeft':
                event.preventDefault();
                if (current.getAttribute('aria-expanded') === 'true') {
                    setPathExpanded(path, false);
                    await tick();
                    await focusTreeItem(findNode(path) ?? undefined);
                }
                else if (path.length > 0) {
                    await focusTreeItem(findNode(path.slice(0, -1)) ?? undefined);
                }
                return;
            case ' ':
                if (current.hasAttribute('aria-expanded')) {
                    event.preventDefault();
                    setPathExpanded(path, current.getAttribute('aria-expanded') !== 'true');
                    await tick();
                    await focusTreeItem(findNode(path) ?? undefined);
                }
                return;
            case 'Enter':
                event.preventDefault();
                selectPath(path);
                return;
            case 'F2':
                event.preventDefault();
                current.querySelector<HTMLElement>(':scope > .struct-action-button')?.focus();
                return;
        }

        if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            typeahead += event.key.toLocaleLowerCase();
            clearTimeout(typeaheadTimer);
            typeaheadTimer = setTimeout(() => (typeahead = ''), 500);
            const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
            const match = ordered.find(item => (item.dataset.nodeLabel ?? '').toLocaleLowerCase().startsWith(typeahead));
            await focusTreeItem(match);
        }
    }

    export async function expand(path: JsonPath): Promise<boolean> {
        if (!isExpandablePath(path)) {
            return false;
        }

        reveal(path, true);
        await tick();
        return true;
    }

    export async function collapse(path: JsonPath): Promise<boolean> {
        if (!isExpandablePath(path)) {
            return false;
        }

        setPathExpanded(path, false);
        await tick();
        return true;
    }

    export async function focus(path: JsonPath): Promise<boolean> {
        const renderable = canRenderPathWithoutReading(path);
        if (!renderable && !resolvePath(path).found) {
            return false;
        }
        reveal(path);
        await tick();
        const node = findNode(path);
        if (node === null) {
            return false;
        }
        setFocused(path);
        await tick();
        node?.focus();
        return node !== null;
    }

    export async function scrollTo(path: JsonPath): Promise<boolean> {
        if (!await focus(path)) {
            return false;
        }

        findNode(path)?.scrollIntoView?.({ block: 'nearest' });
        return true;
    }

    export async function select(path: JsonPath | null): Promise<boolean> {
        if (path !== null && !resolvePath(path).found) {
            return false;
        }

        selectPath(path);
        if (path !== null) {
            reveal(path);
        }
        await tick();
        return true;
    }

    export async function nextMatch(): Promise<JsonPath | null> {
        if (searchMatches.length === 0) {
            return null;
        }

        searchIndex = (searchIndex + 1) % searchMatches.length;
        await navigateToSearchIndex(searchIndex);
        return searchMatches[searchIndex] ?? null;
    }

    export async function previousMatch(): Promise<JsonPath | null> {
        if (searchMatches.length === 0) {
            return null;
        }

        searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
        await navigateToSearchIndex(searchIndex);
        return searchMatches[searchIndex] ?? null;
    }

    async function navigateToSearchIndex(index: number, moveFocus = true) {
        const path = searchMatches[index];
        if (!path) {
            return;
        }

        reveal(path);
        await tick();
        if (moveFocus) {
            setFocused(path);
            await tick();
            findNode(path)?.focus();
        }
        findNode(path)?.scrollIntoView?.({ block: 'nearest' });
    }

    function updateSearchInput(value: string) {
        if (search === undefined) {
            localSearch = value;
        }
        onSearchChange?.(value);
    }

    function openSchemaTip(anchor: HTMLElement, info: SchemaFieldInfo) {
        const rect = anchor.getBoundingClientRect();

        schemaTip = { x: rect.left, y: rect.bottom + 4, info };
    }

    function closeSchemaTip() {
        schemaTip = null;
    }

    function openActions(anchor: HTMLElement, value: unknown, context: ValueContext) {
        const rect = anchor.getBoundingClientRect();

        popup = {
            x: rect.left,
            y: rect.bottom + 3,
            actions: buildActions(value, context),
            anchor,
        };
    }

    async function closeActions() {
        const anchor = popup?.anchor;
        cancelPluginAction();
        popup = null;
        await tick();
        anchor?.focus();
    }

    function buildPath(context: ValueContext): (string | number)[] {
        const path: (string | number)[] = [];
        let cursor: ValueContext | null = context;

        while (cursor !== null && cursor.parent !== null) {
            path.unshift(cursor.key);
            cursor = cursor.parent;
        }

        return path;
    }

    // same guard as the original popup-value-actions.js — huge clipboard
    // writes can hang the browser
    const MAX_JSON_COPY_SIZE = 12 * 1024 * 1024;

    function byteSize(str: string | undefined): number {
        return str === undefined ? 0 : new Blob([str]).size;
    }

    function jsonCopyError(size: number): string | false {
        return size > MAX_JSON_COPY_SIZE
            ? 'Can\'t be copied: resulting JSON is over 12 MB'
            : false;
    }

    function formatSize(size: number): string {
        if (size === 0) {
            return '';
        }

        // U+2009 thin space as a thousands separator
        return `, ${size.toLocaleString('en-US').replace(/,/g, ' ')} bytes`;
    }

    function buildActions(value: unknown, context: ValueContext): PopupAction[] {
        const actions: PopupAction[] = [];
        const node = createJsonViewerNode(value, context);
        const builtPath = buildPath(context);
        const path = pathToQuery(builtPath);

        if (path !== '') {
            actions.push({ text: 'Copy path:', notes: path, action: () => copyText(path) });
        }
        if (context.jsonCompatible) {
            const pointer = pathToPointer(builtPath);
            actions.push({ text: 'Copy JSON Pointer:', notes: pointer, action: () => copyText(pointer) });
        }
        const hasPathActions = actions.length > 0;

        if (typeof value === 'string') {
            actions.push(
                { groupStart: hasPathActions, text: 'Copy as quoted string', action: () => copyText(JSON.stringify(value)) },
                { text: 'Copy as unquoted string', action: () => copyText(JSON.stringify(value).slice(1, -1)) },
                { text: 'Copy a value (unescaped)', action: () => copyText(value) },
            );
            appendPluginActions(actions, node);
            return actions;
        }

        let jsonError: string | false = false;
        let compactStr: string | undefined;
        let formattedStr: string | undefined;

        try {
            compactStr = JSON.stringify(value);

            if (compactStr === undefined) {
                compactStr = undefined;
                jsonError = 'Value is not JSON serializable';
            }
            else {
                formattedStr = JSON.stringify(value, null, 4);
            }
        }
        catch (e) {
            compactStr = formattedStr = undefined;
            const message = safeErrorMessage(e);
            jsonError = /Maximum call stack size|too much recursion/i.test(message)
                ? 'Too much nested structure'
                : message;
        }

        const formattedSize = byteSize(formattedStr);
        const compactSize = byteSize(compactStr);
        const formattedCopyError = jsonCopyError(formattedSize);
        const compactCopyError = jsonCopyError(compactSize);

        actions.push({
            groupStart: hasPathActions,
            text: 'Copy as JSON',
            notes: `(formatted${formatSize(formattedSize)})`,
            error: jsonError ? `Can't export JSON: ${jsonError}` : formattedCopyError,
            disabled: Boolean(jsonError || formattedCopyError),
            action: () => copyText(formattedStr ?? ''),
        });
        actions.push({
            text: 'Copy as JSON',
            notes: `(compact${formatSize(compactSize)})`,
            error: jsonError ? `Can't export JSON: ${jsonError}` : compactCopyError,
            disabled: Boolean(jsonError || compactCopyError),
            action: () => copyText(compactStr ?? ''),
        });

        appendPluginActions(actions, node);

        return actions;
    }

    function appendPluginActions(actions: PopupAction[], node: JsonViewerNode) {
        for (const match of pluginActions(node)) {
            actions.push({
                groupStart: actions.length > 0,
                text: match.action.label,
                action: () => runPluginAction(match, node),
            });
        }
    }

    function isJsonCompatibleRoot(value: unknown): boolean {
        if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
            return true;
        }

        try {
            return Array.isArray(value) || objectToString(value) === '[object Object]';
        }
        catch {
            return false;
        }
    }

    // clicking the free space of the root block expands a collapsed root,
    // as in the original struct view (.view-struct.struct-expand)
    function onRootClick(event: MouseEvent) {
        if (event.target === rootEl) {
            rootEl?.querySelector<HTMLElement>(':scope > .value.struct-expand-value')?.click();
        }
    }
</script>

{#if pluginStatus}<div class='sjd-plugin-status sjd-theme-{themeName}' style:color-scheme={scheme} role='alert'>{pluginStatus}</div>{/if}
{#if showSearch}
    <div class='sjd-search' role='search'>
        <input
            type='search'
            aria-label='Search JSON'
            value={typeof search === 'string' ? search : localSearch}
            oninput={event => updateSearchInput(event.currentTarget.value)}
        />
        <span class='sjd-search-status' role='status'>
            {searchIndex >= 0 ? searchIndex + 1 : 0} / {searchMatches.length}{searchTruncated ? '+' : ''}
        </span>
        <button type='button' aria-label='Previous match' disabled={searchMatches.length === 0} onclick={previousMatch}>↑</button>
        <button type='button' aria-label='Next match' disabled={searchMatches.length === 0} onclick={nextMatch}>↓</button>
    </div>
{/if}
<div
    bind:this={rootEl}
    class='view-struct sjd-theme-{themeName}'
    style:color-scheme={scheme}
    role='tree'
    aria-label='JSON data'
    tabindex='-1'
    onclick={onRootClick}
    onkeydown={onTreeKeydown}
>
    {#key data}<ValueNode value={data} {options} autoExpandLimit={expandDepth} context={rootContext} ancestors={[]} schema={schema ?? undefined} schemaRoot={schema ?? undefined} />{/key}{#if popup}<ActionsPopup x={popup.x} y={popup.y} actions={popup.actions} theme={themeName} {scheme} onclose={closeActions} />{/if}{#if schemaTip}<SchemaTooltip {...schemaTip} theme={themeName} />{/if}
</div>
