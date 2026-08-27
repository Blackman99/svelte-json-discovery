# JsonInspector release visual evidence

Reviewed on 2026-08-27 against the local production documentation UI. The
browser console reported no errors or warnings.

The review covered:

- controlled Table presentation and the loaded-window boundary;
- explicit Diff counts, moved/changed/added markers and both value panes;
- automatic update highlighting after replacing the data identity;
- plugin action discovery and menu placement on a matching node;
- strict Raw disabled state and its path-addressable BigInt diagnostic;
- Ajv, Zod and Valibot issues in one severity summary with Tree markers.

## Screenshots

### Validator adapters

![Ajv, Zod and Valibot issues normalized into one Inspector summary](../public/screenshots/json-inspector-release/json-inspector-validation.jpg)

### Strict Raw diagnostics

![Strict Raw unavailable with a path-addressable BigInt diagnostic](../public/screenshots/json-inspector-release/json-inspector-raw-diagnostics.jpg)

### Explicit Diff

![Explicit Diff summary and current/baseline panes](../public/screenshots/json-inspector-release/json-inspector-diff.jpg)

### Controlled Table

![Inspector Table view](../public/screenshots/json-inspector-release/json-inspector-table.jpg)

### Automatic update highlighting

![Transient update markers after a live data replacement](../public/screenshots/json-inspector-release/json-inspector-live-update.jpg)

### Plugin action

![Matched plugin action in the node action menu](../public/screenshots/json-inspector-release/json-viewer-plugin-action.jpg)
