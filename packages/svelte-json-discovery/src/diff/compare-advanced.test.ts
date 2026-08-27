import type { DiffItemIdentityRule } from './index.js';
import { describe, expect, it } from 'vitest';
import { compareJson } from './index.js';

describe('advanced bounded comparison', () => {
    it('matches array entities without an index cascade and reports moves before nested changes', async () => {
        const baseline = [
            { id: 'a', value: 1 },
            { id: 'b', value: 1 },
        ];
        const current = [
            { id: 'b', value: 2 },
            { id: 'c', value: 1 },
            { id: 'a', value: 1 },
        ];

        await expect(compareJson(current, baseline, {
            itemIdentity: item => (item as { id: string }).id,
        })).resolves.toEqual({ changes: [
            { kind: 'moved', path: [0], pointer: '/0', previousPath: [1], previousPointer: '/1' },
            { kind: 'changed', path: [0, 'value'], pointer: '/0/value' },
            { kind: 'added', path: [1], pointer: '/1' },
            { kind: 'moved', path: [2], pointer: '/2', previousPath: [0], previousPointer: '/0' },
        ] });
    });

    it('lets an exact path identity rule override default index comparison', async () => {
        const rules: readonly DiffItemIdentityRule[] = [{
            path: ['entities'],
            resolve: item => (item as { id: string }).id,
        }];

        const result = await compareJson(
            { entities: [{ id: 'b' }, { id: 'a' }], values: ['b', 'a'] },
            { entities: [{ id: 'a' }, { id: 'b' }], values: ['a', 'b'] },
            { itemIdentityRules: rules },
        );

        expect(result.changes).toEqual([
            { kind: 'moved', path: ['entities', 0], pointer: '/entities/0', previousPath: ['entities', 1], previousPointer: '/entities/1' },
            { kind: 'moved', path: ['entities', 1], pointer: '/entities/1', previousPath: ['entities', 0], previousPointer: '/entities/0' },
            { kind: 'changed', path: ['values', 0], pointer: '/values/0' },
            { kind: 'changed', path: ['values', 1], pointer: '/values/1' },
        ]);
    });

    it('compares Date and RegExp by value while functions and unknown instances use identity', async () => {
        class Box {
            constructor(readonly value: number) {}
        }
        const sharedFunction = () => 1;
        const sharedBox = new Box(1);
        const result = await compareJson({
            dateEqual: new Date(1),
            dateChanged: new Date(2),
            regexpEqual: /x/gi,
            regexpChanged: /x/g,
            sharedFunction,
            changedFunction: () => 1,
            sharedBox,
            changedBox: new Box(1),
        }, {
            dateEqual: new Date(1),
            dateChanged: new Date(1),
            regexpEqual: /x/gi,
            regexpChanged: /x/i,
            sharedFunction,
            changedFunction: () => 1,
            sharedBox,
            changedBox: new Box(1),
        });

        expect(result.changes.map(change => change.pointer)).toEqual([
            '/changedBox',
            '/changedFunction',
            '/dateChanged',
            '/regexpChanged',
        ]);
    });

    it('compares Map and Set entries with non-standard pointers', async () => {
        const map = await compareJson(
            new Map([['b', 3], ['a', 1], ['c', 4]]),
            new Map([['a', 1], ['b', 2]]),
        );
        expect(map.changes).toEqual([
            { kind: 'moved', path: [0], pointer: null, previousPath: [1], previousPointer: null },
            { kind: 'changed', path: [0, 1], pointer: null },
            { kind: 'moved', path: [1], pointer: null, previousPath: [0], previousPointer: null },
            { kind: 'added', path: [2], pointer: null },
        ]);

        const set = await compareJson(new Set(['b', 'a', 'c']), new Set(['a', 'b', 'd']));
        expect(set.changes).toEqual([
            { kind: 'moved', path: [0], pointer: null, previousPath: [1], previousPointer: null },
            { kind: 'moved', path: [1], pointer: null, previousPath: [0], previousPointer: null },
            { kind: 'added', path: [2], pointer: null },
            { kind: 'removed', path: [2], pointer: null },
        ]);
    });

    it('terminates circular graphs and compares shared references at each path', async () => {
        const baselineCycle: Record<string, unknown> = {};
        baselineCycle.self = baselineCycle;
        const currentCycle: Record<string, unknown> = {};
        currentCycle.self = currentCycle;
        await expect(compareJson(currentCycle, baselineCycle)).resolves.toEqual({ changes: [] });

        const baselineShared = { value: 1 };
        const currentShared = { value: 2 };
        await expect(compareJson(
            { a: currentShared, b: currentShared },
            { a: baselineShared, b: baselineShared },
        )).resolves.toEqual({ changes: [
            { kind: 'changed', path: ['a', 'value'], pointer: '/a/value' },
            { kind: 'changed', path: ['b', 'value'], pointer: '/b/value' },
        ] });

        const mismatched: Record<string, unknown> = { other: {} };
        mismatched.self = mismatched.other;
        expect((await compareJson(currentCycle, mismatched)).changes).toEqual([
            { kind: 'removed', path: ['other'], pointer: '/other' },
            { kind: 'changed', path: ['self'], pointer: '/self' },
        ]);
    });

    it('localizes getter, Proxy, iterator and identity resolver failures', async () => {
        let getterReads = 0;
        const hostile = Object.defineProperty({}, 'value', {
            enumerable: true,
            get() {
                getterReads++;
                throw new Error('getter ran');
            },
        });
        const getterResult = await compareJson(hostile, { value: 1 });
        expect(getterReads).toBe(0);
        expect(getterResult.changes[0]).toMatchObject({
            kind: 'changed',
            path: ['value'],
            diagnostic: { code: 'getter' },
        });

        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        expect((await compareJson(proxy, {})).changes[0]).toMatchObject({
            kind: 'changed',
            path: [],
            diagnostic: { code: 'proxy' },
        });

        class HostileMap extends Map<unknown, unknown> {
            override entries(): MapIterator<[unknown, unknown]> {
                throw new Error('iterator blocked');
            }
        }
        expect((await compareJson(new HostileMap([['a', 1]]), new Map([['a', 1]]))).changes[0]).toMatchObject({
            kind: 'changed',
            path: [],
            diagnostic: { code: 'iterator' },
        });

        expect((await compareJson([{ id: 1 }], [{ id: 1 }], {
            itemIdentity() {
                throw new Error('identity blocked');
            },
        })).changes[0]).toMatchObject({ diagnostic: { code: 'identity' }, path: [] });
    });

    it('bounds hidden reads and reports node, depth and result truncation', async () => {
        let descriptorReads = 0;
        const million = new Proxy(Array.from({ length: 1_000_000 }).fill(1), {
            getOwnPropertyDescriptor(target, property) {
                descriptorReads++;
                return Reflect.getOwnPropertyDescriptor(target, property);
            },
        });
        const nodeCapped = await compareJson(million, [], { maxNodes: 25, yieldEvery: 5 });
        expect(nodeCapped.truncated).toMatchObject({ reason: 'nodes', limit: 25 });
        expect(descriptorReads).toBeLessThan(60);

        let objectDescriptorReads = 0;
        const largeObject = new Proxy(Object.fromEntries(
            Array.from({ length: 1_000 }, (_, index) => [`key${index}`, index]),
        ), {
            getOwnPropertyDescriptor(target, property) {
                objectDescriptorReads++;
                return Reflect.getOwnPropertyDescriptor(target, property);
            },
        });
        const objectCapped = await compareJson(largeObject, {}, { maxNodes: 5 });
        expect(objectCapped.truncated).toMatchObject({ reason: 'nodes', limit: 5 });
        expect(objectDescriptorReads).toBeLessThanOrEqual(4);
        expect(objectCapped.changes.length).toBeLessThanOrEqual(4);

        const exactObjectBudget = await compareJson({ a: 1, b: 2 }, { a: 0, b: 0 }, { maxNodes: 3 });
        expect(exactObjectBudget).toEqual({
            changes: [
                expect.objectContaining({ kind: 'changed', path: ['a'] }),
                expect.objectContaining({ kind: 'changed', path: ['b'] }),
            ],
        });

        const depthCapped = await compareJson({ a: { b: { c: 1 } } }, { a: { b: { c: 0 } } }, { maxDepth: 2 });
        expect(depthCapped.truncated).toMatchObject({ reason: 'depth', limit: 2, path: ['a', 'b', 'c'] });

        const resultCapped = await compareJson([1, 2, 3, 4], [0, 0, 0, 0], { maxResults: 2 });
        expect(resultCapped.changes).toHaveLength(2);
        expect(resultCapped.truncated).toMatchObject({ reason: 'results', limit: 2 });
    });

    it('cooperatively rejects with AbortError', async () => {
        const controller = new AbortController();
        const pending = compareJson(Array.from({ length: 1_000 }, (_, index) => index), [], {
            signal: controller.signal,
            yieldEvery: 1,
        });
        controller.abort();

        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it.each(['done', 'value'] as const)('localizes a hostile Map iterator result %s getter', async (property) => {
        class HostileResultMap extends Map<unknown, unknown> {
            override entries(): MapIterator<[unknown, unknown]> {
                return {
                    next() {
                        return Object.defineProperty({}, property, {
                            get() {
                                throw new Error(`${property} blocked`);
                            },
                        }) as IteratorResult<[unknown, unknown]>;
                    },
                    [Symbol.iterator]() {
                        return this;
                    },
                } as MapIterator<[unknown, unknown]>;
            }
        }

        const result = await compareJson(new HostileResultMap([['a', 1]]), new Map([['a', 1]]));
        expect(result.changes[0]).toMatchObject({
            kind: 'changed',
            path: [],
            diagnostic: { code: 'iterator', message: expect.stringContaining(`${property} blocked`) },
        });
    });

    it('localizes invalid Set iterator results and hostile error messages', async () => {
        class InvalidResultSet extends Set<unknown> {
            override values(): SetIterator<unknown> {
                return {
                    next: () => 0,
                    [Symbol.iterator]() {
                        return this;
                    },
                } as unknown as SetIterator<unknown>;
            }
        }
        expect((await compareJson(new InvalidResultSet([1]), new Set([1]))).changes[0]).toMatchObject({
            path: [],
            diagnostic: { code: 'iterator', message: expect.stringContaining('invalid result') },
        });

        const hostileMessage = new Error('placeholder');
        Object.defineProperty(hostileMessage, 'message', { value: Symbol('blocked') });
        class HostileMessageMap extends Map<unknown, unknown> {
            override entries(): MapIterator<[unknown, unknown]> {
                throw hostileMessage;
            }
        }
        expect((await compareJson(new HostileMessageMap(), new Map())).changes[0]).toMatchObject({
            path: [],
            diagnostic: { code: 'iterator', message: expect.stringContaining('Symbol(blocked)') },
        });
    });

    it('preserves current-side diagnostics before reading a large baseline', async () => {
        class HostileMap extends Map<unknown, unknown> {
            override entries(): MapIterator<[unknown, unknown]> {
                throw new Error('current map blocked');
            }
        }
        const mapResult = await compareJson(new HostileMap(), new Map(
            Array.from({ length: 100 }, (_, index) => [index, index]),
        ), { maxNodes: 5 });
        expect(mapResult).toEqual({ changes: [expect.objectContaining({
            path: [],
            diagnostic: { code: 'iterator', message: expect.stringContaining('current map blocked') },
        })] });

        class HostileSet extends Set<unknown> {
            override values(): SetIterator<unknown> {
                throw new Error('current set blocked');
            }
        }
        const setResult = await compareJson(new HostileSet(), new Set(Array.from({ length: 100 }, (_, index) => index)), { maxNodes: 5 });
        expect(setResult).toEqual({ changes: [expect.objectContaining({
            path: [],
            diagnostic: { code: 'iterator', message: expect.stringContaining('current set blocked') },
        })] });

        const identityResult = await compareJson([{ id: 1 }], Array.from({ length: 100 }, (_, id) => ({ id })), {
            itemIdentity() {
                throw new Error('current identity blocked');
            },
            maxNodes: 5,
        });
        expect(identityResult).toEqual({ changes: [expect.objectContaining({
            path: [],
            diagnostic: { code: 'identity', message: expect.stringContaining('current identity blocked') },
        })] });
    });

    it('does not inspect baseline object keys after a current-side key failure', async () => {
        const proxy = new Proxy({}, {
            ownKeys() {
                throw new Error('current keys blocked');
            },
        });
        let baselineKeyReads = 0;
        const baseline = new Proxy({}, {
            ownKeys() {
                baselineKeyReads++;
                return [];
            },
        });

        const result = await compareJson(proxy, baseline);
        expect(baselineKeyReads).toBe(0);
        expect(result).toEqual({ changes: [expect.objectContaining({
            path: [],
            diagnostic: { code: 'proxy', message: expect.stringContaining('Object key inspection failed') },
        })] });
    });

    it('does not fall back to index comparison when identity rules cannot be inspected', async () => {
        const rules = new Proxy([] as DiffItemIdentityRule[], {
            get(target, property, receiver) {
                if (property === Symbol.iterator)
                    throw new Error('rules blocked');
                return Reflect.get(target, property, receiver);
            },
        });

        const result = await compareJson([{ id: 2 }], [{ id: 1 }], { itemIdentityRules: rules });
        expect(result).toEqual({ changes: [expect.objectContaining({
            path: [],
            diagnostic: { code: 'identity', message: expect.stringContaining('rules blocked') },
        })] });
    });
});
