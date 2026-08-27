import { describe, expect, it } from 'vitest';
import { normalizeChangeSet } from './change-set.js';

describe('normalizeChangeSet', () => {
    it('copies and freezes canonical entries without mutating the supplied protocol', () => {
        const source = {
            changes: [{ kind: 'changed', path: ['a/b', '~key'], pointer: '/a~1b/~0key' }],
        };

        const result = normalizeChangeSet(source);

        expect(result.invalidCount).toBe(0);
        expect(result.changeSet.changes).toEqual(source.changes);
        expect(result.changeSet).not.toBe(source);
        expect(Object.isFrozen(result.changeSet)).toBe(true);
        expect(Object.isFrozen(result.changeSet.changes[0].path)).toBe(true);
        expect(source).toEqual({ changes: [{ kind: 'changed', path: ['a/b', '~key'], pointer: '/a~1b/~0key' }] });
    });

    it('ignores malformed, accessor-backed and non-canonical entries locally', () => {
        const accessor = Object.defineProperty({}, 'kind', {
            enumerable: true,
            get() {
                throw new Error('must not run');
            },
        });
        const result = normalizeChangeSet({
            changes: [
                accessor,
                { kind: 'added', path: ['a/b'], pointer: '/a/b' },
                { kind: 'moved', path: [0], pointer: '/0', previousPath: [1], previousPointer: '/1' },
            ],
        });

        expect(result.invalidCount).toBe(2);
        expect(result.changeSet.changes).toEqual([{
            kind: 'moved',
            path: [0],
            pointer: '/0',
            previousPath: [1],
            previousPointer: '/1',
        }]);
    });

    it('contains hostile Proxy metadata as an invalid ChangeSet', () => {
        const source = new Proxy({}, {
            getOwnPropertyDescriptor() {
                throw new Error('blocked');
            },
        });

        expect(normalizeChangeSet(source)).toMatchObject({ invalidCount: 1, changeSet: { changes: [] } });
    });

    it('does not walk every hole in a sparse ChangeSet or throw for a revoked Proxy', () => {
        const sparse: unknown[] = [];
        sparse.length = 1_000_000;
        sparse[999_999] = { kind: 'added', path: ['last'], pointer: '/last' };
        const { proxy, revoke } = Proxy.revocable([], {});
        revoke();

        const result = normalizeChangeSet({ changes: sparse });
        expect(result.invalidCount).toBe(999_999);
        expect(result.changeSet.changes).toHaveLength(1);
        expect(normalizeChangeSet({ changes: proxy })).toMatchObject({ invalidCount: 1, changeSet: { changes: [] } });
    });

    it('preserves frozen diagnostics, non-standard pointers and truncation metadata', () => {
        const result = normalizeChangeSet({
            changes: [{
                kind: 'moved',
                path: [0],
                pointer: null,
                previousPath: [1],
                previousPointer: null,
                diagnostic: { code: 'iterator', message: 'Iterator stopped.' },
            }],
            truncated: { reason: 'nodes', limit: 25, path: [2], pointer: null },
        });

        expect(result.invalidCount).toBe(0);
        expect(result.changeSet).toEqual({
            changes: [{
                kind: 'moved',
                path: [0],
                pointer: null,
                previousPath: [1],
                previousPointer: null,
                diagnostic: { code: 'iterator', message: 'Iterator stopped.' },
            }],
            truncated: { reason: 'nodes', limit: 25, path: [2], pointer: null },
        });
        expect(Object.isFrozen(result.changeSet.changes[0].diagnostic)).toBe(true);
        expect(Object.isFrozen(result.changeSet.truncated)).toBe(true);
    });

    it('drops malformed extended metadata without dropping valid changes', () => {
        const result = normalizeChangeSet({
            changes: [
                { kind: 'changed', path: ['ok'], pointer: '/ok' },
                { kind: 'changed', path: ['bad'], pointer: '/bad', diagnostic: { code: 'unknown', message: 'bad' } },
            ],
            truncated: { reason: 'forever', limit: 0, path: [], pointer: '' },
        });

        expect(result.invalidCount).toBe(2);
        expect(result.changeSet).toEqual({ changes: [{ kind: 'changed', path: ['ok'], pointer: '/ok' }] });
    });
});
