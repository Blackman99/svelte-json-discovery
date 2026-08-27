<script lang='ts'>
    import type { JsonInspectorTableCellRendererProps } from '../../src/inspector/index.js';

    const { row, value }: JsonInspectorTableCellRendererProps = $props();

    function renderValue(): string {
        if (row.failRenderer) {
            throw new Error('table renderer failed');
        }
        return String(value);
    }
</script>

<span data-testid='recovered-table-cell'>{renderValue()}</span>
