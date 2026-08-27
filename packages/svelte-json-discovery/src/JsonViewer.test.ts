import type { JsonViewerActionContext, JsonViewerNode, JsonViewerPlugin, JsonViewerPluginError, JsonViewerRendererProps } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PluginComponentRenderer from '../tests/fixtures/PluginComponentRenderer.svelte';
import ThrowingPluginRenderer from '../tests/fixtures/ThrowingPluginRenderer.svelte';
import JsonViewer from './JsonViewer.svelte';

afterEach(cleanup);

describe('json viewer', () => {
    it('runs a matched plugin action with pending state and restores focus', async () => {
        const user = userEvent.setup();
        let finishAction: (() => void) | undefined;
        let receivedContext: JsonViewerActionContext | undefined;
        const plugin: JsonViewerPlugin = {
            id: 'async-actions',
            actions: [{
                id: 'inspect',
                label: 'Inspect asynchronously',
                when: node => node.path[0] === 'target',
                run(context) {
                    receivedContext = context;
                    return new Promise<void>(resolve => (finishAction = resolve));
                },
            }],
        };

        render(JsonViewer, {
            data: { target: 42 },
            expanded: 1,
            plugins: [plugin],
        });

        const node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        const trigger = within(node as HTMLElement).getByRole('button', { name: 'Value actions' });
        await user.click(trigger);
        const action = screen.getByRole('menuitem', { name: 'Inspect asynchronously' });
        await user.click(action);

        expect(action.getAttribute('aria-busy')).toBe('true');
        expect(action.getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByRole('status').textContent).toBe('Running Inspect asynchronously…');
        expect(receivedContext?.node.path).toEqual(['target']);
        expect(Object.isFrozen(receivedContext?.node)).toBe(true);
        expect(receivedContext?.signal.aborted).toBe(false);

        finishAction?.();
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('cancels a running plugin action when Escape closes its menu', async () => {
        const user = userEvent.setup();
        let actionSignal: AbortSignal | undefined;
        const plugin: JsonViewerPlugin = {
            id: 'escape-cancellation',
            actions: [{
                id: 'wait',
                label: 'Wait for cancellation',
                when: node => node.path[0] === 'target',
                run({ signal }) {
                    actionSignal = signal;
                    return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
                },
            }],
        };

        render(JsonViewer, { data: { target: true }, expanded: 1, plugins: [plugin] });
        const node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        const trigger = within(node as HTMLElement).getByRole('button', { name: 'Value actions' });
        await user.click(trigger);
        await user.click(screen.getByRole('menuitem', { name: 'Wait for cancellation' }));
        await user.keyboard('{Escape}');

        expect(actionSignal?.aborted).toBe(true);
        expect(screen.queryByRole('menu')).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('cancels running and stale plugin actions on supersession and data replacement', async () => {
        const user = userEvent.setup();
        const signals: AbortSignal[] = [];
        let secondRuns = 0;
        const plugin: JsonViewerPlugin = {
            id: 'superseding-actions',
            actions: [
                {
                    id: 'first',
                    label: 'First action',
                    when: node => node.path[0] === 'target',
                    run({ signal }) {
                        signals.push(signal);
                        return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
                    },
                },
                {
                    id: 'second',
                    label: 'Second action',
                    when: node => node.path[0] === 'target',
                    run() {
                        secondRuns++;
                    },
                },
            ],
        };
        const rendered = render(JsonViewer, {
            data: { target: 'first data' },
            expanded: 1,
            plugins: [plugin],
        });

        let node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        await user.click(within(node as HTMLElement).getByRole('button', { name: 'Value actions' }));
        await user.click(screen.getByRole('menuitem', { name: 'First action' }));
        await user.click(screen.getByRole('menuitem', { name: 'Second action' }));
        expect(signals[0]?.aborted).toBe(true);
        expect(secondRuns).toBe(1);

        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        await user.click(within(node as HTMLElement).getByRole('button', { name: 'Value actions' }));
        await user.click(screen.getByRole('menuitem', { name: 'First action' }));
        await rendered.rerender({
            data: { target: 'replacement data' },
            expanded: 1,
            plugins: [plugin],
        });

        expect(signals[1]?.aborted).toBe(true);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('does not let a stale popup completion close newly started work', async () => {
        const user = userEvent.setup();
        const signals: AbortSignal[] = [];
        const resolvers: (() => void)[] = [];
        const plugin: JsonViewerPlugin = {
            id: 'reopened-actions',
            actions: [{
                id: 'wait',
                label: 'Wait action',
                when: node => node.path[0] === 'target',
                run({ signal }) {
                    signals.push(signal);
                    return new Promise<void>(resolve => resolvers.push(resolve));
                },
            }],
        };
        render(JsonViewer, { data: { target: true }, expanded: 1, plugins: [plugin] });
        const node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        const trigger = within(node as HTMLElement).getByRole('button', { name: 'Value actions' });

        await user.click(trigger);
        await user.click(screen.getByRole('menuitem', { name: 'Wait action' }));
        await user.keyboard('{Escape}');
        await user.click(trigger);
        await user.click(screen.getByRole('menuitem', { name: 'Wait action' }));
        resolvers[0]?.();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(screen.getByRole('menu')).not.toBeNull();
        expect(signals[1]?.aborted).toBe(false);
        resolvers[1]?.();
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });

    it('localizes plugin action failures and suppresses errors after cancellation', async () => {
        const user = userEvent.setup();
        const failures: JsonViewerPluginError[] = [];
        let rejectStale: ((error: Error) => void) | undefined;
        const plugin: JsonViewerPlugin = {
            id: 'failing-actions',
            actions: [
                {
                    id: 'fail',
                    label: 'Fail action',
                    when: node => node.path[0] === 'target',
                    run() {
                        throw new Error('action failed');
                    },
                },
                {
                    id: 'stale',
                    label: 'Stale action',
                    when: node => node.path[0] === 'target',
                    run() {
                        return new Promise<void>((_, reject) => (rejectStale = reject));
                    },
                },
            ],
        };
        render(JsonViewer, {
            data: { target: 42 },
            expanded: 1,
            plugins: [plugin],
            theme: 'dark',
            onPluginError: failure => failures.push(failure),
        });
        const node = document.querySelector<HTMLElement>('[data-node-label="target"]');
        const trigger = within(node as HTMLElement).getByRole('button', { name: 'Value actions' });

        await user.click(trigger);
        await user.click(screen.getByRole('menuitem', { name: 'Fail action' }));
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        expect(screen.getByRole('alert').textContent).toBe('Fail action failed: action failed');
        expect(screen.getByRole('alert').classList.contains('sjd-theme-dark')).toBe(true);
        expect(failures).toHaveLength(1);
        expect(failures[0]).toMatchObject({
            pluginId: 'failing-actions',
            operation: 'action',
            operationId: 'fail',
            node: { path: ['target'] },
        });
        expect(failures[0]?.error).toBeInstanceOf(Error);
        await waitFor(() => expect(document.activeElement).toBe(trigger));

        await user.click(trigger);
        await user.click(screen.getByRole('menuitem', { name: 'Stale action' }));
        await user.keyboard('{Escape}');
        rejectStale?.(new Error('late failure'));
        await Promise.resolve();
        expect(failures).toHaveLength(1);
    });

    it('suppresses deferred predicate failures after data replacement or destruction', async () => {
        const failures: JsonViewerPluginError[] = [];
        const plugin: JsonViewerPlugin = {
            id: 'stale-predicate',
            actions: [{
                id: 'hostile',
                label: 'Hostile predicate',
                when(node) {
                    if (node.value === 'old') {
                        throw new Error('old predicate failure');
                    }
                    return false;
                },
                run() {},
            }],
        };
        const rendered = render(JsonViewer, {
            data: { target: 'old' },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });

        await rendered.rerender({
            data: { target: 'new' },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });
        await Promise.resolve();
        expect(failures).toHaveLength(0);
        expect(screen.queryByRole('alert')).toBeNull();

        await rendered.rerender({
            data: { target: 'old' },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });
        await waitFor(() => expect(failures).toHaveLength(1));
        expect(screen.getByRole('alert').textContent).toContain('old predicate failure');

        await rendered.rerender({
            data: { target: 'old' },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });
        await waitFor(() => expect(failures).toHaveLength(2));
        rendered.unmount();

        failures.length = 0;
        const destroyed = render(JsonViewer, {
            data: { target: 'old' },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });
        destroyed.unmount();
        await Promise.resolve();
        expect(failures).toHaveLength(0);
    });

    it('exposes matched plugin actions on circular reference nodes', async () => {
        const user = userEvent.setup();
        const runs: JsonViewerNode[] = [];
        const data: Record<string, unknown> = {};
        data.self = data;
        const plugin: JsonViewerPlugin = {
            id: 'circular-actions',
            actions: [{
                id: 'inspect-circular',
                label: 'Inspect circular reference',
                when: node => node.path[0] === 'self',
                run({ node }) {
                    runs.push(node);
                },
            }],
        };
        render(JsonViewer, { data, expanded: 1, plugins: [plugin] });
        const circularNode = document.querySelector<HTMLElement>('[data-node-label="self"]');

        await user.click(within(circularNode as HTMLElement).getByRole('button', { name: 'Value actions' }));
        await user.click(screen.getByRole('menuitem', { name: 'Inspect circular reference' }));

        expect(runs).toHaveLength(1);
        expect(runs[0]?.path).toEqual(['self']);
    });

    it('keeps the original public node shape assignable', () => {
        const legacyNode: JsonViewerNode = { path: [], pointer: '', value: null };
        legacyNode.path = ['updated'];
        legacyNode.pointer = '/updated';
        legacyNode.value = true;

        expect(legacyNode).toEqual({ path: ['updated'], pointer: '/updated', value: true });
    });

    it('renders a stable node descriptor through an instance component plugin', async () => {
        const user = userEvent.setup();
        const matchedNodes: JsonViewerNode[] = [];
        const selections: (readonly (string | number)[] | null)[] = [];
        const plugin: JsonViewerPlugin = {
            id: 'component-renderer',
            renderers: [{
                when(node) {
                    if (node.path[0] === 'special') {
                        matchedNodes.push(node);
                        return true;
                    }
                    return false;
                },
                component: PluginComponentRenderer,
            }],
        };
        const customized = render(JsonViewer, {
            data: { special: 42, normal: 'built in' },
            expanded: 1,
            plugins: [plugin],
            onSelectedPathChange: path => selections.push(path),
        });

        const customNode = within(customized.container).getByRole('button', {
            name: 'component:special|0|1|number|/special|[]|true|full|42',
        });
        const descriptor = matchedNodes.at(-1);
        expect(descriptor).toMatchObject({
            path: ['special'],
            pointer: '/special',
            value: 42,
            key: 'special',
            index: 0,
            depth: 1,
            kind: 'number',
            parentPath: [],
            jsonCompatible: true,
        });
        expect(Object.isFrozen(descriptor)).toBe(true);
        expect(Object.isFrozen(descriptor?.path)).toBe(true);
        expect(Object.isFrozen(descriptor?.parentPath)).toBe(true);
        expect(within(customized.container).getByText('normal')).toBeTruthy();

        await user.click(customNode);
        expect(selections).toEqual([['special']]);

        const plain = render(JsonViewer, { data: { special: 42 }, expanded: 1 });
        expect(within(plain.container).queryByRole('button', { name: /component:special/ })).toBeNull();
        expect(within(plain.container).getByText((_, node) => node?.classList.contains('number') === true && node.textContent === '42')).toBeTruthy();
    });

    it('renders a snippet from the first matching plugin renderer', () => {
        let laterMatchCalls = 0;
        const firstSnippet = createRawSnippet<[JsonViewerRendererProps]>(getProps => ({
            render: () => `<span data-testid="first-plugin">snippet:${getProps().node.pointer}:${getProps().density}</span>`,
        }));
        const laterSnippet = createRawSnippet<[JsonViewerRendererProps]>(() => ({
            render: () => '<span data-testid="later-plugin">later</span>',
        }));
        const plugins: JsonViewerPlugin[] = [
            {
                id: 'first-plugin',
                renderers: [{
                    when: node => node.path[0] === 'value',
                    snippet: firstSnippet,
                }],
            },
            {
                id: 'later-plugin',
                renderers: [{
                    when(node) {
                        if (node.path[0] === 'value') {
                            laterMatchCalls++;
                            return true;
                        }
                        return false;
                    },
                    snippet: laterSnippet,
                }],
            },
        ];
        const rendered = render(JsonViewer, {
            data: { value: 'custom' },
            expanded: 1,
            plugins,
        });

        expect(within(rendered.container).getByTestId('first-plugin').textContent).toBe('snippet:/value:full');
        expect(within(rendered.container).queryByTestId('later-plugin')).toBeNull();
        expect(laterMatchCalls).toBe(0);
    });

    it('omits JSON Pointer metadata for non-JSON locations', () => {
        let rootNode: JsonViewerNode | undefined;
        const plugin: JsonViewerPlugin = {
            id: 'map-root',
            renderers: [{
                when(node) {
                    if (node.depth === 0) {
                        rootNode = node;
                        return true;
                    }
                    return false;
                },
                component: PluginComponentRenderer,
            }],
        };

        render(JsonViewer, {
            data: new Map([['key', 'value']]),
            plugins: [plugin],
        });

        expect(screen.getByRole('button', { name: /component:null.*map.*false\|full/ })).toBeTruthy();
        expect(rootNode).toMatchObject({
            path: [],
            pointer: null,
            key: null,
            index: null,
            parentPath: null,
            kind: 'map',
            jsonCompatible: false,
        });
    });

    it('reuses resilient Error classification for custom node kinds', () => {
        const error = new Error('custom tag');
        Object.defineProperty(error, Symbol.toStringTag, { value: 'CustomError' });
        let errorNode: JsonViewerNode | undefined;
        const plugin: JsonViewerPlugin = {
            id: 'custom-error',
            renderers: [{
                when(node) {
                    if (node.path[0] === 'error') {
                        errorNode = node;
                        return true;
                    }
                    return false;
                },
                component: PluginComponentRenderer,
            }],
        };

        render(JsonViewer, {
            data: { error },
            expanded: 1,
            plugins: [plugin],
        });

        expect(screen.getByRole('button', { name: /component:error.*error/ })).toBeTruthy();
        expect(errorNode?.kind).toBe('error');
    });

    it('falls back locally when a renderer predicate or component throws', async () => {
        const failures: JsonViewerPluginError[] = [];
        const plugin: JsonViewerPlugin = {
            id: 'hostile-renderers',
            renderers: [{
                when(node) {
                    if (node.path[0] === 'predicate') {
                        throw new Error('predicate failed');
                    }
                    return node.path[0] === 'component';
                },
                component: ThrowingPluginRenderer,
            }],
        };

        render(JsonViewer, {
            data: {
                predicate: 'built in after predicate failure',
                component: 'built in after component failure',
                unaffected: 'still visible',
            },
            expanded: 1,
            plugins: [plugin],
            onPluginError: failure => failures.push(failure),
        });

        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"built in after predicate failure"')).toBeTruthy();
        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"built in after component failure"')).toBeTruthy();
        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"still visible"')).toBeTruthy();
        await waitFor(() => {
            expect(failures.some(failure => failure.pluginId === 'hostile-renderers' && failure.operation === 'renderer-predicate')).toBe(true);
            expect(failures.some(failure => failure.pluginId === 'hostile-renderers' && failure.operation === 'renderer')).toBe(true);
        });
    });

    it('shows an accessible search input only when requested', () => {
        const { unmount } = render(JsonViewer, { data: { hello: 'world' } });

        expect(screen.queryByRole('searchbox')).toBeNull();
        unmount();

        render(JsonViewer, { data: { hello: 'world' }, showSearch: true });

        expect(screen.getByRole('searchbox', { name: 'Search JSON' })).toBeTruthy();
    });

    it('expands and selects nodes through the public component handle', async () => {
        const selections: (readonly (string | number)[] | null)[] = [];
        const { component } = render(JsonViewer, {
            data: { nested: { leaf: 'value' } },
            expanded: 0,
            onSelectedPathChange: path => selections.push(path),
        });

        expect(screen.queryByText('leaf')).toBeNull();
        expect(await component.expand(['nested'])).toBe(true);
        expect(screen.getByText('leaf')).toBeTruthy();
        expect(await component.select(['nested', 'leaf'])).toBe(true);
        expect(selections).toEqual([['nested', 'leaf']]);
    });

    it('searches collapsed keys and values and navigates between results', async () => {
        const user = userEvent.setup();

        render(JsonViewer, {
            data: { hidden: { needleKey: 'first', other: 'needle value' } },
            expanded: 0,
            showSearch: true,
        });

        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'needle');

        expect(await screen.findByText('1 / 2')).toBeTruthy();
        expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search JSON' }));
        expect(screen.getByText('needleKey')).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Next match' }));

        expect(await screen.findByText('2 / 2')).toBeTruthy();
        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"needle value"')).toBeTruthy();
    });

    it('does not read object values outside the visible collection window', () => {
        let hiddenReads = 0;
        const data: Record<string, unknown> = { visible: 'yes' };

        Object.defineProperty(data, 'hidden', {
            enumerable: true,
            get() {
                hiddenReads++;
                return 'later';
            },
        });

        render(JsonViewer, { data, expanded: 1, limit: 1 });

        expect(screen.getByText('visible')).toBeTruthy();
        expect(hiddenReads).toBe(0);
    });

    it('localizes circular references while rendering shared references normally', () => {
        const shared = { answer: 42 };
        const data: Record<string, unknown> = { first: shared, second: shared };
        data.self = data;

        render(JsonViewer, { data, expanded: 4 });

        expect(screen.getByText('[Circular → <root>]')).toBeTruthy();
        expect(screen.getAllByText('answer')).toHaveLength(2);
    });

    it('implements tree keyboard navigation with a single roving focus target', async () => {
        const user = userEvent.setup();
        const selections: (readonly (string | number)[] | null)[] = [];

        render(JsonViewer, {
            data: { branch: { leaf: 1 }, last: 2 },
            expanded: 0,
            onSelectedPathChange: path => selections.push(path),
        });

        const tree = screen.getByRole('tree', { name: 'JSON data' });
        const root = within(tree).getByRole('treeitem');
        root.focus();

        await user.keyboard('{ArrowRight}');
        await waitFor(() => expect(within(tree).getAllByRole('treeitem')[0].getAttribute('aria-expanded')).toBe('true'));
        await user.keyboard('{ArrowRight}');

        expect(document.activeElement?.getAttribute('data-node-label')).toBe('branch');
        expect(within(tree).getAllByRole('treeitem').filter(item => item.tabIndex === 0)).toHaveLength(1);

        await user.keyboard('{Enter}');
        expect(selections).toEqual([['branch']]);
    });

    it('keeps one composite tab stop and exposes node actions with F2', async () => {
        const user = userEvent.setup();
        render(JsonViewer, { data: { value: 1 }, expanded: 1 });

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        root?.focus();
        expect(document.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

        await user.keyboard('{F2}');
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Collapse');
        await user.keyboard('{ArrowRight}');
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Value actions');
        await user.keyboard('{Escape}');
        expect(document.activeElement).toBe(root);
    });

    it('opens and runs plugin actions from the keyboard and returns focus on Escape', async () => {
        const user = userEvent.setup();
        const runs: JsonViewerNode[] = [];
        const plugin: JsonViewerPlugin = {
            id: 'keyboard-actions',
            actions: [{
                id: 'inspect',
                label: 'Inspect node',
                when: node => node.path[0] === 'target',
                run: ({ node }) => {
                    runs.push(node);
                },
            }],
        };
        render(JsonViewer, { data: { target: 1 }, expanded: 1, plugins: [plugin] });

        const target = document.querySelector<HTMLElement>('[data-node-label="target"]');
        target?.focus();
        await user.keyboard('{F2}');
        const trigger = within(target as HTMLElement).getByRole('button', { name: 'Value actions' });
        expect(document.activeElement).toBe(trigger);

        await user.keyboard('{Enter}{End}{Enter}');
        await waitFor(() => expect(runs).toHaveLength(1));
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(runs[0]?.path).toEqual(['target']);

        await user.keyboard('{Enter}{Escape}');
        expect(screen.queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('supports the complete tree direction, toggle and typeahead key set', async () => {
        const user = userEvent.setup();
        render(JsonViewer, {
            data: { alpha: { child: 1 }, beta: 2, charlie: 3 },
            expanded: 1,
        });

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        root?.focus();
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('alpha');

        await user.keyboard(' ');
        expect(document.activeElement?.getAttribute('aria-expanded')).toBe('true');
        await user.keyboard('{ArrowRight}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('child');
        await user.keyboard('{ArrowLeft}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('alpha');
        await user.keyboard('{ArrowLeft}');
        expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');

        await user.keyboard('{End}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('charlie');
        await user.keyboard('{Home}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('root');
        await user.keyboard('b');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('beta');
        await user.keyboard('{ArrowUp}');
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('alpha');
    });

    it('emits controlled expansion changes and applies paths supplied by the host', async () => {
        const data = { branch: { nested: { leaf: true } } };
        const changes: (readonly (readonly (string | number)[])[])[] = [];
        const rendered = render(JsonViewer, {
            data,
            expanded: 0,
            expandedPaths: [[]],
            onExpandedPathsChange: paths => changes.push(paths),
        });

        expect(document.querySelector('[data-node-label="branch"]')?.getAttribute('aria-expanded')).toBe('false');
        expect(await rendered.component.expand(['branch'])).toBe(true);
        expect(changes.at(-1)).toEqual([[], ['branch']]);
        expect(document.querySelector('[data-node-label="branch"]')?.getAttribute('aria-expanded')).toBe('false');

        await rendered.rerender({
            data,
            expanded: 0,
            expandedPaths: [[], ['branch']],
            onExpandedPathsChange: paths => changes.push(paths),
        });

        expect(document.querySelector('[data-node-label="branch"]')?.getAttribute('aria-expanded')).toBe('true');
        expect(await rendered.component.expand(['branch', 'nested'])).toBe(true);
        expect(changes.at(-1)).toEqual([[], ['branch'], ['branch', 'nested']]);
        expect(await rendered.component.expand(['missing'])).toBe(false);
    });

    it('ignores controlled expansion and expand calls for primitive paths', async () => {
        const rendered = render(JsonViewer, {
            data: { primitive: 42 },
            expandedPaths: [[], ['primitive']],
        });

        const primitive = document.querySelector('[data-node-label="primitive"]');
        expect(primitive?.getAttribute('aria-expanded')).toBeNull();
        expect(primitive?.textContent).toContain('42');
        expect(await rendered.component.expand(['primitive'])).toBe(false);
        expect(await rendered.component.collapse(['primitive'])).toBe(false);
    });

    it('supports regular-expression search and reports capped result sets', async () => {
        render(JsonViewer, {
            data: { first: 'needle', second: 'NEEDLE', third: 'other' },
            search: /needle/i,
            showSearch: true,
            maxSearchResults: 1,
        });

        expect(await screen.findByText('1 / 1+')).toBeTruthy();
    });

    it('honors sticky regular-expression semantics', async () => {
        render(JsonViewer, {
            data: { notAtStart: 'ax', atStart: 'x' },
            search: /x/y,
            showSearch: true,
        });

        expect(await screen.findByText('1 / 1')).toBeTruthy();
        expect(screen.getByText('atStart')).toBeTruthy();
        expect(document.querySelector('[data-node-label="atStart"]')?.classList.contains('sjd-search-match')).toBe(true);
        expect(document.querySelector('[data-node-label="notAtStart"]')?.classList.contains('sjd-search-match')).toBe(false);
    });

    it('highlights ordinary string search results without regard to case', async () => {
        render(JsonViewer, {
            data: { value: 'LOUD NEEDLE' },
            search: 'needle',
        });

        await waitFor(() => expect(document.querySelector('.match')?.textContent).toBe('NEEDLE'));
    });

    it('cancels stale asynchronous searches when the query changes', async () => {
        const states: { query: RegExp | string | null; totalCount: number }[] = [];
        const data = {
            values: Array.from({ length: 750 }, (_, index) => `old-${index}`),
            target: 'fresh result',
        };
        const rendered = render(JsonViewer, {
            data,
            search: 'old',
            onSearchStateChange: state => states.push({ query: state.query, totalCount: state.totalCount }),
        });

        await rendered.rerender({
            data,
            search: 'fresh',
            onSearchStateChange: state => states.push({ query: state.query, totalCount: state.totalCount }),
        });

        await waitFor(() => expect(states.at(-1)).toEqual({ query: 'fresh', totalCount: 1 }));
        expect(states.some(state => state.query === 'old' && state.totalCount > 0)).toBe(false);
    });

    it('resets internal state for new data while preserving and recalculating local search', async () => {
        const user = userEvent.setup();
        const selections: (readonly (string | number)[] | null)[] = [];
        const rendered = render(JsonViewer, {
            data: { branch: { value: 'needle old' } },
            expanded: 0,
            showSearch: true,
            onSelectedPathChange: path => selections.push(path),
        });

        await rendered.component.expand(['branch']);
        await rendered.component.select(['branch']);
        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'needle');
        expect(await screen.findByText('1 / 1')).toBeTruthy();

        await rendered.rerender({
            data: { replacement: 'needle new' },
            expanded: 0,
            showSearch: true,
            onSelectedPathChange: path => selections.push(path),
        });

        await waitFor(() => expect(document.querySelector('[data-json-path="[]"]')?.getAttribute('aria-expanded')).toBe('false'));
        expect((screen.getByRole('searchbox', { name: 'Search JSON' }) as HTMLInputElement).value).toBe('needle');
        expect(await screen.findByText('1 / 1')).toBeTruthy();
        expect(selections.at(-1)).toBeNull();
        expect(await rendered.component.focus(['branch'])).toBe(false);
    });

    it('supports all navigation methods on the public component handle', async () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });
        const rendered = render(JsonViewer, {
            data: { first: 'match', second: 'match' },
            expanded: 0,
            search: 'match',
        });

        await waitFor(() => expect(document.querySelectorAll('.sjd-search-match')).toHaveLength(2));
        expect(await rendered.component.previousMatch()).toEqual(['second']);
        expect(await rendered.component.nextMatch()).toEqual(['first']);
        expect(await rendered.component.focus(['second'])).toBe(true);
        expect(document.activeElement?.getAttribute('data-node-label')).toBe('second');
        expect(await rendered.component.scrollTo(['first'])).toBe(true);
        expect(scrollIntoView).toHaveBeenCalled();
        expect(await rendered.component.collapse([])).toBe(true);
        expect(document.querySelector('[data-json-path="[]"]')?.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps controlled selection unchanged until the host supplies the new path', async () => {
        const data = { first: 1, second: 2 };
        const changes: (readonly (string | number)[] | null)[] = [];
        const rendered = render(JsonViewer, {
            data,
            expanded: 1,
            selectedPath: ['first'],
            onSelectedPathChange: path => changes.push(path),
        });

        expect(document.querySelector('[data-node-label="first"]')?.getAttribute('aria-selected')).toBe('true');
        expect(await rendered.component.select(['second'])).toBe(true);
        expect(changes.at(-1)).toEqual(['second']);
        expect(document.querySelector('[data-node-label="first"]')?.getAttribute('aria-selected')).toBe('true');

        await rendered.rerender({
            data,
            expanded: 1,
            selectedPath: ['second'],
            onSelectedPathChange: path => changes.push(path),
        });
        expect(document.querySelector('[data-node-label="second"]')?.getAttribute('aria-selected')).toBe('true');

        await rendered.rerender({
            data,
            expanded: 1,
            selectedPath: ['missing'],
            onSelectedPathChange: path => changes.push(path),
        });
        expect(document.querySelector('[aria-selected="true"]')).toBeNull();
    });

    it('loads the hidden collection window containing a search result', async () => {
        render(JsonViewer, {
            data: ['zero', 'one', 'two', 'three', 'four', 'needle'],
            expanded: 0,
            limit: 2,
            search: 'needle',
        });

        await waitFor(() => expect(document.querySelector('[data-node-label="5"]')).not.toBeNull());
        expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(7);
    });

    it('copies escaped JSON Pointers and restores focus after the action menu closes', async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });

        render(JsonViewer, {
            data: { 'a/b~c': { nested: 1 } },
            expanded: 2,
        });

        const node = document.querySelector<HTMLElement>('[data-node-label="a/b~c"]');
        expect(node).not.toBeNull();
        const actionButton = within(node as HTMLElement).getByRole('button', { name: 'Value actions' });
        await user.click(actionButton);

        const pointerItem = screen.getByRole('menuitem', { name: /Copy JSON Pointer:/ });
        expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true);
        await user.click(pointerItem);

        expect(writeText).toHaveBeenCalledWith('/a~1b~0c');
        expect(document.activeElement).toBe(actionButton);
    });

    it('copies the RFC 6901 empty pointer for the document root', async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        render(JsonViewer, { data: { value: 1 }, expanded: 1 });

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        await user.click(within(root as HTMLElement).getByRole('button', { name: 'Value actions' }));
        await user.click(screen.getByRole('menuitem', { name: 'Copy JSON Pointer:' }));

        expect(writeText).toHaveBeenCalledWith('');
    });

    it('renders Map entries and resolves their stable iteration paths', async () => {
        const rendered = render(JsonViewer, {
            data: new Map([['key', 'value']]),
            expanded: 0,
        });

        expect(screen.getByText('Map(1) {…}')).toBeTruthy();
        expect(await rendered.component.expand([])).toBe(true);
        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"key"')).toBeTruthy();
        expect(screen.getByText((_, node) => node?.classList.contains('string') === true && node.textContent === '"value"')).toBeTruthy();
        expect(await rendered.component.select([0, 1])).toBe(true);

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        const rootActions = root?.querySelector<HTMLElement>(':scope > [aria-label="Value actions"]');
        await userEvent.setup().click(rootActions as HTMLElement);
        expect(screen.queryByRole('menuitem', { name: /Copy JSON Pointer/ })).toBeNull();
    });

    it('renders getter and Proxy failures as local error nodes', () => {
        const throwingGetter: Record<string, unknown> = {};
        Object.defineProperty(throwingGetter, 'broken', {
            enumerable: true,
            get() {
                throw new Error('getter blocked');
            },
        });
        const hostileProxy = new Proxy({}, {
            ownKeys() {
                throw new Error('proxy blocked');
            },
        });
        const hostileArray = new Proxy([], {
            get(target, property, receiver) {
                if (property === 'length') {
                    throw new Error('array length blocked');
                }
                return Reflect.get(target, property, receiver);
            },
        });

        render(JsonViewer, { data: { throwingGetter, hostileProxy, hostileArray }, expanded: 3 });

        expect(screen.getByText('[Thrown: getter blocked]')).toBeTruthy();
        expect(screen.getByText('[Thrown: proxy blocked]')).toBeTruthy();
        expect(screen.getByText('[Thrown: array length blocked]')).toBeTruthy();
    });

    it('can match a getter key even when reading its value throws', async () => {
        const data: Record<string, unknown> = {};
        Object.defineProperty(data, 'needleGetter', {
            enumerable: true,
            get() {
                throw new Error('getter blocked');
            },
        });

        render(JsonViewer, { data, search: 'needle', showSearch: true });

        expect(await screen.findByText('1 / 1')).toBeTruthy();
        expect(screen.getByText('needleGetter')).toBeTruthy();
        expect(screen.getByText('[Thrown: getter blocked]')).toBeTruthy();
    });

    it('can match an array index even when reading its value throws', async () => {
        const data = new Proxy(['zero', 'one'], {
            get(target, property, receiver) {
                if (property === '1') {
                    throw new Error('index blocked');
                }
                return Reflect.get(target, property, receiver);
            },
        });

        render(JsonViewer, { data, search: /^1$/, showSearch: true });

        expect(await screen.findByText('1 / 1')).toBeTruthy();
        expect(screen.getByText('[Thrown: index blocked]')).toBeTruthy();
        expect(document.querySelector('[data-node-label="1"]')?.classList.contains('sjd-search-match')).toBe(true);
    });

    it('localizes serialization failures in the value actions menu', async () => {
        const user = userEvent.setup();
        render(JsonViewer, { data: { unsafe: 1n }, expanded: 1 });

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        expect(root).not.toBeNull();
        await user.click(within(root as HTMLElement).getByRole('button', { name: 'Value actions' }));

        expect(screen.getAllByText(/Can't export JSON:/)).toHaveLength(2);
        expect(screen.getAllByRole('menuitem', { name: /Copy as JSON/ }).every(item => item.getAttribute('aria-disabled') === 'true')).toBe(true);
    });

    it('handles non-Error and hostile serialization exceptions', async () => {
        const user = userEvent.setup();
        const data = {
            toJSON() {
                // eslint-disable-next-line no-throw-literal -- verifies arbitrary user-thrown values stay local
                throw {
                    toString() {
                        throw new Error('coercion blocked');
                    },
                };
            },
        };
        render(JsonViewer, { data, expanded: 1 });

        const root = document.querySelector<HTMLElement>('[data-json-path="[]"]');
        await user.click(within(root as HTMLElement).getByRole('button', { name: 'Value actions' }));

        expect(screen.getAllByText('Can\'t export JSON: Unknown error')).toHaveLength(2);
        expect(screen.getAllByRole('menuitem', { name: /Copy as JSON/ }).every(item => item.getAttribute('aria-disabled') === 'true')).toBe(true);
    });

    it('does not confuse user JSON with the internal error marker', () => {
        render(JsonViewer, {
            data: { __viewerError: true, message: 'ordinary data' },
            expanded: 2,
        });

        expect(screen.getByText('__viewerError')).toBeTruthy();
        expect(screen.getByText('message')).toBeTruthy();
        expect(screen.queryByText('[Thrown: ordinary data]')).toBeNull();
    });

    it('touches only indices in the visible window of a million-item array', async () => {
        const user = userEvent.setup();
        const accessed = new Set<number>();
        const source = Array.from({ length: 1_000_000 }).fill(0);
        const data = new Proxy(source, {
            get(target, property, receiver) {
                if (typeof property === 'string' && /^\d+$/.test(property)) {
                    accessed.add(Number(property));
                }
                return Reflect.get(target, property, receiver);
            },
        });
        const rendered = render(JsonViewer, {
            data,
            expanded: 0,
            limit: 3,
            limitCollapsed: 2,
        });

        expect(await rendered.component.expand([])).toBe(true);
        expect([...accessed]).toEqual([0, 1, 2]);
        expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(4);

        await user.click(screen.getByRole('button', { name: 'Show 3 more...' }));
        expect([...accessed]).toEqual([0, 1, 2, 3, 4, 5]);
        expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(7);
    });

    it('does not scan a small numeric array to decide auto-expansion', () => {
        const accessed = new Set<number>();
        const source = Array.from({ length: 1000 }, (_, index) => index);
        const data = new Proxy(source, {
            get(target, property, receiver) {
                if (typeof property === 'string' && /^\d+$/.test(property)) {
                    accessed.add(Number(property));
                }
                return Reflect.get(target, property, receiver);
            },
        });

        render(JsonViewer, { data, expanded: 1, limitCollapsed: 4 });

        expect([...accessed]).toEqual([0, 1, 2, 3]);
        expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(1);
    });

    it('keeps a large typed array DOM bounded to the visible window', async () => {
        const rendered = render(JsonViewer, {
            data: new Uint32Array(100_000),
            expanded: 0,
            limit: 3,
        });

        expect(await rendered.component.expand([])).toBe(true);
        expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(4);
        expect(screen.getByRole('button', { name: 'Show 3 more...' })).toBeTruthy();
    });

    it('consumes Set and Map iterators only as their visible windows grow', async () => {
        const user = userEvent.setup();

        class CountingSet<T> extends Set<T> {
            reads = 0;

            override values(): SetIterator<T> {
                const iterator = super.values();
                return {
                    next: () => {
                        const result = iterator.next();
                        if (!result.done) {
                            this.reads++;
                        }
                        return result;
                    },
                    [Symbol.iterator]() {
                        return this;
                    },
                } as SetIterator<T>;
            }
        }

        class CountingMap<K, V> extends Map<K, V> {
            reads = 0;

            override entries(): MapIterator<[K, V]> {
                const iterator = super.entries();
                return {
                    next: () => {
                        const result = iterator.next();
                        if (!result.done) {
                            this.reads++;
                        }
                        return result;
                    },
                    [Symbol.iterator]() {
                        return this;
                    },
                } as MapIterator<[K, V]>;
            }
        }

        const set = new CountingSet([1, 2, 3, 4, 5]);
        const setView = render(JsonViewer, { data: set, expanded: 1, limit: 2 });
        expect(set.reads).toBe(2);
        await user.click(screen.getByRole('button', { name: 'Show 2 more...' }));
        expect(set.reads).toBe(4);
        setView.unmount();

        const map = new CountingMap([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]]);
        render(JsonViewer, { data: map, expanded: 1, limit: 2 });
        expect(map.reads).toBe(2);
        await user.click(screen.getByRole('button', { name: 'Show 2 more...' }));
        expect(map.reads).toBe(4);
    });
});
