<script lang='ts'>
    import type { JsonInspectorTableCellRendererProps } from '../../src/inspector/index.js';

    const { column, currentSearchMatch, node, rowIndex, select, selected, value }: JsonInspectorTableCellRendererProps = $props();
</script>

<button
    type='button'
    aria-label={`Select custom ${column.id}`}
    aria-pressed={selected}
    data-current-search-match={currentSearchMatch}
    onclick={select}
>
    <span data-testid='custom-table-cell'>{column.id}:{rowIndex}:{node.pointer ?? 'virtual'}:{String(value)}</span>
</button>
