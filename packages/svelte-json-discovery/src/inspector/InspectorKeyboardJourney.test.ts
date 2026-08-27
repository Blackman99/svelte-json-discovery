import type { JsonViewerPlugin } from '../index.js';
import type { ValidationIssue } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonInspector } from './index.js';

afterEach(cleanup);

describe('json inspector keyboard journey', () => {
    it('connects view switching, issue navigation, Tree actions and Diff navigation', async () => {
        const user = userEvent.setup();
        const runAction = vi.fn();
        const plugins: JsonViewerPlugin[] = [{
            id: 'keyboard-journey',
            actions: [{
                id: 'inspect-target',
                label: 'Inspect target',
                when: node => node.path[0] === 'target',
                run: runAction,
            }],
        }];
        const issues: ValidationIssue[] = [{
            path: ['issue'],
            pointer: '/issue',
            severity: 'warning',
            code: 'review',
            message: 'Review this value',
            source: 'journey',
        }];

        render(JsonInspector, {
            compareTo: { target: 0, issue: 2 },
            data: { target: 1, issue: 2 },
            expanded: 1,
            issues,
            plugins,
        });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const treeButton = within(toolbar).getByRole('button', { name: 'Tree' });
        const rawButton = within(toolbar).getByRole('button', { name: 'Raw' });
        treeButton.focus();
        await user.keyboard('{ArrowRight}{Enter}');
        expect(document.activeElement).toBe(rawButton);
        expect(rawButton.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Raw JSON')).not.toBeNull();

        const issueButton = screen.getByRole('button', {
            name: 'Warning review: Review this value at /issue from journey',
        });
        issueButton.focus();
        await user.keyboard('{Enter}');
        await waitFor(() => expect(treeButton.getAttribute('aria-pressed')).toBe('true'));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["issue"]'));

        await user.keyboard('{Home}{ArrowDown}');
        const target = document.querySelector<HTMLElement>('[data-json-path="[\\"target\\"]"]');
        expect(document.activeElement).toBe(target);
        await user.keyboard('{F2}');
        const actionTrigger = within(target as HTMLElement).getByRole('button', { name: 'Value actions' });
        expect(document.activeElement).toBe(actionTrigger);
        await user.keyboard('{Enter}{End}{Enter}');
        await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(document.activeElement).toBe(actionTrigger));

        treeButton.focus();
        await user.keyboard('{End}{Enter}');
        const diffButton = within(toolbar).getByRole('button', { name: 'Diff' });
        expect(document.activeElement).toBe(diffButton);
        expect(diffButton.getAttribute('aria-pressed')).toBe('true');
        const changed = await screen.findByRole('button', { name: 'Changed /target' });
        changed.focus();
        await user.keyboard('{Enter}');
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["target"]'));
        expect(screen.getByRole('region', { name: 'Current value' }).contains(document.activeElement)).toBe(true);
    });
});
