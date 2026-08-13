<p align="center">
  <img src="./assets/banner.svg" alt="svelte-json-discovery — the discovery.js struct view as a standalone Svelte 5 component" width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/svelte-json-discovery"><img src="https://img.shields.io/npm/v/svelte-json-discovery?color=ff3e00&label=npm" alt="npm version" /></a>
  <a href="https://github.com/Blackman99/svelte-json-discovery/actions/workflows/ci.yml"><img src="https://github.com/Blackman99/svelte-json-discovery/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://blackman99.github.io/svelte-json-discovery/"><img src="https://img.shields.io/badge/docs-github%20pages-2ea44f" alt="Documentation" /></a>
</p>

# svelte-json-discovery

The interactive JSON tree — the **`struct` view** — from
[discoveryjs/discovery](https://github.com/discoveryjs/discovery),
extracted into a standalone, dependency-free **Svelte 5** component.

**[📖 Documentation & live examples →](https://blackman99.github.io/svelte-json-discovery/)**

## Quick start

```bash
pnpm add svelte-json-discovery
```

```svelte
<script>
    import { JsonViewer } from 'svelte-json-discovery';

    const data = { hello: 'world', numbers: [1, 2, 3] };
</script>

<JsonViewer {data} expanded={2} />
```

## Highlights

- 🎨 **Type-aware previews** — colored tokens for strings, numbers (with visual
  thousands separators), booleans, `null`, `Date`, `RegExp`, `Set`, `Error`,
  bigint, typed arrays, functions
- 🌳 **Expand / collapse** with configurable auto-expand depth and the original
  smart heuristics (number arrays and long strings stay collapsed)
- 📚 **Pagination** for large collections — "Show 50 more…" / "Show all the rest…"
- ✂️ **Long string handling** — truncation, length badges, escaped view with an
  "as text" toggle, URL auto-linking
- 🔍 **Match highlighting** — substring or RegExp, including the
  window-around-match logic for truncated strings
- 📋 **Value actions** — copy path, copy as formatted/compact JSON (with byte
  sizes and circular-structure detection), string copy variants
- 🌗 **Light / dark / auto themes**, honoring `--discovery-fmt-*` CSS variables

See the full prop reference in the
[package README](./packages/svelte-json-discovery/README.md) or the
[docs site](https://blackman99.github.io/svelte-json-discovery/#api).

## Monorepo layout

| Path | Description |
| --- | --- |
| [`packages/svelte-json-discovery`](./packages/svelte-json-discovery) | The published component library |
| [`docs`](./docs) | Documentation site — consumes the library through the pnpm workspace, so the examples run the exact code that ships to npm |

## Development

```bash
pnpm install
pnpm dev          # library in watch mode + docs dev server
pnpm check        # svelte-check across the workspace
pnpm lint         # eslint (@antfu/eslint-config); `pnpm lint:fix` to autofix
pnpm build        # build library + docs
pnpm deps:check   # preview dependency updates (taze)
pnpm deps:update  # apply dependency updates and reinstall
```

Minor/patch dependency bumps are also PR'd automatically every Monday by the
`update-deps` workflow ([taze](https://github.com/antfu-collective/taze)).

## Releasing

Versioning is managed with [changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset    # describe your change, pick a bump
```

Merging to `main` lets the release workflow open a "chore: release" PR;
merging that PR publishes to npm (requires the `NPM_TOKEN` repo secret).

## Credits

All rendering logic, styling and UX derive from
[discoveryjs/discovery](https://github.com/discoveryjs/discovery)
(`src/views/struct/`) by [Roman Dvornov](https://github.com/lahmatiy) and
contributors. This project re-implements that view as a Svelte 5 component.

## License

[MIT](./LICENSE)
