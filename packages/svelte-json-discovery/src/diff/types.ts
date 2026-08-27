import type { JsonPath } from '../types.js';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';

export type DiffDiagnosticCode = 'comparison' | 'getter' | 'identity' | 'iterator' | 'proxy';

export interface DiffDiagnostic {
    readonly code: DiffDiagnosticCode;
    readonly message: string;
}

export type DiffTruncationReason = 'depth' | 'nodes' | 'results';

export interface DiffTruncation {
    readonly reason: DiffTruncationReason;
    readonly limit: number;
    readonly path: JsonPath;
    readonly pointer: string | null;
}

export type DiffItemIdentity = bigint | boolean | number | string | symbol;

export interface DiffItemIdentityContext {
    readonly arrayPath: JsonPath;
    readonly index: number;
    readonly side: 'baseline' | 'current';
}

export type DiffItemIdentityResolver = (
    item: unknown,
    context: DiffItemIdentityContext,
) => DiffItemIdentity | null | undefined;

export interface DiffItemIdentityRule {
    readonly path: JsonPath;
    readonly resolve: DiffItemIdentityResolver;
}

export interface CompareJsonOptions {
    readonly signal?: AbortSignal;
    readonly itemIdentity?: DiffItemIdentityResolver;
    readonly itemIdentityRules?: readonly DiffItemIdentityRule[];
    readonly maxNodes?: number;
    readonly maxDepth?: number;
    readonly maxResults?: number;
    /** Cooperative scheduling interval. Primarily useful for deterministic tests. */
    readonly yieldEvery?: number;
}

interface PathChange {
    readonly path: JsonPath;
    readonly pointer: string | null;
    readonly diagnostic?: DiffDiagnostic;
}

export type Change = PathChange & ({
    readonly kind: 'added' | 'changed' | 'removed';
    readonly previousPath?: never;
    readonly previousPointer?: never;
} | {
    readonly kind: 'moved';
    readonly previousPath: JsonPath;
    readonly previousPointer: string | null;
});

export interface ChangeSet {
    readonly changes: readonly Change[];
    readonly truncated?: DiffTruncation;
}
