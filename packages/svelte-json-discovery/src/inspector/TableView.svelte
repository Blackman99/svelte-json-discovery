<script lang='ts'>
    import type { JsonPath, StructOptions } from '../types.js';
    import type { TableSnapshot, TableWindow } from './table-model.js';
    import { pathToPointer, samePath } from '../utils.js';
    import TableCell from './TableCell.svelte';

    const {
        currentSearchPath,
        model,
        onSelect,
        onWindowChange,
        options,
        selectedPath,
        snapshot,
        theme,
    }: {
        currentSearchPath: JsonPath | null;
        model: TableWindow;
        onSelect: (path: JsonPath) => void;
        onWindowChange: () => void;
        options: StructOptions;
        selectedPath: JsonPath | null;
        snapshot: TableSnapshot;
        theme: 'auto' | 'dark' | 'light';
    } = $props();

    const remaining = $derived(Math.max(snapshot.totalRows - snapshot.rows.length, 0));
    const nextCount = $derived(Math.min(model.batchSize, remaining));

    function loadMore() {
        model.loadMore();
        onWindowChange();
    }
</script>

<div class='sjd-table-view view-struct sjd-theme-{theme}' style:color-scheme={theme === 'auto' ? 'light dark' : theme}>
    <table aria-label='JSON table'>
        <thead>
            <tr>
                <th scope='col'>Row</th>
                {#each snapshot.columns as column (column)}
                    <th scope='col'>{column}</th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each snapshot.rows as row (row.index)}
                <tr class:sjd-selected={samePath(selectedPath, [row.index])}>
                    <th scope='row'>
                        <button
                            type='button'
                            aria-label={`Select row ${row.index}`}
                            aria-pressed={samePath(selectedPath, [row.index])}
                            onclick={() => onSelect([row.index])}
                        >{row.index}</button>
                    </th>
                    {#each snapshot.columns as column, columnIndex (column)}
                        <td>
                            {#if row.keys.has(column)}
                                <TableCell
                                    {column}
                                    {columnIndex}
                                    {currentSearchPath}
                                    {onSelect}
                                    {options}
                                    rowIndex={row.index}
                                    rowValue={row.value}
                                    {selectedPath}
                                    value={row.readCell(column)}
                                />
                            {:else}
                                <span class='sjd-table-missing' aria-label={`Missing cell ${pathToPointer([row.index, column])}`}>—</span>
                            {/if}
                        </td>
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
    {#if remaining > 0}
        <button class='sjd-table-more' type='button' onclick={loadMore}>
            Show {nextCount} more {nextCount === 1 ? 'row' : 'rows'}
        </button>
    {/if}
</div>
