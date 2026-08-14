<!-- JSON viewer — Svelte port of the `struct` view from discoveryjs/discovery -->
<script lang='ts'>
    import type { PopupAction, StructOptions, ValueContext } from './types.js';
    import { setContext } from 'svelte';
    import ActionsPopup from './ActionsPopup.svelte';
    import { intOption, listLimit } from './struct-helpers.js';
    import { CONTEXT_KEY } from './types.js';
    import { copyText, isRegExp, pathToQuery } from './utils.js';
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
        /** Color scheme */
        theme?: 'light' | 'dark' | 'auto';
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
        theme = 'auto',
    }: Props = $props();

    const options: StructOptions = $derived({
        match: isRegExp(match) || typeof match === 'string' ? match : null,
        limit: listLimit(limit, 50),
        limitCollapsed: listLimit(limitCollapsed, 4),
        limitCompactObjectEntries: listLimit(limitCompactObjectEntries, 0),
        maxStringLength: intOption(maxStringLength, 150),
        maxCompactStringLength: intOption(maxCompactStringLength, 40),
        allowedExcessStringLength: intOption(allowedExcessStringLength, 10),
        maxPropertyLength: intOption(maxPropertyLength, Infinity),
        maxCompactPropertyLength: intOption(maxCompactPropertyLength, 35),
    });

    const expandDepth = $derived(
        expanded === true ? 1 : typeof expanded === 'number' ? Math.max(0, Math.trunc(expanded)) : 0,
    );
    const themeName = $derived(theme === 'light' || theme === 'dark' ? theme : 'auto');
    const scheme = $derived(themeName === 'auto' ? 'light dark' : themeName);
    const rootContext = $derived<ValueContext>({ parent: null, host: { '': data }, key: '', index: 0 });

    let rootEl = $state<HTMLElement>();
    let popup = $state<{ x: number; y: number; actions: PopupAction[] } | null>(null);

    setContext(CONTEXT_KEY, { openActions });

    function openActions(anchor: HTMLElement, value: unknown, context: ValueContext) {
        const rect = anchor.getBoundingClientRect();

        popup = {
            x: rect.left,
            y: rect.bottom + 3,
            actions: buildActions(value, context),
        };
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
        if (typeof value === 'string') {
            return [
                { text: 'Copy as quoted string', action: () => copyText(JSON.stringify(value)) },
                { text: 'Copy as unquoted string', action: () => copyText(JSON.stringify(value).slice(1, -1)) },
                { text: 'Copy a value (unescaped)', action: () => copyText(value) },
            ];
        }

        const actions: PopupAction[] = [];
        const path = pathToQuery(buildPath(context));
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
            jsonError = /Maximum call stack size|too much recursion/i.test((e as Error).message)
                ? 'Too much nested structure'
                : (e as Error).message;
        }

        if (path !== '') {
            actions.push({ text: 'Copy path:', notes: path, action: () => copyText(path) });
        }

        const formattedSize = byteSize(formattedStr);
        const compactSize = byteSize(compactStr);
        const formattedCopyError = jsonCopyError(formattedSize);
        const compactCopyError = jsonCopyError(compactSize);

        actions.push({
            groupStart: path !== '',
            text: 'Copy as JSON',
            notes: `(formatted${formatSize(formattedSize)})`,
            error: jsonError ? `Can't export JSON: ${jsonError}` : formattedCopyError,
            disabled: Boolean(jsonError || formattedCopyError),
            action: () => copyText(formattedStr ?? ''),
        });
        actions.push({
            text: 'Copy as JSON',
            notes: `(compact${formatSize(compactSize)})`,
            error: compactCopyError,
            disabled: Boolean(jsonError || compactCopyError),
            action: () => copyText(compactStr ?? ''),
        });

        return actions;
    }

    // clicking the free space of the root block expands a collapsed root,
    // as in the original struct view (.view-struct.struct-expand)
    function onRootClick(event: MouseEvent) {
        if (event.target === rootEl) {
            rootEl?.querySelector<HTMLElement>(':scope > .value.struct-expand-value')?.click();
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
    bind:this={rootEl}
    class='view-struct sjd-theme-{themeName}'
    style:color-scheme={scheme}
    onclick={onRootClick}
>
    {#key data}<ValueNode value={data} {options} autoExpandLimit={expandDepth} context={rootContext} />{/key}{#if popup}<ActionsPopup {...popup} theme={themeName} {scheme} onclose={() => (popup = null)} />{/if}
</div>
