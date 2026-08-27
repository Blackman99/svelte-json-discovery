export type StrictJsonResult
    = | { text: string; reason: null }
        | { text: null; reason: string };

type FormatResult
    = | { valid: true; text: string }
        | { valid: false };

const INVALID_REASON = 'Raw view requires strict JSON-compatible data.';

export function serializeStrictJson(value: unknown): StrictJsonResult {
    try {
        const result = formatStrictJson(value, [], 0);
        return result.valid
            ? { text: result.text, reason: null }
            : { text: null, reason: INVALID_REASON };
    }
    catch {
        return { text: null, reason: INVALID_REASON };
    }
}

function formatStrictJson(value: unknown, ancestors: object[], depth: number): FormatResult {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return { valid: true, text: JSON.stringify(value) };
    }
    if (typeof value === 'number') {
        return Number.isFinite(value)
            ? { valid: true, text: JSON.stringify(value) }
            : { valid: false };
    }
    if (typeof value !== 'object' || ancestors.includes(value)) {
        return { valid: false };
    }

    const nextAncestors = [...ancestors, value];
    if (Array.isArray(value)) {
        const keys = Reflect.ownKeys(value);
        if (keys.some(key => typeof key === 'symbol' || (key !== 'length' && !isArrayIndex(key, value.length)))) {
            return { valid: false };
        }
        const entries: string[] = [];
        for (let index = 0; index < value.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
            if (!descriptor || !('value' in descriptor)) {
                return { valid: false };
            }
            const child = formatStrictJson(descriptor.value, nextAncestors, depth + 1);
            if (!child.valid) {
                return child;
            }
            entries.push(child.text);
        }
        return { valid: true, text: formatCollection('[', ']', entries, depth) };
    }

    const prototype = Object.getPrototypeOf(value);
    if (!isPlainRecordPrototype(prototype)) {
        return { valid: false };
    }
    const entries: string[] = [];
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
            return { valid: false };
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
            return { valid: false };
        }
        const child = formatStrictJson(descriptor.value, nextAncestors, depth + 1);
        if (!child.valid) {
            return child;
        }
        entries.push(`${JSON.stringify(key)}: ${child.text}`);
    }
    return { valid: true, text: formatCollection('{', '}', entries, depth) };
}

function isPlainRecordPrototype(prototype: object | null): boolean {
    if (prototype === null) {
        return true;
    }
    const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    if (
        !constructor
        || !('value' in constructor)
        || typeof constructor.value !== 'function'
        || constructor.value.name !== 'Object'
        || constructor.value.prototype !== prototype
        || Object.getPrototypeOf(prototype) !== null
    ) {
        return false;
    }
    return Function.prototype.toString.call(constructor.value) === Function.prototype.toString.call(Object);
}

function formatCollection(open: string, close: string, entries: string[], depth: number): string {
    if (entries.length === 0) {
        return `${open}${close}`;
    }
    const entryIndent = '  '.repeat(depth + 1);
    const closeIndent = '  '.repeat(depth);
    return `${open}\n${entries.map(entry => `${entryIndent}${entry}`).join(',\n')}\n${closeIndent}${close}`;
}

function isArrayIndex(key: string, length: number): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
