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

Import the toolbar and shared inspection state from the optional subpath. Tree,
strict Raw, automatic object-array Table and explicit baseline Diff share the
same accessible view toolbar.

```svelte
<script lang='ts'>
    import type { JsonInspectorView } from 'svelte-json-discovery/inspector';
    import { JsonInspector } from 'svelte-json-discovery/inspector';

    let view = $state<JsonInspectorView>('tree');
</script>

<JsonInspector
    data={[{ id: 1, name: 'Ada' }, { id: 2, name: 'Grace', meta: { active: true } }]}
    {view}
    onViewChange={next => view = next}
    maxRawBytes={12 * 1024 * 1024}
    showSearch
/>
```

`views` restricts the ordered toolbar registry. `JsonInspector` preserves the
Tree search, selected path, active match and controller methods, so existing
`JsonViewerHandle` integrations can move to the shell without losing Tree
behavior. The main package entry does not import the optional Inspector graph.

Diff is enabled by an explicit `compareTo` baseline. The built-in comparator is
asynchronous, cooperative and cancellable. It walks primitives and plain
objects deterministically, compares arrays by index by default, supports entity
identity rules, and understands Date, RegExp, Map, Set, cycles and shared
references. Getter, Proxy, iterator and identity failures become local
diagnostic changes. Activating a change focuses the exact current or baseline
node when possible and otherwise falls back to its nearest ancestor.

```svelte
<script lang='ts'>
    import { JsonInspector } from 'svelte-json-discovery/inspector';

    const baseline = { users: [{ id: 1, role: 'reviewer' }] };
    const current = { users: [{ id: 1, role: 'maintainer' }, { id: 2, role: 'reviewer' }] };
    const identifyUser = (item: unknown) => (item as { id: number }).id;
</script>

<JsonInspector
    data={current}
    compareTo={baseline}
    itemIdentityRules={[{ path: ['users'], resolve: identifyUser }]}
    maxDiffNodes={100_000}
    maxDiffDepth={100}
    maxDiffResults={10_000}
/>
```

Applications can precompute the same stable protocol with
`await compareJson(current, baseline, options)` from
`svelte-json-discovery/diff`, or supply their own `ChangeSet`. A supplied set
fully bypasses built-in comparison.

Every standard location carries both a canonical `JsonPath` and RFC 6901
Pointer. Map and Set positions use `pointer: null` because they are not standard
JSON locations. A moved change additionally carries `previousPath` and
`previousPointer`; a localized failure carries `diagnostic`, and capped output
carries `truncated`. Malformed precomputed entries are ignored with a local
diagnostic. `onChangeSelect` runs before default navigation; return `false` to
replace it. All stable comparison types, `compareJson`, and `normalizeChangeSet`
are exported from the dependency-free `./diff` subpath.

Raw is generated asynchronously and enabled only when the complete input is
representable as strict JSON. It formats with two-space indentation and enables
copy only for that complete output. `undefined`, BigInt, non-finite numbers,
sparse arrays, accessors, special JavaScript instances and circular references
produce path-addressable diagnostics rather than misleading placeholders. A
diagnostic returns to Tree and focuses the affected node. Generation is
cooperative and cancellable; `maxRawBytes` limits retained UTF-8 output and
defaults to 12 MB. `RawDiagnostic` and `RawDiagnosticCode` are exported from the
Inspector subpath for integrations that need the stable diagnostic vocabulary.

Table is enabled when the currently loaded array window contains only plain
object rows. Automatic columns follow deterministic first-seen key order across
that window; nested values use the existing compact renderer rather than being
flattened. Row and cell selection use the same `JsonPath` state as Tree, and
search matches retain their path and node metadata in cells. The initial batch
uses `limit` (50 by default); Show more reads only the next batch and keeps both
data access and DOM growth bounded.

`tableColumns` controls titles, row-relative paths or accessors, custom
component/snippet renderers, visibility and sortable headers. Without it,
automatic columns remain the default. Header activation sorts only the loaded
window. Supplying `tableSort` switches to host-controlled full-data ordering:
the Inspector reports the next state through `onTableSortChange` but never
eagerly reads or locally reorders hidden rows.

```svelte
<script lang='ts'>
    import type {
        JsonInspectorTableColumn,
        JsonInspectorTableSort,
    } from 'svelte-json-discovery/inspector';
    import { JsonInspector } from 'svelte-json-discovery/inspector';

    const tableColumns: JsonInspectorTableColumn[] = [
        { id: 'name', title: 'Person', path: ['profile', 'name'], sortable: true },
        { id: 'score', accessor: row => Number(row.score) * 100, sortable: true },
        { id: 'internal', path: ['internal'], visible: false },
    ];
    let tableSort = $state<JsonInspectorTableSort | null>(null);
</script>

<JsonInspector
    data={rows}
    {tableColumns}
    {tableSort}
    onTableSortChange={next => tableSort = next}
/>
```

