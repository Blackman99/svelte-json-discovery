import type { JsonPath } from '../types.js';
import type { TableRow, TableSnapshot } from './table-model.js';
import type { JsonInspectorTableColumn, JsonInspectorTableSort } from './types.js';
import { viewerError } from '../collection.js';
import { isPlainObject } from './table-model.js';

export interface PresentedTableColumn {
    readonly config: JsonInspectorTableColumn;
    readonly id: string;
    readonly title: string;
    readonly sortable: boolean;
    readonly automaticKey: string | null;
}

export interface PresentedTableCell {
    readonly column: PresentedTableColumn;
    readonly jsonCompatible: boolean;
    readonly path: JsonPath;
    readonly present: boolean;
    readonly value: unknown;
}

export interface PresentedTableRow {
    readonly cells: readonly PresentedTableCell[];
    readonly source: TableRow;
}

export interface TablePresentation {
    readonly columns: readonly PresentedTableColumn[];
    readonly rows: readonly PresentedTableRow[];
    readonly sort: JsonInspectorTableSort | null;
}

export function createTablePresentation(
    snapshot: TableSnapshot,
    configuredColumns: readonly JsonInspectorTableColumn[] | undefined,
    sort: JsonInspectorTableSort | null,
    locallySorted: boolean,
): TablePresentation {
    const columns = resolveColumns(snapshot.columns, configuredColumns);
    const effectiveSort = normalizeSort(sort, columns);
    const rows = snapshot.rows.map(source => ({
        source,
        cells: columns.map(column => resolveCell(source, column)),
    }));

    if (locallySorted && effectiveSort !== null) {
        const columnIndex = columns.findIndex(column => column.id === effectiveSort.columnId);
        const direction = effectiveSort.direction === 'ascending' ? 1 : -1;
        rows.sort((left, right) => direction * compareValues(left.cells[columnIndex]?.value, right.cells[columnIndex]?.value));
    }

    return { columns, rows, sort: effectiveSort };
}

function resolveColumns(
    automaticColumns: readonly string[],
    configuredColumns: readonly JsonInspectorTableColumn[] | undefined,
): PresentedTableColumn[] {
    if (configuredColumns === undefined) {
        return automaticColumns.map(key => ({
            automaticKey: key,
            config: { id: key, path: [key], sortable: true },
            id: key,
            sortable: true,
            title: key,
        }));
    }

    const ids = new Set<string>();
    const resolved: PresentedTableColumn[] = [];
    for (const column of configuredColumns) {
        if (column.visible === false || ids.has(column.id)) {
            continue;
        }
        ids.add(column.id);
        resolved.push({
            automaticKey: null,
            config: column,
            id: column.id,
            sortable: column.sortable === true,
            title: column.title ?? column.id,
        });
    }
    return resolved;
}

function resolveCell(row: TableRow, column: PresentedTableColumn): PresentedTableCell {
    if (column.automaticKey !== null) {
        return {
            column,
            jsonCompatible: true,
            path: [row.index, column.automaticKey],
            present: row.keys.has(column.automaticKey),
            value: row.readCell(column.automaticKey),
        };
    }

    if (column.config.accessor) {
        try {
            return {
                column,
                jsonCompatible: false,
                path: [row.index],
                present: true,
                value: column.config.accessor(row.value, row.index),
            };
        }
        catch (error) {
            return {
                column,
                jsonCompatible: false,
                path: [row.index],
                present: true,
                value: viewerError(error),
            };
        }
    }

    const resolved = readPath(row.value, column.config.path);
    return {
        column,
        jsonCompatible: resolved.jsonCompatible,
        path: [row.index, ...column.config.path],
        present: true,
        value: resolved.value,
    };
}

function readPath(row: Record<string, unknown>, path: JsonPath): { value: unknown; jsonCompatible: boolean } {
    let value: unknown = row;
    let jsonCompatible = true;
    try {
        for (const part of path) {
            if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
                return { value: undefined, jsonCompatible };
            }
            jsonCompatible = jsonCompatible && (Array.isArray(value) || isPlainObject(value));
            value = Reflect.get(value, part);
        }
        return { value, jsonCompatible };
    }
    catch (error) {
        return { value: viewerError(error), jsonCompatible: false };
    }
}

function normalizeSort(
    sort: JsonInspectorTableSort | null,
    columns: readonly PresentedTableColumn[],
): JsonInspectorTableSort | null {
    return sort !== null && columns.some(column => column.id === sort.columnId && column.sortable)
        ? sort
        : null;
}

function compareValues(left: unknown, right: unknown): number {
    if (Object.is(left, right)) {
        return 0;
    }
    if (left === null || left === undefined) {
        return 1;
    }
    if (right === null || right === undefined) {
        return -1;
    }
    if (typeof left === 'number' && typeof right === 'number') {
        return (Number.isNaN(left) ? 1 : 0) - (Number.isNaN(right) ? 1 : 0) || left - right;
    }
    if (typeof left === 'bigint' && typeof right === 'bigint') {
        return left < right ? -1 : 1;
    }
    try {
        return String(left).localeCompare(String(right));
    }
    catch {
        return 0;
    }
}
