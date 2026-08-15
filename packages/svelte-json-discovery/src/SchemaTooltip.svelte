<!-- Field documentation tooltip, fed by a JSON Schema node (schema.ts).
     Portaled to document.body like the actions popup so transformed
     ancestors can't displace its fixed positioning. -->
<script lang='ts'>
    import type { SchemaFieldInfo } from './schema.js';
    import { portal } from './portal.js';

    const { x, y, info, theme }: {
        x: number;
        y: number;
        info: SchemaFieldInfo;
        theme: string;
    } = $props();

    let el = $state<HTMLElement>();

    // keep the tooltip inside the viewport
    $effect(() => {
        if (el) {
            const rect = el.getBoundingClientRect();

            if (rect.right > window.innerWidth - 8) {
                el.style.left = `${Math.max(8, window.innerWidth - 8 - rect.width)}px`;
            }

            if (rect.bottom > window.innerHeight - 8) {
                el.style.top = `${Math.max(8, y - rect.height - 24)}px`;
            }
        }
    });
</script>

<div
    class='struct-schema-tip sjd-theme-{theme}'
    use:portal
    bind:this={el}
    style:left='{x}px'
    style:top='{y}px'
    role='tooltip'
>
    {#if info.title || info.type || info.deprecated}
        <div class='tip-head'>
            {#if info.title}<span class='tip-title'>{info.title}</span>{/if}
            {#if info.type}<span class='tip-type'>{info.type}{info.format ? ` · ${info.format}` : ''}</span>{/if}
            {#if info.deprecated}<span class='tip-deprecated'>deprecated</span>{/if}
        </div>
    {/if}
    {#if info.description}<div class='tip-description'>{info.description}</div>{/if}
    {#if info.enumValues}
        <div class='tip-row'><span class='tip-label'>enum</span><code>{info.enumValues.join(' | ')}</code></div>
    {/if}
    {#if info.defaultValue !== undefined}
        <div class='tip-row'><span class='tip-label'>default</span><code>{info.defaultValue}</code></div>
    {/if}
    {#if info.examples}
        <div class='tip-row'><span class='tip-label'>e.g.</span><code>{info.examples.join(', ')}</code></div>
    {/if}
</div>
