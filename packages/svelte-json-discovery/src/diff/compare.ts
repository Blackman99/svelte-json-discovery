import type { JsonPath } from '../types.js';
import type { Change, ChangeSet, CompareJsonOptions, DiffDiagnostic, DiffDiagnosticCode, DiffItemIdentity, DiffItemIdentityResolver, DiffTruncation, DiffTruncationReason } from './types.js';
import { safeErrorMessage } from '../collection.js';
import { pathToPointer } from '../utils.js';

export const DEFAULT_MAX_DIFF_NODES = 100_000;
export const DEFAULT_MAX_DIFF_DEPTH = 100;
export const DEFAULT_MAX_DIFF_RESULTS = 10_000;

type ContainerKind = 'array' | 'map' | 'object' | 'set';
type ValueKind = ContainerKind | 'date' | 'identity' | 'primitive' | 'regexp';
interface Classification { readonly kind: ValueKind; readonly comparable?: number | string }
interface ClassificationFailure { readonly diagnostic: DiffDiagnostic }
interface PairAncestor { readonly baseline: object; readonly current: object }
interface DataEntry { readonly exists: boolean; readonly value?: unknown; readonly diagnostic?: DiffDiagnostic }
interface IdentityEntry { readonly id: DiffItemIdentity; readonly index: number; readonly value: unknown }
interface MapEntry { readonly index: number; readonly key: unknown; readonly value: unknown }

const dateGetTime = Date.prototype.getTime;
const mapSizeGetter = Object.getOwnPropertyDescriptor(Map.prototype, 'size')?.get;
const regexpFlagsGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, 'flags')?.get;
const regexpSourceGetter = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source')?.get;
const setSizeGetter = Object.getOwnPropertyDescriptor(Set.prototype, 'size')?.get;

class DiffScheduler {
    private operations = 0;

    constructor(private readonly signal: AbortSignal | undefined, private readonly yieldEvery: number) {}

    async start(): Promise<void> {
        await this.yield();
    }

    async checkpoint(): Promise<void> {
        this.throwIfAborted();
        this.operations++;
        if (this.operations % this.yieldEvery === 0)
            await this.yield();
    }

    private throwIfAborted(): void {
        if (this.signal?.aborted)
            throw abortError();
    }

    private async yield(): Promise<void> {
        this.throwIfAborted();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        this.throwIfAborted();
    }
}

class ComparisonContext {
    readonly changes: Change[] = [];
    readonly scheduler: DiffScheduler;
    readonly maxDepth: number;
    readonly maxNodes: number;
    readonly maxResults: number;
    readonly itemIdentity: DiffItemIdentityResolver | undefined;
    readonly itemIdentityRules: CompareJsonOptions['itemIdentityRules'];
    nodes = 0;
    truncation: DiffTruncation | undefined;

    constructor(options: CompareJsonOptions) {
        this.maxDepth = positiveInteger(options.maxDepth, DEFAULT_MAX_DIFF_DEPTH);
        this.maxNodes = positiveInteger(options.maxNodes, DEFAULT_MAX_DIFF_NODES);
        this.maxResults = positiveInteger(options.maxResults, DEFAULT_MAX_DIFF_RESULTS);
        this.itemIdentity = options.itemIdentity;
        this.itemIdentityRules = options.itemIdentityRules;
        this.scheduler = new DiffScheduler(options.signal, positiveInteger(options.yieldEvery, 250));
    }

    get stopped(): boolean { return this.truncation !== undefined; }

    async step(path: JsonPath, jsonCompatible: boolean): Promise<boolean> {
        if (this.stopped)
            return false;
        if (this.nodes >= this.maxNodes) {
            this.truncate('nodes', this.maxNodes, path, jsonCompatible);
            return false;
        }
        this.nodes++;
        await this.scheduler.checkpoint();
        return !this.stopped;
    }

    add(change: Change, jsonCompatible: boolean): boolean {
        if (this.stopped)
            return false;
        if (this.changes.length >= this.maxResults) {
            this.truncate('results', this.maxResults, change.path, jsonCompatible);
            return false;
        }
        this.changes.push(change);
        return true;
    }

