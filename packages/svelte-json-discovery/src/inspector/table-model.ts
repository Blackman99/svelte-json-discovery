import { viewerError } from '../collection.js';
import { hasNativeObjectSource } from '../native-object.js';

export const TABLE_ARRAY_REASON = 'Table view requires an array of plain-object rows.';
export const TABLE_EMPTY_REASON = 'Table view requires at least one loaded plain-object row.';
export const TABLE_ROW_REASON = 'Table requires every loaded row to be a plain object.';

export interface TableRow {
    readonly index: number;
    readonly value: Record<string, unknown>;
    readonly keys: ReadonlySet<string>;
    readCell: (key: string) => unknown;
}

export interface TableSnapshot {
    readonly columns: readonly string[];
    readonly disabledReason: string | null;
    readonly rows: readonly TableRow[];
    readonly totalRows: number;
}

export interface TableWindow {
    readonly batchSize: number;
    loadMore: () => TableSnapshot;
    snapshot: () => TableSnapshot;
}

export function createTableWindow(data: unknown, batchSize: number): TableWindow {
    const normalizedBatch = normalizeBatchSize(batchSize);
    const rows: TableRow[] = [];
    const columns: string[] = [];
    const knownColumns = new Set<string>();
    let disabledReason: string | null = null;
    let totalRows = 0;

    try {
        if (!Array.isArray(data)) {
            disabledReason = TABLE_ARRAY_REASON;
        }
        else {
            const length = Object.getOwnPropertyDescriptor(data, 'length');
            if (!length || !('value' in length) || !Number.isSafeInteger(length.value) || length.value < 0) {
                disabledReason = TABLE_ARRAY_REASON;
            }
            else {
                totalRows = length.value;
                disabledReason = totalRows === 0 ? TABLE_EMPTY_REASON : null;
            }
        }
    }
    catch {
        disabledReason = TABLE_ARRAY_REASON;
    }

    function snapshot(): TableSnapshot {
        return {
            columns: [...columns],
            disabledReason,
            rows: [...rows],
            totalRows,
        };
    }

    function loadMore(): TableSnapshot {
        if (disabledReason !== null) {
            return snapshot();
        }
        try {
            if (!Array.isArray(data)) {
                disabledReason = TABLE_ROW_REASON;
                return snapshot();
            }
            const target = Math.min(rows.length + normalizedBatch, totalRows);
            for (let index = rows.length; index < target; index++) {
                const row = readRow(data, index);
                if (!row) {
                    disabledReason = TABLE_ROW_REASON;
                    break;
                }
                rows.push(row);
                for (const key of row.keys) {
                    if (!knownColumns.has(key)) {
                        knownColumns.add(key);
                        columns.push(key);
                    }
                }
            }
        }
        catch {
            disabledReason = TABLE_ROW_REASON;
        }
        return snapshot();
    }

    if (disabledReason === null) {
        loadMore();
    }

    return Object.freeze({ batchSize: normalizedBatch, loadMore, snapshot });
}

function readRow(data: unknown[], index: number): TableRow | null {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(data, String(index));
        if (!descriptor || !('value' in descriptor) || !isPlainObject(descriptor.value)) {
            return null;
        }
        const value = descriptor.value as Record<string, unknown>;
        const keys = Object.keys(value);
        const keySet = new Set(keys);
        const cellCache = new Map<string, unknown>();
        return Object.freeze({
            index,
            value,
            keys: keySet,
            readCell(key: string) {
                if (!keySet.has(key)) {
                    return undefined;
                }
                if (!cellCache.has(key)) {
                    try {
                        cellCache.set(key, value[key]);
                    }
                    catch (error) {
                        cellCache.set(key, viewerError(error));
                    }
                }
                return cellCache.get(key);
            },
        });
    }
    catch {
        return null;
    }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    try {
        const prototype = Object.getPrototypeOf(value);
        if (prototype === null) {
            return true;
        }
        const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
        if (!constructor || !('value' in constructor) || typeof constructor.value !== 'function') {
            return false;
        }
        const name = Object.getOwnPropertyDescriptor(constructor.value, 'name');
        return Boolean(
            name
            && 'value' in name
            && name.value === 'Object'
            && Object.getOwnPropertyDescriptor(constructor.value, 'prototype')?.value === prototype
            && Object.getPrototypeOf(prototype) === null
            && hasNativeObjectSource(constructor.value),
        );
    }
    catch {
        return false;
    }
}

function normalizeBatchSize(value: number): number {
    return Number.isFinite(value) && value >= 1 ? Math.trunc(value) : 50;
}
