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
- **Pagination for large collections** — renders 50 entries at a time with
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
- **Match highlighting** — pass a substring or RegExp via the `match` prop
  (includes the original "window around the first match" logic for
  truncated strings)
- **Value actions popup (`ƒ`)** — copy as quoted/unquoted/unescaped string,
  copy path (e.g. `stats.issues[0]["key with spaces"]`), copy as JSON
  (formatted / compact, with byte sizes and circular-structure detection)
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
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | Color scheme |
| `schema` | `object \| null` | `null` | JSON Schema for `data`; documented fields get hover tooltips |

## Development

This package lives in a pnpm monorepo — see the
[repository root](https://github.com/Blackman99/svelte-json-discovery) for
development and release instructions.

## Credits

All rendering logic, styling and UX are derived from
[discoveryjs/discovery](https://github.com/discoveryjs/discovery)
(`src/views/struct/`), MIT licensed, by Roman Dvornov and contributors.
This package re-implements that view as a self-contained Svelte 5 component.
