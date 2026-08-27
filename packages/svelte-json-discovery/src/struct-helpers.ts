// Ports of helper functions from discoveryjs/discovery src/views/struct/index.js

import type { StructOptions } from './types.js';
import { isViewerError } from './collection.js';
import { hasOwn, isArray, isTypedArray, objectToString } from './utils.js';

export function isValueExpandable(value: unknown, options: StructOptions): boolean {
    if (isViewerError(value)) {
        return false;
    }

    // string
    if (typeof value === 'string') {
        return value.length > options.maxStringLength || /[\r\n\f\t]/.test(value);
    }

    // arrays
    if (isArray(value)) {
        try {
            return value.length > 0;
        }
        catch {
            return true;
        }
    }

    // object-like values
    if (typeof value === 'object' && value !== null) {
        try {
            switch (objectToString(value)) {
                case '[object Set]':
                    return (value as Set<unknown>).size > 0;

                case '[object Map]':
                    return (value as Map<unknown, unknown>).size > 0;

                case '[object Object]': {
                    for (const key in value) {
                        if (hasOwn(value, key)) {
                            return true;
                        }
                    }
                }
            }
        }
        catch {
            // Let hostile objects expand into a localized error entry.
            return true;
        }
    }

    return false;
}

export function shouldAutoExpand(value: unknown, arraySampleLimit = 4): boolean {
    if (isViewerError(value)) {
        return false;
    }

    if (typeof value === 'string') {
        return false;
    }

    // array of numbers
    if (isTypedArray(value)) {
        return false;
    }

    if (Array.isArray(value)) {
        try {
            // Inspect only the indices that a collapsed preview is allowed to
            // read. If that window is numeric, conservatively keep the array
            // collapsed without touching hidden entries.
            const sampleSize = Math.min(value.length, arraySampleLimit);
            for (let index = 0; index < sampleSize; index++) {
                if (typeof value[index] !== 'number') {
                    return true;
                }
            }
            return false;
        }
        catch {
            return false;
        }
    }

    return true;
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
