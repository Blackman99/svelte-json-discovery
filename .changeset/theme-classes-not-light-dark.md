---
"svelte-json-discovery": patch
---

Make forced themes survive production CSS pipelines: theme colors are now driven by `sjd-theme-light` / `sjd-theme-dark` / `sjd-theme-auto` classes (with a `prefers-color-scheme` media query for `auto`) instead of `light-dark()` + an inline `color-scheme`. CSS minifiers such as lightningcss (Vite's default) downlevel `light-dark()` into a polyfill keyed off `color-scheme` declarations they can see in stylesheets, which silently broke `theme="light"` inside dark pages in production builds while dev builds looked fine. Also fixes a typo in the light-theme string underline color.
