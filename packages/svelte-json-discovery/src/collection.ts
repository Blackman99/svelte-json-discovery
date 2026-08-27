import { isArray, isSet, objectToString } from './utils.js';

export interface ViewerErrorValue {
    readonly message: string;
}

const viewerErrors = new WeakSet<object>();

export type CollectionEntry = [string | number, unknown];

export interface CollectionReader {
    readonly kind: 'array' | 'object';
    readonly size: number;
    readonly sorted: boolean;
    read: (count: number, sortKeys: boolean) => CollectionEntry[];
    indexOf: (key: string | number, sortKeys: boolean) => number;
}

export function safeErrorMessage(error: unknown): string {
    try {
        if (error instanceof Error) {
            return String(error.message);
        }
        return String(error);
    }
    catch {
        return 'Unknown error';
    }
}

export function viewerError(error: unknown): ViewerErrorValue {
    const value = { message: safeErrorMessage(error) };
    viewerErrors.add(value);
    return value;
}

export function isViewerError(value: unknown): value is ViewerErrorValue {
    try {
        return Boolean(value && typeof value === 'object' && viewerErrors.has(value));
    }
    catch {
        return false;
    }
}

function errorReader(error: unknown, kind: CollectionReader['kind'] = 'object'): CollectionReader {
    const entry: CollectionEntry = kind === 'array'
        ? [0, viewerError(error)]
        : ['[Error]', viewerError(error)];

    return {
        kind,
        size: 1,
        sorted: true,
        read: count => count > 0 ? [entry] : [],
        indexOf: key => key === entry[0] ? 0 : -1,
    };
}

function arrayReader(value: ArrayLike<unknown>): CollectionReader {
    let size: number;
    try {
        size = value.length;
    }
    catch (error) {
        return errorReader(error, 'array');
    }

    return {
        kind: 'array',
        size,
        sorted: true,
        read(count) {
            const entries: CollectionEntry[] = [];
            for (let index = 0; index < Math.min(count, size); index++) {
                try {
                    entries.push([index, value[index]]);
                }
                catch (error) {
                    entries.push([index, viewerError(error)]);
                }
            }
            return entries;
        },
        indexOf(key) {
            return typeof key === 'number' && key >= 0 && key < size ? key : -1;
        },
    };
}

function iterableReader(value: Set<unknown> | Map<unknown, unknown>, map: boolean): CollectionReader {
    let size: number;
    let iterator: Iterator<unknown> | null = null;
    const cache: unknown[] = [];
    let iteratorError: ViewerErrorValue | null = null;

    try {
        size = value.size;
        iterator = map ? value.entries() : value.values();
    }
    catch (error) {
        return errorReader(error, 'array');
    }

    function ensure(count: number) {
        while (cache.length < Math.min(count, size) && iterator && !iteratorError) {
            try {
                const next = iterator.next();
                if (next.done) {
                    iterator = null;
                    break;
                }
                cache.push(next.value);
            }
            catch (error) {
                iteratorError = viewerError(error);
            }
        }
    }

    return {
        kind: 'array',
        get size() {
            return size + (iteratorError ? 1 : 0);
        },
        sorted: true,
        read(count) {
            ensure(count);
            const entries = cache.slice(0, count).map<CollectionEntry>((entry, index) => [index, entry]);
            if (iteratorError && entries.length < count) {
                entries.push([entries.length, iteratorError]);
            }
            return entries;
        },
        indexOf(key) {
            return typeof key === 'number' && key >= 0 && key < size ? key : -1;
        },
    };
}

function objectReader(value: object): CollectionReader {
    let keys: string[];
    try {
        keys = Object.keys(value);
    }
    catch (error) {
        return errorReader(error);
    }

    const sortedKeys = [...keys].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const sorted = keys.every((key, index) => index === 0 || key > keys[index - 1]);

    function source(sortKeys: boolean) {
        return sortKeys ? sortedKeys : keys;
    }

    return {
        kind: 'object',
        size: keys.length,
        sorted,
        read(count, sortKeys) {
            return source(sortKeys).slice(0, count).map<CollectionEntry>((key) => {
                try {
                    return [key, (value as Record<string, unknown>)[key]];
                }
                catch (error) {
                    return [key, viewerError(error)];
                }
            });
        },
        indexOf(key, sortKeys) {
            return source(sortKeys).indexOf(String(key));
        },
    };
}

export function createCollectionReader(value: unknown): CollectionReader {
    try {
        if (isArray(value)) {
            return arrayReader(value);
        }
        if (isSet(value)) {
            return iterableReader(value, false);
        }
        if (objectToString(value) === '[object Map]') {
            return iterableReader(value as Map<unknown, unknown>, true);
        }
        if (value !== null && typeof value === 'object') {
            return objectReader(value);
        }
    }
    catch (error) {
        return errorReader(error);
    }

    return {
        kind: 'object',
        size: 0,
        sorted: true,
        read: () => [],
        indexOf: () => -1,
    };
}
