<script lang='ts'>
    import type { JsonPath, StructOptions, ValueContext } from '../types.js';
    import type { PresentedTableCell } from './table-presentation.js';
    import type { JsonInspectorTableCellRendererProps } from './types.js';
    import { createJsonViewerNode } from '../node.js';
    import { valueTokens } from '../preview.js';
    import Preview from '../Preview.svelte';
    import { pathKey, pathToPointer, samePath } from '../utils.js';

    const {
        cell,
        columnIndex,
        currentSearchPath,
        onSelect,
        options,
        rowIndex,
        rowValue,
        selectedPath,
    }: {
        cell: PresentedTableCell;
        columnIndex: number;
        currentSearchPath: JsonPath | null;
        onSelect: (path: JsonPath) => void;
        options: StructOptions;
        rowIndex: number;
        rowValue: Record<string, unknown>;
        selectedPath: JsonPath | null;
    } = $props();

    const path = $derived<JsonPath>(cell.path);
    const pointer = $derived(cell.jsonCompatible ? pathToPointer(path) : null);
    const context = $derived<ValueContext>({
        parent: {
            parent: null,
            host: rowValue,
            key: path.at(-2) ?? rowIndex,
            index: rowIndex,
            path: path.slice(0, -1),
            jsonCompatible: cell.jsonCompatible,
        },
        host: rowValue,
        key: cell.jsonCompatible ? path.at(-1) ?? rowIndex : cell.column.id,
        index: columnIndex,
        path,
        jsonCompatible: cell.jsonCompatible,
    });
    const node = $derived(createJsonViewerNode(cell.value, context));
    const tokens = $derived(valueTokens(cell.value, true, options));
    const Renderer = $derived(cell.column.config.renderer?.component);
    const rendererSnippet = $derived(cell.column.config.renderer?.snippet);
    const rendererProps = $derived<JsonInspectorTableCellRendererProps>({
        column: cell.column.config,
        node,
        row: rowValue,
        rowIndex,
        value: cell.value,
        selected: samePath(selectedPath, path),
        currentSearchMatch: samePath(currentSearchPath, path),
        select: () => onSelect(path),
    });
    const label = $derived(pointer === null
        ? `Select derived cell ${cell.column.id} for row ${rowIndex}`
        : `Select cell ${pointer}`);
    type RendererInputs = ReturnType<typeof rendererInputs>;
    let rendererFailure = $state.raw<RendererInputs | null>(null);
    let rendererBoundaryVersion = $state(0);

    function rendererInputs() {
        return {
            renderer: cell.column.config.renderer,
            column: cell.column.config,
            currentSearchMatch: rendererProps.currentSearchMatch,
            columnIndex,
            jsonCompatible: cell.jsonCompatible,
            path: pathKey(path),
            row: rowValue,
            rowIndex,
            selected: rendererProps.selected,
            value: cell.value,
        };
    }

    function rememberRendererFailure() {
        rendererFailure = rendererInputs();
    }

    $effect(() => {
        const current = rendererInputs();
        const failed = rendererFailure;
        if (failed === null) {
            return;
        }
        const changed = Object.entries(current).some(([key, value]) => !Object.is(failed[key as keyof typeof current], value));
        if (changed) {
            rendererFailure = null;
            rendererBoundaryVersion++;
        }
    });
</script>

{#snippet compactCell()}
    <button
        type='button'
        class='sjd-table-cell-value'
        class:sjd-selected={samePath(selectedPath, path)}
        class:sjd-search-current={samePath(currentSearchPath, path)}
        aria-label={label}
        aria-pressed={samePath(selectedPath, path)}
        data-json-path={pathKey(path)}
        data-json-pointer={node.pointer ?? undefined}
        data-node-kind={node.kind}
        onclick={rendererProps.select}
    >
        <Preview {tokens} />
    </button>
{/snippet}

{#if Renderer || rendererSnippet}
    {#key rendererBoundaryVersion}
        <svelte:boundary onerror={rememberRendererFailure}>
            <div
                class='sjd-table-cell-value sjd-custom-table-cell'
                class:sjd-selected={rendererProps.selected}
                class:sjd-search-current={rendererProps.currentSearchMatch}
                data-json-path={pathKey(path)}
                data-json-pointer={node.pointer ?? undefined}
                data-node-kind={node.kind}
            >
                {#if Renderer}
                    <Renderer {...rendererProps} />
                {:else if rendererSnippet}
                    {@render rendererSnippet(rendererProps)}
                {/if}
            </div>
            {#snippet failed()}
                {@render compactCell()}
            {/snippet}
        </svelte:boundary>
    {/key}
{:else}
    {@render compactCell()}
{/if}
