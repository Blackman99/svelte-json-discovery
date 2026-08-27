import type { JsonViewerNode, JsonViewerNodeKind, ValueContext } from './types.js';
import { isViewerError } from './collection.js';
import { isError, isRegExp, isSet, isTypedArray, objectToString, pathToPointer } from './utils.js';

export function valueKind(value: unknown): JsonViewerNodeKind {
    if (value === null) {
        return 'null';
    }

    const primitiveKind = typeof value;
    if (primitiveKind !== 'object') {
        return primitiveKind === 'bigint'
            || primitiveKind === 'boolean'
            || primitiveKind === 'function'
            || primitiveKind === 'number'
            || primitiveKind === 'string'
            || primitiveKind === 'symbol'
            || primitiveKind === 'undefined'
            ? primitiveKind
            : 'unknown';
    }

    try {
        if (isViewerError(value)) {
            return 'error';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        if (isTypedArray(value)) {
            return 'typed-array';
        }
        if (isError(value)) {
            return 'error';
        }
        if (isRegExp(value)) {
            return 'regexp';
        }
        if (isSet(value)) {
            return 'set';
        }

        switch (objectToString(value)) {
            case '[object Date]': return 'date';
            case '[object Map]': return 'map';
            default: return 'object';
        }
    }
    catch {
        return 'unknown';
    }
}

export function createJsonViewerNode(value: unknown, context: ValueContext): JsonViewerNode {
    const path = Object.freeze([...context.path]);
    const parentPath = context.parent === null
        ? null
        : Object.freeze([...context.parent.path]);

    return Object.freeze({
        path,
        pointer: context.jsonCompatible ? pathToPointer(path) : null,
        value,
        key: context.parent === null ? null : context.key,
        index: context.parent === null ? null : context.index,
        depth: path.length,
        kind: valueKind(value),
        parentPath,
        jsonCompatible: context.jsonCompatible,
    });
}
