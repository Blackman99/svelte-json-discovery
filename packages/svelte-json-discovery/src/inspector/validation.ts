import type { JsonPath } from '../types.js';
import type { ValidationIssue, ValidationIssueSeverity } from '../validation/types.js';
import { pathKey, pathToPointer } from '../utils.js';

export interface ValidationState {
    readonly byPath: ReadonlyMap<string, readonly ValidationIssue[]>;
    readonly byAncestor: ReadonlyMap<string, readonly ValidationIssue[]>;
    readonly counts: Readonly<Record<ValidationIssueSeverity, number>>;
    readonly invalidCount: number;
    readonly issues: readonly ValidationIssue[];
}

const SEVERITIES: readonly ValidationIssueSeverity[] = ['error', 'warning', 'info'];

export function normalizeValidationIssues(input: unknown): ValidationState {
    const normalized: ValidationIssue[] = [];
    let invalidCount = 0;
    try {
        if (input === undefined) {
            return createState(normalized, invalidCount);
        }
        if (!Array.isArray(input)) {
            return createState(normalized, 1);
        }
        const length = dataProperty(input, 'length');
        if (!Number.isSafeInteger(length) || (length as number) < 0) {
            return createState(normalized, 1);
        }
        const inputLength = length as number;
        const indices = Object.getOwnPropertyNames(input)
            .filter(key => isArrayIndex(key, inputLength))
            .sort((left, right) => Number(left) - Number(right));
        for (const index of indices) {
            try {
                const candidate = dataProperty(input, index);
                const issue = normalizeIssue(candidate);
                if (issue === null) {
                    invalidCount++;
                }
                else {
                    normalized.push(issue);
                }
            }
            catch {
                invalidCount++;
            }
        }
    }
    catch {
        invalidCount++;
    }
    return createState(normalized, invalidCount);
}

function isArrayIndex(key: string, length: number): boolean {
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

export function issuesAtPath(state: ValidationState, path: JsonPath): readonly ValidationIssue[] {
    return state.byPath.get(pathKey(path)) ?? [];
}

export function combineValidationStates(...states: readonly ValidationState[]): ValidationState {
    return createState(
        states.flatMap(state => state.issues),
        states.reduce((total, state) => total + state.invalidCount, 0),
    );
}

export function issuesBelowPath(state: ValidationState, path: JsonPath): readonly ValidationIssue[] {
    return state.byAncestor.get(pathKey(path)) ?? [];
}

export function issueMarkerLabel(issues: readonly ValidationIssue[]): string {
    if (issues.length === 0) {
        return '';
    }
    const severity = highestSeverity(issues);
    if (new Set(issues.map(issue => issue.severity)).size > 1) {
        return `${issues.length} issues, highest severity ${severity}`;
    }
    if (severity === 'info' && issues.length > 1) {
        return `${issues.length} info issues`;
    }
    return `${issues.length} ${issues.length === 1 ? severity : `${severity}s`}`;
}

export function highestSeverity(issues: readonly ValidationIssue[]): ValidationIssueSeverity {
    return SEVERITIES.find(severity => issues.some(issue => issue.severity === severity)) ?? 'info';
}

function createState(issues: ValidationIssue[], invalidCount: number): ValidationState {
    const byPath = new Map<string, ValidationIssue[]>();
    const byAncestor = new Map<string, ValidationIssue[]>();
    const counts: Record<ValidationIssueSeverity, number> = { error: 0, warning: 0, info: 0 };
    for (const issue of issues) {
        counts[issue.severity]++;
        appendIssue(byPath, pathKey(issue.path), issue);
        for (let length = 0; length <= issue.path.length; length++) {
            appendIssue(byAncestor, pathKey(issue.path.slice(0, length)), issue);
        }
    }
    return Object.freeze({
        byPath: freezeIssueLists(byPath),
        byAncestor: freezeIssueLists(byAncestor),
        counts: Object.freeze(counts),
        invalidCount,
        issues: Object.freeze(issues),
    });
}

function normalizeIssue(candidate: unknown): ValidationIssue | null {
    try {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return null;
        }
        const path = normalizePath(dataProperty(candidate, 'path'));
        const pointer = dataProperty(candidate, 'pointer');
        const severity = dataProperty(candidate, 'severity');
        const code = dataProperty(candidate, 'code');
        const message = dataProperty(candidate, 'message');
        const source = dataProperty(candidate, 'source');
        if (
            path === null
            || (pointer !== null && typeof pointer !== 'string')
            || (typeof pointer === 'string' && pointer !== pathToPointer(path))
            || !SEVERITIES.includes(severity as ValidationIssueSeverity)
            || typeof code !== 'string'
            || typeof message !== 'string'
            || typeof source !== 'string'
        ) {
            return null;
        }
        const detailsDescriptor = Object.getOwnPropertyDescriptor(candidate, 'details');
        if (detailsDescriptor && !('value' in detailsDescriptor)) {
            return null;
        }
        return Object.freeze({
            path,
            pointer: pointer as string | null,
            severity: severity as ValidationIssueSeverity,
            code,
            message,
            source,
            ...(detailsDescriptor ? { details: detailsDescriptor.value } : {}),
        });
    }
    catch {
        return null;
    }
}

function appendIssue(map: Map<string, ValidationIssue[]>, key: string, issue: ValidationIssue): void {
    const list = map.get(key);
    if (list) {
        list.push(issue);
    }
    else {
        map.set(key, [issue]);
    }
}

function freezeIssueLists(map: Map<string, ValidationIssue[]>): ReadonlyMap<string, readonly ValidationIssue[]> {
    return new Map([...map].map(([key, list]) => [key, Object.freeze(list)]));
}

function normalizePath(candidate: unknown): JsonPath | null {
    if (!Array.isArray(candidate)) {
        return null;
    }
    const length = dataProperty(candidate, 'length');
    if (!Number.isSafeInteger(length) || (length as number) < 0) {
        return null;
    }
    const path: (string | number)[] = [];
    for (let index = 0; index < (length as number); index++) {
        const part = dataProperty(candidate, String(index));
        if (typeof part !== 'string' && !(typeof part === 'number' && Number.isFinite(part) && Number.isInteger(part))) {
            return null;
        }
        path.push(part);
    }
    return Object.freeze(path);
}

function dataProperty(value: object, key: PropertyKey): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
        throw new TypeError(`Expected data property ${String(key)}`);
    }
    return descriptor.value;
}
