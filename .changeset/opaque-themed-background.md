---
"svelte-json-discovery": patch
---

Paint an opaque, theme-correct background: the original struct view layers `rgba(205,205,205,.1)` over the discovery app background, so standalone a forced `theme="light"` viewer inside a dark page (or vice versa) looked wrong — token colors switched but the surface stayed whatever was behind it. The background is now pre-composited via `color-mix()` over `--discovery-background-color` (falling back to `light-dark(#fff, #242424)`), matching how the view renders inside discovery itself.
