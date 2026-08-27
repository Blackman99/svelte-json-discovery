# svelte-json-discovery

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
