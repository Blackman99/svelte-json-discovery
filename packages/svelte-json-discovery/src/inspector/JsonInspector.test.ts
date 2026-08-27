import type { JsonViewerSearchState } from '../types.js';
import type { JsonInspectorHandle, JsonInspectorTableColumn, JsonInspectorTableSort, JsonInspectorView, ValidationIssue } from './index.js';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TableCellRenderer from '../../tests/fixtures/TableCellRenderer.svelte';
import ThrowingTableCellRenderer from '../../tests/fixtures/ThrowingTableCellRenderer.svelte';
import { JsonInspector } from './index.js';

afterEach(cleanup);

describe('json inspector tree shell', () => {
    it('renders Tree by default and exposes unavailable view reasons', async () => {
        render(JsonInspector, { data: { status: undefined }, expanded: 1 });

        const toolbar = screen.getByRole('toolbar', { name: 'Inspector views' });
        const tree = within(toolbar).getByRole('button', { name: 'Tree' });
        const raw = within(toolbar).getByRole('button', { name: 'Raw' });

        expect(tree.getAttribute('aria-pressed')).toBe('true');
        expect(raw.getAttribute('aria-disabled')).toBe('true');
        await waitFor(() => expect(document.getElementById(raw.getAttribute('aria-describedby') as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.'));
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
        await waitFor(() => expect(document.getElementById(raw.getAttribute('aria-describedby') as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.'));
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

    it('uses unique unavailable-view descriptions across Inspector instances', async () => {
        render(JsonInspector, { data: { first: undefined } });
        render(JsonInspector, { data: { second: undefined } });

        const rawButtons = screen.getAllByRole('button', { name: 'Raw' });
        const descriptionIds = rawButtons.map(button => button.getAttribute('aria-describedby'));
        expect(new Set(descriptionIds).size).toBe(2);
        await waitFor(() => {
            for (const descriptionId of descriptionIds) {
                expect(document.getElementById(descriptionId as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.');
            }
        });
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
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());

        await user.click(raw);
        expect(changes).toEqual(['raw']);
        expect(raw.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Raw JSON').textContent).toBe('{\n  "hello": "world",\n  "count": 2\n}');
        expect(screen.queryByRole('tree', { name: 'JSON data' })).toBeNull();

        await user.click(within(toolbar).getByRole('button', { name: 'Tree' }));
        expect(screen.getByRole('tree', { name: 'JSON data' })).not.toBeNull();
    });

    it('starts in Raw when requested as an available uncontrolled default', async () => {
        render(JsonInspector, { data: { ready: true }, defaultView: 'raw' });

        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true'));
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"ready": true');
    });

    it('never enables Raw or reads accessors for extended and circular values', async () => {
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
            const raw = within(rendered.container).getByRole('button', { name: 'Raw' });
            await waitFor(() => expect(document.getElementById(raw.getAttribute('aria-describedby') as string)?.textContent).toBe('Raw view requires strict JSON-compatible data.'));
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

        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());
        await user.click(raw);
        expect(screen.getByLabelText('Raw JSON').textContent).toBe('{\n  "safe": 1\n}');
        expect(toJsonReads).toBe(0);

        cleanup();
        const inherited = Object.assign(Object.create({ toJSON: () => ({ fabricated: true }) }), { safe: 1 });
        render(JsonInspector, { data: inherited });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-describedby')).toContain('view-reason-raw'));

        cleanup();
        const FakeObject = { Object: function Object() {} }.Object;
        const spoofedPrototype = Object.create(null, {
            constructor: { configurable: true, value: FakeObject, writable: true },
        });
        FakeObject.prototype = spoofedPrototype;
        const spoofed = Object.assign(Object.create(spoofedPrototype), { safe: 1 });
        render(JsonInspector, { data: spoofed });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-describedby')).toContain('view-reason-raw'));
    });

    it('accepts strict JSON records parsed in another realm', async () => {
        const user = userEvent.setup();
        const iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        const crossRealmData = (iframe.contentWindow as Window & typeof globalThis).JSON.parse('{"crossRealm":true}');
        render(JsonInspector, { data: crossRealmData });

        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());
        await user.click(raw);
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"crossRealm": true');
        iframe.remove();
    });

    it('formats Array Proxies without invoking their length get trap', async () => {
        const user = userEvent.setup();
        const array = new Proxy([1, 2], {
            get(target, key, receiver) {
                if (key === 'length') {
                    throw new Error('blocked');
                }
                return Reflect.get(target, key, receiver);
            },
        });
        render(JsonInspector, { data: { array } });
        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());

        await user.click(raw);

        expect(screen.getByLabelText('Raw JSON').textContent).toBe('{\n  "array": [\n    1,\n    2\n  ]\n}');
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
        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());
        await user.click(raw);
        const copy = screen.getByRole('button', { name: 'Copy raw JSON' });

        await user.click(copy);

        expect(writeText).toHaveBeenCalledWith('[\n  "complete",\n  1\n]');
        expect(screen.getByRole('status').textContent).toBe('Copied raw JSON.');
        expect(document.activeElement).toBe(copy);

        await rendered.rerender({ data: ['replacement', 2] });
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
        expect(await screen.findByLabelText('Raw JSON')).toHaveProperty('textContent', '[\n  "replacement",\n  2\n]');
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
        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());
        await user.click(raw);
        void user.click(screen.getByRole('button', { name: 'Copy raw JSON' }));
        await waitFor(() => expect(finishCopy).toBeTypeOf('function'));

        await rendered.rerender({ data: { version: 2 } });
        finishCopy?.();
        await Promise.resolve();

        await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
        expect(await screen.findByLabelText('Raw JSON')).toHaveProperty('textContent', '{\n  "version": 2\n}');
    });

    it('clears a stale unavailable status when replacement data enables Raw', async () => {
        const user = userEvent.setup();
        const rendered = render(JsonInspector, { data: { invalid: undefined } });
        const raw = screen.getByRole('button', { name: 'Raw' });
        await user.click(raw);
        expect(screen.getByRole('status').textContent).toContain('requires strict JSON');

        await rendered.rerender({ data: { valid: true } });

        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());
        await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
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

    it('summarizes precomputed validation issues and marks exact Tree nodes', async () => {
        const issues: ValidationIssue[] = [
            { path: ['name'], pointer: '/name', severity: 'error', code: 'required', message: 'Name is required', source: 'schema' },
            { path: ['age'], pointer: '/age', severity: 'warning', code: 'range', message: 'Age is unusual', source: 'business', details: { maximum: 120 } },
            { path: [], pointer: '', severity: 'info', code: 'review', message: 'Review this record', source: 'policy' },
        ];
        render(JsonInspector, { data: { name: '', age: 130 }, expanded: 1, issues });

        const summary = screen.getByRole('region', { name: 'Validation summary' });
        expect(within(summary).getByRole('status', { name: 'Validation issue counts' }).textContent?.replace(/\s+/g, ' ').trim()).toBe('1 error, 1 warning, 1 info');
        expect(within(summary).getAllByRole('button')).toHaveLength(3);
        expect(within(summary).getByRole('button', { name: 'Error required: Name is required at /name from schema' })).not.toBeNull();
        await waitFor(() => expect(document.querySelector('[data-json-path="[\\"name\\"]"] > .sjd-validation-marker')?.textContent).toBe('1 error'));
        expect(document.querySelector('[data-json-path="[\\"age\\"]"] > .sjd-validation-marker')?.textContent).toBe('1 warning');
        expect(document.querySelector('[data-json-path="[]"] > .sjd-validation-marker')?.textContent).toBe('1 info');
    });

    it('marks only loaded Table rows and cells, then annotates the next window', async () => {
        const user = userEvent.setup();
        const issues: ValidationIssue[] = [
            { path: [0, 'profile', 'name'], pointer: '/0/profile/name', severity: 'error', code: 'name', message: 'Invalid name', source: 'schema' },
            { path: [1, 'id'], pointer: '/1/id', severity: 'warning', code: 'id', message: 'Check id', source: 'schema' },
        ];
        render(JsonInspector, {
            data: [{ id: 1, profile: { name: '' } }, { id: 2, profile: { name: 'Ada' } }],
            issues,
            limit: 1,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'JSON table' });

        expect(within(table).getByRole('rowheader', { name: /0/ }).querySelector('.sjd-validation-marker')?.textContent).toBe('1 error');
        expect(screen.getByRole('button', { name: 'Select cell /0/profile' }).parentElement?.querySelector('.sjd-validation-marker')?.textContent).toBe('1 error');
        expect(within(table).getAllByRole('rowheader')).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'Show 1 more row' }));
        expect(within(table).getAllByRole('rowheader')).toHaveLength(2);
        expect(within(table).getAllByRole('rowheader')[1]?.querySelector('.sjd-validation-marker')?.textContent).toBe('1 warning');
    });

    it('navigates issues through Tree without clearing search and lets callbacks replace navigation', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: [4, 'name'],
            pointer: '/4/name',
            severity: 'error',
            code: 'required',
            message: 'Missing name',
            source: 'schema',
        };
        const onIssueSelect = vi.fn();
        const rendered = render(JsonInspector, {
            data: [{ name: 'zero' }, { name: 'one' }, { name: 'two' }, { name: 'three' }, { name: 'needle' }],
            issues: [issue],
            limit: 2,
            onIssueSelect,
            showSearch: true,
            views: ['tree', 'table'],
        });
        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'needle');
        await user.click(screen.getByRole('button', { name: 'Table' }));
        await user.click(screen.getByRole('button', { name: 'Error required: Missing name at /4/name from schema' }));

        expect(onIssueSelect).toHaveBeenCalledWith(issue);
        expect(screen.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
        expect((screen.getByRole('searchbox', { name: 'Search JSON' }) as HTMLInputElement).value).toBe('needle');
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('[4,"name"]'));

        const blocking = vi.fn(() => false);
        await rendered.rerender({
            data: [{ name: 'zero' }, { name: 'one' }, { name: 'two' }, { name: 'three' }, { name: 'needle' }],
            defaultView: 'table',
            issues: [issue],
            limit: 2,
            onIssueSelect: blocking,
            showSearch: true,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        await user.click(screen.getByRole('button', { name: 'Error required: Missing name at /4/name from schema' }));
        expect(blocking).toHaveBeenCalledWith(expect.objectContaining({ code: 'required' }));
        expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('diagnoses invalid and missing validation paths locally', async () => {
        const user = userEvent.setup();
        const missing: ValidationIssue = {
            path: ['missing'],
            pointer: '/missing',
            severity: 'info',
            code: 'external',
            message: 'External target',
            source: 'adapter',
        };
        render(JsonInspector, {
            data: { present: true },
            issues: [
                missing,
                { path: ['bad'], pointer: '/wrong', severity: 'error', code: 'bad', message: 'Bad pointer', source: 'adapter' },
                { path: ['bad'], pointer: '/bad', severity: 'fatal', code: 'bad', message: 'Bad severity', source: 'adapter' },
            ] as unknown as ValidationIssue[],
        });

        expect(screen.getByRole('status', { name: 'Validation diagnostics' }).textContent).toBe('Ignored 2 invalid validation issues.');
        await user.click(screen.getByRole('button', { name: 'Info external: External target at /missing from adapter' }));
        await waitFor(() => expect(screen.getByRole('status', { name: 'Validation navigation' }).textContent).toBe('Validation issue target is unavailable: /missing'));
    });

    it('navigates non-standard validation paths without inventing a JSON Pointer', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: ['lookup', 0],
            pointer: null,
            severity: 'info',
            code: 'map-entry',
            message: 'Review map entry',
            source: 'adapter',
        };
        render(JsonInspector, {
            data: { lookup: new Map([['key', 'value']]) },
            expanded: 1,
            issues: [issue],
        });

        await user.click(screen.getByRole('button', { name: 'Info map-entry: Review map entry at lookup[0] from adapter' }));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["lookup",0]'));
        expect(screen.queryByRole('status', { name: 'Validation navigation' })).toBeNull();
    });

    it('keeps the newest asynchronous issue activation authoritative', async () => {
        const user = userEvent.setup();
        const issues: ValidationIssue[] = [
            { path: ['first'], pointer: '/first', severity: 'error', code: 'first', message: 'First issue', source: 'schema' },
            { path: ['second'], pointer: '/second', severity: 'warning', code: 'second', message: 'Second issue', source: 'schema' },
        ];
        let resolveFirst: (() => void) | undefined;
        let resolveSecond: (() => void) | undefined;
        const onIssueSelect = vi.fn((issue: ValidationIssue) => new Promise<void>((resolve) => {
            if (issue.code === 'first') {
                resolveFirst = resolve;
            }
            else {
                resolveSecond = resolve;
            }
        }));
        render(JsonInspector, { data: { first: 1, second: 2 }, expanded: 1, issues, onIssueSelect });

        await user.click(screen.getByRole('button', { name: 'Error first: First issue at /first from schema' }));
        await user.click(screen.getByRole('button', { name: 'Warning second: Second issue at /second from schema' }));
        resolveSecond?.();
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["second"]'));
        resolveFirst?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(onIssueSelect).toHaveBeenCalledTimes(2);
        expect(document.activeElement?.getAttribute('data-json-path')).toBe('["second"]');
    });

    it('invalidates pending issue activation when data and issues are replaced', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: ['old'],
            pointer: '/old',
            severity: 'error',
            code: 'old',
            message: 'Old issue',
            source: 'schema',
        };
        let resolveSelection: (() => void) | undefined;
        const rendered = render(JsonInspector, {
            data: { old: true },
            expanded: 1,
            issues: [issue],
            onIssueSelect: () => new Promise<void>(resolve => (resolveSelection = resolve)),
        });
        await user.click(screen.getByRole('button', { name: 'Error old: Old issue at /old from schema' }));
        await rendered.rerender({ data: { fresh: true }, expanded: 1, issues: [] });

        resolveSelection?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(screen.queryByRole('status', { name: 'Validation navigation' })).toBeNull();
        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('null');
    });

    it('does not let pending issue activation override a newer view choice', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: ['value'],
            pointer: '/value',
            severity: 'error',
            code: 'value',
            message: 'Review value',
            source: 'schema',
        };
        let resolveSelection: (() => void) | undefined;
        render(JsonInspector, {
            data: { value: 1 },
            issues: [issue],
            onIssueSelect: () => new Promise<void>(resolve => (resolveSelection = resolve)),
            views: ['tree', 'raw'],
        });
        const raw = screen.getByRole('button', { name: 'Raw' });
        await waitFor(() => expect(raw.getAttribute('aria-disabled')).toBeNull());

        await user.click(screen.getByRole('button', { name: 'Error value: Review value at /value from schema' }));
        await user.click(raw);
        resolveSelection?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(raw.getAttribute('aria-pressed')).toBe('true');
    });

    it('does not request Tree after a controlled host supersedes pending issue activation', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: ['value'],
            pointer: '/value',
            severity: 'error',
            code: 'value',
            message: 'Review value',
            source: 'schema',
        };
        let resolveSelection: (() => void) | undefined;
        const onViewChange = vi.fn();
        const onIssueSelect = () => new Promise<void>(resolve => (resolveSelection = resolve));
        const data = { value: 1 };
        const issues = [issue];
        const rendered = render(JsonInspector, {
            data,
            issues,
            onIssueSelect,
            onViewChange,
            view: 'tree',
            views: ['tree', 'raw'],
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-disabled')).toBeNull());
        await user.click(screen.getByRole('button', { name: 'Error value: Review value at /value from schema' }));
        await rendered.rerender({ data, issues, onIssueSelect, onViewChange, view: 'raw', views: ['tree', 'raw'] });

        resolveSelection?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true');
        expect(onViewChange).not.toHaveBeenCalledWith('tree');
    });

    it('focuses an issue after a controlled host accepts the requested Tree view', async () => {
        const user = userEvent.setup();
        const data = { value: 1 };
        const issues: ValidationIssue[] = [{
            path: ['value'],
            pointer: '/value',
            severity: 'error',
            code: 'value',
            message: 'Review value',
            source: 'schema',
        }];
        let applyView: (view: JsonInspectorView) => void = () => undefined;
        const onViewChange = vi.fn((view: JsonInspectorView) => applyView(view));
        const rendered = render(JsonInspector, { data, issues, onViewChange, view: 'raw', views: ['tree', 'raw'] });
        applyView = view => void rendered.rerender({ data, issues, onViewChange, view, views: ['tree', 'raw'] });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true'));

        await user.click(screen.getByRole('button', { name: 'Error value: Review value at /value from schema' }));

        expect(onViewChange).toHaveBeenCalledWith('tree');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true'));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["value"]'));
    });

    it('does not let pending issue activation override newer Raw diagnostic navigation', async () => {
        const user = userEvent.setup();
        const issue: ValidationIssue = {
            path: ['first'],
            pointer: '/first',
            severity: 'error',
            code: 'first',
            message: 'Review first',
            source: 'schema',
        };
        let resolveSelection: (() => void) | undefined;
        render(JsonInspector, {
            data: { first: 1, bad: undefined },
            expanded: 1,
            issues: [issue],
            onIssueSelect: () => new Promise<void>(resolve => (resolveSelection = resolve)),
        });
        const diagnostic = await screen.findByRole('button', { name: 'Raw diagnostic at /bad: Undefined is not valid JSON.' });

        await user.click(screen.getByRole('button', { name: 'Error first: Review first at /first from schema' }));
        await user.click(diagnostic);
        await waitFor(() => expect(document.activeElement?.getAttribute('data-json-path')).toBe('["bad"]'));
        resolveSelection?.();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.activeElement?.getAttribute('data-json-path')).toBe('["bad"]');
    });

    it('continues after a hostile validation entry and renders later valid issues', () => {
        const revoked = Proxy.revocable({}, {});
        revoked.revoke();
        const valid: ValidationIssue = {
            path: ['value'],
            pointer: '/value',
            severity: 'info',
            code: 'valid',
            message: 'Still visible',
            source: 'adapter',
        };
        render(JsonInspector, { data: { value: 1 }, issues: [revoked.proxy, valid] as unknown as ValidationIssue[] });

        expect(screen.getByRole('status', { name: 'Validation diagnostics' }).textContent).toBe('Ignored 1 invalid validation issue.');
        expect(screen.getByRole('button', { name: 'Info valid: Still visible at /value from adapter' })).not.toBeNull();
    });

    it('enumerates only present validation entries in a large sparse array', () => {
        const valid: ValidationIssue = {
            path: ['value'],
            pointer: '/value',
            severity: 'info',
            code: 'valid',
            message: 'Still visible',
            source: 'adapter',
        };
        const sparse: ValidationIssue[] = [];
        sparse.length = 20_000;
        sparse[0] = valid;
        let descriptorReads = 0;
        const guarded = new Proxy(sparse, {
            getOwnPropertyDescriptor(target, key) {
                descriptorReads++;
                return Reflect.getOwnPropertyDescriptor(target, key);
            },
        });
        render(JsonInspector, { data: { value: 1 }, issues: guarded });

        expect(descriptorReads).toBeLessThanOrEqual(2);
        expect(screen.getByRole('button', { name: 'Info valid: Still visible at /value from adapter' })).not.toBeNull();
        expect(screen.queryByRole('status', { name: 'Validation diagnostics' })).toBeNull();
    });

    it('counts valid validation issues beyond the summary window without truncation', () => {
        const issues: ValidationIssue[] = Array.from({ length: 10_001 }, (_, index) => ({
            path: [],
            pointer: '',
            severity: 'error',
            code: `issue-${index}`,
            message: `Issue ${index}`,
            source: 'adapter',
        }));
        render(JsonInspector, { data: null, issues });

        expect(screen.getByRole('status', { name: 'Validation issue counts' }).textContent?.replace(/\s+/g, ' ').trim()).toBe('10001 errors, 0 warnings, 0 info issues');
        expect(screen.queryByRole('status', { name: 'Validation diagnostics' })).toBeNull();
    });

    it('normalizes Proxy-provided validation indices in numeric order', () => {
        const issues: ValidationIssue[] = ['first', 'second', 'third'].map((code, index) => ({
            path: [index],
            pointer: `/${index}`,
            severity: 'info',
            code,
            message: code,
            source: 'adapter',
        }));
        const reversed = new Proxy(issues, {
            ownKeys: target => Reflect.ownKeys(target).reverse(),
        });
        render(JsonInspector, { data: [1, 2, 3], issues: reversed });
        const summary = screen.getByRole('region', { name: 'Validation summary' });

        expect(within(summary).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
            'Info first: first at /0 from adapter',
            'Info second: second at /1 from adapter',
            'Info third: third at /2 from adapter',
        ]);
    });

    it('pages large validation summaries with valid list semantics', async () => {
        const user = userEvent.setup();
        const issues: ValidationIssue[] = Array.from({ length: 120 }, (_, index) => ({
            path: [index],
            pointer: `/${index}`,
            severity: 'info',
            code: `issue-${index}`,
            message: `Issue ${index}`,
            source: 'adapter',
        }));
        render(JsonInspector, { data: Array.from({ length: 120 }), issues });
        const summary = screen.getByRole('region', { name: 'Validation summary' });

        expect(within(summary).getAllByRole('listitem')).toHaveLength(50);
        expect(within(summary).getByRole('status', { name: 'Validation issue counts' }).textContent?.replace(/\s+/g, ' ').trim()).toBe('0 errors, 0 warnings, 120 info issues');
        expect(within(summary).getByRole('status', { name: 'Validation issue window' }).textContent).toBe('Showing 50 of 120 validation issues.');
        await user.click(within(summary).getByRole('button', { name: 'Show 50 more validation issues' }));
        expect(within(summary).getAllByRole('listitem')).toHaveLength(100);
    });

    it('announces mixed-severity node markers without overstating errors', async () => {
        const issues: ValidationIssue[] = [
            { path: ['value'], pointer: '/value', severity: 'error', code: 'error', message: 'Invalid', source: 'schema' },
            { path: ['value'], pointer: '/value', severity: 'warning', code: 'warning', message: 'Review', source: 'policy' },
            { path: ['other'], pointer: '/other', severity: 'info', code: 'first-info', message: 'First note', source: 'policy' },
            { path: ['other'], pointer: '/other', severity: 'info', code: 'second-info', message: 'Second note', source: 'policy' },
        ];
        render(JsonInspector, { data: { value: 1, other: 2 }, expanded: 1, issues });

        await waitFor(() => expect(document.querySelector('[data-json-path="[\\"value\\"]"] > .sjd-validation-marker')?.getAttribute('aria-label')).toBe('2 issues, highest severity error'));
        expect(document.querySelector('[data-json-path="[\\"other\\"]"] > .sjd-validation-marker')?.getAttribute('aria-label')).toBe('2 info issues');
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
        await waitFor(() => expect(within(toolbar).getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true'));
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('2');
    });

    it('enables Table only for a loaded window of plain-object array rows', async () => {
        const rendered = render(JsonInspector, {
            data: { not: 'an array' },
            views: ['tree', 'table'],
        });
        const table = screen.getByRole('button', { name: 'Table' });
        expect(table.getAttribute('aria-disabled')).toBe('true');
        expect(document.getElementById(table.getAttribute('aria-describedby') as string)?.textContent).toBe('Table view requires an array of plain-object rows.');

        await rendered.rerender({
            data: [{ id: 1 }, { id: 2, name: 'second' }],
            views: ['tree', 'table'],
        });
        await waitFor(() => expect(table.getAttribute('aria-disabled')).toBeNull());

        await rendered.rerender({
            data: [{ id: 1 }, null],
            views: ['tree', 'table'],
        });
        await waitFor(() => expect(document.getElementById(table.getAttribute('aria-describedby') as string)?.textContent).toBe('Table requires every loaded row to be a plain object.'));
    });

    it('accepts plain-object rows from another realm', async () => {
        const iframe = document.createElement('iframe');
        document.body.appendChild(iframe);
        const rows = (iframe.contentWindow as Window & typeof globalThis).JSON.parse('[{"id":1}]');
        render(JsonInspector, { data: rows, views: ['tree', 'table'] });

        expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-disabled')).toBeNull();
        iframe.remove();
    });

    it('rejects rows with a spoofed Object constructor', () => {
        const FakeObject = { Object: function Object() {} }.Object;
        const spoofedPrototype = Object.create(null, {
            constructor: { configurable: true, value: FakeObject, writable: true },
        });
        FakeObject.prototype = spoofedPrototype;
        const spoofed = Object.assign(Object.create(spoofedPrototype), { id: 1 });

        render(JsonInspector, { data: [spoofed], views: ['tree', 'table'] });

        const table = screen.getByRole('button', { name: 'Table' });
        expect(table.getAttribute('aria-disabled')).toBe('true');
        expect(document.getElementById(table.getAttribute('aria-describedby') as string)?.textContent).toBe('Table requires every loaded row to be a plain object.');
    });

    it('builds deterministic window columns and renders nested cells compactly', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            data: [
                { id: 1, profile: { name: 'Ada' } },
                { name: 'second', id: 2 },
            ],
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'JSON table' });

        expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Row', 'id', 'profile', 'name']);
        const profile = within(table).getByRole('button', { name: 'Select cell /0/profile' });
        expect(profile.textContent).toBe('{…}');
        expect(profile.getAttribute('data-json-path')).toBe('[0,"profile"]');
        expect(profile.getAttribute('data-node-kind')).toBe('object');
        expect(profile.getAttribute('data-json-pointer')).toBe('/0/profile');
    });

    it('renders controlled path, accessor, hidden and custom columns', async () => {
        const user = userEvent.setup();
        const snippet = createRawSnippet<[import('./index.js').JsonInspectorTableCellRendererProps]>(getProps => ({
            render: () => `<span data-testid="snippet-table-cell">${getProps().column.id}:${String(getProps().value)}</span>`,
        }));
        const columns: JsonInspectorTableColumn[] = [
            { id: 'person', title: 'Person', path: ['profile', 'name'], sortable: true },
            { id: 'score', title: 'Score', accessor: row => Number(row.score) * 2, renderer: { component: TableCellRenderer } },
            { id: 'tag', title: 'Tag', accessor: row => row.tag, renderer: { snippet } },
            { id: 'secret', title: 'Secret', path: ['secret'], visible: false },
            { id: 'broken', title: 'Broken', accessor: () => { throw new Error('accessor blocked'); } },
        ];
        render(JsonInspector, {
            data: [{ profile: { name: 'Ada' }, score: 4, tag: 'math', secret: true }],
            tableColumns: columns,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'JSON table' });

        expect(within(table).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Row', 'Person', 'Score', 'Tag', 'Broken']);
        expect(within(table).queryByText('Secret')).toBeNull();
        const person = screen.getByRole('button', { name: 'Select cell /0/profile/name' });
        expect(person.textContent).toContain('Ada');
        await user.click(person);
        expect(person.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('custom-table-cell').textContent).toBe('score:0:virtual:8');
        await user.click(screen.getByRole('button', { name: 'Select custom score' }));
        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('[0]');
        expect(screen.getByRole('button', { name: 'Select custom score' }).getAttribute('aria-pressed')).toBe('true');
        expect(table.querySelector('button button')).toBeNull();
        expect(screen.getByTestId('snippet-table-cell').textContent).toBe('tag:math');
        expect(screen.getByTestId('custom-table-cell').closest('[data-json-path]')?.getAttribute('data-json-pointer')).toBeNull();
        expect(screen.getByRole('button', { name: 'Select derived cell broken for row 0' }).textContent).toBe('[Thrown: accessor blocked]');
    });

    it('falls back to compact cells when custom component or snippet renderers throw', async () => {
        const user = userEvent.setup();
        const throwingSnippet = createRawSnippet<[import('./index.js').JsonInspectorTableCellRendererProps]>(() => ({
            render: () => { throw new Error('snippet renderer failed'); },
        }));
        const data = [{ component: 7, snippet: 8, failRenderer: true }];
        const columns: JsonInspectorTableColumn[] = [
            { id: 'component', path: ['component'], renderer: { component: ThrowingTableCellRenderer } },
            { id: 'snippet', path: ['snippet'], renderer: { snippet: throwingSnippet } },
        ];
        const rendered = render(JsonInspector, {
            data,
            tableColumns: columns,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));

        expect(screen.getByRole('table', { name: 'JSON table' })).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Select cell /0/component' }).textContent).toBe('7');
        expect(screen.getByRole('button', { name: 'Select cell /0/snippet' }).textContent).toBe('8');
        const table = screen.getByRole('table', { name: 'JSON table' });
        expect(table.querySelectorAll('[data-json-path="[0,\\"component\\"]"]')).toHaveLength(1);
        expect(table.querySelectorAll('[data-json-path="[0,\\"snippet\\"]"]')).toHaveLength(1);

        await rendered.rerender({
            data: [{ component: 7, snippet: 8, failRenderer: false }],
            tableColumns: columns,
            views: ['tree', 'table'],
        });
        await waitFor(() => expect(screen.getByTestId('recovered-table-cell').textContent).toBe('7'));
        expect(screen.queryByRole('button', { name: 'Select cell /0/component' })).toBeNull();
    });

    it('omits Pointer metadata when a controlled path enters a non-JSON container', async () => {
        const user = userEvent.setup();
        const meta = Object.assign(new Map(), { label: 'mapped' });
        render(JsonInspector, {
            data: [{ meta }],
            tableColumns: [{ id: 'label', path: ['meta', 'label'] }],
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));

        const cell = document.querySelector<HTMLElement>('[data-json-path="[0,\\"meta\\",\\"label\\"]"]');
        expect(cell?.getAttribute('data-json-pointer')).toBeNull();
        expect(cell?.textContent).toBe('"mapped"');
    });

    it('sorts only the loaded window locally and preserves source row paths', async () => {
        const user = userEvent.setup();
        let rowReads = 0;
        const target: unknown[] = [];
        target.length = 1_000_000;
        const scores = [3, 1, 2];
        const data = new Proxy(target, {
            getOwnPropertyDescriptor(array, key) {
                if (typeof key === 'string' && /^\d+$/.test(key)) {
                    rowReads++;
                    return { configurable: true, enumerable: true, value: { score: scores[Number(key)] ?? 100 }, writable: true };
                }
                return Reflect.getOwnPropertyDescriptor(array, key);
            },
        });
        render(JsonInspector, {
            data,
            expanded: 0,
            limit: 2,
            tableColumns: [{ id: 'score', title: 'Rank', path: ['score'], sortable: true }],
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const sort = screen.getByRole('button', { name: 'Sort Rank ascending' });
        sort.focus();
        await user.keyboard('{Enter}');

        expect(sort.parentElement?.getAttribute('aria-sort')).toBe('ascending');
        expect(screen.getByRole('status', { name: 'Table ordering scope' }).textContent).toBe('Ordering applies to the current loaded window.');
        expect(within(screen.getByRole('table', { name: 'JSON table' })).getAllByRole('rowheader').map(header => header.textContent)).toEqual(['1', '0']);
        expect(rowReads).toBe(2);
    });

    it('requests controlled full-data sorting without reordering or eager reads', async () => {
        const user = userEvent.setup();
        const changes: (JsonInspectorTableSort | null)[] = [];
        let rowReads = 0;
        const target: unknown[] = [];
        target.length = 1_000_000;
        const data = new Proxy(target, {
            getOwnPropertyDescriptor(array, key) {
                if (typeof key === 'string' && /^\d+$/.test(key)) {
                    rowReads++;
                    return { configurable: true, enumerable: true, value: { score: key === '0' ? 3 : 1 }, writable: true };
                }
                return Reflect.getOwnPropertyDescriptor(array, key);
            },
        });
        render(JsonInspector, {
            data,
            expanded: 0,
            limit: 2,
            tableColumns: [{ id: 'score', path: ['score'], sortable: true }],
            tableSort: { columnId: 'score', direction: 'ascending' },
            onTableSortChange: sort => changes.push(sort),
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'JSON table' });

        expect(within(table).getAllByRole('rowheader').map(header => header.textContent)).toEqual(['0', '1']);
        expect(screen.getByRole('status', { name: 'Table ordering scope' }).textContent).toBe('Ordering applies to full data and is controlled by the host.');
        await user.click(screen.getByRole('button', { name: 'Sort score descending' }));
        expect(changes).toEqual([{ columnId: 'score', direction: 'descending' }]);
        expect(rowReads).toBe(2);
    });

    it('retains valid selection and active path when controlled columns change', async () => {
        const selectedPath = [0, 'profile', 'name'] as const;
        const rendered = render(JsonInspector, {
            data: [{ profile: { name: 'Ada' }, id: 1 }],
            expanded: 3,
            selectedPath,
            tableColumns: [{ id: 'person', path: ['profile', 'name'] }],
            views: ['tree', 'table'],
        });
        await rendered.rerender({
            data: [{ profile: { name: 'Ada' }, id: 1 }],
            expanded: 3,
            selectedPath,
            tableColumns: [{ id: 'id', path: ['id'] }, { id: 'person', path: ['profile', 'name'], visible: false }],
            views: ['tree', 'table'],
        });

        expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('[0,"profile","name"]');
        expect(document.querySelector('[data-json-path="[0,\\"profile\\",\\"name\\"]"]')?.getAttribute('aria-selected')).toBe('true');
    });

    it('synchronizes canonical row and cell selection between Table and Tree', async () => {
        const user = userEvent.setup();
        const selections: (readonly (string | number)[] | null)[] = [];
        render(JsonInspector, {
            data: [{ id: 1, profile: { name: 'Ada' } }, { id: 2 }],
            expanded: 3,
            views: ['tree', 'table'],
            onSelectedPathChange: path => selections.push(path),
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));

        const cell = screen.getByRole('button', { name: 'Select cell /0/profile' });
        await user.click(cell);
        expect(selections.at(-1)).toEqual([0, 'profile']);
        expect(cell.getAttribute('aria-pressed')).toBe('true');
        await user.click(screen.getByRole('button', { name: 'Tree' }));
        expect(document.querySelector('[data-json-path="[0,\\"profile\\"]"]')?.getAttribute('aria-selected')).toBe('true');

        const treeCell = [...document.querySelectorAll<HTMLElement>('[data-json-path]')]
            .find(node => node.getAttribute('data-json-path') === JSON.stringify([1, 'id']));
        await user.click(treeCell as HTMLElement);
        expect(selections.at(-1)).toEqual([1, 'id']);
        await user.click(screen.getByRole('button', { name: 'Table' }));
        expect(screen.getByRole('button', { name: 'Select cell /1/id' }).getAttribute('aria-pressed')).toBe('true');
        await user.click(screen.getByRole('button', { name: 'Select row 1' }));
        expect(selections.at(-1)).toEqual([1]);
    });

    it('keeps search and node metadata visible in Table cells', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            data: [{ name: 'Ada' }, { name: 'Grace' }],
            views: ['tree', 'table'],
            showSearch: true,
        });
        await user.type(screen.getByRole('searchbox', { name: 'Search JSON' }), 'grace');
        await waitFor(() => expect(screen.getByText('1 / 1')).not.toBeNull());
        await user.click(screen.getByRole('button', { name: 'Table' }));

        const cell = screen.getByRole('button', { name: 'Select cell /1/name' });
        expect(cell.classList.contains('sjd-search-current')).toBe(true);
        expect(within(cell).getByText('Grace').classList.contains('match')).toBe(true);
        expect(cell.getAttribute('data-node-kind')).toBe('string');
    });

    it('uses the Tree search semantics for whitespace-only Table searches', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            data: [{ name: 'Ada Lovelace' }],
            search: ' ',
            views: ['tree', 'table'],
        });
        await waitFor(() => expect(document.querySelector('.sjd-inspector')?.getAttribute('data-active-path')).toBe('[0,"name"]'));
        await user.click(screen.getByRole('button', { name: 'Table' }));

        const cell = screen.getByRole('button', { name: 'Select cell /0/name' });
        expect(cell.classList.contains('sjd-search-current')).toBe(true);
        expect(cell.querySelector('.match')?.textContent).toBe(' ');
    });

    it('localizes throwing Table getters in compact error cells', async () => {
        const user = userEvent.setup();
        let getterReads = 0;
        const row = Object.defineProperty({}, 'broken', {
            enumerable: true,
            get() {
                getterReads++;
                throw new Error('cell blocked');
            },
        });
        render(JsonInspector, { data: [row], views: ['tree', 'table'] });
        await user.click(screen.getByRole('button', { name: 'Table' }));

        const cell = screen.getByRole('button', { name: 'Select cell /0/broken' });
        expect(cell.textContent).toBe('[Thrown: cell blocked]');
        expect(cell.getAttribute('data-node-kind')).toBe('error');
        expect(getterReads).toBeGreaterThan(0);
    });

    it('bounds Table row reads and DOM growth to the loaded window', async () => {
        const user = userEvent.setup();
        let rowReads = 0;
        const target: unknown[] = [];
        target.length = 1_000_000;
        const data = new Proxy(target, {
            getOwnPropertyDescriptor(array, key) {
                if (typeof key === 'string' && /^\d+$/.test(key)) {
                    rowReads++;
                    return { configurable: true, enumerable: true, value: { id: Number(key) }, writable: true };
                }
                return Reflect.getOwnPropertyDescriptor(array, key);
            },
        });
        render(JsonInspector, {
            data,
            expanded: 0,
            limit: 2,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        const table = screen.getByRole('table', { name: 'JSON table' });

        expect(rowReads).toBe(2);
        expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
        await user.click(screen.getByRole('button', { name: 'Show 2 more rows' }));
        expect(rowReads).toBe(4);
        expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
    });

    it('does not inspect array rows when Table is not registered', () => {
        let rowReads = 0;
        const target: unknown[] = [];
        target.length = 100;
        const data = new Proxy(target, {
            getOwnPropertyDescriptor(array, key) {
                if (typeof key === 'string' && /^\d+$/.test(key)) {
                    rowReads++;
                    return { configurable: true, enumerable: true, value: { id: Number(key) }, writable: true };
                }
                return Reflect.getOwnPropertyDescriptor(array, key);
            },
        });

        render(JsonInspector, { data, expanded: 0, views: ['tree'] });

        expect(rowReads).toBe(0);
    });

    it('disables Table when Show more reaches a non-object row', async () => {
        const user = userEvent.setup();
        render(JsonInspector, {
            data: [{ id: 1 }, { id: 2 }, null],
            limit: 2,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        await user.click(screen.getByRole('button', { name: 'Show 1 more row' }));

        const table = screen.getByRole('button', { name: 'Table' });
        await waitFor(() => expect(table.getAttribute('aria-disabled')).toBe('true'));
        expect(document.getElementById(table.getAttribute('aria-describedby') as string)?.textContent).toBe('Table requires every loaded row to be a plain object.');
        expect(screen.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('localizes a revoked array Proxy encountered by Table Show more', async () => {
        const user = userEvent.setup();
        const target = [{ id: 1 }, { id: 2 }];
        const { proxy, revoke } = Proxy.revocable(target, {});
        render(JsonInspector, {
            data: proxy,
            limit: 1,
            views: ['tree', 'table'],
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        revoke();

        await expect(user.click(screen.getByRole('button', { name: 'Show 1 more row' }))).resolves.toBeUndefined();
        const table = screen.getByRole('button', { name: 'Table' });
        await waitFor(() => expect(table.getAttribute('aria-disabled')).toBe('true'));
        expect(document.getElementById(table.getAttribute('aria-describedby') as string)?.textContent).toBe('Table requires every loaded row to be a plain object.');
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

    it('reports path-addressable Raw diagnostics and navigates them back to Tree', async () => {
        const user = userEvent.setup();
        render(JsonInspector, { data: { nested: { bad: 1n } }, expanded: 0 });

        const diagnostic = await screen.findByRole('button', { name: 'Raw diagnostic at /nested/bad: BigInt is not valid JSON.' });
        expect(screen.queryByLabelText('Raw JSON')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy raw JSON' })).toBeNull();
        await user.click(diagnostic);

        expect(screen.getByRole('button', { name: 'Tree' }).getAttribute('aria-pressed')).toBe('true');
        await waitFor(() => expect(document.activeElement?.getAttribute('data-node-label')).toBe('bad'));
    });

    it('focuses rendered getter error nodes and falls back for non-rendered diagnostic paths', async () => {
        const user = userEvent.setup();
        const getter = Object.defineProperty({}, 'broken', {
            enumerable: true,
            get() {
                throw new Error('getter blocked');
            },
        });
        const first = render(JsonInspector, { data: { nested: getter }, expanded: 0 });
        await user.click(await screen.findByRole('button', {
            name: 'Raw diagnostic at /nested/broken: Getter properties are not evaluated for Raw output.',
        }));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-node-label')).toBe('broken'));
        expect(screen.getByText('[Thrown: getter blocked]')).not.toBeNull();
        first.unmount();

        const hidden = Object.defineProperty({}, 'hidden', { value: 1, enumerable: false });
        render(JsonInspector, { data: { nested: hidden }, expanded: 0 });
        await user.click(await screen.findByRole('button', {
            name: 'Raw diagnostic at /nested/hidden: Non-enumerable properties are not valid strict JSON.',
        }));
        await waitFor(() => expect(document.activeElement?.getAttribute('data-node-label')).toBe('nested'));
        expect(document.querySelector('[data-node-label="hidden"]')).toBeNull();
    });

    it('localizes every unsupported Raw failure without exposing incomplete copy actions', async () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const getter = Object.defineProperty({}, 'value', {
            enumerable: true,
            get() {
                throw new Error('must not run');
            },
        });
        const hostileProxy = new Proxy({}, {
            ownKeys() {
                throw new Error('blocked');
            },
        });
        const cyclicPrototype: object = new Proxy({}, {
            getPrototypeOf() {
                return cyclicPrototype;
            },
        });
        const hostileConstructor = new Proxy(() => {}, {
            getOwnPropertyDescriptor(target, key) {
                if (key === 'name' || key === 'prototype') {
                    throw new Error('blocked');
                }
                return Reflect.getOwnPropertyDescriptor(target, key);
            },
        });
        const hostileConstructorPrototype = Object.create(null, {
            constructor: { value: hostileConstructor },
        });
        let constructorGetterReads = 0;
        const accessorConstructor = () => {};
        Object.defineProperty(accessorConstructor, 'name', {
            configurable: true,
            get() {
                constructorGetterReads++;
                return 'Object';
            },
        });
        const accessorConstructorPrototype = Object.create(null, {
            constructor: { value: accessorConstructor },
        });
        const hostileArray = new Proxy([], {
            getOwnPropertyDescriptor(target, key) {
                if (key === 'length') {
                    throw new Error('blocked');
                }
                return Reflect.getOwnPropertyDescriptor(target, key);
            },
        });
        const tagged = Object.defineProperty({}, Symbol.toStringTag, {
            enumerable: true,
            get() {
                throw new Error('must stay local');
            },
        });
        class IterableValue {
            * [Symbol.iterator]() {
                throw new Error('must not run');
            }
        }
        const cases = [
            { data: circular, name: 'Raw diagnostic at /self: Circular reference to <root>.' },
            { data: { value: 1n }, name: 'Raw diagnostic at /value: BigInt is not valid JSON.' },
            { data: { value: new Map() }, name: 'Raw diagnostic at /value: Map is not valid JSON.' },
            { data: { value: new Set() }, name: 'Raw diagnostic at /value: Set is not valid JSON.' },
            { data: { value: getter }, name: 'Raw diagnostic at /value/value: Getter properties are not evaluated for Raw output.' },
            { data: { value: hostileProxy }, name: 'Raw diagnostic at /value: Proxy key enumeration failed.' },
            { data: { value: cyclicPrototype }, name: 'Raw diagnostic at /value: Proxy prototype chain is cyclic.' },
            { data: { value: Object.create(hostileConstructorPrototype) }, name: 'Raw diagnostic at /value: Proxy property inspection failed.' },
            { data: { value: Object.create(accessorConstructorPrototype) }, name: 'Raw diagnostic at /value: Getter constructor metadata is not evaluated for Raw output.' },
            { data: { value: hostileArray }, name: 'Raw diagnostic at /value: Proxy property inspection failed.' },
            { data: { value: tagged }, name: 'Raw diagnostic at /value: Symbol properties are not valid strict JSON.' },
            { data: { value: new IterableValue() }, name: 'Raw diagnostic at /value: Iterable objects are not valid JSON.' },
            { data: { value: Number.NaN }, name: 'Raw diagnostic at /value: Non-finite numbers are not valid JSON.' },
        ];

        for (const candidate of cases) {
            const rendered = render(JsonInspector, { data: candidate.data });
            expect(await within(rendered.container).findByRole('button', { name: candidate.name })).not.toBeNull();
            expect(within(rendered.container).queryByLabelText('Raw JSON')).toBeNull();
            expect(within(rendered.container).queryByRole('button', { name: 'Copy raw JSON' })).toBeNull();
            rendered.unmount();
        }
        expect(constructorGetterReads).toBe(0);
    });

    it('announces the Raw byte cap and never retains partial output as copyable', async () => {
        render(JsonInspector, {
            data: { payload: 'this output is deliberately larger than the cap' },
            maxRawBytes: 24,
        });

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Raw output exceeds the 24 byte limit.'));
        expect(screen.queryByLabelText('Raw JSON')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy raw JSON' })).toBeNull();
    });

    it('counts UTF-8 bytes and defaults the Raw cap to 12 MB', async () => {
        const rendered = render(JsonInspector, { data: '你好', maxRawBytes: 6 });
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Raw output exceeds the 6 byte limit.'));
        expect(screen.queryByLabelText('Raw JSON')).toBeNull();

        rendered.unmount();
        render(JsonInspector, { data: 'x'.repeat(12 * 1024 * 1024) });
        await waitFor(
            () => expect(screen.getByRole('status').textContent).toBe('Raw output exceeds the 12582912 byte limit.'),
            { timeout: 3000 },
        );
        expect(screen.queryByLabelText('Raw JSON')).toBeNull();
    });

    it('announces cancellation and restarts Raw generation after a controlled view change', async () => {
        const data = Array.from({ length: 1000 }, (_, index) => index);
        const rendered = render(JsonInspector, { data, view: 'tree' });
        expect(screen.getByRole('status').textContent).toBe('Generating Raw…');

        await rendered.rerender({ data, view: 'raw' });

        expect(screen.getByRole('status').textContent).toBe('Raw generation cancelled. Generating Raw…');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-pressed')).toBe('true'));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('skips unregistered Raw work and keeps Raw announcements independent from view feedback', async () => {
        const user = userEvent.setup();
        const withoutRaw = render(JsonInspector, { data: { value: 1 }, views: ['tree'] });
        expect(within(withoutRaw.container).queryByText('Generating Raw…')).toBeNull();
        expect(within(withoutRaw.container).queryByRole('status')).toBeNull();
        withoutRaw.unmount();

        render(JsonInspector, {
            data: 'Raw output exceeds its configured cap',
            maxRawBytes: 6,
        });
        await user.click(screen.getByRole('button', { name: 'Table' }));
        await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Raw output exceeds the 6 byte limit.'));
        expect(screen.getByRole('status').textContent).toBe('Table view requires an array of plain-object rows.');
    });

    it('cancels cooperative Raw work on data replacement without publishing stale output', async () => {
        let descriptorReads = 0;
        const large = new Proxy(Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`key${index}`, index])), {
            getOwnPropertyDescriptor(target, key) {
                descriptorReads++;
                return Reflect.getOwnPropertyDescriptor(target, key);
            },
        });
        const rendered = render(JsonInspector, { data: large });
        expect(screen.getByRole('status').textContent).toBe('Generating Raw…');
        // Tree performs its own one-time key enumeration; only count reads after
        // the Raw job has been observed in progress.
        descriptorReads = 0;
        await rendered.rerender({ data: { replacement: true } });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Raw' }).getAttribute('aria-disabled')).toBeNull());

        expect(descriptorReads).toBeLessThan(600);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Raw' }));
        expect(screen.getByLabelText('Raw JSON').textContent).toContain('"replacement": true');
        expect(screen.getByLabelText('Raw JSON').textContent).not.toContain('key599');
    });
});
