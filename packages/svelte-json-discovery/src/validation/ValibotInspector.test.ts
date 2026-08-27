import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonInspector } from '../inspector/index.js';
import { createValibotValidator } from './valibot.js';

afterEach(cleanup);

describe('valibot Inspector integration', () => {
    it('renders and navigates a real nested Valibot issue end to end', async () => {
        const user = userEvent.setup();
        const schema = v.object({
            'a/b': v.array(v.object({ '~name': v.string() })),
        });
        const data = { 'a/b': [{ '~name': 42 }] };
        render(JsonInspector, { data, validate: createValibotValidator(v.safeParserAsync(schema)) });

        const issue = await screen.findByRole('button', { name: /Error string: .* at \/a~1b\/0\/~0name from valibot/ });
        expect(screen.getByRole('status', { name: 'Validation status' }).textContent).toBe('Validation complete with 1 issue.');
        await user.click(issue);
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["a/b",0,"~name"]'));
    });

    it('normalizes a real root custom issue deterministically', async () => {
        const schema = v.pipe(v.string(), v.check(value => value === 'accepted', 'Value rejected'));
        const issues = await createValibotValidator(v.safeParserAsync(schema))('rejected', new AbortController().signal);

        expect(issues).toEqual([
            expect.objectContaining({ path: [], pointer: '', code: 'check', message: 'Value rejected', source: 'valibot' }),
        ]);
    });

    it('reports a missing object path locally without crashing navigation', async () => {
        const user = userEvent.setup();
        const schema = v.object({ missing: v.string('Missing field') });
        render(JsonInspector, { data: {}, validate: createValibotValidator(v.safeParserAsync(schema)) });

        await user.click(await screen.findByRole('button', { name: /Error object: Invalid key: .* at \/missing from valibot/ }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation navigation' }).textContent).toBe('Validation issue target is unavailable: /missing'));
    });

    it('keeps a real Map key issue local and non-standard', async () => {
        const user = userEvent.setup();
        const schema = v.map(v.string(), v.number());
        const data = new Map<unknown, number>([[{ id: 1 }, 2]]);
        render(JsonInspector, { data, validate: createValibotValidator(v.safeParserAsync(schema)) });

        await user.click(await screen.findByRole('button', { name: /Error string: .* from valibot/ }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation navigation' }).textContent).toContain('Validation issue target is unavailable:'));
        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('null');
    });
});
