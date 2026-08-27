import type { JsonPath } from '../types.js';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved';

interface PathChange {
    readonly path: JsonPath;
    readonly pointer: string;
}

export type Change = PathChange & ({
    readonly kind: 'added' | 'changed' | 'removed';
    readonly previousPath?: never;
    readonly previousPointer?: never;
} | {
    readonly kind: 'moved';
    readonly previousPath: JsonPath;
    readonly previousPointer: string;
});

export interface ChangeSet {
    readonly changes: readonly Change[];
}
