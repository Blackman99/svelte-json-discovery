export interface StructOptions {
    match: RegExp | string | null;
    limit: number | false;
    limitCollapsed: number | false;
    limitCompactObjectEntries: number | false;
    maxStringLength: number;
    maxCompactStringLength: number;
    allowedExcessStringLength: number;
    maxPropertyLength: number;
    maxCompactPropertyLength: number;
}

// Chain describing where a value lives inside the root data,
// used to build a path for the "Copy path" action
export interface ValueContext {
    parent: ValueContext | null;
    host: unknown;
    key: string | number;
    index: number;
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
}

export const CONTEXT_KEY = Symbol('svelte-json-discovery');
