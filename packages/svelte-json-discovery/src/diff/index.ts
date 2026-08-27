export { normalizeChangeSet } from './change-set.js';
export type { NormalizedChangeSet } from './change-set.js';
export { compareJson, DEFAULT_MAX_DIFF_DEPTH, DEFAULT_MAX_DIFF_NODES, DEFAULT_MAX_DIFF_RESULTS } from './compare.js';
export type {
    Change,
    ChangeKind,
    ChangeSet,
    CompareJsonOptions,
    DiffDiagnostic,
    DiffDiagnosticCode,
    DiffItemIdentity,
    DiffItemIdentityContext,
    DiffItemIdentityResolver,
    DiffItemIdentityRule,
    DiffTruncation,
    DiffTruncationReason,
} from './types.js';
