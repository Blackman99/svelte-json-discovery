import type { Component, Snippet } from 'svelte';

export interface StructOptions {
    match: RegExp | string | null;
    matchIgnoreCase: boolean;
    limit: number | false;
    limitCollapsed: number | false;
    limitCompactObjectEntries: number | false;
    maxStringLength: number;
    maxCompactStringLength: number;
    allowedExcessStringLength: number;
    maxPropertyLength: number;
    maxCompactPropertyLength: number;
}

export type JsonPath = readonly (string | number)[];

export type JsonViewerNodeKind
    = | 'array'
        | 'bigint'
        | 'boolean'
        | 'date'
        | 'error'
        | 'function'
        | 'map'
        | 'null'
        | 'number'
        | 'object'
        | 'regexp'
        | 'set'
        | 'string'
        | 'symbol'
        | 'typed-array'
        | 'undefined'
        | 'unknown';

/** Stable immutable description of a rendered value and its canonical location. */
export interface JsonViewerNode {
    path: JsonPath;
    pointer: string | null;
    value: unknown;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly key?: string | number | null;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly index?: number | null;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly depth?: number;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly kind?: JsonViewerNodeKind;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly parentPath?: JsonPath | null;
    /** Always present on descriptors supplied by JsonViewer; optional for 0.3 assignment compatibility. */
    readonly jsonCompatible?: boolean;
}

/** @experimental Renderer contracts may evolve from integration feedback. */
export type JsonViewerRendererDensity = 'compact' | 'full';

/** @experimental Renderer contracts may evolve from integration feedback. */
export interface JsonViewerRendererProps {
    readonly node: JsonViewerNode;
    readonly density: JsonViewerRendererDensity;
    readonly controller: JsonViewerHandle;
}

/** @experimental Action contracts may evolve from integration feedback. */
export interface JsonViewerActionContext {
    readonly node: JsonViewerNode;
    readonly signal: AbortSignal;
}

/** @experimental Action contracts may evolve from integration feedback. */
export interface JsonViewerAction {
    readonly id: string;
    readonly label: string;
    readonly when: (node: JsonViewerNode) => boolean;
    readonly run: (context: JsonViewerActionContext) => Promise<void> | void;
}

/** @experimental Renderer contracts may evolve from integration feedback. */
export type JsonViewerRenderer = {
    readonly when: (node: JsonViewerNode) => boolean;
    readonly component: Component<JsonViewerRendererProps>;
    readonly snippet?: never;
} | {
    readonly when: (node: JsonViewerNode) => boolean;
    readonly component?: never;
    readonly snippet: Snippet<[JsonViewerRendererProps]>;
};

/** @experimental Plugin contracts may evolve from integration feedback. */
export interface JsonViewerPlugin {
    readonly id: string;
    readonly renderers?: readonly JsonViewerRenderer[];
    readonly actions?: readonly JsonViewerAction[];
}

export interface JsonViewerActionMatch {
    readonly pluginId: string;
    readonly action: JsonViewerAction;
}

export interface JsonViewerRendererMatch {
    readonly pluginId: string;
    readonly renderer: JsonViewerRenderer;
}

export type JsonViewerPluginOperation = 'action' | 'action-predicate' | 'renderer' | 'renderer-predicate';

export interface JsonViewerPluginError {
    readonly pluginId: string;
    readonly node: JsonViewerNode;
    readonly operation: JsonViewerPluginOperation;
    readonly operationId?: string;
    readonly error: unknown;
}

export interface JsonViewerSearchState {
    query: RegExp | string | null;
    currentIndex: number;
    totalCount: number;
    truncated: boolean;
    currentPath: JsonPath | null;
}

export interface JsonViewerHandle {
    expand: (path: JsonPath) => Promise<boolean>;
    collapse: (path: JsonPath) => Promise<boolean>;
    focus: (path: JsonPath) => Promise<boolean>;
    scrollTo: (path: JsonPath) => Promise<boolean>;
    select: (path: JsonPath | null) => Promise<boolean>;
    nextMatch: () => Promise<JsonPath | null>;
    previousMatch: () => Promise<JsonPath | null>;
}

// Chain describing where a value lives inside the root data,
// used to build a path for the "Copy path" action
export interface ValueContext {
    parent: ValueContext | null;
    host: unknown;
    key: string | number;
    index: number;
    path: JsonPath;
    jsonCompatible: boolean;
}

export interface PopupAction {
    text: string;
    notes?: string;
    error?: string | false;
    disabled?: boolean;
    groupStart?: boolean;
    action: () => Promise<unknown> | void;
}

export interface JsonViewerApi {
    controller: JsonViewerHandle;
    resolveRenderer: (node: JsonViewerNode) => JsonViewerRendererMatch | null;
    hasPluginActions: (node: JsonViewerNode) => boolean;
    reportPluginError: (
        pluginId: string,
        node: JsonViewerNode,
        operation: JsonViewerPluginOperation,
        error: unknown,
        operationId?: string,
    ) => void;
    openActions: (anchor: HTMLElement, value: unknown, context: ValueContext) => void;
    openSchemaTip: (anchor: HTMLElement, info: import('./schema.js').SchemaFieldInfo) => void;
    closeSchemaTip: () => void;
    isExpanded: (path: JsonPath, initial: boolean) => boolean;
    setExpanded: (path: JsonPath, expanded: boolean) => void;
    isSelected: (path: JsonPath) => boolean;
    select: (path: JsonPath) => void;
    isSearchMatch: (path: JsonPath) => boolean;
    isCurrentSearchMatch: (path: JsonPath) => boolean;
    revealPath: () => JsonPath | null;
    isFocused: (path: JsonPath) => boolean;
    setFocused: (path: JsonPath) => void;
}

export const CONTEXT_KEY = Symbol('svelte-json-discovery');
