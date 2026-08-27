import type { ZodIssueLike } from './zod.js';
import { describe, expect, it } from 'vitest';
import { createZodValidator, zodIssuesToIssues } from './zod.js';

describe('zod validation adapter', () => {
    it('maps root, nested object and array paths with canonical escaped pointers', () => {
        const root: ZodIssueLike = {
            path: [],
            code: 'invalid_type',
            message: 'Invalid root',
        };
        const nested: ZodIssueLike = {
            path: ['a/b', '~items', 0],
            code: 'too_small',
            message: 'Too small',
            minimum: 2,
        };

        const issues = zodIssuesToIssues([root, nested]);

        expect(issues).toEqual([
            expect.objectContaining({ path: [], pointer: '', severity: 'error', code: 'invalid_type', message: 'Invalid root', source: 'zod' }),
            expect.objectContaining({ path: ['a/b', '~items', 0], pointer: '/a~1b/~0items/0', severity: 'error', code: 'too_small', message: 'Too small', source: 'zod' }),
        ]);
        expect(issues[0]?.details).toBe(root);
        expect(issues[1]?.details).toBe(nested);
    });

    it('preserves deterministic union and custom issues with source and severity overrides', () => {
        const union: ZodIssueLike = {
            path: ['choice'],
            code: 'invalid_union',
            message: 'Invalid input',
            errors: [[{ path: [], code: 'invalid_type', message: 'Expected string' }]],
        };
        const custom: ZodIssueLike = {
            path: ['confirm'],
            code: 'custom',
            message: 'Values do not match',
        };

        expect(zodIssuesToIssues([union, custom], {
            severity: issue => issue.code === 'custom' ? 'warning' : 'info',
            source: 'profile-schema',
        })).toEqual([
            expect.objectContaining({ path: ['choice'], pointer: '/choice', code: 'invalid_union', severity: 'info', source: 'profile-schema' }),
            expect.objectContaining({ path: ['confirm'], pointer: '/confirm', code: 'custom', severity: 'warning', source: 'profile-schema' }),
        ]);
    });

    it('keeps unsupported property-key paths non-standard and locally navigable', () => {
        const property = Symbol('record-key');
        const issue: ZodIssueLike = {
            path: ['records', property],
            code: 'custom',
            message: 'Unsupported key',
        };

        expect(zodIssuesToIssues([issue], {
            data: { records: { 'Symbol(record-key)': 'unrelated' } },
        })).toEqual([
            expect.objectContaining({
                path: ['records', 'Symbol(record-key)#1'],
                pointer: null,
                code: 'custom',
            }),
        ]);
    });

    it('bounds unavailable fallback checks for hostile data', () => {
        const issue: ZodIssueLike = {
            path: [Symbol('hostile')],
            code: 'custom',
            message: 'Hostile path',
        };
        let checks = 0;
        const guarded = new Proxy({}, {
            getOwnPropertyDescriptor() {
                checks++;
                return { configurable: true, enumerable: true, value: true, writable: true };
            },
        });

        expect(() => zodIssuesToIssues([issue], { data: guarded })).toThrow('Unable to isolate a non-standard Zod issue path.');
        expect(checks).toBeLessThanOrEqual(32);
    });

    it('adapts safeParseAsync results and observes cancellation', async () => {
        const issue: ZodIssueLike = { path: ['name'], code: 'invalid_type', message: 'Expected string' };
        const schema = {
            safeParseAsync: async () => ({ success: false as const, error: { issues: [issue] } }),
        };
        const validate = createZodValidator(schema);

        expect(await validate({ name: 1 }, new AbortController().signal)).toEqual([
            expect.objectContaining({ path: ['name'], pointer: '/name', code: 'invalid_type' }),
        ]);

        const controller = new AbortController();
        controller.abort();
        await expect(validate({ name: 1 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
});
