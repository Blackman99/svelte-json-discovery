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

    it('uses array entity identity in the public Inspector without index cascades', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            compareTo: [{ id: 'a', value: 1 }, { id: 'b', value: 1 }],
            data: [{ id: 'b', value: 2 }, { id: 'a', value: 1 }],
            expanded: 2,
            itemIdentity: item => (item as { id: string }).id,
        });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Moved /1 → /0' })).not.toBeNull());
        expect(screen.getByRole('button', { name: 'Changed /0/value' })).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Moved /0 → /1' })).not.toBeNull();
        expect(screen.queryByRole('button', { name: 'Changed /0/id' })).toBeNull();
        expect(within(screen.getByRole('region', { name: 'Diff summary' })).getAllByRole('button')).toHaveLength(3);
    });

    it('announces truncation and retains only the configured result window', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            compareTo: [],
            data: Array.from({ length: 20 }, (_, index) => index),
            maxDiffResults: 3,
        });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Diff truncation' })).not.toBeNull());
        const summary = screen.getByRole('region', { name: 'Diff summary' });
        expect(within(summary).getAllByRole('button')).toHaveLength(3);
        expect(screen.getByRole('status', { name: 'Diff status' }).textContent).toContain('results limit (3)');
    });

    it('suppresses a stale large comparison after data and baseline replacement', async () => {
        const user = userEvent.setup();
        const first = Array.from({ length: 5_000 }, (_, index) => ({ index, value: 1 }));
        const firstBaseline = Array.from({ length: 5_000 }, (_, index) => ({ index, value: 0 }));
        const rendered = render(JsonInspector, { compareTo: firstBaseline, data: first });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        expect(screen.getByRole('status', { name: 'Diff status' }).textContent).toContain('Comparing');
        await rendered.rerender({ compareTo: { latest: 0 }, data: { latest: 1 } });

        await waitFor(() => expect(screen.getByRole('button', { name: 'Changed /latest' })).not.toBeNull());
        expect(within(screen.getByRole('region', { name: 'Diff summary' })).getAllByRole('button')).toHaveLength(1);
        expect(screen.getByRole('status', { name: 'Diff status' }).textContent).toBe('Comparison complete.');
    });

    it('presents a hostile getter as a local accessible diagnostic change', async () => {
        const user = userEvent.setup();
        let reads = 0;
        const data = Object.defineProperty({}, 'blocked', {
            enumerable: true,
            get() {
                reads++;
                throw new Error('must stay unread');
            },
        });
        render(JsonInspector, { compareTo: { blocked: 1 }, data, expanded: 1 });

        await user.click(screen.getByRole('button', { name: 'Diff' }));
        const diagnostic = await screen.findByRole('button', { name: /Changed \/blocked — Getter properties are not evaluated/ });
        expect(diagnostic).not.toBeNull();
        expect(screen.getByRole('status', { name: 'Change counts' }).textContent).toContain('1 diagnostics');
        expect(reads).toBeLessThanOrEqual(2);
    });
});

function markerAt(region: HTMLElement, path: readonly (string | number)[]): HTMLElement | null {
    const encoded = JSON.stringify(path);
    const node = [...region.querySelectorAll<HTMLElement>('[data-json-path]')]
        .find(candidate => candidate.dataset.jsonPath === encoded);
    return node?.querySelector(':scope > .sjd-diff-marker') ?? null;
}
