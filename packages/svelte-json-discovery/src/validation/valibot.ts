import type { JsonPath } from '../types.js';
import type { JsonValidator, ValidationIssue, ValidationIssueSeverity } from './types.js';
import { pathToPointer } from '../utils.js';

const MAX_UNAVAILABLE_SEGMENT_ATTEMPTS = 32;

export interface ValibotPathItemLike {
    readonly type: string;
    readonly origin: string;
    readonly input: unknown;
    readonly key?: unknown;
    readonly value: unknown;
}

export interface ValibotIssueLike {
    readonly kind: string;
    readonly type: string;
    readonly message: string;
    readonly path?: readonly ValibotPathItemLike[];
}

export interface ValibotParserLike {
    (data: unknown): unknown;
}

export interface ValibotAdapterOptions {
    /** Current data keeps non-standard path fallbacks unavailable. */
    readonly data?: unknown;
    readonly severity?: ValidationIssueSeverity | ((issue: ValibotIssueLike) => ValidationIssueSeverity);
    readonly source?: string;
}

export function valibotIssuesToIssues(
    issues: readonly ValibotIssueLike[],
    options: ValibotAdapterOptions = {},
): readonly ValidationIssue[] {
    return Object.freeze(issues.map((issue) => {
        const normalized = normalizeValibotPath(issue.path ?? [], options.data);
        const severity = typeof options.severity === 'function'
            ? options.severity(issue)
            : options.severity ?? 'error';
        return Object.freeze({
            path: normalized.path,
            pointer: normalized.standard ? pathToPointer(normalized.path) : null,
            severity,
            code: issue.type,
            message: issue.message,
            source: options.source ?? 'valibot',
            details: issue,
        });
    }));
}

export function createValibotValidator(
    parser: ValibotParserLike,
    options: Omit<ValibotAdapterOptions, 'data'> = {},
): JsonValidator {
    return async (data, signal) => {
        throwIfAborted(signal);
        const result = await parser(data);
        throwIfAborted(signal);
        if (safeParseSucceeded(result)) {
            return [];
        }
        const issues = safeParseIssues(result);
        if (issues === null) {
            throw new TypeError('Valibot parser returned an invalid result.');
        }
        return valibotIssuesToIssues(issues, { ...options, data });
    };
}

function normalizeValibotPath(
    path: readonly ValibotPathItemLike[],
    data: unknown,
): { path: JsonPath; standard: boolean } {
    let standard = true;
    let current = data;
    const normalized = path.map((item, index) => {
        const segment = standardSegment(item);
        if (segment !== null) {
            current = readSegment(current, segment);
            return segment;
        }
        standard = false;
        const fallback = unavailableSegment(current, item.key, index);
        current = undefined;
        return fallback;
    });
    return { path: Object.freeze(normalized), standard };
}

function standardSegment(item: ValibotPathItemLike): string | number | null {
    if (item.type === 'object' && (item.origin === 'key' || item.origin === 'value') && typeof item.key === 'string') {
        return item.key;
    }
    if (item.type === 'array' && item.origin === 'value' && typeof item.key === 'number' && Number.isSafeInteger(item.key) && item.key >= 0) {
        return item.key;
    }
    return null;
}

function unavailableSegment(value: unknown, key: unknown, index: number): string {
    let base: string;
    try {
        base = String(key);
    }
    catch {
        base = `[unsupported Valibot path segment ${index}]`;
    }
    for (let attempt = 0; attempt < MAX_UNAVAILABLE_SEGMENT_ATTEMPTS; attempt++) {
        const candidate = attempt === 0 ? base : `${base}#${attempt}`;
        if (!isVisibleProperty(value, candidate)) {
            return candidate;
        }
    }
    throw new TypeError('Unable to isolate a non-standard Valibot issue path.');
}

function isVisibleProperty(value: unknown, property: string): boolean {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return false;
    }
    try {
        return Object.prototype.propertyIsEnumerable.call(value, property);
    }
    catch {
        throw new TypeError('Unable to isolate a non-standard Valibot issue path.');
    }
}

function readSegment(value: unknown, segment: string | number): unknown {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return undefined;
    }
    try {
        return Reflect.get(value, segment);
    }
    catch {
        return undefined;
    }
}

function safeParseSucceeded(result: unknown): boolean {
    return result !== null
        && typeof result === 'object'
        && Reflect.get(result, 'success') === true;
}

function safeParseIssues(result: unknown): readonly ValibotIssueLike[] | null {
    if (result === null || typeof result !== 'object' || Reflect.get(result, 'success') !== false) {
        return null;
    }
    const issues = Reflect.get(result, 'issues');
    return Array.isArray(issues) && issues.length > 0
        ? issues as readonly ValibotIssueLike[]
        : null;
}

function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        const error = new Error('Validation cancelled');
        error.name = 'AbortError';
        throw error;
    }
}
