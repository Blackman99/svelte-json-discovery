<script lang='ts'>
    import type { JsonPath, StructOptions } from '../types.js';
    import type { TableSnapshot, TableWindow } from './table-model.js';
    import type { JsonInspectorTableColumn, JsonInspectorTableSort } from './types.js';
    import { pathToPointer, samePath } from '../utils.js';
    import { createTablePresentation } from './table-presentation.js';
    import TableCell from './TableCell.svelte';

    const {
        currentSearchPath,
        columns,
        model,
        onSelect,
        onSortChange,
        onWindowChange,
        options,
        selectedPath,
        snapshot,
        sort,
        theme,
    }: {
        columns: readonly JsonInspectorTableColumn[] | undefined;
        currentSearchPath: JsonPath | null;
        model: TableWindow;
        onSelect: (path: JsonPath) => void;
        onSortChange: ((sort: JsonInspectorTableSort | null) => void) | undefined;
        onWindowChange: () => void;
        options: StructOptions;
        selectedPath: JsonPath | null;
        snapshot: TableSnapshot;
        sort: JsonInspectorTableSort | null | undefined;
        theme: 'auto' | 'dark' | 'light';
    } = $props();

    const remaining = $derived(Math.max(snapshot.totalRows - snapshot.rows.length, 0));
    const nextCount = $derived(Math.min(model.batchSize, remaining));
    let localSort = $state<JsonInspectorTableSort | null>(null);
    const controlledSort = $derived(sort !== undefined);
    const requestedSort = $derived(controlledSort ? sort ?? null : localSort);
    const presentation = $derived(createTablePresentation(snapshot, columns, requestedSort, !controlledSort));

    $effect(() => {
        if (!controlledSort && localSort !== null && presentation.sort === null) {
            localSort = null;
        }
    });

    function loadMore() {
        model.loadMore();
        onWindowChange();
    }

    function nextSort(columnId: string): JsonInspectorTableSort | null {
        if (presentation.sort?.columnId !== columnId) {
            return { columnId, direction: 'ascending' };
        }
        if (presentation.sort.direction === 'ascending') {
            return { columnId, direction: 'descending' };
        }
        return null;
    }

    function requestSort(columnId: string) {
        const next = nextSort(columnId);
        if (!controlledSort) {
            localSort = next;
        }
        onSortChange?.(next);
    }

    function sortLabel(columnId: string, title: string): string {
        const next = nextSort(columnId);
        return next === null ? `Clear ${title} sorting` : `Sort ${title} ${next.direction}`;
    }
</script>

<div class='sjd-table-view view-struct sjd-theme-{theme}' style:color-scheme={theme === 'auto' ? 'light dark' : theme}>
    <span class='sjd-table-ordering' role='status' aria-label='Table ordering scope'>
        {controlledSort ? 'Ordering applies to full data and is controlled by the host.' : 'Ordering applies to the current loaded window.'}
    </span>
    <table aria-label='JSON table'>
        <thead>
            <tr>
                <th scope='col'>Row</th>
                {#each presentation.columns as column (column.id)}
                    <th
                        scope='col'
                        aria-sort={presentation.sort?.columnId === column.id ? presentation.sort.direction : undefined}
                    >
                        {#if column.sortable}
                            <button type='button' aria-label={sortLabel(column.id, column.title)} onclick={() => requestSort(column.id)}>{column.title}</button>
                        {:else}
                            {column.title}
                        {/if}
                    </th>
                {/each}
            </tr>
        </thead>
        <tbody>
            {#each presentation.rows as row (row.source.index)}
                <tr class:sjd-selected={samePath(selectedPath, [row.source.index])}>
                    <th scope='row'>
                        <button
                            type='button'
                            aria-label={`Select row ${row.source.index}`}
                            aria-pressed={samePath(selectedPath, [row.source.index])}
                            onclick={() => onSelect([row.source.index])}
                        >{row.source.index}</button>
                    </th>
                    {#each row.cells as cell, columnIndex (cell.column.id)}
                        <td>
                            {#if cell.present}
                                <TableCell
                                    {cell}
                                    {columnIndex}
                                    {currentSearchPath}
                                    {onSelect}
                                    {options}
                                    rowIndex={row.source.index}
                                    rowValue={row.source.value}
                                    {selectedPath}
                                />
                            {:else}
                                <span class='sjd-table-missing' aria-label={`Missing cell ${pathToPointer(cell.path)}`}>—</span>
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
