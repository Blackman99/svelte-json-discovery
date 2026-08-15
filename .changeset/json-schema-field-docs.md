---
"svelte-json-discovery": minor
---

Field documentation via JSON Schema: pass a `schema` prop describing your data and documented keys get a dotted underline with a hover tooltip showing the field's title, description, type/format, enum values, default, examples and deprecation status. The schema walker follows the data path through `properties`, `patternProperties`, `additionalProperties`, `items`/`prefixItems`, resolves local `$ref` pointers (cycle-safe) and looks through `allOf`/`anyOf`/`oneOf` branches. The tooltip is portaled to `document.body` and themed like the actions popup.
