<!-- Value actions menu — a standalone take on struct/popup-value-actions.js -->
<script lang="ts">
    import { portal } from './portal.js';
    import type { PopupAction } from './types.js';

    let { x, y, actions, theme, scheme, onclose }: {
        x: number;
        y: number;
        actions: PopupAction[];
        theme: string;
        scheme: string;
        onclose: () => void;
    } = $props();

    let el = $state<HTMLElement>();

    // keep the popup inside the viewport
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

    function onOutsidePointerDown(event: PointerEvent) {
        if (el && event.target instanceof Node && !el.contains(event.target)) {
            onclose();
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            onclose();
        }
    }

    async function run(item: PopupAction) {
        if (item.disabled) {
            return;
        }

        try {
            await item.action();
        } finally {
            onclose();
        }
    }
</script>

<!-- capture-phase scroll: also closes when any scrollable ancestor
     (e.g. the viewer's own overflow container) scrolls the anchor away -->
<svelte:window onpointerdown={onOutsidePointerDown} onkeydown={onKeydown} onscrollcapture={onclose} />

<div
    class="struct-actions-popup sjd-theme-{theme}"
    use:portal
    bind:this={el}
    style:left="{x}px"
    style:top="{y}px"
    style:color-scheme={scheme}
    role="menu"
    tabindex="-1"
>
    {#each actions as item}
        <div
            class="menu-item"
            class:disabled={item.disabled}
            class:group-start={item.groupStart}
            role="menuitem"
            tabindex={item.disabled ? undefined : 0}
            aria-disabled={item.disabled || undefined}
            onclick={() => run(item)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), run(item))}
        >
            {item.text}{#if item.notes}<span class="notes">{item.notes}</span>{/if}
            {#if item.error}<div class="error">{item.error}</div>{/if}
        </div>
    {/each}
</div>
