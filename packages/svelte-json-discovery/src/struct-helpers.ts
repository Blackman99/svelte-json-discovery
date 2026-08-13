// Ports of helper functions from discoveryjs/discovery src/views/struct/index.js

import type { StructOptions } from './types.js';
import { hasOwn, isArray, isSet, isTypedArray, objectToString } from './utils.js';

export function isValueExpandable(value: unknown, options: StructOptions): boolean {
    // string
    if (typeof value === 'string') {
        return value.length > options.maxStringLength || /[\r\n\f\t]/.test(value);
    }

    // arrays
    if (isArray(value)) {
        return value.length > 0;
    }

    // object-like values
    if (typeof value === 'object' && value !== null) {
        switch (objectToString(value)) {
            case '[object Set]':
                return (value as Set<unknown>).size > 0;

            case '[object Object]': {
                for (const key in value) {
                    if (hasOwn(value, key)) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

export function shouldAutoExpand(value: unknown): boolean {
    if (typeof value === 'string') {
        return false;
    }

    // array of numbers
    if (isTypedArray(value) || (Array.isArray(value) && value.every(el => typeof el === 'number'))) {
        return false;
    }

    return true;
}

// Returns entries of an expanded value as [key, value] pairs
export function valueEntries(value: unknown): [string | number, unknown][] {
    if (isArray(value)) {
        return Array.from(value as ArrayLike<unknown>, (el, idx) => [idx, el]);
    }

    if (isSet(value)) {
        return [...(value as Set<unknown>)].map((el, idx) => [idx, el]);
    }

    return Object.entries(value as object);
}

export function isSortedKeys(entries: [string | number, unknown][]): boolean {
    return entries.length < 2
        || entries.every(([key], idx) => idx === 0 || key > entries[idx - 1][0]);
}

export function intOption(value: unknown, defaultValue: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
        return Math.trunc(value);
    }

    return defaultValue;
}

export function listLimit(value: unknown, defaultValue: number): number | false {
    if (value === false) {
        return false;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
        return Math.trunc(value);
    }

    return defaultValue;
}
