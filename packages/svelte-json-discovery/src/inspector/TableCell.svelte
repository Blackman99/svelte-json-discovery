<script lang='ts'>
    import type { JsonPath, StructOptions, ValueContext } from '../types.js';
    import { createJsonViewerNode } from '../node.js';
    import { valueTokens } from '../preview.js';
    import Preview from '../Preview.svelte';
    import { pathKey, pathToPointer, samePath } from '../utils.js';

    const {
        column,
        columnIndex,
        currentSearchPath,
        onSelect,
        options,
        rowIndex,
        rowValue,
        selectedPath,
        value,
    }: {
        column: string;
        columnIndex: number;
        currentSearchPath: JsonPath | null;
        onSelect: (path: JsonPath) => void;
        options: StructOptions;
        rowIndex: number;
        rowValue: Record<string, unknown>;
        selectedPath: JsonPath | null;
        value: unknown;
    } = $props();

    const path = $derived<JsonPath>([rowIndex, column]);
    const pointer = $derived(pathToPointer(path));
    const context = $derived<ValueContext>({
        parent: {
            parent: {
                parent: null,
                host: { '': rowValue },
                key: '',
                index: 0,
                path: [],
                jsonCompatible: true,
            },
            host: [rowValue],
            key: rowIndex,
            index: rowIndex,
            path: [rowIndex],
            jsonCompatible: true,
        },
        host: rowValue,
        key: column,
        index: columnIndex,
        path,
        jsonCompatible: true,
    });
    const node = $derived(createJsonViewerNode(value, context));
    const tokens = $derived(valueTokens(value, true, options));
</script>

<button
    type='button'
    class='sjd-table-cell-value'
    class:sjd-selected={samePath(selectedPath, path)}
    class:sjd-search-current={samePath(currentSearchPath, path)}
    aria-label={`Select cell ${pointer}`}
    aria-pressed={samePath(selectedPath, path)}
    data-json-path={pathKey(path)}
    data-json-pointer={node.pointer}
    data-node-kind={node.kind}
    onclick={() => onSelect(path)}
><Preview {tokens} /></button>