Path columns retain their canonical JSON Pointer. Accessor columns are derived:
their renderer receives a frozen node without Pointer metadata, and selecting
one selects its source row. Custom renderers own their interactive markup and
call the supplied `select()` action; renderer or accessor failures fall back to
local compact/error cells without taking down the Inspector.

Precomputed validation issues can be supplied without bundling a validator.
The Inspector announces error, warning and info totals, marks matching Tree
nodes and currently loaded Table rows/cells, and navigates an activated issue
through Tree while preserving the current search. Standard JSON locations must
include their canonical RFC 6901 Pointer; non-standard locations such as Map
entries use `pointer: null`.

```svelte
<script lang='ts'>
    import type { ValidationIssue } from 'svelte-json-discovery/inspector';
    import { JsonInspector } from 'svelte-json-discovery/inspector';

    const issues: ValidationIssue[] = [{
        path: [0, 'name'],
        pointer: '/0/name',
        severity: 'error',
        code: 'required',
        message: 'Name is required',
        source: 'schema',
    }];
</script>

<JsonInspector data={rows} {issues} />
```

`ValidationIssue` is a stable adapter protocol with `path`, `pointer`,
`severity`, `code`, `message`, `source` and optional `details`. Malformed
issues are ignored with a local diagnostic, and an issue whose target no longer
exists reports a local navigation status. `onIssueSelect` runs before default
navigation: return `false` to replace it, or return anything else to augment it.

`validate(data, signal)` adds host-provided asynchronous validation. It runs in
addition to `issues`; changing `data` or the validator, removing the validator,
or unmounting the Inspector aborts the previous signal and suppresses stale
results. Pending, successful, failed and cancelled runs are announced without
blocking Tree inspection. Import its stable type from the validator-neutral
entry:

```svelte
<script lang='ts'>
    import type { JsonValidator } from 'svelte-json-discovery/validation';

    const validate: JsonValidator = async (data, signal) => {
        const issues = await validationService(data, { signal });
        return issues;
    };
</script>

<JsonInspector {data} {validate} />
```

The optional Ajv adapter accepts Ajv's compiled validator without importing Ajv
itself. The host application owns the Ajv dependency:

```svelte
<script lang='ts'>
    import Ajv from 'ajv';
    import { JsonInspector } from 'svelte-json-discovery/inspector';
    import { createAjvValidator } from 'svelte-json-discovery/validation/ajv';

    const check = new Ajv({ allErrors: true }).compile(schema);
    const validate = createAjvValidator(check);
</script>

<JsonInspector {data} {validate} />
```

Ajv `instancePath` values become canonical paths and RFC 6901 Pointers; escaped
tokens and array indices are normalized against the current data. Keyword,
message, source, default error severity and the original Ajv error in `details`
are preserved deterministically. `./validation/ajv` is isolated from both the
main package entry and the generic `./validation` entry.

The optional Zod adapter accepts a Zod schema through the same validator
protocol. The host application owns the Zod dependency:

```svelte
<script lang='ts'>
    import { JsonInspector } from 'svelte-json-discovery/inspector';
    import { createZodValidator } from 'svelte-json-discovery/validation/zod';
    import * as z from 'zod';

    const schema = z.object({
        name: z.string().min(1),
        roles: z.array(z.string()),
    });
    const validate = createZodValidator(schema);
</script>

<JsonInspector {data} {validate} />
```

Zod object and array path segments become canonical paths and escaped RFC 6901
Pointers. Codes, messages, source, default error severity and the original Zod
issue in `details` are preserved in input order. Non-standard property keys use
a collision-free unavailable fallback and a `null` Pointer, while the original
key remains in `details`; unavailable targets remain local Inspector diagnostics.
`./validation/zod` is isolated from both the main package entry and the generic
`./validation` entry.

The optional Valibot adapter consumes a parser created by the host application,
so Valibot also stays outside the package runtime graph:

```svelte
<script lang='ts'>
    import { JsonInspector } from 'svelte-json-discovery/inspector';
    import { createValibotValidator } from 'svelte-json-discovery/validation/valibot';
    import * as v from 'valibot';

    const schema = v.object({
        name: v.pipe(v.string(), v.nonEmpty()),
        roles: v.array(v.string()),
    });
    const validate = createValibotValidator(v.safeParserAsync(schema));
</script>

<JsonInspector {data} {validate} />
```

Valibot object keys and array indices become canonical paths and RFC 6901
Pointers. The issue `type`, message, source, default error severity and original
issue in `details` are preserved in parser order. Missing targets remain local
navigation diagnostics; Map, Set and other non-standard path items use a
bounded collision-free fallback with a `null` Pointer. `./validation/valibot`
is isolated from the main package and generic `./validation` entries.

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
