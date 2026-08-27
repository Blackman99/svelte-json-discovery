import type { ValibotIssueLike } from './valibot.js';
import { describe, expect, it } from 'vitest';
import { createValibotValidator, valibotIssuesToIssues } from './valibot.js';

describe('valibot validation adapter', () => {
    it('maps root, nested object and array paths with canonical escaped pointers', () => {
        const root: ValibotIssueLike = {
            kind: 'schema',
            type: 'object',
            message: 'Invalid root',
        };
        const data = { 'a/b': [{ '~name': 42 }] };
        const nested: ValibotIssueLike = {
            kind: 'schema',
            type: 'string',
            message: 'Expected string',
            path: [
                { type: 'object', origin: 'value', input: data, key: 'a/b', value: data['a/b'] },
                { type: 'array', origin: 'value', input: data['a/b'], key: 0, value: data['a/b'][0] },
                { type: 'object', origin: 'value', input: data['a/b'][0], key: '~name', value: 42 },
            ],
        };

        const issues = valibotIssuesToIssues([root, nested], { data });

        expect(issues).toEqual([
            expect.objectContaining({ path: [], pointer: '', severity: 'error', code: 'object', message: 'Invalid root', source: 'valibot' }),
            expect.objectContaining({ path: ['a/b', 0, '~name'], pointer: '/a~1b/0/~0name', severity: 'error', code: 'string', message: 'Expected string', source: 'valibot' }),
        ]);
        expect(issues[0]?.details).toBe(root);
        expect(issues[1]?.details).toBe(nested);
    });

    it('preserves custom and missing-path issues with deterministic overrides', () => {
        const custom: ValibotIssueLike = {
            kind: 'validation',
            type: 'check',
            message: 'Confirmation rejected',
            path: [{ type: 'object', origin: 'value', input: {}, key: 'confirm', value: undefined }],
        };
        const missing: ValibotIssueLike = {
            kind: 'schema',
            type: 'string',
            message: 'Missing field',
            path: [{ type: 'object', origin: 'value', input: {}, key: 'missing', value: undefined }],
        };

        expect(valibotIssuesToIssues([custom, missing], {
            data: {},
            severity: issue => issue.kind === 'validation' ? 'warning' : 'info',
            source: 'profile-schema',
        })).toEqual([
            expect.objectContaining({ path: ['confirm'], pointer: '/confirm', code: 'check', severity: 'warning', source: 'profile-schema' }),
            expect.objectContaining({ path: ['missing'], pointer: '/missing', code: 'string', severity: 'info', source: 'profile-schema' }),
        ]);
    });

    it('keeps unmappable path items collision-free and bounded', () => {
        const key = { id: 1 };
        const issue: ValibotIssueLike = {
            kind: 'schema',
            type: 'map',
            message: 'Unsupported map key',
            path: [{ type: 'map', origin: 'value', input: new Map(), key, value: false }],
        };
        const data = { '[object Object]': 'unrelated' };

        expect(valibotIssuesToIssues([issue], { data })).toEqual([
            expect.objectContaining({ path: ['[object Object]#1'], pointer: null, code: 'map' }),
        ]);

        let checks = 0;
        const guarded = new Proxy({}, {
            getOwnPropertyDescriptor() {
                checks++;
                return { configurable: true, enumerable: true, value: true, writable: true };
            },
        });
        expect(() => valibotIssuesToIssues([issue], { data: guarded })).toThrow('Unable to isolate a non-standard Valibot issue path.');
        expect(checks).toBeLessThanOrEqual(32);
    });

    it('keeps invalid origins and array indices non-standard', () => {
        const invalidOrigin: ValibotIssueLike = {
            kind: 'schema',
            type: 'string',
            message: 'Invalid origin',
            path: [{ type: 'object', origin: 'bogus', input: {}, key: 'name', value: false }],
        };
        const invalidIndices: ValibotIssueLike[] = [-1, Number.MAX_SAFE_INTEGER + 1].map(key => ({
            kind: 'schema',
            type: 'string',
            message: 'Invalid index',
            path: [{ type: 'array', origin: 'value', input: [], key, value: false }],
        }));
        const invalidArrayOrigin: ValibotIssueLike = {
            kind: 'schema',
            type: 'string',
            message: 'Invalid array origin',
            path: [{ type: 'array', origin: 'key', input: [], key: 0, value: false }],
        };

        expect(valibotIssuesToIssues([invalidOrigin], { data: { name: 'unrelated' } })).toEqual([
            expect.objectContaining({ path: ['name#1'], pointer: null }),
        ]);
        expect(valibotIssuesToIssues(invalidIndices, { data: [] })).toEqual([
            expect.objectContaining({ path: ['-1'], pointer: null }),
            expect.objectContaining({ path: [String(Number.MAX_SAFE_INTEGER + 1)], pointer: null }),
        ]);
        expect(valibotIssuesToIssues([invalidArrayOrigin], { data: ['unrelated'] })).toEqual([
            expect.objectContaining({ path: ['0#1'], pointer: null }),
        ]);
    });

    it('adapts safe parser results and observes cancellation', async () => {
        const issue: ValibotIssueLike = { kind: 'schema', type: 'string', message: 'Expected string' };
        const parser = async () => ({ success: false as const, issues: [issue] });
        const validate = createValibotValidator(parser);

        expect(await validate(42, new AbortController().signal)).toEqual([
            expect.objectContaining({ path: [], pointer: '', code: 'string' }),
        ]);

        const controller = new AbortController();
        controller.abort();
        await expect(validate(42, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects a failed parser result without issues', async () => {
        const validate = createValibotValidator(() => ({ success: false, issues: [] }));

        await expect(validate(null, new AbortController().signal)).rejects.toThrow('Valibot parser returned an invalid result.');
    });
});
