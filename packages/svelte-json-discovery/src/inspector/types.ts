import type { ComponentProps } from 'svelte';
import type JsonViewer from '../JsonViewer.svelte';
import type { JsonPath, JsonViewerHandle } from '../types.js';

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
};
