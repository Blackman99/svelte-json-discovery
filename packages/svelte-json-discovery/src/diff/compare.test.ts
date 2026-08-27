import { describe, expect, it } from 'vitest';
import { compareJson } from './index.js';

describe('basic JSON comparison', () => {
    it('represents primitive replacement at the canonical root path', () => {
        expect(compareJson('current', 'baseline')).toEqual({
            changes: [{ kind: 'changed', path: [], pointer: '' }],
        });
        expect(compareJson(Number.NaN, Number.NaN)).toEqual({ changes: [] });
    });

    it('compares plain objects deterministically and arrays by index', () => {
        const baseline = {
            same: 1,
            removed: true,
            nested: { value: 'before' },
            array: ['same', 'before'],
        };
        const current = {
            same: 1,
            added: true,
            nested: { value: 'after' },
            array: ['same', 'after', 'new'],
        };

        expect(compareJson(current, baseline)).toEqual({
            changes: [
                { kind: 'added', path: ['added'], pointer: '/added' },
                { kind: 'changed', path: ['array', 1], pointer: '/array/1' },
                { kind: 'added', path: ['array', 2], pointer: '/array/2' },
                { kind: 'changed', path: ['nested', 'value'], pointer: '/nested/value' },
                { kind: 'removed', path: ['removed'], pointer: '/removed' },
            ],
        });
    });

    it('does not mutate frozen current or baseline inputs', () => {
        const current = Object.freeze({ nested: Object.freeze([1, 3]) });
        const baseline = Object.freeze({ nested: Object.freeze([1, 2]) });

        expect(compareJson(current, baseline).changes).toEqual([
            { kind: 'changed', path: ['nested', 1], pointer: '/nested/1' },
        ]);
        expect(current.nested).toEqual([1, 3]);
        expect(baseline.nested).toEqual([1, 2]);
    });
});
