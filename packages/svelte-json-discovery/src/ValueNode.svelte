<!-- Recursive value renderer — port of renderValue/expandValue/renderEntries
     from discoveryjs/discovery src/views/struct/index.js.
     Template lines are kept tight (no whitespace between output nodes) since
     the markup is rendered in white-space sensitive contexts. -->
<script lang="ts">
    import { getContext } from 'svelte';
    import ValueNode from './ValueNode.svelte';
    import Preview from './Preview.svelte';
    import { valueTokens } from './preview.js';
    import { isSortedKeys, isValueExpandable, shouldAutoExpand, valueEntries } from './struct-helpers.js';
    import { isArray, isSet, matchAll, numParts, stringifyIfNeeded } from './utils.js';
    import { CONTEXT_KEY } from './types.js';
    import type { JsonViewerApi, StructOptions, ValueContext } from './types.js';

    let { value, options, context, autoExpandLimit = 0 }: {
        value: unknown;
        options: StructOptions;
        context: ValueContext;
        autoExpandLimit?: number;
    } = $props();

    const api = getContext<JsonViewerApi>(CONTEXT_KEY);

    const expandable = $derived(isValueExpandable(value, options));
    const limitNum = $derived(options.limit === false ? Infinity : options.limit);
    const isStringValue = $derived(typeof value === 'string');
    const isArrayLike = $derived(isArray(value) || isSet(value));

    // initial auto-expand (mirrors renderValue + shouldAutoExpand); deliberately
    // computed from the initial prop values only
    // svelte-ignore state_referenced_locally
    const initiallyExpanded = autoExpandLimit > 0 && isValueExpandable(value, options) && shouldAutoExpand(value);
    // svelte-ignore state_referenced_locally
    const initialLimit = options.limit === false ? Infinity : options.limit;

    let expanded = $state(initiallyExpanded);
    let visibleCount = $state(initiallyExpanded ? initialLimit : 0);
    let sortKeys = $state(false);
    let asText = $state(false);

    const rawEntries = $derived(expanded && !isStringValue ? valueEntries(value) : []);
    const sorted = $derived(isArrayLike ? true : isSortedKeys(rawEntries));
    const entries = $derived(!isArrayLike && sortKeys && !sorted
        ? [...rawEntries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        : rawEntries);
    const size = $derived(entries.length);
    const visibleEntries = $derived(entries.slice(0, visibleCount));
    const restCount = $derived(Math.max(size - visibleEntries.length, 0));
    const childExpandLimit = $derived(autoExpandLimit > 0 ? autoExpandLimit - 1 : 0);

    const escapedLength = $derived(isStringValue ? stringifyIfNeeded(value as string).length : 0);
    const stringChunks = $derived.by(() => {
        const chunks: { isMatch: boolean; text: string }[] = [];

        if (isStringValue) {
            if (options.match) {
                matchAll(
                    value as string,
                    options.match,
                    (text) => chunks.push({ isMatch: false, text }),
                    (text) => {
                        chunks.push({ isMatch: true, text });
                    }
                );
            } else {
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
        expanded = true;
    }

    function collapse() {
        expanded = false;
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
            ? name.slice(0, options.maxPropertyLength) + '…'
            : name;
    }

    function childContext(key: string | number, index: number): ValueContext {
        return { parent: context, host: value, key, index };
    }

    function showActions(event: Event) {
        api?.openActions(event.currentTarget as HTMLElement, value, context);
    }

    // non-breaking spaces, as in the original objectKeyProtoEl ('\xA0')
    const nbsp = String.fromCharCode(160);
    const keyIndent = nbsp.repeat(4);

    function chunkText(text: string) {
        return asText ? text : stringifyIfNeeded(text);
    }

    function keydownActivate(handler: (event: Event) => void) {
        return (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handler(event);
            }
        };
    }
</script>

{#snippet actionButton(action: string, title: string | undefined, handler: (event: Event) => void)}<span class="struct-action-button" data-action={action} {title} role="button" tabindex="0" onclick={handler} onkeydown={keydownActivate(handler)}></span>{/snippet}

{#snippet num(value: number)}{#each numParts(value) as part, i}{#if i > 0}<span class="num-delim"></span>{/if}{part}{/each}{/snippet}

{#snippet moreButtons()}{#if restCount > 0}<span class="more-buttons">{#if restCount > limitNum}<button class="more-button" onclick={() => (visibleCount += limitNum)}>Show {limitNum} more...</button>{/if}<button class="more-button" onclick={() => (visibleCount = size)}>Show all the rest {restCount} items...</button></span>{/if}{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
{#if !expanded}<span class="value" class:struct-expand-value={expandable} role={expandable ? 'button' : undefined} tabindex={expandable ? 0 : undefined} onclick={expandable ? onCollapsedClick : undefined} onkeydown={expandable ? keydownActivate(expand) : undefined}><Preview tokens={valueTokens(value, false, options)} /></span>{:else if isStringValue}<span class="value struct-expanded" class:string-value-as-text={asText}>"{@render actionButton('collapse', undefined, collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{@render actionButton('toggle-string-mode', 'Toggle string show mode', () => (asText = !asText))}<span class="string-length">length: {@render num(escapedLength)} chars</span><span class="string-text-wrapper"><span class="string-text">{#each stringChunks as chunk}{#if chunk.isMatch}<span class="match">{chunkText(chunk.text)}</span>{:else}{chunkText(chunk.text)}{/if}{/each}</span></span>"</span>{:else if isArrayLike}<span class="value struct-expanded">[{@render actionButton('collapse', undefined, collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{#if size > 1}<span class="value-size">{@render num(size)} elements</span>{/if}{#each visibleEntries as entry, i (i)}<div class="entry-line" data-index={i > 0 && i % 10 === 9 ? i + 1 : undefined}><ValueNode value={entry[1]} {options} autoExpandLimit={childExpandLimit} context={childContext(entry[0], i)} />{#if i !== size - 1},{/if}</div>{/each}{@render moreButtons()}]</span>{:else}<span class="value struct-expanded" class:sort-keys={sortKeys}>&lbrace;{@render actionButton('collapse', undefined, collapse)}{@render actionButton('value-actions', 'Value actions', showActions)}{#if !sorted}{@render actionButton('toggle-sort-keys', 'Toggle key sorting', () => (sortKeys = !sortKeys))}{/if}{#if size > 1}<span class="value-size">{@render num(size)} entries</span>{/if}{#each visibleEntries as entry, i (entry[0])}<div class="entry-line" data-index={i > 0 && i % 10 === 9 ? i + 1 : undefined}><span class="label">{keyIndent}<span class="property">{fitKey(entry[0])}</span>:{nbsp}</span><ValueNode value={entry[1]} {options} autoExpandLimit={childExpandLimit} context={childContext(entry[0], i)} />{#if i !== size - 1},{/if}</div>{/each}{@render moreButtons()}&rbrace;</span>{/if}
