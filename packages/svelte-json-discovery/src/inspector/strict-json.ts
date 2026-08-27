import type { JsonPath } from '../types.js';
import type { RawDiagnostic, RawDiagnosticCode } from './types.js';
import { hasNativeObjectSource } from '../native-object.js';
import { pathToPointer } from '../utils.js';

export const DEFAULT_MAX_RAW_BYTES = 12 * 1024 * 1024;

export type StrictJsonResult
    = | { status: 'valid'; text: string; diagnostics: readonly []; bytes: number; reason: null }
        | { status: 'invalid'; text: null; diagnostics: readonly RawDiagnostic[]; bytes: 0; reason: string }
        | { status: 'capped'; text: null; diagnostics: readonly []; bytes: 0; reason: string }
        | { status: 'cancelled'; text: null; diagnostics: readonly []; bytes: 0; reason: string };

export interface StrictJsonOptions {
    signal?: AbortSignal;
    maxBytes?: number;
    yieldEvery?: number;
}

interface Ancestor { value: object; path: JsonPath }

const INVALID_REASON = 'Raw view requires strict JSON-compatible data.';
const CANCELLED_REASON = 'Raw generation cancelled.';

class DiagnosticFailure extends Error {
    constructor(readonly diagnostic: RawDiagnostic) {
        super(diagnostic.message);
    }
}

class ByteCapFailure extends Error {}
class CancelledFailure extends Error {}

class ChunkWriter {
    readonly chunks: string[] = [];
    bytes = 0;
    private readonly encoder = new TextEncoder();

    constructor(readonly maxBytes: number) {}

    write(chunk: string) {
        const nextBytes = this.bytes + this.encoder.encode(chunk).byteLength;
        if (nextBytes > this.maxBytes) {
            this.discard();
            throw new ByteCapFailure();
        }
        this.chunks.push(chunk);
        this.bytes = nextBytes;
    }

    discard() {
        this.chunks.length = 0;
        this.bytes = 0;
    }
}

class CooperativeScheduler {
    private operations = 0;

    constructor(
        private readonly signal: AbortSignal | undefined,
        private readonly yieldEvery: number,
    ) {}

    async start() {
        await this.yield();
    }

    async checkpoint() {
        this.throwIfCancelled();
        this.operations++;
        if (this.operations % this.yieldEvery === 0) {
            await this.yield();
        }
    }

    throwIfCancelled() {
        if (this.signal?.aborted) {
            throw new CancelledFailure();
        }
    }

    private async yield() {
        this.throwIfCancelled();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        this.throwIfCancelled();
    }
}

export async function generateStrictJson(value: unknown, options: StrictJsonOptions = {}): Promise<StrictJsonResult> {
    const maxBytes = normalizeMaxBytes(options.maxBytes);
    const writer = new ChunkWriter(maxBytes);
    const scheduler = new CooperativeScheduler(options.signal, normalizeYieldEvery(options.yieldEvery));

    try {
        await scheduler.start();
        await writeValue(value, [], [], 0, writer, scheduler);
        scheduler.throwIfCancelled();
        return {
            status: 'valid',
            text: writer.chunks.join(''),
            diagnostics: [],
            bytes: writer.bytes,
            reason: null,
        };
    }
    catch (error) {
        writer.discard();
        if (error instanceof CancelledFailure || options.signal?.aborted) {
            return { status: 'cancelled', text: null, diagnostics: [], bytes: 0, reason: CANCELLED_REASON };
        }
        if (error instanceof ByteCapFailure) {
            return {
                status: 'capped',
                text: null,
                diagnostics: [],
                bytes: 0,
                reason: `Raw output exceeds the ${maxBytes} byte limit.`,
            };
        }
        const diagnostic = error instanceof DiagnosticFailure
            ? error.diagnostic
            : createDiagnostic('serialization', 'Raw serialization failed.', []);
        return { status: 'invalid', text: null, diagnostics: [diagnostic], bytes: 0, reason: INVALID_REASON };
    }
}

