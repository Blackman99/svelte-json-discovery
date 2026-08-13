<!-- Renders a token tree produced by preview.ts (port of value-to-html.ts).
     The template is kept on single lines on purpose: some tokens are rendered
     inside white-space:pre elements where stray whitespace would show up. -->
<script lang="ts">
    import Preview from './Preview.svelte';
    import type { Token } from './preview.js';

    let { tokens }: { tokens: Token[] } = $props();
</script>

{#each tokens as token}{#if token.href}<a href={token.href} target="_blank" rel="noreferrer">{#if token.children}<Preview tokens={token.children} />{:else}{token.text}{/if}</a>{:else if token.children}<span class={token.cls}><Preview tokens={token.children} /></span>{:else if token.parts}<span class={token.cls}>{#each token.parts as part, i}{#if i > 0}<span class="num-delim"></span>{/if}{part}{/each}</span>{:else if token.cls != null}<span class={token.cls}>{token.text}</span>{:else}{token.text}{/if}{/each}
