<script lang='ts'>
    import type { JsonViewerRendererProps } from 'svelte-json-discovery';

    const { node }: JsonViewerRendererProps = $props();
</script>

<span class='status-pill'>{String(node.value)}</span>

<style>
    .status-pill {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 9px;
        border: 1px solid color-mix(in srgb, var(--discovery-green-color, #16a34a) 50%, transparent);
        border-radius: 999px;
        color: var(--discovery-green-color, #16a34a);
        background: color-mix(in srgb, var(--discovery-green-color, #16a34a) 12%, transparent);
        font: 600 12px/1 var(--font-mono, monospace);
    }
</style>
