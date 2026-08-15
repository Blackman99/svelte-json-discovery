// Best-effort JSON Schema walker used for field documentation tooltips.
// Follows the data path through properties / patternProperties /
// additionalProperties / items / prefixItems, resolves local $ref pointers
// and looks through allOf / anyOf / oneOf branches.

export type JsonSchema = Record<string, unknown> | boolean;

export interface SchemaFieldInfo {
    title?: string;
    description?: string;
    type?: string;
    enumValues?: string[];
    defaultValue?: string;
    examples?: string[];
    format?: string;
    deprecated?: boolean;
}

function resolvePointer(root: unknown, pointer: string): unknown {
    if (!pointer.startsWith('#')) {
        return undefined; // external documents are not supported
    }

    let node = root;

    for (const rawPart of pointer.slice(1).split('/')) {
        if (rawPart === '') {
            continue;
        }

        if (node === null || typeof node !== 'object') {
            return undefined;
        }

        const part = decodeURIComponent(rawPart).replace(/~1/g, '/').replace(/~0/g, '~');

        node = (node as Record<string, unknown>)[part];
    }

    return node;
}

export function deref(
    schema: unknown,
    root: unknown,
    seen: Set<string> = new Set(),
): Record<string, unknown> | undefined {
    if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
        return undefined;
    }

    const node = schema as Record<string, unknown>;
    const ref = node.$ref;

    if (typeof ref === 'string') {
        if (seen.has(ref)) {
            return undefined; // circular $ref
        }

        seen.add(ref);

        const target = deref(resolvePointer(root, ref), root, seen);
        const { $ref: _, ...siblings } = node;

        // sibling keywords next to $ref (legal since 2019-09) win over the target
        return target ? { ...target, ...siblings } : siblings;
    }

    return node;
}

const combinators = ['allOf', 'anyOf', 'oneOf'] as const;

// schema for data[key], given the schema describing data itself
export function childSchema(
    parentSchema: unknown,
    key: string | number,
    root: unknown,
): Record<string, unknown> | undefined {
    const schema = deref(parentSchema, root);

    if (!schema) {
        return undefined;
    }

    const branches: unknown[] = [schema];

    for (const keyword of combinators) {
        const list = schema[keyword];

        if (Array.isArray(list)) {
            branches.push(...list);
        }
    }

    for (const branch of branches) {
        const node = branch === schema ? schema : deref(branch, root);

        if (!node) {
            continue;
        }

        const found = typeof key === 'number'
            ? childOfArraySchema(node, key, root)
            : childOfObjectSchema(node, key, root);

        if (found) {
            return found;
        }
    }

    return undefined;
}

function childOfArraySchema(
    node: Record<string, unknown>,
    index: number,
    root: unknown,
): Record<string, unknown> | undefined {
    const { prefixItems, items } = node;

    if (Array.isArray(prefixItems)) {
        if (index < prefixItems.length) {
            return deref(prefixItems[index], root);
        }

        if (items !== undefined && !Array.isArray(items)) {
            return deref(items, root);
        }

        return undefined;
    }

    if (Array.isArray(items)) {
        // draft-07 tuple form
        return index < items.length ? deref(items[index], root) : deref(node.additionalItems, root);
    }

    return deref(items, root);
}

function childOfObjectSchema(
    node: Record<string, unknown>,
    key: string,
    root: unknown,
): Record<string, unknown> | undefined {
    const properties = node.properties;

    if (properties !== null && typeof properties === 'object' && Object.hasOwn(properties, key)) {
        return deref((properties as Record<string, unknown>)[key], root);
    }

    const patternProperties = node.patternProperties;

    if (patternProperties !== null && typeof patternProperties === 'object') {
        for (const [pattern, sub] of Object.entries(patternProperties)) {
            try {
                if (new RegExp(pattern).test(key)) {
                    return deref(sub, root);
                }
            }
            catch {
                // invalid pattern in the schema — ignore
            }
        }
    }

    const additionalProperties = node.additionalProperties;

    if (additionalProperties !== null && typeof additionalProperties === 'object') {
        return deref(additionalProperties, root);
    }

    return undefined;
}

function short(value: unknown): string {
    const str = JSON.stringify(value);

    return typeof str === 'string'
        ? str.length > 60 ? `${str.slice(0, 60)}…` : str
        : String(value);
}

// displayable subset of a schema node; null when there is nothing worth a tooltip
export function schemaInfo(schema: Record<string, unknown> | undefined): SchemaFieldInfo | null {
    if (!schema) {
        return null;
    }

    const info: SchemaFieldInfo = {};

    if (typeof schema.title === 'string') {
        info.title = schema.title;
    }

    if (typeof schema.description === 'string') {
        info.description = schema.description;
    }

    if (typeof schema.type === 'string') {
        info.type = schema.type;
    }
    else if (Array.isArray(schema.type)) {
        info.type = schema.type.join(' | ');
    }

    if (Array.isArray(schema.enum)) {
        info.enumValues = schema.enum.map(short);
    }

    if (schema.default !== undefined) {
        info.defaultValue = short(schema.default);
    }

    if (Array.isArray(schema.examples) && schema.examples.length > 0) {
        info.examples = schema.examples.slice(0, 3).map(short);
    }

    if (typeof schema.format === 'string') {
        info.format = schema.format;
    }

    if (schema.deprecated === true) {
        info.deprecated = true;
    }

    // a bare type is not worth a tooltip on its own
    if (info.title || info.description || info.enumValues || info.defaultValue || info.examples || info.deprecated) {
        return info;
    }

    return null;
}
