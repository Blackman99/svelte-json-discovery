# svelte-json-discovery

## 0.4.0

### Minor Changes

- 8fb58a7: Run cancellable host validation alongside precomputed issues and add an
  optional Ajv adapter with canonical path mapping, deterministic issue metadata,
  and isolated package entry points.
- 690eb05: Add the optional `svelte-json-discovery/inspector` subpath with a controlled or
  uncontrolled `JsonInspector` Tree shell, accessible view toolbar, shared search
  and selection state, controller forwarding, and explicit unavailable-view reasons.
- dead92b: Add instance-scoped synchronous and asynchronous plugin actions with cancellation,
  accessible pending state, keyboard operation, focus restoration, localized failure
  UI, and structured `onPluginError` reporting for action and renderer failures.
- dbbdb1c: Add a strict read-only Raw Inspector view with controlled and uncontrolled
  switching, formatted complete JSON output, copy feedback, preserved Tree context
  and per-view scroll state, plus clear disabled reasons for non-JSON values.
- c9e3493: Add an automatic object-array Table Inspector view with deterministic loaded-window
  columns, compact nested cells, shared path selection and search metadata, plus
  bounded incremental row loading.
- 255e70f: Generate strict Raw output cooperatively with cancellation, a configurable
  12 MB UTF-8 limit, accessible progress states, and path-addressable diagnostics
  that return unsupported values to their focused Tree node.
- c862153: Make built-in Diff asynchronous, cancellable and bounded, with global or
  path-specific array entity identity, Date/RegExp/Map/Set semantics, cycle and
  shared-reference handling, localized hostile-value diagnostics, and accessible
  truncation reporting.
- 563da99: Add an optional Zod validation adapter with canonical path and JSON Pointer
  mapping, stable issue metadata, isolated package boundaries, and Inspector
  navigation coverage.
- e9e1083: Add controlled Table columns with path or accessor cells, custom renderers,
  visibility and sortable headers, plus bounded current-window sorting and
  host-controlled full-data sort requests.
- 561d378: Display precomputed validation issues through a stable validator-neutral
  protocol, accessible severity summaries, Tree and bounded Table markers, and
  path-aware navigation with host override support.
- 68abc49: Add explicit baseline comparison and a stable optional Diff protocol with
  deterministic plain JSON changes, accessible summaries, inline current/baseline
  markers, host-supplied ChangeSet support and best-path navigation.
- 0fdb1f8: Complete the JsonInspector release boundary with publish-tarball and main-entry
  size snapshots, integrated keyboard coverage, live Raw and validator-adapter
  documentation, and explicit stable-versus-experimental API guidance.
- 25349e5: Add stable immutable node descriptors and experimental instance-scoped Component or Snippet renderers for `JsonViewer` plugins.
- 6e41868: Add an optional Valibot validation adapter with canonical object and array path
  mapping, bounded non-standard path diagnostics, stable issue metadata, isolated
  package boundaries, and Inspector navigation coverage.
- 8903ea4: Add optional previous-identity update highlighting to JsonInspector with
  controlled and explicit comparison priority, configurable expiry, stale-work
  cancellation, shared Tree/Table/Diff markers, and reduced-motion presentation.

## 0.3.0

### Minor Changes

- 2f76919: Add global key/value search, controlled expansion and selection, an imperative
  viewer controller, RFC 6901 JSON Pointer copying, windowed collection reads,
  circular/error isolation, and complete ARIA tree keyboard interaction.

## 0.2.0

### Minor Changes

- c5d8432: Field documentation via JSON Schema: pass a `schema` prop describing your data and documented keys get a dotted underline with a hover tooltip showing the field's title, description, type/format, enum values, default, examples and deprecation status. The schema walker follows the data path through `properties`, `patternProperties`, `additionalProperties`, `items`/`prefixItems`, resolves local `$ref` pointers (cycle-safe) and looks through `allOf`/`anyOf`/`oneOf` branches. The tooltip is portaled to `document.body` and themed like the actions popup.

## 0.1.1

### Patch Changes

- e7ba090: Expose `./package.json` in the exports map so tooling that reads it through package exports resolution keeps working.
- 99fe180: Close two remaining gaps with the original struct view: action buttons get the original touch-device treatment (solid surface, larger hit target under `@media (hover: none)`), and "Copy as JSON" is disabled with an explanatory note when the resulting JSON exceeds 12 MB — huge clipboard writes can hang the browser.

## 0.1.0

### Minor Changes

- 90ffb1f: Initial release: standalone Svelte 5 port of the `struct` (JSON) view from discoveryjs/discovery — type-aware collapsed previews, expand/collapse with auto-expand depth, pagination for large collections, string truncation with "as text" mode, match highlighting, value actions popup (copy path / copy JSON), Set/Date/RegExp/Error/bigint/TypedArray support, and light/dark/auto theming.

### Patch Changes

- b810f5c: Paint an opaque, theme-correct background: the original struct view layers `rgba(205,205,205,.1)` over the discovery app background, so standalone a forced `theme="light"` viewer inside a dark page (or vice versa) looked wrong — token colors switched but the surface stayed whatever was behind it. The background is now pre-composited via `color-mix()` over `--discovery-background-color` (falling back to `light-dark(#fff, #242424)`), matching how the view renders inside discovery itself.
- 53ab498: Fix value-actions popup displacement: the popup is now portaled to `document.body`, so a transformed/filtered/animated ancestor of the viewer can no longer become the containing block for its fixed positioning and shift it away from the ƒ button. The popup now also closes when any scrollable ancestor scrolls (capture-phase listener), not only the window.
- 25e1621: Make forced themes survive production CSS pipelines: theme colors are now driven by `sjd-theme-light` / `sjd-theme-dark` / `sjd-theme-auto` classes (with a `prefers-color-scheme` media query for `auto`) instead of `light-dark()` + an inline `color-scheme`. CSS minifiers such as lightningcss (Vite's default) downlevel `light-dark()` into a polyfill keyed off `color-scheme` declarations they can see in stylesheets, which silently broke `theme="light"` inside dark pages in production builds while dev builds looked fine. Also fixes a typo in the light-theme string underline color.
