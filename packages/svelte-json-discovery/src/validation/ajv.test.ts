import type { AjvErrorLike } from './ajv.js';
import { describe, expect, it } from 'vitest';
import { ajvErrorsToIssues, createAjvValidator } from './ajv.js';

describe('ajv validation adapter', () => {
    it('maps root and escaped instance paths with stable defaults and original details', () => {
        const root: AjvErrorLike = {
            instancePath: '',
            keyword: 'type',
            message: 'must be object',
            params: { type: 'object' },
            schemaPath: '#/type',
        };
        const nested: AjvErrorLike = {
            instancePath: '/a~1b/~0items/0',
            keyword: 'minLength',
            message: 'must NOT have fewer than 2 characters',
            params: { limit: 2 },
            schemaPath: '#/properties/a~1b/properties/~0items/items/minLength',
        };

        const issues = ajvErrorsToIssues([root, nested], {
            data: { 'a/b': { '~items': [''] } },
        });

        expect(issues).toEqual([
            expect.objectContaining({ path: [], pointer: '', severity: 'error', code: 'type', message: 'must be object', source: 'ajv' }),
            expect.objectContaining({ path: ['a/b', '~items', 0], pointer: '/a~1b/~0items/0', severity: 'error', code: 'minLength', source: 'ajv' }),
        ]);
        expect(issues[0]?.details).toBe(root);
        expect(issues[1]?.details).toBe(nested);
    });

    it('maps errors deterministically and supports source and severity overrides', () => {
        const errors: AjvErrorLike[] = [
            { instancePath: '/second', keyword: 'required', params: {}, schemaPath: '#/required' },
            { instancePath: '/first', keyword: 'custom', message: 'custom failure', params: {}, schemaPath: '#/custom' },
        ];

        expect(ajvErrorsToIssues(errors, { data: { first: 1, second: 2 }, severity: 'warning', source: 'schema-v2' })).toEqual([
            expect.objectContaining({ path: ['second'], code: 'required', message: 'Validation failed: required', severity: 'warning', source: 'schema-v2' }),
            expect.objectContaining({ path: ['first'], code: 'custom', message: 'custom failure', severity: 'warning', source: 'schema-v2' }),
        ]);
    });

    it('adapts sync and async Ajv validators and observes cancellation', async () => {
        const error: AjvErrorLike = { instancePath: '/name', keyword: 'type', message: 'must be string', params: { type: 'string' }, schemaPath: '#/type' };
        const sync = Object.assign(() => false, { errors: [error] });
        const validateSync = createAjvValidator(sync);
        expect(await validateSync({ name: 1 }, new AbortController().signal)).toEqual([
            expect.objectContaining({ path: ['name'], pointer: '/name', code: 'type' }),
        ]);

        const asyncFailure = Object.assign(async () => Promise.reject(Object.assign(new Error('invalid'), { errors: [error] })), { errors: null });
        const validateAsync = createAjvValidator(asyncFailure);
        expect(await validateAsync({ name: 1 }, new AbortController().signal)).toEqual([
            expect.objectContaining({ path: ['name'], pointer: '/name', code: 'type' }),
        ]);

        const asyncValidFalsyData = Object.assign(async () => false, { $async: true as const, errors: [error] });
        expect(await createAjvValidator(asyncValidFalsyData)(false, new AbortController().signal)).toEqual([]);

        const controller = new AbortController();
        controller.abort();
        await expect(validateSync({ name: 1 }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('snapshots synchronous errors before concurrent calls can replace them', async () => {
        const sync = Object.assign(
            (data: unknown) => {
                const name = (data as { name: string }).name;
                sync.errors = [{
                    instancePath: '/name',
                    keyword: name,
                    message: `invalid ${name}`,
                    params: {},
                    schemaPath: '#/properties/name',
                }];
                return false;
            },
            { errors: [] as AjvErrorLike[] },
        );
        const validate = createAjvValidator(sync);

        const [first, second] = await Promise.all([
            validate({ name: 'first' }, new AbortController().signal),
            validate({ name: 'second' }, new AbortController().signal),
        ]);

        expect(first).toEqual([expect.objectContaining({ code: 'first', message: 'invalid first' })]);
        expect(second).toEqual([expect.objectContaining({ code: 'second', message: 'invalid second' })]);
    });
});
