<!-- Value actions menu — a standalone take on struct/popup-value-actions.js -->
<script lang='ts'>
    import type { PopupAction } from './types.js';
    import { onDestroy } from 'svelte';
    import { portal } from './portal.js';

    const { x, y, actions, theme, scheme, onclose }: {
        x: number;
        y: number;
        actions: PopupAction[];
        theme: string;
        scheme: string;
        onclose: () => void;
    } = $props();

    let el = $state<HTMLElement>();
    let pendingIndex = $state<number | null>(null);
    let runGeneration = 0;

    onDestroy(() => runGeneration++);

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

            (el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? el).focus();
        }
    });

    function onOutsidePointerDown(event: PointerEvent) {
        if (el && event.target instanceof Node && !el.contains(event.target)) {
            onclose();
        }
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onclose();
        }
    }

    function onMenuKeydown(event: KeyboardEvent) {
        if (!el || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            return;
        }

        event.preventDefault();
        const items = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')];
        const current = items.indexOf(document.activeElement as HTMLElement);
        let target: HTMLElement | undefined;
        if (event.key === 'Home') {
            target = items[0];
        }
        else if (event.key === 'End') {
            target = items.at(-1);
        }
        else if (event.key === 'ArrowDown') {
            target = items[(current + 1) % items.length];
        }
        else {
            target = items[(current - 1 + items.length) % items.length];
        }
        target?.focus();
    }

    async function run(item: PopupAction, index: number) {
        if (item.disabled || pendingIndex === index) {
            return;
        }

        const generation = ++runGeneration;
        pendingIndex = index;
        try {
            await item.action();
        }
        finally {
            if (generation === runGeneration) {
                pendingIndex = null;
                onclose();
            }
        }
    }
</script>

<!-- capture-phase scroll: also closes when any scrollable ancestor
     (e.g. the viewer's own overflow container) scrolls the anchor away -->
<svelte:window onpointerdown={onOutsidePointerDown} onkeydown={onKeydown} onscrollcapture={onclose} />

<div
    class='struct-actions-popup sjd-theme-{theme}'
    use:portal
    bind:this={el}
    style:left='{x}px'
    style:top='{y}px'
    style:color-scheme={scheme}
    role='menu'
    tabindex='-1'
    onkeydown={onMenuKeydown}
>
    {#each actions as item, i (i)}
        <div
            class='menu-item'
            class:disabled={item.disabled || pendingIndex === i}
            class:group-start={item.groupStart}
            role='menuitem'
            tabindex={item.disabled || pendingIndex === i ? undefined : 0}
            aria-disabled={item.disabled || pendingIndex === i || undefined}
            aria-busy={pendingIndex === i || undefined}
            onclick={() => run(item, i)}
            onkeydown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), run(item, i))}
        >
            {item.text}{#if item.notes}<span class='notes'>{item.notes}</span>{/if}
            {#if pendingIndex === i}<span class='notes' role='status'>Running {item.text}…</span>{/if}
            {#if item.error}<div class='error'>{item.error}</div>{/if}
        </div>
    {/each}
</div>
