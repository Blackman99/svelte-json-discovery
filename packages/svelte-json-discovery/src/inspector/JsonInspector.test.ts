import type { JsonViewerSearchState } from '../types.js';
import type { JsonInspectorHandle, JsonInspectorView } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonInspector } from './index.js';

afterEach(cleanup);

describe('json inspector tree shell', () => {
    it('renders Tree by default and exposes unavailable view reasons', () => {
        render(JsonInspector, { data: { status: 'healthy' }, expanded: 1 });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const tree = within(toolbar).getByRole('button', { name: 'Tree' });
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });

        expect(tree.getAttribute('aria-pressed')).toBe('true');
        expect(raw.getAttribute('aria-disabled')).toBe('true');
        expect(document.getElementById(raw.getAttribute('aria-describedby') as string)?.textContent).toBe('Raw view is not available in this build.');
        expect(screen.getByText('Raw view is not available in this build.')).not.toBeNull();
        expect(screen.getByRole('tree', { name: 'JSON data' }).textContent).toContain('healthy');
    });

    it('restricts the view registry and announces unavailable activation', async () => {
        const user = userEvent.setup();
        const changes: JsonInspectorView[] = [];
        render(JsonInspector, {
            data: { value: 1 },
            views: ['tree', 'raw'],
            onViewChange: view => changes.push(view),
        });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        expect(within(toolbar).getAllByRole('button')).toHaveLength(2);
        expect(within(toolbar).queryByRole('button', { name: 'Table' })).toBeNull();
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });
        await user.click(raw);

        expect(changes).toEqual([]);
        expect(screen.getByRole('status').textContent).toBe('Raw view is not available in this build.');
        expect(within(toolbar).getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('supports toolbar arrow navigation without skipping disabled views', async () => {
        const user = userEvent.setup();
        render(JsonInspector, { data: null });
        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const tree = within(toolbar).getByRole('button', { name: 'Tree' });
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });
        const diff = within(toolbar).getByRole('button', { name: 'Diff' });

        tree.focus();
        await user.keyboard('{ArrowRight}');
        expect(document.activeElement).toBe(raw);
        expect(raw.tabIndex).toBe(0);
        expect(tree.tabIndex).toBe(-1);
        await user.keyboard('{End}');
        expect(document.activeElement).toBe(diff);
        expect(diff.tabIndex).toBe(0);
        await user.keyboard('{Home}');
        expect(document.activeElement).toBe(tree);
        expect(tree.tabIndex).toBe(0);
        await user.keyboard('{ArrowLeft}');
        expect(document.activeElement).toBe(diff);
        expect(diff.tabIndex).toBe(0);
    });

    it('uses unique unavailable-view descriptions across Inspector instances', () => {
        render(JsonInspector, { data: { first: true } });
        render(JsonInspector, { data: { second: true } });

        const rawButtons = screen.getAllByRole('button', { name: 'Raw' });
        const descriptionIds = rawButtons.map(button => button.getAttribute('aria-describedby'));
        expect(new Set(descriptionIds).size).toBe(2);
        for (const descriptionId of descriptionIds) {
            expect(document.getElementById(descriptionId as string)?.textContent).toBe('Raw view is not available in this build.');
        }
    });

    it('keeps canonical search, selection and controller behavior in Tree', async () => {
        const user = userEvent.setup();
        const searchStates: JsonViewerSearchState[] = [];
        const selectedPaths: (readonly (string | number)[] | null)[] = [];
        const rendered = render(JsonInspector, {
            data: { branch: { target: 'needle' }, other: 'needle' },
            expanded: 0,
            showSearch: true,
            onSearchStateChange: state => searchStates.push(state),
            onSelectedPathChange: path => selectedPaths.push(path),
        });
        const inspector: JsonInspectorHandle = rendered.component;

        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'needle');
        await waitFor(() => expect(searchStates.at(-1)?.totalCount).toBe(2));
        expect(await inspector?.nextMatch()).toEqual(['other']);
        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('["other"]');
        expect(await inspector?.select(['branch', 'target'])).toBe(true);
        expect(selectedPaths.at(-1)).toEqual(['branch', 'target']);
        expect(document.querySelector('[data-node-label="target"]')?.getAttribute('aria-selected')).toBe('true');
        expect(await inspector?.collapse(['branch'])).toBe(true);
        expect(document.querySelector('[data-node-label="branch"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps a controlled view authoritative', async () => {
        const user = userEvent.setup();
        const onViewChange = vi.fn();
        const rendered = render(JsonInspector, {
            data: { value: 1 },
            view: 'tree',
            views: ['tree', 'raw'],
            onViewChange,
        });
        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });

        await user.click(within(toolbar).getByRole('button', { name: 'Tree' }));
        expect(onViewChange).not.toHaveBeenCalled();
        await rendered.rerender({
            data: { value: 2 },
            view: 'tree',
            views: ['tree', 'raw'],
            onViewChange,
        });
        expect(within(toolbar).getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('2')).not.toBeNull();
    });

    it('resets internal selection when the data identity changes', async () => {
        const user = userEvent.setup();
        const selections: (readonly (string | number)[] | null)[] = [];
        const rendered = render(JsonInspector, {
            data: { stablePath: 1 },
            expanded: 1,
            onSelectedPathChange: path => selections.push(path),
        });

        await user.click(document.querySelector<HTMLElement>('[data-node-label="stablePath"]') as HTMLElement);
        expect(selections.at(-1)).toEqual(['stablePath']);
        expect(document.querySelector('[data-node-label="stablePath"]')?.getAttribute('aria-selected')).toBe('true');

        await rendered.rerender({
            data: { stablePath: 2 },
            expanded: 1,
            onSelectedPathChange: path => selections.push(path),
        });
        await waitFor(() => expect(document.querySelector('[data-node-label="stablePath"]')?.getAttribute('aria-selected')).toBe('false'));
        expect(selections.at(-1)).toBeNull();
    });
});
