<script lang='ts'>
    import type { Snippet } from 'svelte';
    import CodeBlock from './CodeBlock.svelte';

    const { id, title, intro, code, lang = 'svelte', children, note }: {
        id: string;
        title: string;
        intro?: string;
        code?: string;
        lang?: string;
        children?: Snippet;
        note?: string;
    } = $props();
</script>

<section class='example' {id}>
    <h2><a class='anchor' href='#{id}'>§</a>{title}</h2>
    {#if intro}<p class='intro'>{@html intro}</p>{/if}
    {#if code}<CodeBlock {code} {lang} />{/if}
    {#if children}
        <div class='live'>
            <span class='live-chip'>live</span>
            {@render children()}
        </div>
    {/if}
    {#if note}<p class='note'>{@html note}</p>{/if}
</section>

<style>
    .example {
        margin: 0 0 72px;
        scroll-margin-top: 84px;
    }

    h2 {
        font-size: 28px;
        font-weight: 650;
        margin-bottom: 12px;
    }

    .anchor {
        opacity: 0;
        margin-left: -26px;
        padding-right: 8px;
        font-size: 20px;
        color: var(--faint);
        transition: opacity 0.15s;
    }

    h2:hover .anchor {
        opacity: 1;
    }

    .intro {
        margin: 0 0 18px;
        max-width: 68ch;
        color: var(--muted);
    }

    .intro :global(code) {
        color: var(--ink);
    }

    .live {
        position: relative;
        margin-top: 14px;
        padding: 18px 14px 14px;
        background: var(--bg-raised);
        border: 1px solid var(--line);
        border-radius: 12px;
        box-shadow: var(--shadow);
    }

    .live-chip {
        position: absolute;
        top: -9px;
        left: 14px;
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
        background: var(--bg-raised);
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        border-radius: 99px;
        padding: 1px 9px;
    }

    .note {
        margin: 12px 0 0;
        font-size: 14px;
        color: var(--muted);
        max-width: 68ch;
        padding-left: 14px;
        border-left: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
    }
</style>
