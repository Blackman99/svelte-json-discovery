import type { Component, ComponentProps, Snippet } from 'svelte';
import type JsonViewer from '../JsonViewer.svelte';
import type { JsonPath, JsonViewerHandle, JsonViewerNode } from '../types.js';

export type JsonInspectorView = 'tree' | 'raw' | 'table' | 'diff';

export type JsonInspectorHandle = JsonViewerHandle;

export type RawDiagnosticCode
    = | 'bigint'
        | 'circular'
        | 'getter'
        | 'iterator'
        | 'map'
        | 'proxy'
        | 'serialization'
        | 'set'
        | 'unsupported';

export interface RawDiagnostic {
    readonly code: RawDiagnosticCode;
    readonly message: string;
    readonly path: JsonPath;
    readonly pointer: string;
}

export type JsonInspectorTableSortDirection = 'ascending' | 'descending';

export interface JsonInspectorTableSort {
    readonly columnId: string;
    readonly direction: JsonInspectorTableSortDirection;
}

export interface JsonInspectorTableCellRendererProps {
    readonly column: JsonInspectorTableColumn;
    readonly node: JsonViewerNode;
    readonly row: Record<string, unknown>;
    readonly rowIndex: number;
    readonly value: unknown;
    readonly selected: boolean;
    readonly currentSearchMatch: boolean;
    /** Custom renderers own their interactive markup and call select() when appropriate. */
    readonly select: () => void;
}

export type JsonInspectorTableCellRenderer = {
    readonly component: Component<JsonInspectorTableCellRendererProps>;
    readonly snippet?: never;
} | {
    readonly component?: never;
    readonly snippet: Snippet<[JsonInspectorTableCellRendererProps]>;
};

interface JsonInspectorTableColumnBase {
    readonly id: string;
    readonly title?: string;
    readonly renderer?: JsonInspectorTableCellRenderer;
    readonly visible?: boolean;
    readonly sortable?: boolean;
}

export type JsonInspectorTableColumn = JsonInspectorTableColumnBase & ({
    /** Path relative to each row. Path cells retain their canonical JSON location. */
    readonly path: JsonPath;
    readonly accessor?: never;
} | {
    /** Derived cell value. Accessor cells select the canonical source row and omit JSON Pointer metadata. */
    readonly accessor: (row: Record<string, unknown>, rowIndex: number) => unknown;
    readonly path?: never;
});

export type JsonInspectorProps = ComponentProps<typeof JsonViewer> & {
    /** Controlled active view. Unavailable views fall back to Tree. */
    view?: JsonInspectorView;
    /** Initial view for uncontrolled use. */
    defaultView?: JsonInspectorView;
    /** Ordered subset of built-in views shown in the toolbar. */
    views?: readonly JsonInspectorView[];
    /** Called when an available view is requested. */
    onViewChange?: (view: JsonInspectorView) => void;
    /** Maximum retained UTF-8 bytes for complete Raw output. */
    maxRawBytes?: number;
    /** Controlled Table columns. Omit to derive automatic columns from the loaded window. */
    tableColumns?: readonly JsonInspectorTableColumn[];
    /** Controlled full-data sort state. Omit for current-window local sorting. */
    tableSort?: JsonInspectorTableSort | null;
    /** Called when a sortable Table header requests its next sort state. */
    onTableSortChange?: (sort: JsonInspectorTableSort | null) => void;
};
