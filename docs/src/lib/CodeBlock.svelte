<script lang="ts">
    import { highlight } from './highlight.js';

    let { code, lang = 'svelte' }: { code: string; lang?: string } = $props();

    const tokens = $derived(highlight(code.trim()));
    let copied = $state(false);

    async function copy() {
        await navigator.clipboard.writeText(code.trim());
        copied = true;
        setTimeout(() => (copied = false), 1500);
    }
</script>

<div class="code-block">
    <div class="code-head">
        <span class="lang">{lang}</span>
        <button class="copy" onclick={copy}>{copied ? 'copied ✓' : 'copy'}</button>
    </div>
    <pre><code>{#each tokens as t}{#if t.cls}<span class={t.cls}>{t.text}</span>{:else}{t.text}{/if}{/each}</code></pre>
</div>

<style>
    .code-block {
        background: var(--code-bg);
        border: 1px solid var(--line-soft);
        border-radius: 10px;
        overflow: hidden;
    }

    .code-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 14px;
        border-bottom: 1px solid rgba(236, 229, 218, 0.08);
    }

    .lang {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #7d746a;
    }

    .copy {
        font-family: var(--font-mono);
        font-size: 11px;
        color: #a39889;
        background: none;
        border: 1px solid rgba(236, 229, 218, 0.15);
        border-radius: 4px;
        padding: 2px 9px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
    }

    .copy:hover {
        color: #ece5da;
        border-color: rgba(236, 229, 218, 0.4);
    }

    pre {
        margin: 0;
        padding: 14px 16px;
        overflow-x: auto;
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.6;
        color: #d8d0c4;
    }

    code {
        all: unset;
        font-family: inherit;
    }

    /* token colors on the fixed dark code surface */
    pre :global(.cmt) { color: #7d746a; font-style: italic; }
    pre :global(.str) { color: #a3c64c; }
    pre :global(.kw) { color: #d98ca0; }
    pre :global(.atom) { color: #58aedd; }
    pre :global(.num) { color: #58aedd; }
    pre :global(.cmp) { color: #ffb38a; }
    pre :global(.tag) { color: #d98ca0; }
    pre :global(.attr) { color: #c49be8; }
    pre :global(.svb) { color: #ff8a4d; }
    pre :global(.pun) { color: #8d8379; }
</style>
