import type { JsonViewerSearchState } from '../types.js';
import type { JsonInspectorHandle, JsonInspectorView } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonInspector } from './index.js';

afterEach(cleanup);

describe('json inspector tree shell', () => {
    it('renders Tree by default and exposes unavailable view reasons', () => {
        render(JsonInspector, { data: { status: undefined }, expanded: 1 });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const tree = within(toolbar).getByRole('button', { name: 'Tree' });
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });

        expect(tree.getAttribute('aria-pressed')).toBe('true');
        expect(raw.getAttribute('aria-disabled')).toBe('true');
        expect(document.getElementById(raw.getAttribute('aria-describedby') as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.');
        expect(screen.getByText('Raw view requires strict JSON-compatible data.')).not.toBeNull();
        expect(screen.getByRole('tree', { name: 'JSON data' }).textContent).toContain('undefined');
    });

    it('restricts the view registry and announces unavailable activation', async () => {
        const user = userEvent.setup();
        const changes: JsonInspectorView[] = [];
        render(JsonInspector, {
            data: { value: undefined },
            views: ['tree', 'raw'],
            onViewChange: view => changes.push(view),
        });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        expect(within(toolbar).getAllByRole('button')).toHaveLength(2);
        expect(within(toolbar).queryByRole('button', { name: 'Table' })).toBeNull();
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });
        await user.click(raw);

        expect(changes).toEqual([]);
        expect(screen.getByRole('status').textContent).toBe('Raw view requires strict JSON-compatible data.');
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
        render(JsonInspector, { data: { first: undefined } });
        render(JsonInspector, { data: { second: undefined } });

        const rawButtons = screen.getAllByRole('button', { name: 'Raw' });
        const descriptionIds = rawButtons.map(button => button.getAttribute('aria-describedby'));
        expect(new Set(descriptionIds).size).toBe(2);
        for (const descriptionId of descriptionIds) {
            expect(document.getElementById(descriptionId as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.');
        }
    });

    it('switches between Tree and formatted strict Raw in uncontrolled mode', async () => {
        const user = userEvent.setup();
        const changes: JsonInspectorView[] = [];
        render(JsonInspector, {
            data: { hello: 'world', count: 2 },
            onViewChange: next => changes.push(next),
        });
        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });
        expect(raw.getAttribute('aria-disabled')).toBeNull();

        await user.click(raw);
        expect(changes).toEqual(['raw']);
        expect(raw.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Raw JSON').textContent).toBe('{\n  "hello": "world",\n  "count": 2\n}');
        expect(screen.queryByRole('tree', { name: 'JSON data' })).toBeNull();

        await user.click(within(toolbar).getByRole('button', { name: 'Tree' }));
        expect(screen.getByRole('tree', { name: 'JSON data' })).not.toBeNull();
    });

    it('starts in Raw when requested as an available uncontrolled default', () => {
        render(JsonInspector, { data: { ready: true }, defaultView: 'raw' });

        expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"ready": true');
    });

    it('never enables Raw or reads accessors for extended and circular values', () => {
        let getterReads = 0;
        const getterObject = Object.defineProperty({}, 'value', {
            enumerable: false,
            get() {
                getterReads++;
                return 1;
            },
        });
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const values = [new Date(), 1n, circular, getterObject];

        for (const data of values) {
            const rendered = render(JsonInspector, { data });
            expect(within(rendered.container).getByRole('button', { name: 'Raw' }).getAttribute('aria-disabled')).toBe('true');
            expect(within(rendered.container).queryByLabelText('Raw JSON')).toBeNull();
            rendered.unmount();
        }
        expect(getterReads).toBe(0);
    });

    it('formats from validated descriptors without invoking Proxy or inherited toJSON hooks', async () => {
        const user = userEvent.setup();
        let toJsonReads = 0;
        const proxy = new Proxy({ safe: 1 }, {
            get(target, key, receiver) {
                if (key === 'toJSON') {
                    toJsonReads++;
                    return () => ({ fabricated: true });
                }
                return Reflect.get(target, key, receiver);
            },
        });
        render(JsonInspector, { data: proxy });

        await user.click(screen.getByRole('button', { name: 'Raw' }));
        expect(screen.getByLabelText('Raw JSON').textContent).toBe('{\n  "safe": 1\n}');
        expect(toJsonReads).toBe(0);

        cleanup();
        const inherited = Object.assign(Object.create({ toJSON: () => ({ fabricated: true }) }), { safe: 1 });
        render(JsonInspector, { data: inherited });
        expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-disabled')).toBe('true');

        cleanup();
        const FakeObject = { Object: function Object() {} }.Object;
        const spoofedPrototype = Object.create(null, {
            constructor: { configurable: true, value: FakeObject, writable: true },
        });
        FakeObject.prototype = spoofedPrototype;
        const spoofed = Object.assign(Object.create(spoofedPrototype), { safe: 1 });
        render(JsonInspector, { data: spoofed });
        expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-disabled')).toBe('true');
    });

    it('accepts strict JSON records parsed in another realm', async () => {
        const user = userEvent.setup();
        const iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        const crossRealmData = (iframe.contentWindow as Window & typeof globalThis).JSON.parse('{"crossRealm":true}');
        render(JsonInspector, { data: crossRealmData });

        const raw = screen.getByRole('button', { name: 'Raw' });
        expect(raw.getAttribute('aria-disabled')).toBeNull();
        await user.click(raw);
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"crossRealm": true');
        iframe.remove();
    });

    it('preserves shared inspection context and view-local scroll positions', async () => {
        const user = userEvent.setup();
        const rendered = render(JsonInspector, {
            data: { branch: { target: 'needle' }, other: 'value' },
            expanded: 0,
            showSearch: true,
        });
        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'needle');
        await waitFor(() => expect(document.querySelector('[data-node-label="target"]')).not.toBeNull());
        expect(await rendered.component.select(['branch', 'target'])).toBe(true);
        const treePanel = document.querySelector<HTMLElement>('[data-view-panel="tree"]') as HTMLElement;
        treePanel.scrollTop = 37;

        await user.click(screen.getByRole('button', { name: 'Raw' }));
        const rawPanel = document.querySelector<HTMLElement>('[data-view-panel="raw"]') as HTMLElement;
        rawPanel.scrollTop = 22;
        await user.click(screen.getByRole('button', { name: 'Tree' }));

        expect((screen.getByRole('searchbox', { name: 'Search JSON' }) as HTMLInputElement).value).toBe('needle');
        expect(document.querySelector('[data-node-label="target"]')?.getAttribute('aria-selected')).toBe('true');
        expect(document.querySelector('[data-node-label="branch"]')?.getAttribute('aria-expanded')).toBe('true');
        expect(treePanel.scrollTop).toBe(37);
        await user.click(screen.getByRole('button', { name: 'Raw' }));
        expect(rawPanel.scrollTop).toBe(22);
    });

    it('copies only complete Raw output with feedback and focus restoration', async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        const rendered = render(JsonInspector, { data: ['complete', 1] });
        await user.click(screen.getByRole('button', { name: 'Raw' }));
        const copy = screen.getByRole('button', { name: 'Copy raw JSON' });

        await user.click(copy);

        expect(writeText).toHaveBeenCalledWith('[\n  "complete",\n  1\n]');
        expect(screen.getByRole('status').textContent).toBe('Copied raw JSON.');
        expect(document.activeElement).toBe(copy);

        await rendered.rerender({ data: ['replacement', 2] });
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('replacement');
    });

    it('reports Raw copy failure and restores the invoking button', async () => {
        const user = userEvent.setup();
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
        });
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: vi.fn().mockReturnValue(false),
        });
        render(JsonInspector, { data: { complete: true } });
        await user.click(screen.getByRole('button', { name: 'Raw' }));
        const copy = screen.getByRole('button', { name: 'Copy raw JSON' });

        await user.click(copy);

        expect(screen.getByRole('status').textContent).toBe('Could not copy raw JSON.');
        expect(document.activeElement).toBe(copy);
    });

    it('suppresses stale copy completion after Raw content is replaced', async () => {
        const user = userEvent.setup();
        let finishCopy: (() => void) | undefined;
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn(() => new Promise<void>(resolve => (finishCopy = resolve))) },
        });
        const rendered = render(JsonInspector, { data: { version: 1 } });
        await user.click(screen.getByRole('button', { name: 'Raw' }));
        void user.click(screen.getByRole('button', { name: 'Copy raw JSON' }));
        await waitFor(() => expect(finishCopy).toBeTypeOf('function'));

        await rendered.rerender({ data: { version: 2 } });
        finishCopy?.();
        await Promise.resolve();

        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"version": 2');
    });

    it('clears a stale unavailable status when replacement data enables Raw', async () => {
        const user = userEvent.setup();
        const rendered = render(JsonInspector, { data: { invalid: undefined } });
        const raw = screen.getByRole('button', { name: 'Raw' });
        await user.click(raw);
        expect(screen.getByRole('status').textContent).toContain('requires strict JSON');

        await rendered.rerender({ data: { valid: true } });

        expect(raw.getAttribute('aria-disabled')).toBeNull();
        expect(screen.queryByRole('status')).toBeNull();
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

        await user.click(within(toolbar).getByRole('button', { name: 'Raw' }));
        expect(onViewChange).toHaveBeenCalledWith('raw');
        expect(within(toolbar).getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
        await rendered.rerender({
            data: { value: 2 },
            view: 'raw',
            views: ['tree', 'raw'],
            onViewChange,
        });
        expect(within(toolbar).getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('2');
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