    truncate(reason: DiffTruncationReason, limit: number, path: JsonPath, jsonCompatible: boolean): void {
        if (this.truncation)
            return;
        const frozenPath = freezePath(path);
        this.truncation = Object.freeze({ reason, limit, path: frozenPath, pointer: jsonCompatible ? pathToPointer(frozenPath) : null });
    }
}

export async function compareJson(current: unknown, baseline: unknown, options: CompareJsonOptions = {}): Promise<ChangeSet> {
    const context = new ComparisonContext(options);
    await context.scheduler.start();
    await compareValue(current, baseline, [], 0, [], true, context);
    return Object.freeze(context.truncation
        ? { changes: Object.freeze(context.changes), truncated: context.truncation }
        : { changes: Object.freeze(context.changes) });
}

async function compareValue(
    current: unknown,
    baseline: unknown,
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    jsonCompatible: boolean,
    context: ComparisonContext,
    stepped = false,
): Promise<void> {
    if (!stepped && !await context.step(path, jsonCompatible))
        return;
    if (Object.is(current, baseline))
        return;
    if (depth > context.maxDepth) {
        context.truncate('depth', context.maxDepth, path, jsonCompatible);
        return;
    }

    const currentType = classify(current);
    const baselineType = classify(baseline);
    if ('diagnostic' in currentType) {
        addDiagnostic(context, path, jsonCompatible, currentType.diagnostic);
        return;
    }
    if ('diagnostic' in baselineType) {
        addDiagnostic(context, path, jsonCompatible, baselineType.diagnostic);
        return;
    }
    if (currentType.kind !== baselineType.kind) {
        addPathChange(context, 'changed', path, jsonCompatible);
        return;
    }
    if (currentType.kind === 'primitive' || currentType.kind === 'identity') {
        addPathChange(context, 'changed', path, jsonCompatible);
        return;
    }
    if (currentType.kind === 'date' || currentType.kind === 'regexp') {
        if (!Object.is(currentType.comparable, baselineType.comparable))
            addPathChange(context, 'changed', path, jsonCompatible);
        return;
    }

    const currentObject = current as object;
    const baselineObject = baseline as object;
    const currentAncestor = ancestors.findIndex(ancestor => ancestor.current === currentObject);
    const baselineAncestor = ancestors.findIndex(ancestor => ancestor.baseline === baselineObject);
    if (currentAncestor >= 0 || baselineAncestor >= 0) {
        if (currentAncestor !== baselineAncestor)
            addPathChange(context, 'changed', path, jsonCompatible);
        return;
    }
    const nextAncestors = [...ancestors, { current: currentObject, baseline: baselineObject }];

    switch (currentType.kind) {
        case 'array':
            await compareArrays(current as unknown[], baseline as unknown[], path, depth, nextAncestors, jsonCompatible, context);
            break;
        case 'map':
            await compareMaps(current as Map<unknown, unknown>, baseline as Map<unknown, unknown>, path, depth, nextAncestors, context);
            break;
        case 'object':
            await compareObjects(currentObject, baselineObject, path, depth, nextAncestors, jsonCompatible, context);
            break;
        case 'set':
            await compareSets(current as Set<unknown>, baseline as Set<unknown>, path, context);
            break;
    }
}

async function compareArrays(
    current: unknown[],
    baseline: unknown[],
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    jsonCompatible: boolean,
    context: ComparisonContext,
): Promise<void> {
    const resolver = resolveIdentityResolver(path, context);
    if (resolver instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('identity', resolver.message));
        return;
    }
    if (resolver) {
        const compared = await compareArraysByIdentity(current, baseline, path, depth, ancestors, jsonCompatible, resolver, context);
        if (compared)
            return;
    }
    await compareArraysByIndex(current, baseline, path, depth, ancestors, jsonCompatible, context);
}

