import type { ChangeSet } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonInspector } from '../inspector/index.js';

afterEach(cleanup);

describe('json inspector Diff view', () => {
    it('summarizes and marks explicit baseline changes, then focuses current or baseline paths', async () => {
        const user = userEvent.setup();
        const baseline = Object.freeze({
            nested: Object.freeze({ value: 'before' }),
            removed: 'baseline only',
        });
        const data = Object.freeze({
            added: 'current only',
            nested: Object.freeze({ value: 'after' }),
        });
        render(JsonInspector, { compareTo: baseline, data, expanded: 2 });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        const summary = screen.getByRole('region', { name: 'Diff summary' });
        expect(within(summary).getByRole('status', { name: 'Change counts' }).textContent?.replace(/\s+/g, ' ').trim()).toBe('1 added, 1 removed, 1 changed, 0 moved');
        expect(within(summary).getAllByRole('button')).toHaveLength(3);

        const current = screen.getByRole('region', { name: 'Current value' });
        const baselineRegion = screen.getByRole('region', { name: 'Baseline value' });
        await waitFor(() => expect(markerAt(current, ['added'])?.getAttribute('aria-label')).toBe('Added'));
        expect(markerAt(current, ['added'])?.getAttribute('role')).toBe('img');
        expect(markerAt(current, ['nested', 'value'])?.getAttribute('aria-label')).toBe('Changed');
        expect(markerAt(baselineRegion, ['removed'])?.getAttribute('aria-label')).toBe('Removed');

        await user.click(within(summary).getByRole('button', { name: 'Added /added' }));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["added"]'));
        expect(current.contains(document.activeElement)).toBe(true);

        await user.click(within(summary).getByRole('button', { name: 'Removed /removed' }));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["removed"]'));
        expect(baselineRegion.contains(document.activeElement)).toBe(true);
        expect(data).toEqual({ added: 'current only', nested: { value: 'after' } });
        expect(baseline).toEqual({ nested: { value: 'before' }, removed: 'baseline only' });
    });

    it('lets a supplied ChangeSet bypass comparison and drive moved navigation', async () => {
        const user = userEvent.setup();
        const data = { items: [{ id: 'second' }, { id: 'first' }] };
        const compareTo = { completely: 'different' };
        const changeSet: ChangeSet = {
            changes: [{
                kind: 'moved',
                path: ['items', 0],
                pointer: '/items/0',
                previousPath: ['items', 1],
                previousPointer: '/items/1',
            }],
        };
        const onChangeSelect = vi.fn();
        render(JsonInspector, { changeSet, compareTo, data, expanded: 2, onChangeSelect });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        const summary = screen.getByRole('region', { name: 'Diff summary' });
        expect(within(summary).getByRole('status', { name: 'Change counts' }).textContent).toContain('1 moved');
        expect(within(summary).getAllByRole('button')).toHaveLength(1);
        await user.click(within(summary).getByRole('button', { name: 'Moved /items/1 → /items/0' }));

        expect(onChangeSelect).toHaveBeenCalledWith(changeSet.changes[0]);
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["items",0]'));
        expect(screen.queryByRole('button', { name: /Changed/ })).toBeNull();
    });

    it('keeps Diff disabled without an explicit baseline or ChangeSet', async () => {
        render(JsonInspector, { data: { value: 1 } });
        const diff = screen.getByRole('button', { name: 'Diff' });

        expect(diff.getAttribute('aria-disabled')).toBe('true');
        await waitFor(() => expect(document.getElementById(diff.getAttribute('aria-describedby') as string)?.textContent).toBe('Diff view requires compareTo or a ChangeSet.'));
    });

    it('treats an explicitly supplied undefined value as a primitive baseline', async () => {
        const user = userEvent.setup();
        render(JsonInspector, { compareTo: undefined, data: 1 });
        const diff = screen.getByRole('button', { name: 'Diff' });

        expect(diff.getAttribute('aria-disabled')).toBeNull();
        await user.click(diff);
        expect(screen.getByRole('button', { name: 'Changed <root>' })).not.toBeNull();
    });

    it('ranks exact targets on both sides before falling back to an ancestor', async () => {
        const user = userEvent.setup();
        const changeSet: ChangeSet = {
            changes: [{ kind: 'changed', path: ['onlyBaseline'], pointer: '/onlyBaseline' }],
        };
        render(JsonInspector, {
            changeSet,
            compareTo: { onlyBaseline: true },
            data: { other: true },
            expanded: 1,
        });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        await user.click(screen.getByRole('button', { name: 'Changed /onlyBaseline' }));

        const baselineRegion = screen.getByRole('region', { name: 'Baseline value' });
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["onlyBaseline"]'));
        expect(baselineRegion.contains(document.activeElement)).toBe(true);
    });

    it('cancels deferred navigation when the compared input changes', async () => {
        const user = userEvent.setup();
        let resolveSelection: (() => void) | undefined;
        const onChangeSelect = vi.fn(() => new Promise<void>((resolve) => {
            resolveSelection = resolve;
        }));
        const rendered = render(JsonInspector, {
            compareTo: { value: 0 },
            data: { value: 1 },
            expanded: 1,
            onChangeSelect,
        });
        await user.click(screen.getByRole('button', { name: 'Diff' }));
        await user.click(screen.getByRole('button', { name: 'Changed /value' }));

        await rendered.rerender({
            compareTo: { replacement: 0 },
            data: { replacement: 1 },
            expanded: 1,
            onChangeSelect,
        });
        resolveSelection?.();
        await Promise.resolve();

        expect(document.activeElement?.getAttribute('data-json-path')).not.toBe('["replacement"]');
    });
});

function markerAt(region: HTMLElement, path: readonly (string | number)[]): HTMLElement | null {
    const encoded = JSON.stringify(path);
    const node = [...region.querySelectorAll<HTMLElement>('[data-json-path]')]
        .find(candidate => candidate.dataset.jsonPath === encoded);
    return node?.querySelector(':scope > .sjd-diff-marker') ?? null;
}