async function writeValue(
    value: unknown,
    path: JsonPath,
    ancestors: readonly Ancestor[],
    depth: number,
    writer: ChunkWriter,
    scheduler: CooperativeScheduler,
): Promise<void> {
    await scheduler.checkpoint();

    if (value === null) {
        writer.write('null');
        return;
    }
    if (typeof value === 'string') {
        await writeJsonString(value, writer, scheduler);
        return;
    }
    if (typeof value === 'boolean') {
        writer.write(value ? 'true' : 'false');
        return;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            fail('serialization', 'Non-finite numbers are not valid JSON.', path);
        }
        writer.write(JSON.stringify(value));
        return;
    }
    if (typeof value === 'bigint') {
        fail('bigint', 'BigInt is not valid JSON.', path);
    }
    if (typeof value !== 'object') {
        fail('unsupported', `${describeUnsupported(value)} is not valid JSON.`, path);
    }

    const circularTarget = ancestors.find(ancestor => ancestor.value === value);
    if (circularTarget) {
        const target = circularTarget.path.length === 0 ? '<root>' : pathToPointer(circularTarget.path);
        fail('circular', `Circular reference to ${target}.`, path);
    }
    const nextAncestors = [...ancestors, { value, path }];

    if (isArray(value, path)) {
        await writeArray(value, path, nextAncestors, depth, writer, scheduler);
        return;
    }

    const collectionKind = readCollectionKind(value);
    if (collectionKind === 'map') {
        fail('map', 'Map is not valid JSON.', path);
    }
    if (collectionKind === 'set') {
        fail('set', 'Set is not valid JSON.', path);
    }

    const prototype = readPrototype(value, path);
    if (!isPlainRecordPrototype(prototype, path)) {
        if (await findPropertyDescriptor(value, Symbol.iterator, path, scheduler)) {
            fail('iterator', 'Iterable objects are not valid JSON.', path);
        }
        fail('unsupported', 'Object is not a plain JSON object.', path);
    }
    await writeRecord(value, path, nextAncestors, depth, writer, scheduler);
}

async function writeArray(
    value: unknown[],
    path: JsonPath,
    ancestors: readonly Ancestor[],
    depth: number,
    writer: ChunkWriter,
    scheduler: CooperativeScheduler,
) {
    const keys = readOwnKeys(value, path);
    const lengthDescriptor = readOwnDescriptor(value, 'length', path);
    const length = lengthDescriptor && 'value' in lengthDescriptor && typeof lengthDescriptor.value === 'number'
        ? lengthDescriptor.value
        : 0;
    if (keys.some(key => typeof key === 'symbol' || (key !== 'length' && !isArrayIndex(key, length)))) {
        fail('serialization', 'Arrays with non-index properties are not valid strict JSON.', path);
    }

    writer.write('[');
    for (let index = 0; index < length; index++) {
        await scheduler.checkpoint();
        const childPath = [...path, index];
        const descriptor = readOwnDescriptor(value, String(index), childPath);
        if (!descriptor) {
            fail('serialization', 'Sparse array entries are not valid strict JSON.', childPath);
        }
        if (!('value' in descriptor)) {
            fail('getter', 'Getter properties are not evaluated for Raw output.', childPath);
        }
        writer.write(index === 0 ? '\n' : ',\n');
        writer.write('  '.repeat(depth + 1));
        await writeValue(descriptor.value, childPath, ancestors, depth + 1, writer, scheduler);
    }
    if (length > 0) {
        writer.write('\n');
        writer.write('  '.repeat(depth));
    }
    writer.write(']');
}

async function writeRecord(
    value: object,
    path: JsonPath,
    ancestors: readonly Ancestor[],
    depth: number,
    writer: ChunkWriter,
    scheduler: CooperativeScheduler,
) {
    const keys = readOwnKeys(value, path);
    writer.write('{');
    let index = 0;
    for (const key of keys) {
        await scheduler.checkpoint();
        if (typeof key === 'symbol') {
            fail('serialization', 'Symbol properties are not valid strict JSON.', path);
        }
        const childPath = [...path, key];
        const descriptor = readOwnDescriptor(value, key, childPath);
        if (!descriptor) {
            fail('serialization', 'Non-enumerable properties are not valid strict JSON.', childPath);
        }
        if (!('value' in descriptor)) {
            fail('getter', 'Getter properties are not evaluated for Raw output.', childPath);
        }
        if (!descriptor.enumerable) {
            fail('serialization', 'Non-enumerable properties are not valid strict JSON.', childPath);
        }
        writer.write(index++ === 0 ? '\n' : ',\n');
        writer.write('  '.repeat(depth + 1));
        await writeJsonString(key, writer, scheduler);
        writer.write(': ');
        await writeValue(descriptor.value, childPath, ancestors, depth + 1, writer, scheduler);
    }
    if (index > 0) {
        writer.write('\n');
        writer.write('  '.repeat(depth));
    }
    writer.write('}');
}