async function compareArraysByIndex(
    current: unknown[],
    baseline: unknown[],
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    jsonCompatible: boolean,
    context: ComparisonContext,
): Promise<void> {
    const currentLength = readArrayLength(current);
    const baselineLength = readArrayLength(baseline);
    if (currentLength instanceof Error || baselineLength instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('proxy', errorMessage(currentLength, baselineLength)));
        return;
    }
    const length = Math.max(currentLength, baselineLength);
    for (let index = 0; index < length && !context.stopped; index++) {
        const childPath = [...path, index];
        if (!await context.step(childPath, jsonCompatible))
            return;
        const currentEntry = readArrayEntry(current, index);
        const baselineEntry = readArrayEntry(baseline, index);
        if (currentEntry.diagnostic || baselineEntry.diagnostic) {
            addDiagnostic(context, childPath, jsonCompatible, currentEntry.diagnostic ?? baselineEntry.diagnostic!);
        }
        else if (!baselineEntry.exists && currentEntry.exists) {
            addPathChange(context, 'added', childPath, jsonCompatible);
        }
        else if (baselineEntry.exists && !currentEntry.exists) {
            addPathChange(context, 'removed', childPath, jsonCompatible);
        }
        else if (currentEntry.exists && baselineEntry.exists) {
            await compareValue(currentEntry.value, baselineEntry.value, childPath, depth + 1, ancestors, jsonCompatible, context, true);
        }
    }
}

async function compareArraysByIdentity(
    current: unknown[],
    baseline: unknown[],
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    jsonCompatible: boolean,
    resolver: DiffItemIdentityResolver,
    context: ComparisonContext,
): Promise<boolean> {
    const currentEntries = await readIdentityEntries(current, path, 'current', resolver, jsonCompatible, context);
    if (currentEntries instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('identity', currentEntries.message));
        return true;
    }
    if (context.stopped || currentEntries === null)
        return context.stopped;
    const baselineEntries = await readIdentityEntries(baseline, path, 'baseline', resolver, jsonCompatible, context);
    if (baselineEntries instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('identity', baselineEntries.message));
        return true;
    }
    if (context.stopped || baselineEntries === null)
        return context.stopped;
    const currentById = uniqueIdentityMap(currentEntries);
    const baselineById = uniqueIdentityMap(baselineEntries);
    if (currentById === null || baselineById === null) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('identity', 'Array item identities must be unique.'));
        return true;
    }
    for (const entry of currentEntries) {
        if (context.stopped)
            return true;
        const childPath = [...path, entry.index];
        const previous = baselineById.get(entry.id);
        if (!previous) {
            addPathChange(context, 'added', childPath, jsonCompatible);
            continue;
        }
        if (previous.index !== entry.index)
            addMovedChange(context, childPath, [...path, previous.index], jsonCompatible);
        await compareValue(entry.value, previous.value, childPath, depth + 1, ancestors, jsonCompatible, context);
    }
    for (const entry of baselineEntries) {
        if (context.stopped)
            return true;
        if (!currentById.has(entry.id))
            addPathChange(context, 'removed', [...path, entry.index], jsonCompatible);
    }
    return true;
}

async function readIdentityEntries(
    value: unknown[],
    path: JsonPath,
    side: 'baseline' | 'current',
    resolver: DiffItemIdentityResolver,
    jsonCompatible: boolean,
    context: ComparisonContext,
): Promise<IdentityEntry[] | Error | null> {
    const length = readArrayLength(value);
    if (length instanceof Error)
        return length;
    const entries: IdentityEntry[] = [];
    for (let index = 0; index < length && !context.stopped; index++) {
        const childPath = [...path, index];
        if (!await context.step(childPath, jsonCompatible))
            return entries;
        const entry = readArrayEntry(value, index);
        if (entry.diagnostic)
            return new Error(entry.diagnostic.message);
        if (!entry.exists)
            continue;
        try {
            const id = resolver(entry.value, { arrayPath: freezePath(path), index, side });
            if (id === null || id === undefined)
                return null;
            entries.push({ id, index, value: entry.value });
        }
        catch (error) {
            return new Error(`Item identity resolution failed: ${safeErrorMessage(error)}`);
        }
    }
    return entries;
}

