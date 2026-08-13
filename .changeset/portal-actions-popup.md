---
"svelte-json-discovery": patch
---

Fix value-actions popup displacement: the popup is now portaled to `document.body`, so a transformed/filtered/animated ancestor of the viewer can no longer become the containing block for its fixed positioning and shift it away from the ƒ button.
