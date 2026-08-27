# svelte-json-discovery

Standalone Svelte 5 port of the **`struct` (JSON) view** from
[discoveryjs/discovery](https://github.com/discoveryjs/discovery) — an
interactive, type-aware JSON tree viewer.

**[📖 Documentation & live examples](https://blackman99.github.io/svelte-json-discovery/)** ·
**[GitHub](https://github.com/Blackman99/svelte-json-discovery)**

```bash
pnpm add svelte-json-discovery
```

## Features (ported from the original struct view)

- **Type-aware collapsed previews** — colored tokens for strings, numbers
  (with visual thousands separators that don't affect copied text), booleans,
  `null`/`undefined`, `Date`, `RegExp`, `Set`, `Error`, bigint, functions
- **Expand / collapse** any value, with configurable auto-expand depth
- **Smart auto-expand** — arrays of numbers and long strings stay collapsed
  (`shouldAutoExpand` heuristic from the original)
- **Windowed reads for large collections** — arrays and typed arrays only read
  visible indices, objects only read values in the current window, and
  `Set`/`Map` iterators are consumed incrementally; renders 50 entries at a time with
  "Show 50 more..." / "Show all the rest N items..." buttons
- **Entry index markers** every 10 entries, and value size badges
  ("N elements" / "N entries")
- **Long string handling** — truncated with "… N more", expandable with a
  length badge, escaped by default with an "as text" toggle (unescaped view)
- **URL auto-linking** in expanded string previews
- **Key sorting toggle** (`keys ↓`) for objects with unsorted keys
- **Field docs via JSON Schema** — pass a `schema` and documented keys get
  a dotted underline with a hover tooltip (title, description, type, enum,
  default, examples, deprecation); resolves local `$ref`, `items`,
  `additionalProperties`, `patternProperties` and combinators
- **Global search and navigation** — search keys and primitive values with a
  string or `RegExp`; next/previous navigation expands and reveals each result,
  with cancellable traversal and a configurable result cap
- **Match highlighting** — pass a substring or RegExp via the legacy `match` prop
  (includes the original "window around the first match" logic for
  truncated strings)
- **Controlled paths and component controller** — control expansion and
  selection from application state, or call `expand`, `collapse`, `focus`,
  `scrollTo`, `select`, `nextMatch`, and `previousMatch` through `bind:this`
- **Instance-scoped custom renderers** — ordered plugins can replace matching
  nodes with a Svelte Component or Snippet while preserving the built-in fallback
- **Async plugin actions** — attach node-specific sync or async commands with
  pending state, cancellation, focus restoration and localized error reporting
- **Value actions popup (`ƒ`)** — copy as quoted/unquoted/unescaped string,
  copy path (e.g. `stats.issues[0]["key with spaces"]`), copy as JSON
  Pointer (RFC 6901), or copy as JSON (formatted / compact, with byte sizes)
- **Resilient inspection** — true circular references are localized as
  `[Circular → path]`; getters, Proxies, iterators and serialization failures
  become local error states instead of crashing the viewer
- **Accessible tree interaction** — WAI-ARIA tree semantics, roving focus,
  arrow/Home/End/typeahead navigation, Enter selection and Space toggle
- **Light / dark / auto themes** (`auto` follows `prefers-color-scheme`);
  honors `--discovery-*` CSS custom properties when embedded in a
  discovery-themed app

Not ported (they depend on the discovery host/runtime): signature popup (𝕊),
"view as table" toggle, jora query annotations, export dialogs.

## Usage

```svelte
<script>
    import { JsonViewer } from 'svelte-json-discovery';

    const data = { hello: 'world', numbers: [1, 2, 3] };
</script>

<JsonViewer {data} expanded={2} />
```

### Optional Inspector shell

Import the toolbar and shared inspection state from the optional subpath. The
Tree view is available now; Raw, Table and Diff remain visible with accessible
unavailable reasons until their optional implementations are added.

```svelte
<script lang='ts'>
    import type { JsonInspectorView } from 'svelte-json-discovery/inspector';
    import { JsonInspector } from 'svelte-json-discovery/inspector';

    let view = $state<JsonInspectorView>('tree');
</script>

<JsonInspector
    data={{ hello: 'world' }}
    {view}
    onViewChange={next => view = next}
    showSearch
/>
```

`views` restricts the ordered toolbar registry. `JsonInspector` preserves the
Tree search, selected path, active match and controller methods, so existing
`JsonViewerHandle` integrations can move to the shell without losing Tree
behavior. The main package entry does not import the optional Inspector graph.

### Search and programmatic control

```svelte
<script lang='ts'>
    import type { JsonPath, JsonViewerHandle } from 'svelte-json-discovery';
    import { JsonViewer } from 'svelte-json-discovery';

    let viewer: JsonViewerHandle;
    let expandedPaths = $state<readonly JsonPath[]>([[]]);
    let selectedPath = $state<JsonPath | null>(null);
</script>

<JsonViewer
    bind:this={viewer}
    {data}
    showSearch
    {expandedPaths}
    {selectedPath}
    onExpandedPathsChange={paths => expandedPaths = paths}
    onSelectedPathChange={path => selectedPath = path}
/>

<button onclick={() => viewer.scrollTo(['users', 0])}>First user</button>
```

`JsonPath`, `JsonViewerNode`, `JsonViewerSearchState`, and `JsonViewerHandle`
are exported for host integrations. `expanded` remains the initial expansion
depth when `expandedPaths` is not supplied.

### Custom renderers and actions

```svelte
<script lang='ts'>
    import type { JsonViewerPlugin } from 'svelte-json-discovery';
    import { JsonViewer } from 'svelte-json-discovery';
    import StatusRenderer from './StatusRenderer.svelte';

    const plugins: JsonViewerPlugin[] = [{
        id: 'status-pill',
        renderers: [{
            when: node => node.key === 'status',
            component: StatusRenderer,
        }],
        actions: [{
            id: 'inspect-latency',
            label: 'Inspect latency',
            when: node => node.key === 'latencyMs',
            async run({ node, signal }) {
                const response = await fetch(`/api/latency/${node.value}`, { signal });
                await response.json();
            },
        }],
    }];
</script>

<JsonViewer
    data={{ status: 'healthy', latencyMs: 84 }}
    {plugins}
    onPluginError={failure => console.error(failure)}
/>
```

`JsonViewerNode` is a stable, immutable descriptor containing `path`, `pointer`,
`value`, `key`, `index`, `depth`, `kind`, `parentPath`, and `jsonCompatible`.
Renderer props also receive `density` and the public Viewer `controller`.
Action handlers receive the same frozen node descriptor and an `AbortSignal`.
The Viewer cancels an in-flight action when another action supersedes it, its
menu closes, the data identity changes, or the component is destroyed. Failures
remain local and are reported through `onPluginError` with plugin, node and
operation context. Plugin, renderer and action contracts are **experimental**
in this release; registration is per Viewer instance, predicates run in order,
and the first matching renderer wins.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `unknown` | — | The value to display |
| `expanded` | `number \| boolean` | `1` | Levels to auto-expand (`true` = 1, `0`/`false` = collapsed preview) |
| `limit` | `number \| false` | `50` | Entries rendered per expand / "show more" step (`false` = all) |
| `limitCollapsed` | `number \| false` | `4` | Entries shown in a collapsed preview |
| `limitCompactObjectEntries` | `number \| false` | `0` | Entries shown for nested objects in previews (`0` renders `{…}`) |
| `maxStringLength` | `number` | `150` | Max string length before truncation (top level of a value) |
| `maxCompactStringLength` | `number` | `40` | Max string length inside nested previews |
| `allowedExcessStringLength` | `number` | `10` | Slack before truncation kicks in |
| `maxPropertyLength` | `number` | `Infinity` | Max property name length in expanded entries |
| `maxCompactPropertyLength` | `number` | `35` | Max property name length in previews |
| `match` | `string \| RegExp \| null` | `null` | Highlight matches in strings |
| `search` | `string \| RegExp \| null` | `null` | Search keys and primitive values; takes highlight priority over `match` |
| `showSearch` | `boolean` | `false` | Show the built-in search controls |
| `maxSearchResults` | `number` | `1000` | Maximum stored results; capped totals are displayed with `+` |
| `onSearchChange` | `(query: string) => void` | — | Called when the built-in search input changes |
| `onSearchStateChange` | `(state: JsonViewerSearchState) => void` | — | Reports result count, current index/path and truncation |
| `expandedPaths` | `readonly JsonPath[]` | — | Controlled expanded paths |
| `onExpandedPathsChange` | `(paths: readonly JsonPath[]) => void` | — | Called when expansion changes |
| `selectedPath` | `JsonPath \| null` | — | Controlled selected path |
| `onSelectedPathChange` | `(path: JsonPath \| null) => void` | — | Called when selection changes |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Color scheme |
| `schema` | `object \| null` | `null` | JSON Schema for `data`; documented fields get hover tooltips |
| `plugins` | `readonly JsonViewerPlugin[]` | `[]` | Experimental instance-scoped node renderers and actions |
| `onPluginError` | `(failure: JsonViewerPluginError) => void` | — | Reports localized plugin predicate, renderer and action failures |

## Development

This package lives in a pnpm monorepo — see the
[repository root](https://github.com/Blackman99/svelte-json-discovery) for
development and release instructions.

## Credits

All rendering logic, styling and UX are derived from
[discoveryjs/discovery](https://github.com/discoveryjs/discovery)
(`src/views/struct/`), MIT licensed, by Roman Dvornov and contributors.
This package re-implements that view as a self-contained Svelte 5 component.
