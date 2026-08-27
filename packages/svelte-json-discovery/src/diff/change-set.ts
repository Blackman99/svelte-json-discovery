import type { JsonPath } from '../types.js';
import type { Change, ChangeKind, ChangeSet } from './types.js';
import { pathToPointer } from '../utils.js';

export interface NormalizedChangeSet {
    readonly changeSet: ChangeSet;
    readonly invalidCount: number;
}

const CHANGE_KINDS = new Set<ChangeKind>(['added', 'removed', 'changed', 'moved']);
const MISSING = Symbol('missing data property');

export function normalizeChangeSet(value: unknown): NormalizedChangeSet {
    const changes: Change[] = [];
    let invalidCount = 0;
    const source = readDataProperty(value, 'changes');
    if (!isArray(source)) {
        return { changeSet: freezeChangeSet(changes), invalidCount: 1 };
    }

    const length = readDataProperty(source, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
        return { changeSet: freezeChangeSet(changes), invalidCount: 1 };
    }
    const indices = arrayIndices(source, length);
    if (indices === null) {
        return { changeSet: freezeChangeSet(changes), invalidCount: 1 };
    }
    invalidCount += length - indices.length;
    for (const index of indices) {
        const candidate = readDataProperty(source, String(index));
        const normalized = normalizeChange(candidate);
        if (normalized === null) {
            invalidCount++;
        }
        else {
            changes.push(normalized);
        }
    }

    return { changeSet: freezeChangeSet(changes), invalidCount };
}

function normalizeChange(value: unknown): Change | null {
    const kind = readDataProperty(value, 'kind');
    const path = normalizePath(readDataProperty(value, 'path'));
    const pointer = readDataProperty(value, 'pointer');
    if (typeof kind !== 'string' || !CHANGE_KINDS.has(kind as ChangeKind) || path === null || pointer !== pathToPointer(path)) {
        return null;
    }

    if (kind === 'moved') {
        const previousPath = normalizePath(readDataProperty(value, 'previousPath'));
        const previousPointer = readDataProperty(value, 'previousPointer');
        if (previousPath === null || previousPointer !== pathToPointer(previousPath)) {
            return null;
        }
        return Object.freeze({ kind, path, pointer, previousPath, previousPointer });
    }

    return Object.freeze({ kind, path, pointer }) as Change;
}

function normalizePath(value: unknown): JsonPath | null {
    if (!isArray(value)) {
        return null;
    }
    const length = readDataProperty(value, 'length');
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
        return null;
    }
    const indices = arrayIndices(value, length);
    if (indices === null || indices.length !== length) {
        return null;
    }
    const path: Array<string | number> = [];
    for (const index of indices) {
        const segment = readDataProperty(value, String(index));
        if (segment === MISSING) {
            return null;
        }
        if (typeof segment === 'string') {
            path.push(segment);
        }
        else if (typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0) {
            path.push(segment);
        }
        else {
            return null;
        }
    }
    return Object.freeze(path);
}

function arrayIndices(value: unknown[], length: number): number[] | null {
    try {
        return Object.getOwnPropertyNames(value)
            .filter(key => key !== 'length' && isArrayIndex(key, length))
            .map(Number)
            .sort((left, right) => left - right);
    }
    catch {
        return null;
    }
}

function isArray(value: unknown): value is unknown[] {
    try {
        return Array.isArray(value);
    }
    catch {
        return false;
    }
}

function isArrayIndex(key: string, length: number): boolean {
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function readDataProperty(value: unknown, key: string): unknown {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return MISSING;
    }
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : MISSING;
    }
    catch {
        return MISSING;
    }
}

function freezeChangeSet(changes: Change[]): ChangeSet {
    return Object.freeze({ changes: Object.freeze(changes) });
}
