<!-- Recursive value renderer — port of renderValue/expandValue/renderEntries
     from discoveryjs/discovery src/views/struct/index.js.
     Template lines are kept tight (no whitespace between output nodes) since
     the markup is rendered in white-space sensitive contexts. -->
<script lang='ts'>
    import type { JsonViewerApi, JsonViewerRendererProps, StructOptions, ValueContext } from './types.js';
    import { getContext } from 'svelte';
    import { createCollectionReader } from './collection.js';
    import { createJsonViewerNode } from './node.js';
    import { valueTokens } from './preview.js';
    import Preview from './Preview.svelte';
    import { childSchema, schemaInfo } from './schema.js';
    import { isValueExpandable, shouldAutoExpand } from './struct-helpers.js';
    import { CONTEXT_KEY } from './types.js';
    import { matchAll, numParts, objectToString, pathKey, pathToQuery, stringifyIfNeeded } from './utils.js';
    import ValueNode from './ValueNode.svelte';

    const { value, options, context, ancestors, autoExpandLimit = 0, schema, schemaRoot, forceBuiltIn = false }: {
        value: unknown;
        options: StructOptions;
        context: ValueContext;
        ancestors: readonly { value: object; path: readonly (string | number)[] }[];
        autoExpandLimit?: number;
        schema?: Record<string, unknown>;
        schemaRoot?: Record<string, unknown>;
        forceBuiltIn?: boolean;
    } = $props();

    const api = getContext<JsonViewerApi>(CONTEXT_KEY);
    const node = $derived(createJsonViewerNode(value, context));
    const customRenderer = $derived(forceBuiltIn ? null : api.resolveRenderer(node));
    const RendererComponent = $derived(customRenderer?.component);
    const RendererSnippet = $derived(customRenderer?.snippet);
    const rendererProps = $derived<JsonViewerRendererProps>({
        node,
        density: 'full',
        controller: api.controller,
    });

    const circularAncestor = $derived(
        value !== null && typeof value === 'object'
            ? ancestors.find(ancestor => ancestor.value === value)
            : undefined,
    );
    const childAncestors = $derived(
        value !== null && typeof value === 'object' && !circularAncestor
            ? [...ancestors, { value, path: context.path }]
            : ancestors,
    );
    const expandable = $derived(!circularAncestor && isValueExpandable(value, options));
    const limitNum = $derived(options.limit === false ? Infinity : options.limit);
    const isStringValue = $derived(typeof value === 'string');
    // ValueNode instances are recreated when the root data identity changes.
    // Keeping one reader preserves incremental Set/Map iterator caches.
    // svelte-ignore state_referenced_locally
    const collection = createCollectionReader(value);
    const isArrayLike = $derived(collection.kind === 'array');

    // initial auto-expand (mirrors renderValue + shouldAutoExpand); deliberately
    // computed from the initial prop values only
    // svelte-ignore state_referenced_locally
    const initiallyExpanded = autoExpandLimit > 0
        && isValueExpandable(value, options)
        && shouldAutoExpand(value, options.limitCollapsed === false ? Infinity : options.limitCollapsed);
    // svelte-ignore state_referenced_locally
    const initialLimit = options.limit === false ? Infinity : options.limit;

    let visibleCount = $state(initiallyExpanded ? initialLimit : 0);
    let sortKeys = $state(false);
    let asText = $state(false);

    const expanded = $derived(api.isExpanded(context.path, initiallyExpanded));
    const sorted = $derived(collection.sorted);
    const size = $derived(collection.size);
    const visibleEntries = $derived(expanded && !isStringValue ? collection.read(visibleCount, sortKeys) : []);
    const restCount = $derived(Math.max(size - visibleEntries.length, 0));
    const childExpandLimit = $derived(autoExpandLimit > 0 ? autoExpandLimit - 1 : 0);

    $effect(() => {
        if (expanded && visibleCount === 0) {
            visibleCount = initialLimit;
        }

        const target = api.revealPath();
        if (expanded && target && target.length > context.path.length
            && context.path.every((part, index) => part === target[index])) {
            const targetKey = target[context.path.length];
            const targetIndex = collection.indexOf(targetKey, sortKeys);
            if (targetIndex >= visibleCount) {
                visibleCount = targetIndex + 1;
            }
        }
    });

    const escapedLength = $derived(isStringValue ? stringifyIfNeeded(value as string).length : 0);
    const stringChunks = $derived.by(() => {
        const chunks: { isMatch: boolean; text: string }[] = [];

        if (isStringValue) {
            if (options.match) {
                matchAll(
                    value as string,
                    options.match,
                    text => chunks.push({ isMatch: false, text }),
                    (text) => {
                        chunks.push({ isMatch: true, text });
                    },
                    options.matchIgnoreCase,
                );
            }
            else {
                chunks.push({ isMatch: false, text: value as string });
            }
        }

        return chunks;
    });

    function expand() {
        if (!expandable) {
            return;
        }

        visibleCount = limitNum;
        api.setExpanded(context.path, true);
    }

    function collapse() {
        api.setExpanded(context.path, false);
    }

    function onCollapsedClick(event: Event) {
        // let links inside a collapsed preview work without toggling
        if (event.target instanceof Element && event.target.closest('a')) {
            return;
        }

        expand();
    }

    function fitKey(key: string | number) {
        const name = String(key);

        return name.length > options.maxPropertyLength
            ? `${name.slice(0, options.maxPropertyLength)}…`
            : name;
    }

    function childContext(key: string | number, index: number): ValueContext {
        const jsonCompatible = context.jsonCompatible
            && (Array.isArray(value) || objectToString(value) === '[object Object]');

        return {
            parent: context,
            host: value,
            key,
            index,
            path: [...context.path, key],
            jsonCompatible,
        };
    }

    function showActions(event: Event) {
        api?.openActions(event.currentTarget as HTMLElement, value, context);
    }

    function childSchemaFor(key: string | number) {
        return schema ? childSchema(schema, key, schemaRoot ?? schema) : undefined;
    }

    function fieldDoc(key: string | number) {
        return schemaInfo(childSchemaFor(key));
    }

    function showFieldDoc(event: Event, key: string | number) {
        const info = fieldDoc(key);

        if (info) {
            api?.openSchemaTip(event.currentTarget as HTMLElement, info);
        }
    }

    function hideFieldDoc() {
        api?.closeSchemaTip();
    }

    // non-breaking spaces, as in the original objectKeyProtoEl ('\xA0')
    const nbsp = String.fromCharCode(160);
    const keyIndent = nbsp.repeat(4);

    function chunkText(text: string) {
        return asText ? text : stringifyIfNeeded(text);
    }

    function keydownActivate(handler: (event: Event) => void) {
        return (event: KeyboardEvent) => {
            const action = event.currentTarget as HTMLElement;

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handler(event);
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                action.closest<HTMLElement>('[role="treeitem"]')?.focus();
            }
            else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const treeItem = action.closest<HTMLElement>('[role="treeitem"]');
                const actions = treeItem ? [...treeItem.querySelectorAll<HTMLElement>(':scope > .struct-action-button')] : [];
                const index = actions.indexOf(action);
                const offset = event.key === 'ArrowRight' ? 1 : -1;
                actions[(index + offset + actions.length) % actions.length]?.focus();
            }
        };
    }

    function selectLeaf() {
        api.select(context.path);
    }