async function compareObjects(
    current: object,
    baseline: object,
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    jsonCompatible: boolean,
    context: ComparisonContext,
): Promise<void> {
    const currentKeys = readObjectKeys(current);
    if (currentKeys instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('proxy', currentKeys.message));
        return;
    }
    const baselineKeys = readObjectKeys(baseline);
    if (baselineKeys instanceof Error) {
        addDiagnostic(context, path, jsonCompatible, diagnostic('proxy', baselineKeys.message));
        return;
    }
    const keys = [...new Set([...currentKeys, ...baselineKeys])].sort();
    for (const key of keys) {
        if (context.stopped)
            return;
        const childPath = [...path, key];
        if (!await context.step(childPath, jsonCompatible))
            return;
        const currentEntry = readObjectEntry(current, key);
        const baselineEntry = readObjectEntry(baseline, key);
        if (currentEntry?.diagnostic || baselineEntry?.diagnostic) {
            addDiagnostic(context, childPath, jsonCompatible, currentEntry?.diagnostic ?? baselineEntry!.diagnostic!);
        }
        else if (!baselineEntry.exists && currentEntry.exists) {
            addPathChange(context, 'added', childPath, jsonCompatible);
        }
        else if (baselineEntry.exists && !currentEntry.exists) {
            addPathChange(context, 'removed', childPath, jsonCompatible);
        }
        else if (currentEntry.exists && baselineEntry.exists) {
            await compareValue(currentEntry.value, baselineEntry.value, childPath, depth + 1, ancestors, jsonCompatible, context, true);
        }
    }
}

async function compareMaps(
    current: Map<unknown, unknown>,
    baseline: Map<unknown, unknown>,
    path: JsonPath,
    depth: number,
    ancestors: readonly PairAncestor[],
    context: ComparisonContext,
): Promise<void> {
    const currentEntries = await readMapEntries(current, path, context);
    if (currentEntries instanceof Error) {
        addDiagnostic(context, path, false, diagnostic('iterator', currentEntries.message));
        return;
    }
    const baselineEntries = await readMapEntries(baseline, path, context);
    if (baselineEntries instanceof Error) {
        addDiagnostic(context, path, false, diagnostic('iterator', baselineEntries.message));
        return;
    }
    const baselineByKey = new Map(baselineEntries.map(entry => [entry.key, entry]));
    const currentKeys = new Set(currentEntries.map(entry => entry.key));
    for (const entry of currentEntries) {
        if (context.stopped)
            return;
        const previous = baselineByKey.get(entry.key);
        const entryPath = [...path, entry.index];
        if (!previous) {
            addPathChange(context, 'added', entryPath, false);
            continue;
        }
        if (previous.index !== entry.index)
            addMovedChange(context, entryPath, [...path, previous.index], false);
        await compareValue(entry.value, previous.value, [...entryPath, 1], depth + 1, ancestors, false, context);
    }
    for (const entry of baselineEntries) {
        if (context.stopped)
            return;
        if (!currentKeys.has(entry.key))
            addPathChange(context, 'removed', [...path, entry.index], false);
    }
}

async function compareSets(current: Set<unknown>, baseline: Set<unknown>, path: JsonPath, context: ComparisonContext): Promise<void> {
    const currentEntries = await readSetEntries(current, path, context);
    if (currentEntries instanceof Error) {
        addDiagnostic(context, path, false, diagnostic('iterator', currentEntries.message));
        return;
    }
    const baselineEntries = await readSetEntries(baseline, path, context);
    if (baselineEntries instanceof Error) {
        addDiagnostic(context, path, false, diagnostic('iterator', baselineEntries.message));
        return;
    }
    const baselineIndices = new Map(baselineEntries.map((value, index) => [value, index]));
    const currentValues = new Set(currentEntries);
    currentEntries.forEach((value, index) => {
        if (context.stopped)
            return;
        const previousIndex = baselineIndices.get(value);
        if (previousIndex === undefined)
            addPathChange(context, 'added', [...path, index], false);
        else if (previousIndex !== index)
            addMovedChange(context, [...path, index], [...path, previousIndex], false);
    });
    baselineEntries.forEach((value, index) => {
        if (!context.stopped && !currentValues.has(value))
            addPathChange(context, 'removed', [...path, index], false);
    });
}

