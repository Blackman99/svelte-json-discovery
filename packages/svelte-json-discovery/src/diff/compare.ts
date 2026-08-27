import type { JsonPath } from '../types.js';
import type { Change, ChangeSet } from './types.js';
import { pathToPointer } from '../utils.js';

export function compareJson(current: unknown, baseline: unknown): ChangeSet {
    const changes: Change[] = [];
    compareValue(current, baseline, [], changes);
    return Object.freeze({ changes: Object.freeze(changes) });
}

function compareValue(current: unknown, baseline: unknown, path: JsonPath, changes: Change[]): void {
    if (Object.is(current, baseline)) {
        return;
    }
    if (Array.isArray(current) && Array.isArray(baseline)) {
        compareArrays(current, baseline, path, changes);
        return;
    }
    if (isPlainObject(current) && isPlainObject(baseline)) {
        compareObjects(current, baseline, path, changes);
        return;
    }
    changes.push(change('changed', path));
}

function compareArrays(current: unknown[], baseline: unknown[], path: JsonPath, changes: Change[]): void {
    const length = Math.max(current.length, baseline.length);
    for (let index = 0; index < length; index++) {
        const currentHasIndex = Object.hasOwn(current, index);
        const baselineHasIndex = Object.hasOwn(baseline, index);
        const childPath = [...path, index];
        if (!baselineHasIndex && currentHasIndex) {
            changes.push(change('added', childPath));
        }
        else if (baselineHasIndex && !currentHasIndex) {
            changes.push(change('removed', childPath));
        }
        else if (currentHasIndex && baselineHasIndex) {
            compareValue(current[index], baseline[index], childPath, changes);
        }
    }
}

function compareObjects(
    current: Record<string, unknown>,
    baseline: Record<string, unknown>,
    path: JsonPath,
    changes: Change[],
): void {
    const keys = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort();
    for (const key of keys) {
        const currentHasKey = Object.hasOwn(current, key);
        const baselineHasKey = Object.hasOwn(baseline, key);
        const childPath = [...path, key];
        if (!baselineHasKey && currentHasKey) {
            changes.push(change('added', childPath));
        }
        else if (baselineHasKey && !currentHasKey) {
            changes.push(change('removed', childPath));
        }
        else {
            compareValue(current[key], baseline[key], childPath, changes);
        }
    }
}

function change(kind: 'added' | 'changed' | 'removed', path: JsonPath): Change {
    const frozenPath = Object.freeze([...path]);
    return Object.freeze({ kind, path: frozenPath, pointer: pathToPointer(frozenPath) });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
