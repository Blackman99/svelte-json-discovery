// Ports of discoveryjs/discovery core utils used by the struct (JSON) view:
// is-type.ts, html.ts (numDelim), pattern.ts (matchAll), object-utils.ts,
// copy-text.ts and model.ts (pathToQuery).

export type TypedArray
    = | Uint8Array
        | Uint8ClampedArray
        | Uint16Array
        | Uint32Array
        | Int8Array
        | Int16Array
        | Int32Array
        | Float32Array
        | Float64Array
        | BigInt64Array
        | BigUint64Array;

export function objectToString(value: unknown): string {
    return Object.prototype.toString.call(value);
}

export function hasOwn(object: object, key: PropertyKey): boolean {
    return Object.hasOwn ? Object.hasOwn(object, key) : Object.hasOwn(object, key);
}

export function isTypedArray(value: unknown): value is TypedArray {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

export function isArray<T>(value: unknown): value is Array<T> | TypedArray {
    return Array.isArray(value) || isTypedArray(value);
}

export function isSet<T>(value: unknown): value is Set<T> {
    return objectToString(value) === '[object Set]';
}

export function isRegExp(value: unknown): value is RegExp {
    return objectToString(value) === '[object RegExp]';
}

export function isError(value: unknown): value is Error {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
        return false;
    }

    const str = objectToString(value);

    return (
        str === '[object Error]'
        || str === '[object DOMException]'
        || str === '[object Exception]'
        || value instanceof Error
    );
}

// Escape a string the way JSON.stringify() does, but only when it contains
// characters that need escaping (control chars, quotes, backslashes, etc.)
export function stringifyIfNeeded(value: string): string {
    return /[^\x20\x21\x23-\x5B\x5D-\uD799]/.test(value)
        ? JSON.stringify(value).slice(1, -1)
        : value;
}

// Split a stringified number into thousand groups; groups are rendered
// with an empty <span class="num-delim"> between them which produces
// a small visual gap without adding characters to the copied text
const delimRegExp = /\.\d+(?:eE[-+]?\d+)?|\B(?=(?:\d{3})+(?:\D|$))/g;

export function numParts(value: number | bigint | string): string[] {
    const str = String(value);

    if (str.length <= 3) {
        return [str];
    }

    const parts: string[] = [];
    let lastIndex = 0;

    delimRegExp.lastIndex = 0;
    for (let match = delimRegExp.exec(str); match !== null; match = delimRegExp.exec(str)) {
        if (match[0] === '') {
            if (match.index > lastIndex) {
                parts.push(str.slice(lastIndex, match.index));
                lastIndex = match.index;
            }
            delimRegExp.lastIndex++; // avoid infinite loop on zero-length matches
        }
        // a non-empty match is a fraction part – no delimiters inside it
    }

    parts.push(str.slice(lastIndex));

    return parts;
}

export interface PatternMatch { offset: number; length: number }

const stopSymbol = Symbol('stop-match');

function matchWithRx(str: string, pattern: RegExp, lastIndex = 0): PatternMatch | null {
    const rx = pattern.global
        ? pattern
        : new RegExp(pattern.source, `${pattern.flags}g`);

    rx.lastIndex = lastIndex;

    const match = rx.exec(str);

    return match !== null ? { offset: match.index, length: match[0].length } : null;
}

function matchWithString(str: string, pattern: string, lastIndex: number): PatternMatch | null {
    const offset = str.indexOf(pattern, lastIndex);

    return offset !== -1 ? { offset, length: pattern.length } : null;
}

export function matchAll(
    text: string,
    pattern: RegExp | string | null,
    onText: (substring: string, last: boolean) => void,
    onMatch: (substring: string, stop: symbol) => void | symbol,
    ignoreCase = false,
): void {
    if (!isRegExp(pattern) && typeof pattern !== 'string') {
        onText(text, true);
        return;
    }

    let matchText = String(text);

    if (ignoreCase) {
        if (typeof pattern === 'string') {
            matchText = matchText.toLowerCase();
            pattern = pattern.toLowerCase();
        }
        else if (!pattern.ignoreCase) {
            pattern = new RegExp(pattern.source, `${pattern.flags}i`);
        }
    }

    let lastIndex = 0;
    let stopMatch = false;

    do {
        const match: PatternMatch | null = stopMatch
            ? null
            : typeof pattern === 'string'
                ? matchWithString(matchText, pattern, lastIndex)
                : matchWithRx(matchText, pattern, lastIndex);

        if (match === null || (match.length === 0 && match.offset === lastIndex)) {
            onText(lastIndex > 0 ? text.slice(lastIndex) : text, true);
            break;
        }

        if (match.length !== 0) {
            if (match.offset !== lastIndex) {
                onText(text.slice(lastIndex, match.offset), false);
            }

            stopMatch = onMatch(text.substr(match.offset, match.length), stopSymbol) === stopSymbol;
        }

        lastIndex = match.offset + match.length;
    } while (lastIndex !== text.length);
}

const identifierRx = /^[a-z_$][\w$]*$/i;

export function pathToQuery(path: (string | number)[]): string {
    let query = '';

    for (const part of path) {
        if (typeof part === 'number') {
            query += `[${part}]`;
        }
        else if (identifierRx.test(part)) {
            query += query === '' ? part : `.${part}`;
        }
        else {
            query += `[${JSON.stringify(part)}]`;
        }
    }

    return query;
}

export function pathKey(path: readonly (string | number)[]): string {
    return JSON.stringify(path);
}

export function samePath(a: readonly (string | number)[] | null | undefined, b: readonly (string | number)[] | null | undefined): boolean {
    return a === b || Boolean(a && b && a.length === b.length && a.every((part, index) => part === b[index]));
}

export function pathStartsWith(path: readonly (string | number)[], prefix: readonly (string | number)[]): boolean {
    return path.length >= prefix.length && prefix.every((part, index) => part === path[index]);
}

export function pathToPointer(path: readonly (string | number)[]): string {
    return path.length === 0
        ? ''
        : `/${path.map(part => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

export async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        }
        catch {
            // fall through to the legacy path
        }
    }

    const el = document.createElement('textarea');

    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:absolute;left:-9999px;opacity:0';
    document.body.appendChild(el);

    try {
        el.select();
        document.execCommand('copy');
    }
    finally {
        el.remove();
    }
}
