import type { JsonPath } from '../types.js';

export type ValidationIssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    readonly path: JsonPath;
    /** Canonical RFC 6901 Pointer, or null for a non-standard JSON location. */
    readonly pointer: string | null;
    readonly severity: ValidationIssueSeverity;
    readonly code: string;
    readonly message: string;
    readonly source: string;
    readonly details?: unknown;
}

export type JsonValidator = (
    data: unknown,
    signal: AbortSignal,
) => readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;