async function readMapEntries(value: Map<unknown, unknown>, path: JsonPath, context: ComparisonContext): Promise<MapEntry[] | Error> {
    let iterator: Iterator<[unknown, unknown]>;
    try {
        iterator = value.entries();
    }
    catch (error) {
        return new Error(`Map iterator creation failed: ${safeErrorMessage(error)}`);
    }
    const entries: MapEntry[] = [];
    while (!context.stopped) {
        if (!await context.step([...path, entries.length], false))
            break;
        try {
            const next = iterator.next();
            if (next.done)
                break;
            const value = next.value;
            if (!Array.isArray(value) || value.length < 2)
                return new Error('Map iterator returned an invalid entry.');
            entries.push({ index: entries.length, key: value[0], value: value[1] });
        }
        catch (error) {
            return new Error(`Map iterator failed: ${safeErrorMessage(error)}`);
        }
    }
    return entries;
}

async function readSetEntries(value: Set<unknown>, path: JsonPath, context: ComparisonContext): Promise<unknown[] | Error> {
    let iterator: Iterator<unknown>;
    try {
        iterator = value.values();
    }
    catch (error) {
        return new Error(`Set iterator creation failed: ${safeErrorMessage(error)}`);
    }
    const entries: unknown[] = [];
    while (!context.stopped) {
        if (!await context.step([...path, entries.length], false))
            break;
        try {
            const next = iterator.next();
            if ((typeof next !== 'object' && typeof next !== 'function') || next === null)
                return new Error('Set iterator returned an invalid result.');
            if (next.done)
                break;
            entries.push(next.value);
        }
        catch (error) {
            return new Error(`Set iterator failed: ${safeErrorMessage(error)}`);
        }
    }
    return entries;
}

function classify(value: unknown): Classification | ClassificationFailure {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return { kind: 'primitive' };
    if (typeof value === 'function')
        return { kind: 'identity' };
    try {
        if (Array.isArray(value))
            return { kind: 'array' };
    }
    catch (error) {
        return { diagnostic: diagnostic('proxy', `Array recognition failed: ${safeErrorMessage(error)}`) };
    }
    try {
        return { kind: 'date', comparable: dateGetTime.call(value) };
    }
    catch { /* Not a Date internal slot. */ }
    try {
        if (regexpSourceGetter && regexpFlagsGetter) {
            return { kind: 'regexp', comparable: `${regexpSourceGetter.call(value)}/${regexpFlagsGetter.call(value)}` };
        }
    }
    catch { /* Not a RegExp internal slot. */ }
    try {
        if (mapSizeGetter) {
            mapSizeGetter.call(value);
            return { kind: 'map' };
        }
    }
    catch { /* Not a Map internal slot. */ }
    try {
        if (setSizeGetter) {
            setSizeGetter.call(value);
            return { kind: 'set' };
        }
    }
    catch { /* Not a Set internal slot. */ }
    let prototype: object | null;
    try {
        prototype = Object.getPrototypeOf(value);
    }
    catch (error) {
        return { diagnostic: diagnostic('proxy', `Prototype inspection failed: ${safeErrorMessage(error)}`) };
    }
    if (prototype === Object.prototype || prototype === null)
        return { kind: 'object' };
    if (prototype === Date.prototype || prototype === Map.prototype || prototype === RegExp.prototype || prototype === Set.prototype) {
        return { diagnostic: diagnostic('proxy', 'Special value inspection failed.') };
    }
    return { kind: 'identity' };
}

function readArrayLength(value: unknown[]): number | Error {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
        return descriptor && 'value' in descriptor && typeof descriptor.value === 'number' ? descriptor.value : new Error('Array length is unavailable.');
    }
    catch (error) {
        return new Error(`Array inspection failed: ${safeErrorMessage(error)}`);
    }
}

