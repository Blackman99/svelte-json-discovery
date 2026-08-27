# Project Context

## Product

`svelte-json-discovery` is a developer-first, read-only Svelte 5 inspector for
already-parsed `unknown` values. The published core has zero runtime
dependencies and preserves the familiar discovery.js struct-view visual model.

## Domain vocabulary

- **JsonViewer**: the lightweight Tree rendering core and compatibility surface.
- **JsonInspector**: the optional, batteries-included shell that coordinates
  tools, views, validation, and comparison.
- **Tree view**: the recursive, path-addressable value inspection view.
- **Raw view**: a strict JSON representation that never fabricates serializable
  content for non-JSON values.
- **Table view**: an object-array view whose rows remain path-addressable.
- **Diff view**: a comparison view driven by a normalized `ChangeSet`.
- **JsonPath**: the canonical readonly array of string or numeric path segments.
- **JsonViewerNode**: an immutable public description of a value at a JsonPath.
- **Plugin**: an instance-scoped, ordered extension containing renderers or
  actions. Plugins must not mutate Viewer internals directly.
- **ValidationIssue**: a normalized, path-addressable validation diagnostic.
- **ChangeSet**: normalized added, removed, changed, or moved path information.
- **Adapter**: an optional boundary translating an external validator or
  precomputed result into stable project protocols.

## Product boundaries

- Keep `JsonViewer` read-only and backward compatible.
- Keep the main package entry zero-runtime-dependency.
- Prefer optional subpath exports for Inspector, views, validation, and Diff.
- Localize failures from user data, renderers, actions, and adapters.
- Exclude editing, repair, undo/redo, file ingestion, query workbenches, remote
  request protocols, and spreadsheet-style aggregation unless a later spec
  explicitly changes the boundary.

## Verification seam

Prefer public component behavior through Vitest, Testing Library for Svelte,
and jsdom. Verify accessibility, cancellation, lazy reads, and bounded DOM
behavior without testing recursive component internals.
