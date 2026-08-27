import type { JsonPath } from '../types.js';
import type { JsonValidator, ValidationIssue, ValidationIssueSeverity } from './types.js';

export interface AjvErrorLike {
    readonly instancePath: string;
    readonly keyword: string;
    readonly message?: string;
    readonly params: unknown;
    readonly propertyName?: string;
    readonly schemaPath: string;
}

export interface AjvValidateLike {
    (data: unknown): unknown;
    readonly $async?: true;
    readonly errors?: readonly AjvErrorLike[] | null;
}

export interface AjvAdapterOptions {
    /** Current data disambiguates numeric object keys from array indices. */
    readonly data?: unknown;
    readonly severity?: ValidationIssueSeverity | ((error: AjvErrorLike) => ValidationIssueSeverity);
    readonly source?: string;
}

export function ajvErrorsToIssues(
    errors: readonly AjvErrorLike[] | null | undefined,
    options: AjvAdapterOptions = {},
): readonly ValidationIssue[] {
    if (!errors) {
        return [];
    }
    return Object.freeze(errors.map((error) => {
        const path = pointerToPath(error.instancePath, options.data);
        const severity = typeof options.severity === 'function'
            ? options.severity(error)
            : options.severity ?? 'error';
        return Object.freeze({
            path: Object.freeze(path ?? []),
            pointer: path === null ? null : error.instancePath,
            severity,
            code: error.keyword,
            message: error.message ?? `Validation failed: ${error.keyword}`,
            source: options.source ?? 'ajv',
            details: error,
        });
    }));
}

export function createAjvValidator(
    validate: AjvValidateLike,
    options: Omit<AjvAdapterOptions, 'data'> = {},
): JsonValidator {
    return async (data, signal) => {
        throwIfAborted(signal);
        try {
            const pending = validate(data);
            const synchronous = !isPromiseLike(pending);
            const synchronousErrors = synchronous ? validate.errors : undefined;
            const result = await pending;
            throwIfAborted(signal);
            return validate.$async === true || result === true
                ? []
                : ajvErrorsToIssues(synchronous ? synchronousErrors : validate.errors, { ...options, data });
        }
        catch (error) {
            throwIfAborted(signal);
            const errors = validationErrors(error);
            if (errors) {
                return ajvErrorsToIssues(errors, { ...options, data });
            }
            throw error;
        }
    };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return false;
    }
    try {
        return typeof Reflect.get(value, 'then') === 'function';
    }
    catch {
        return false;
    }
}

function pointerToPath(pointer: string, data: unknown): JsonPath | null {
    if (pointer === '') {
        return [];
    }
    if (!pointer.startsWith('/')) {
        return null;
    }
    const path: (string | number)[] = [];
    let current = data;
    for (const encoded of pointer.slice(1).split('/')) {
        const token = decodePointerToken(encoded);
        if (token === null) {
            return null;
        }
        const segment = Array.isArray(current) && isArrayIndex(token) ? Number(token) : token;
        path.push(segment);
        current = readSegment(current, segment);
    }
    return path;
}

function decodePointerToken(token: string): string | null {
    if (/~(?:[^01]|$)/.test(token)) {
        return null;
    }
    return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function isArrayIndex(token: string): boolean {
    return token === '0' || /^[1-9]\d*$/.test(token);
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

function validationErrors(error: unknown): readonly AjvErrorLike[] | null {
    if (error === null || typeof error !== 'object') {
        return null;
    }
    try {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'errors');
        return descriptor && 'value' in descriptor && Array.isArray(descriptor.value)
            ? descriptor.value as readonly AjvErrorLike[]
            : null;
    }
    catch {
        return null;
    }
}

function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        const error = new Error('Validation cancelled');
        error.name = 'AbortError';
        throw error;
    }
}