</script>

{#snippet actionButton(action: string, title: string | undefined, handler: (event: Event) => void)}<span class='struct-action-button' data-action={action} title={title ?? action} aria-label={title ?? action} role='button' tabindex='-1' onclick={handler} onkeydown={keydownActivate(handler)}></span>{/snippet}

{#snippet num(value: number)}{#each numParts(value) as part, i (i)}{#if i > 0}<span class='num-delim'></span>{/if}{part}{/each}{/snippet}

{#snippet moreButtons()}{#if restCount > 0}<span class='more-buttons'>{#if restCount > limitNum}<button class='more-button' onclick={() => (visibleCount += limitNum)}>Show {limitNum} more...</button>{/if}<button class='more-button' onclick={() => (visibleCount = size)}>Show all the rest {restCount} items...</button></span>{/if}{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events (keyboard handling is delegated to the tree root) -->
{#if customRenderer}<svelte:boundary><span class='value sjd-custom-renderer' class:sjd-selected={api.isSelected(context.path)} class:sjd-search-match={api.isSearchMatch(context.path)} class:sjd-search-current={api.isCurrentSearchMatch(context.path)} data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onclick={selectLeaf} onfocus={() => api.setFocused(context.path)}>{#if RendererComponent}<RendererComponent {...rendererProps} />{:else if RendererSnippet}{@render RendererSnippet(rendererProps)}{/if}</span>{#snippet failed()}<ValueNode {value} {options} {context} {ancestors} {autoExpandLimit} {schema} {schemaRoot} forceBuiltIn />{/snippet}</svelte:boundary>{:else if circularAncestor}<span class='value circular-value' data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onfocus={() => api.setFocused(context.path)}>[Circular → {pathToQuery([...circularAncestor.path]) || '<root>'}]</span>{:else if !expanded}<span class='value' class:struct-expand-value={expandable} class:sjd-selected={api.isSelected(context.path)} class:sjd-search-match={api.isSearchMatch(context.path)} class:sjd-search-current={api.isCurrentSearchMatch(context.path)} data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-expanded={expandable ? false : undefined} aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onclick={expandable ? onCollapsedClick : selectLeaf} onfocus={() => api.setFocused(context.path)}><Preview tokens={valueTokens(value, false, options)} /></span>{:else if isStringValue}<span class='value struct-expanded' class:string-value-as-text={asText} class:sjd-selected={api.isSelected(context.path)} class:sjd-search-match={api.isSearchMatch(context.path)} class:sjd-search-current={api.isCurrentSearchMatch(context.path)} data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-expanded='true' aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onfocus={() => api.setFocused(context.path)}>"{@render actionButton('collapse', 'Collapse', collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{@render actionButton('toggle-string-mode', 'Toggle string show mode', () => (asText = !asText))}<span class='string-length'>length: {@render num(escapedLength)} chars</span><span class='string-text-wrapper'><span class='string-text'>{#each stringChunks as chunk, i (i)}{#if chunk.isMatch}<span class='match'>{chunkText(chunk.text)}</span>{:else}{chunkText(chunk.text)}{/if}{/each}</span></span>"</span>{:else if isArrayLike}<span class='value struct-expanded' class:sjd-selected={api.isSelected(context.path)} class:sjd-search-match={api.isSearchMatch(context.path)} class:sjd-search-current={api.isCurrentSearchMatch(context.path)} data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-expanded='true' aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onfocus={() => api.setFocused(context.path)}>[{@render actionButton('collapse', 'Collapse', collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{#if size > 1}<span class='value-size'>{@render num(size)} elements</span>{/if}{#each visibleEntries as entry, i (i)}<div class='entry-line' role='group' data-index={i > 0 && i % 10 === 9 ? i + 1 : undefined}><ValueNode value={entry[1]} {options} autoExpandLimit={childExpandLimit} context={childContext(entry[0], i)} ancestors={childAncestors} schema={childSchemaFor(entry[0])} {schemaRoot} />{#if i !== size - 1},{/if}</div>{/each}{@render moreButtons()}]</span>{:else}<span class='value struct-expanded' class:sort-keys={sortKeys} class:sjd-selected={api.isSelected(context.path)} class:sjd-search-match={api.isSearchMatch(context.path)} class:sjd-search-current={api.isCurrentSearchMatch(context.path)} data-json-path={pathKey(context.path)} data-node-label={context.parent === null ? 'root' : String(context.key)} role='treeitem' aria-level={context.path.length + 1} aria-expanded='true' aria-selected={api.isSelected(context.path)} tabindex={api.isFocused(context.path) ? 0 : -1} onfocus={() => api.setFocused(context.path)}>&lbrace;{@render actionButton('collapse', 'Collapse', collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{#if !sorted}{@render actionButton('toggle-sort-keys', 'Toggle key sorting', () => (sortKeys = !sortKeys))}{/if}{#if size > 1}<span class='value-size'>{@render num(size)} entries</span>{/if}{#each visibleEntries as entry, i (entry[0])}<div class='entry-line' role='group' data-index={i > 0 && i % 10 === 9 ? i + 1 : undefined}><span class='label'>{keyIndent}<span class='property' role='term' class:has-doc={fieldDoc(entry[0]) !== null} class:match={api.isSearchMatch([...context.path, entry[0]])} onmouseenter={e => showFieldDoc(e, entry[0])} onmouseleave={hideFieldDoc}>{fitKey(entry[0])}</span>:{nbsp}</span><ValueNode value={entry[1]} {options} autoExpandLimit={childExpandLimit} context={childContext(entry[0], i)} ancestors={childAncestors} schema={childSchemaFor(entry[0])} {schemaRoot} />{#if i !== size - 1},{/if}</div>{/each}{@render moreButtons()}&rbrace;</span>{/if}
