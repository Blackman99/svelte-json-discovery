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

export interface JsonViewerNode {
    path: JsonPath;
    pointer: string | null;
    value: unknown;
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
    action: () => void;
}

export interface JsonViewerApi {
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