async function writeJsonString(value: string, writer: ChunkWriter, scheduler: CooperativeScheduler) {
    writer.write('"');
    for (let offset = 0; offset < value.length;) {
        let end = Math.min(offset + 8192, value.length);
        const finalCodeUnit = value.charCodeAt(end - 1);
        if (end < value.length && finalCodeUnit >= 0xD800 && finalCodeUnit <= 0xDBFF) {
            end++;
        }
        const encoded = JSON.stringify(value.slice(offset, end));
        if (typeof encoded !== 'string') {
            throw new TypeError('String serialization failed.');
        }
        writer.write(encoded.slice(1, -1));
        offset = end;
        await scheduler.checkpoint();
    }
    writer.write('"');
}

function isArray(value: object, path: JsonPath): value is unknown[] {
    try {
        return Array.isArray(value);
    }
    catch {
        fail('proxy', 'Proxy array inspection failed.', path);
    }
}

function readCollectionKind(value: object): 'map' | 'set' | null {
    try {
        Map.prototype.has.call(value, value);
        return 'map';
    }
    catch {
        // Not a Map internal slot.
    }
    try {
        Set.prototype.has.call(value, value);
        return 'set';
    }
    catch {
        return null;
    }
}

function readPrototype(value: object, path: JsonPath): object | null {
    try {
        return Object.getPrototypeOf(value);
    }
    catch {
        fail('proxy', 'Proxy prototype inspection failed.', path);
    }
}

function readOwnKeys(value: object, path: JsonPath): (string | symbol)[] {
    try {
        return Reflect.ownKeys(value);
    }
    catch {
        fail('proxy', 'Proxy key enumeration failed.', path);
    }
}

function readOwnDescriptor(value: object, key: PropertyKey, path: JsonPath): PropertyDescriptor | undefined {
    try {
        return Object.getOwnPropertyDescriptor(value, key);
    }
    catch {
        fail('proxy', 'Proxy property inspection failed.', path);
    }
}

async function findPropertyDescriptor(
    value: object,
    key: PropertyKey,
    path: JsonPath,
    scheduler: CooperativeScheduler,
): Promise<PropertyDescriptor | undefined> {
    let current: object | null = value;
    const visited = new Set<object>();
    while (current) {
        await scheduler.checkpoint();
        if (visited.has(current)) {
            fail('proxy', 'Proxy prototype chain is cyclic.', path);
        }
        visited.add(current);
        const descriptor = readOwnDescriptor(current, key, path);
        if (descriptor) {
            return descriptor;
        }
        current = readPrototype(current, path);
    }
    return undefined;
}

function isPlainRecordPrototype(prototype: object | null, path: JsonPath): boolean {
    if (prototype === null) {
        return true;
    }
    const constructor = readOwnDescriptor(prototype, 'constructor', path);
    const constructorMetadata = constructor && 'value' in constructor && typeof constructor.value === 'function'
        ? readFunctionMetadata(constructor.value, path)
        : null;
    if (
        !constructor
        || !('value' in constructor)
        || typeof constructor.value !== 'function'
        || constructorMetadata?.name !== 'Object'
        || constructorMetadata.prototype !== prototype
        || readPrototype(prototype, path) !== null
    ) {
        return false;
    }
    try {
        return hasNativeObjectSource(constructor.value);
    }
    catch {
        fail('proxy', 'Object constructor inspection failed.', path);
    }
}

function readFunctionMetadata(value: object, path: JsonPath): { name: unknown; prototype: unknown } {
    const name = readOwnDescriptor(value, 'name', path);
    const prototype = readOwnDescriptor(value, 'prototype', path);
    if ((name && !('value' in name)) || (prototype && !('value' in prototype))) {
        fail('getter', 'Getter constructor metadata is not evaluated for Raw output.', path);
    }
    return {
        name: name && 'value' in name ? name.value : undefined,
        prototype: prototype && 'value' in prototype ? prototype.value : undefined,
    };
}

function createDiagnostic(code: RawDiagnosticCode, message: string, path: JsonPath): RawDiagnostic {
    const stablePath = Object.freeze([...path]) as JsonPath;
    return Object.freeze({ code, message, path: stablePath, pointer: pathToPointer(stablePath) });
}

function fail(code: RawDiagnosticCode, message: string, path: JsonPath): never {
    throw new DiagnosticFailure(createDiagnostic(code, message, path));
}

function describeUnsupported(value: unknown): string {
    if (value === undefined) {
        return 'Undefined';
    }
    const kind = typeof value;
    return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function normalizeMaxBytes(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : DEFAULT_MAX_RAW_BYTES;
}

function normalizeYieldEvery(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 32;
}

function isArrayIndex(key: string, length: number): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
