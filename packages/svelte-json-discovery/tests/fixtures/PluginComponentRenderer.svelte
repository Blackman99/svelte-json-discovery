<script lang='ts'>
    import type { JsonViewerRendererProps } from '../../src/index.js';

    const { node, density, controller }: JsonViewerRendererProps = $props();
</script>

<button
    type='button'
    onclick={(event) => {
        event.stopPropagation();
        void controller.select(node.path);
    }}
>
    component:{String(node.key)}|{node.index}|{node.depth}|{node.kind}|{node.pointer}|{JSON.stringify(node.parentPath)}|{String(node.jsonCompatible)}|{density}|{String(node.value)}
</button>
