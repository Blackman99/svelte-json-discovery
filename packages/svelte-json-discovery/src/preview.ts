// Port of discoveryjs/discovery src/views/struct/value-to-html.ts.
// Instead of building HTML strings it produces a token tree which is
// rendered by Preview.svelte — no innerHTML involved.

import type { StructOptions } from './types.js';
import { isViewerError, safeErrorMessage } from './collection.js';
import { hasOwn, isArray, isError, matchAll, numParts, objectToString, stringifyIfNeeded } from './utils.js';

export interface Token {
    cls?: string;
    text?: string;
    parts?: string[];
    href?: string;
    children?: Token[];
}

// the original also listed an IPv4 alternative (`\d+(?:\.\d+){3}`),
// which is a strict subset of the host pattern below
const urlRx = /^(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/\S*)?$/i;

function more(num: number): Token {
    return {
        cls: 'more',
        children: [{ text: '… ' }, { parts: numParts(num) }, { text: ' more' }],
    };
}

function stringTokens(value: string, compact: boolean, options: StructOptions): Token {
    const valueLength = value.length;
    const maxLength = compact ? options.maxCompactStringLength : options.maxStringLength;
    const shortString = valueLength > maxLength + options.allowedExcessStringLength;
    const content: Token[] = [];
    let prefix: Token | null = null;
    let rest: Token | null = null;

    if (shortString) {
        if (options.match) {
            // show a window of the string around the first match
            const matches: { start: number; end: number }[] = [];
            const gap = maxLength > 30 ? 10 : 5;
            const maxMatchLength = maxLength - gap;
            let offset = 0;
            let firstMatchOffset = -1;

            matchAll(
                value,
                options.match,
                (chunk) => {
                    offset += chunk.length;
                },
                (chunk, stop) => {
                    if (firstMatchOffset === -1) {
                        firstMatchOffset = offset + maxMatchLength;
                    }

                    if (offset < firstMatchOffset) {
                        matches.push({ start: offset, end: offset + chunk.length });
                    }

                    offset += chunk.length;

                    if (offset > firstMatchOffset) {
                        return stop;
                    }
                },
                options.matchIgnoreCase,
            );

            if (matches.length > 0) {
                const start = matches[0].start;
                let budget = maxLength;

                if (start !== 0) {
                    const prefixStr = stringifyIfNeeded(value.slice(0, start));

                    if (start > gap) {
                        const moreLength = 2;
                        const prefixLength = gap - moreLength;

                        prefix = { cls: 'more prefix', text: '' };
                        content.push({ text: prefixStr.slice(-prefixLength) });
                        budget -= gap;
                    }
                    else {
                        content.push({ text: prefixStr });
                    }
                }

                for (let i = 0; i < matches.length && budget > 0; i++) {
                    const { start, end } = matches[i];
                    const matchLength = Math.min(end - start, budget);

                    content.push({ cls: 'match', text: stringifyIfNeeded(value.slice(start, start + matchLength)) });
                    budget -= matchLength;

                    if (budget > 0) {
                        const isLast = i + 1 >= matches.length;
                        const nextEnd = isLast ? value.length : matches[i + 1].start;
                        const nextTextLength = Math.min(nextEnd - end, budget);

                        if (isLast) {
                            const restCount = value.length - (end + nextTextLength);

                            if (restCount > 0) {
                                rest = { cls: 'more suffix', parts: numParts(restCount) };
                            }
                        }

                        if (nextTextLength > 0) {
                            content.push({ text: stringifyIfNeeded(value.slice(end, end + nextTextLength)) });
                            budget -= nextTextLength;
                        }
                    }
                }
            }
        }

        if (content.length === 0) {
            content.push({ text: stringifyIfNeeded(value.slice(0, maxLength)) });
            rest = { cls: 'more suffix', parts: numParts(valueLength - maxLength) };
        }
    }
    else if (options.match) {
        matchAll(
            value,
            options.match,
            (text) => {
                content.push({ text: stringifyIfNeeded(text) });
            },
            (text) => {
                content.push({ cls: 'match', text: stringifyIfNeeded(text) });
            },
            options.matchIgnoreCase,
        );
    }
    else {
        content.push({ text: stringifyIfNeeded(value) });
    }

    const asLink = !compact && (value[0] === 'h' || value[0] === '/') && urlRx.test(value);
    const children: Token[] = [{ text: '"' }];

    if (prefix !== null) {
        children.push(prefix);
    }

    if (asLink) {
        children.push({ href: value, children: content });
    }
    else {
        children.push(...content);
    }

    if (rest !== null) {
        children.push(rest);
    }

    children.push({ text: '"' });

    return { cls: 'string', children };
}