function readArrayEntry(value: unknown[], index: number): DataEntry {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor)
            return { exists: false };
        if (!('value' in descriptor))
            return { exists: true, diagnostic: diagnostic('getter', 'Getter properties are not evaluated for Diff.') };
        return { exists: true, value: descriptor.value };
    }
    catch (error) {
        return { exists: true, diagnostic: diagnostic('proxy', `Array entry inspection failed: ${safeErrorMessage(error)}`) };
    }
}

function readObjectKeys(value: object): string[] | Error {
    try {
        return Reflect.ownKeys(value).filter((key): key is string => typeof key === 'string');
    }
    catch (error) {
        return new Error(`Object key inspection failed: ${safeErrorMessage(error)}`);
    }
}

function readObjectEntry(value: object, key: string): DataEntry {
    let descriptor: PropertyDescriptor | undefined;
    try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
    }
    catch (error) {
        return { exists: true, diagnostic: diagnostic('proxy', `Property inspection failed: ${safeErrorMessage(error)}`) };
    }
    if (!descriptor || !descriptor.enumerable)
        return { exists: false };
    if (!('value' in descriptor))
        return { exists: true, diagnostic: diagnostic('getter', 'Getter properties are not evaluated for Diff.') };
    return { exists: true, value: descriptor.value };
}

function resolveIdentityResolver(path: JsonPath, context: ComparisonContext): DiffItemIdentityResolver | Error | undefined {
    try {
        for (const rule of context.itemIdentityRules ?? []) {
            if (samePath(rule.path, path))
                return rule.resolve;
        }
        return context.itemIdentity;
    }
    catch (error) { return new Error(`Item identity rule inspection failed: ${safeErrorMessage(error)}`); }
}

function uniqueIdentityMap(entries: IdentityEntry[]): Map<DiffItemIdentity, IdentityEntry> | null {
    const result = new Map<DiffItemIdentity, IdentityEntry>();
    for (const entry of entries) {
        if (result.has(entry.id))
            return null;
        result.set(entry.id, entry);
    }
    return result;
}

function samePath(left: JsonPath, right: JsonPath): boolean {
    return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function addPathChange(
    context: ComparisonContext,
    kind: 'added' | 'changed' | 'removed',
    path: JsonPath,
    jsonCompatible: boolean,
    valueDiagnostic?: DiffDiagnostic,
): void {
    const frozenPath = freezePath(path);
    context.add(Object.freeze({
        kind,
        path: frozenPath,
        pointer: jsonCompatible ? pathToPointer(frozenPath) : null,
        ...(valueDiagnostic ? { diagnostic: valueDiagnostic } : {}),
    }) as Change, jsonCompatible);
}

function addMovedChange(context: ComparisonContext, path: JsonPath, previousPath: JsonPath, jsonCompatible: boolean): void {
    const frozenPath = freezePath(path);
    const frozenPreviousPath = freezePath(previousPath);
    context.add(Object.freeze({
        kind: 'moved',
        path: frozenPath,
        pointer: jsonCompatible ? pathToPointer(frozenPath) : null,
        previousPath: frozenPreviousPath,
        previousPointer: jsonCompatible ? pathToPointer(frozenPreviousPath) : null,
    }), jsonCompatible);
}

function addDiagnostic(context: ComparisonContext, path: JsonPath, jsonCompatible: boolean, value: DiffDiagnostic): void {
    addPathChange(context, 'changed', path, jsonCompatible, value);
}

function diagnostic(code: DiffDiagnosticCode, message: string): DiffDiagnostic {
    return Object.freeze({ code, message });
}
function errorMessage(current: unknown, baseline: unknown): string {
    const error = current instanceof Error ? current : baseline;
    return error instanceof Error ? error.message : 'Comparison failed.';
}
function freezePath(path: JsonPath): JsonPath {
    return Object.freeze([...path]);
}
function positiveInteger(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}
function abortError(): Error {
    try {
        return new DOMException('Diff comparison aborted.', 'AbortError');
    }
    catch {
        const error = new Error('Diff comparison aborted.');
        error.name = 'AbortError';
        return error;
    }
}
