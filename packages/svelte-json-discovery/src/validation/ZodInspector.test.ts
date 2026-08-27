import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import * as z from 'zod';
import { JsonInspector } from '../inspector/index.js';
import { createZodValidator } from './zod.js';

afterEach(cleanup);

describe('zod Inspector integration', () => {
    it('renders and navigates a real nested Zod issue end to end', async () => {
        const user = userEvent.setup();
        const schema = z.object({
            'a/b': z.array(z.object({ '~name': z.string() })),
        });
        const data = { 'a/b': [{ '~name': 42 }] };
        render(JsonInspector, { data, validate: createZodValidator(schema) });

        const issue = await screen.findByRole('button', { name: /Error invalid_type: .* at \/a~1b\/0\/~0name from zod/ });
        expect(screen.getByRole('status', { name: 'Validation status' }).textContent).toBe('Validation complete with 1 issue.');
        await user.click(issue);
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["a/b",0,"~name"]'));
    });

    it('normalizes real root union and custom refinement issues deterministically', async () => {
        const signal = new AbortController().signal;
        const union = await createZodValidator(z.union([z.string(), z.number()]))(false, signal);
        const customSchema = z.object({ confirm: z.string() }).superRefine((_data, context) => {
            context.addIssue({ code: 'custom', message: 'Confirmation rejected', path: ['confirm'] });
        });
        const custom = await createZodValidator(customSchema)({ confirm: 'no' }, signal);

        expect(union).toEqual([expect.objectContaining({ path: [], pointer: '', code: 'invalid_union', source: 'zod' })]);
        expect(custom).toEqual([expect.objectContaining({ path: ['confirm'], pointer: '/confirm', code: 'custom', message: 'Confirmation rejected' })]);
    });

    it('reports an unavailable Zod target locally without crashing navigation', async () => {
        const user = userEvent.setup();
        const schema = z.object({ present: z.boolean() }).refine(() => false, {
            message: 'Missing target',
            path: ['missing'],
        });
        render(JsonInspector, { data: { present: true }, validate: createZodValidator(schema) });

        await user.click(await screen.findByRole('button', { name: 'Error custom: Missing target at /missing from zod' }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation navigation' }).textContent).toBe('Validation issue target is unavailable: /missing'));
    });

    it('does not navigate a Symbol path to an unrelated colliding string key', async () => {
        const user = userEvent.setup();
        const symbol = Symbol('record-key');
        const schema = z.any().superRefine((_data, context) => {
            context.addIssue({ code: 'custom', message: 'Unsupported record key', path: ['records', symbol] });
        });
        const data = { records: { 'Symbol(record-key)': 'unrelated' } };
        render(JsonInspector, { data, expanded: 2, validate: createZodValidator(schema) });

        await user.click(await screen.findByRole('button', { name: /Error custom: Unsupported record key .* from zod/ }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation navigation' }).textContent).toContain('Validation issue target is unavailable:'));

        expect(document.activeElement?.getAttribute('data-json-path')).not.toBe('["records","Symbol(record-key)"]');
        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('null');
    });

    it('turns an always-visible Proxy path into a bounded local validation failure', async () => {
        const symbol = Symbol('hostile');
        const schema = z.any().superRefine((_data, context) => {
            context.addIssue({ code: 'custom', message: 'Hostile path', path: ['records', symbol] });
        });
        const guarded = new Proxy({}, {
            getOwnPropertyDescriptor() {
                return { configurable: true, enumerable: true, value: true, writable: true };
            },
        });
        render(JsonInspector, { data: { records: guarded }, validate: createZodValidator(schema) });

        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation status' }).textContent).toBe('Validation failed: Unable to isolate a non-standard Zod issue path.'));
        expect(screen.getByRole('tree', { name: 'JSON data' })).not.toBeNull();
        expect(screen.queryByRole('region', { name: 'Validation summary' })).toBeNull();
    });
});
