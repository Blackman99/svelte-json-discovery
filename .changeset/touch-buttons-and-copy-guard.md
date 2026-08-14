---
"svelte-json-discovery": patch
---

Close two remaining gaps with the original struct view: action buttons get the original touch-device treatment (solid surface, larger hit target under `@media (hover: none)`), and "Copy as JSON" is disabled with an explanatory note when the resulting JSON exceeds 12 MB — huge clipboard writes can hang the browser.
