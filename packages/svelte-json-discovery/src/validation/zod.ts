import type { JsonPath } from '../types.js';
import type { JsonValidator, ValidationIssue, ValidationIssueSeverity } from './types.js';
import { pathToPointer } from '../utils.js';

const MAX_UNAVAILABLE_SEGMENT_ATTEMPTS = 32;

export interface ZodIssueLike {
    readonly path: readonly PropertyKey[];
    readonly code?: string;
    readonly message: string;
    readonly errors?: unknown;
    readonly minimum?: unknown;
}

export interface ZodSchemaLike {
    readonly safeParseAsync: (data: unknown) => unknown;
}

export interface ZodAdapterOptions {
    /** Current data keeps non-standard PropertyKey fallbacks unavailable. */
    readonly data?: unknown;
    readonly severity?: ValidationIssueSeverity | ((issue: ZodIssueLike) => ValidationIssueSeverity);
    readonly source?: string;
}

export function zodIssuesToIssues(
    issues: readonly ZodIssueLike[],
    options: ZodAdapterOptions = {},
): readonly ValidationIssue[] {
    return Object.freeze(issues.map((issue) => {
        const normalized = normalizeZodPath(issue.path, options.data);
        const severity = typeof options.severity === 'function'
            ? options.severity(issue)
            : options.severity ?? 'error';
        return Object.freeze({
            path: normalized.path,
            pointer: normalized.standard ? pathToPointer(normalized.path) : null,
            severity,
            code: issue.code ?? 'custom',
            message: issue.message,
            source: options.source ?? 'zod',
            details: issue,
        });
    }));
}

export function createZodValidator(
    schema: ZodSchemaLike,
    options: Omit<ZodAdapterOptions, 'data'> = {},
): JsonValidator {
    return async (data, signal) => {
        throwIfAborted(signal);
        const result = await schema.safeParseAsync(data);
        throwIfAborted(signal);
        if (safeParseSucceeded(result)) {
            return [];
        }
        const issues = safeParseIssues(result);
        if (issues === null) {
            throw new TypeError('Zod safeParseAsync returned an invalid result.');
        }
        return zodIssuesToIssues(issues, { ...options, data });
    };
}

function normalizeZodPath(path: readonly PropertyKey[], data: unknown): { path: JsonPath; standard: boolean } {
    let standard = true;
    let current = data;
    const normalized = path.map((segment, index) => {
        if (typeof segment === 'string' || (typeof segment === 'number' && Number.isFinite(segment) && Number.isInteger(segment))) {
            current = readSegment(current, segment);
            return segment;
        }
        standard = false;
        const fallback = unavailableSegment(current, segment, index);
        current = undefined;
        return fallback;
    });
    return { path: Object.freeze(normalized), standard };
}

function unavailableSegment(value: unknown, segment: PropertyKey, index: number): string {
    let base: string;
    try {
        base = String(segment);
    }
    catch {
        base = `[unsupported Zod path segment ${index}]`;
    }
    for (let attempt = 0; attempt < MAX_UNAVAILABLE_SEGMENT_ATTEMPTS; attempt++) {
        const candidate = attempt === 0 ? base : `${base}#${attempt}`;
        if (!isVisibleProperty(value, candidate)) {
            return candidate;
        }
    }
    throw new TypeError('Unable to isolate a non-standard Zod issue path.');
}

function isVisibleProperty(value: unknown, property: string): boolean {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return false;
    }
    try {
        return Object.prototype.propertyIsEnumerable.call(value, property);
    }
    catch {
        throw new TypeError('Unable to isolate a non-standard Zod issue path.');
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

function safeParseIssues(result: unknown): readonly ZodIssueLike[] | null {
    if (result === null || typeof result !== 'object' || Reflect.get(result, 'success') !== false) {
        return null;
    }
    const error = Reflect.get(result, 'error');
    if (error === null || typeof error !== 'object') {
        return null;
    }
    const issues = Reflect.get(error, 'issues');
    return Array.isArray(issues) ? issues as readonly ZodIssueLike[] : null;
}

function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        const error = new Error('Validation cancelled');
        error.name = 'AbortError';
        throw error;
    }
}