export function valueTokens(value: unknown, compact: boolean, options: StructOptions): Token[] {
    try {
        return unsafeValueTokens(value, compact, options);
    }
    catch (error) {
        return [{ cls: 'error-value', text: `[Thrown: ${safeErrorMessage(error)}]` }];
    }
}

function unsafeValueTokens(value: unknown, compact: boolean, options: StructOptions): Token[] {
    if (isViewerError(value)) {
        return [{ cls: 'error-value', text: `[Thrown: ${value.message}]` }];
    }

    switch (typeof value) {
        case 'boolean':
        case 'undefined':
            return [{ cls: 'keyword', text: String(value) }];

        case 'number':
        case 'bigint':
            return [{ cls: 'number', parts: numParts(value) }];

        case 'symbol':
            return [{ cls: 'symbol', text: String(value) }];

        case 'function':
            return [{ text: 'ƒn' }];

        case 'string':
            return [stringTokens(value, compact, options)];

        case 'object': {
            if (value === null) {
                return [{ cls: 'keyword', text: 'null' }];
            }

            if (isArray(value)) {
                const valueLength = value.length;
                const limitCollapsed = options.limitCollapsed === false || options.limitCollapsed > valueLength
                    ? valueLength
                    : options.limitCollapsed;
                const out: Token[] = [{ text: '[' }];

                for (let i = 0; i < limitCollapsed; i++) {
                    if (i > 0) {
                        out.push({ text: ', ' });
                    }

                    out.push(...valueTokens(value[i], true, options));
                }

                if (valueLength > limitCollapsed) {
                    if (limitCollapsed > 0) {
                        out.push({ text: ', ' });
                    }

                    out.push(more(valueLength - limitCollapsed), { text: ' ' });
                }

                out.push({ text: ']' });

                return out;
            }

            if (isError(value)) {
                const children: Token[] = [{ cls: 'error-value__name', text: String(value.name) }];

                if (!compact) {
                    children.push({ cls: 'error-value__message', text: String(value.message) });
                }

                return [{ cls: 'error-value', children }];
            }

            switch (objectToString(value)) {
                case '[object Set]': {
                    const valueSize = (value as Set<unknown>).size;
                    const limitCollapsed = options.limitCollapsed === false || options.limitCollapsed > valueSize
                        ? valueSize
                        : options.limitCollapsed;
                    const iterator = (value as Set<unknown>).values();
                    const out: Token[] = [{ text: '[' }];

                    for (let i = 0; i < limitCollapsed; i++) {
                        if (i > 0) {
                            out.push({ text: ', ' });
                        }

                        out.push(...valueTokens(iterator.next().value, true, options));
                    }

                    if (valueSize > limitCollapsed) {
                        if (limitCollapsed > 0) {
                            out.push({ text: ', ' });
                        }

                        out.push(more(valueSize - limitCollapsed), { text: ' ' });
                    }

                    out.push({ text: ']' });

                    return out;
                }

                case '[object Map]': {
                    const valueSize = (value as Map<unknown, unknown>).size;
                    return [{ text: `Map(${valueSize}) {${valueSize > 0 ? '…' : ''}}` }];
                }

                case '[object Date]':
                    return [{ cls: 'date', text: String(value) }];

                case '[object RegExp]':
                    return [{ cls: 'regexp', text: String(value) }];
            }

            if (compact && options.limitCompactObjectEntries === 0) {
                for (const key in value) {
                    if (hasOwn(value, key)) {
                        return [{ text: '{…}' }];
                    }
                }

                return [{ text: '{}' }];
            }

            const limitObjectEntries = compact
                ? options.limitCompactObjectEntries === false ? Infinity : options.limitCompactObjectEntries
                : options.limitCollapsed === false ? Infinity : options.limitCollapsed;
            const content: Token[] = [];
            let count = 0;

            for (const key in value) {
                if (hasOwn(value, key)) {
                    if (count < limitObjectEntries) {
                        if (count > 0) {
                            content.push({ text: ', ' });
                        }

                        const property = key.length > options.maxCompactPropertyLength
                            ? `${key.slice(0, options.maxCompactPropertyLength)}…`
                            : key;

                        content.push(
                            { cls: 'property', text: property },
                            { text: ': ' },
                            ...valueTokens((value as Record<string, unknown>)[key], true, options),
                        );
                    }

                    count++;
                }
            }

            if (count > limitObjectEntries) {
                if (content.length > 0) {
                    content.push({ text: ', ' });
                }

                content.push(more(count - limitObjectEntries));
            }

            return content.length
                ? [{ text: '{ ' }, ...content, { text: ' }' }]
                : [{ text: '{}' }];
        }

        default:
            return [{ text: `unknown type "${typeof value}"` }];
    }
}
