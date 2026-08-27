import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Ajv from 'ajv';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonInspector } from '../inspector/index.js';
import { createAjvValidator } from './ajv.js';

afterEach(cleanup);

describe('ajv Inspector integration', () => {
    it('renders and navigates a real Ajv issue end to end', async () => {
        const user = userEvent.setup();
        const ajv = new Ajv({ allErrors: true });
        const check = ajv.compile({
            type: 'object',
            properties: {
                'a/b': {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { '~name': { type: 'string' } },
                    },
                },
            },
        });
        const data = { 'a/b': [{ '~name': 42 }] };
        render(JsonInspector, { data, validate: createAjvValidator(check) });

        const issue = await screen.findByRole('button', { name: 'Error type: must be string at /a~1b/0/~0name from ajv' });
        expect(screen.getByRole('status', { name: 'Validation status' }).textContent).toBe('Validation complete with 1 issue.');
        await user.click(issue);
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["a/b",0,"~name"]'));
    });
});
