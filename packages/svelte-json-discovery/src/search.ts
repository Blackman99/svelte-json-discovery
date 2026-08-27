import type { JsonPath } from './types.js';
import { isArray, isSet, isTypedArray, objectToString } from './utils.js';

export interface SearchResult {
    matches: JsonPath[];
    truncated: boolean;
}

function matchesText(text: string, query: RegExp | string): boolean {
    if (typeof query === 'string') {
        return text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    }

    return new RegExp(query.source, query.flags).test(text);
}

function primitiveText(value: unknown): string | null {
    if (value === null) {
        return 'null';
    }

    switch (typeof value) {
        case 'bigint':
        case 'boolean':
        case 'number':
        case 'string':
        case 'undefined':
            return String(value);
        default:
            return null;
    }
}

async function yieldToBrowser(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
}

export async function searchJson(
    data: unknown,
    query: RegExp | string,
    maxResults: number,
    cancelled: () => boolean,
): Promise<SearchResult> {
    const matches: JsonPath[] = [];
    const ancestors = new Set<object>();
    let visited = 0;
    let truncated = false;

    async function visit(value: unknown, path: JsonPath, key?: string | number): Promise<void> {
        if (cancelled() || truncated) {
            return;
        }

        visited++;
        if (visited % 250 === 0) {
            await yieldToBrowser();
            if (cancelled()) {
                return;
            }
        }

        const keyMatches = key !== undefined && matchesText(String(key), query);
        const text = primitiveText(value);
        const valueMatches = text !== null && matchesText(text, query);

        if (keyMatches || valueMatches) {
            if (matches.length >= maxResults) {
                truncated = true;
                return;
            }
            matches.push([...path]);
        }

        if (value === null || typeof value !== 'object') {
            return;
        }

        if (ancestors.has(value)) {
            return;
        }

        ancestors.add(value);
        try {
            if (isArray(value)) {
                for (let index = 0; index < value.length; index++) {
                    let child: unknown;
                    try {
                        child = value[index];
                    }
                    catch {
                        if (matchesText(String(index), query)) {
                            if (matches.length >= maxResults) {
                                truncated = true;
                                return;
                            }
                            matches.push([...path, index]);
                        }
                        continue;
                    }
                    await visit(child, [...path, index], index);
                    if (cancelled() || truncated) {
                        return;
                    }
                }
            }
            else if (isSet(value)) {
                let index = 0;
                for (const child of value) {
                    await visit(child, [...path, index], index);
                    index++;
                    if (cancelled() || truncated) {
                        return;
                    }
                }
            }
            else if (objectToString(value) === '[object Map]') {
                let index = 0;
                for (const [mapKey, child] of value as Map<unknown, unknown>) {
                    await visit([mapKey, child], [...path, index], index);
                    index++;
                    if (cancelled() || truncated) {
                        return;
                    }
                }
            }
            else if (!isTypedArray(value)) {
                let keys: string[];
                try {
                    keys = Object.keys(value);
                }
                catch {
                    return;
                }

                for (const childKey of keys) {
                    let child: unknown;
                    try {
                        child = (value as Record<string, unknown>)[childKey];
                    }
                    catch {
                        if (matchesText(childKey, query)) {
                            if (matches.length >= maxResults) {
                                truncated = true;
                                return;
                            }
                            matches.push([...path, childKey]);
                        }
                        continue;
                    }
                    await visit(child, [...path, childKey], childKey);
                    if (cancelled() || truncated) {
                        return;
                    }
                }
            }
        }
        catch {
            // A hostile iterator or Proxy is a local, non-fatal search miss.
        }
        finally {
            ancestors.delete(value);
        }
    }

    await visit(data, []);
    return { matches, truncated };
}
