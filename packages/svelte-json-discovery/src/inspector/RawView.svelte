<script lang='ts'>
    import { tick } from 'svelte';
    import { copyText } from '../utils.js';

    const { text }: { text: string } = $props();
    let copyStatus = $state('');
    let copyButton = $state<HTMLButtonElement>();
    let copyGeneration = 0;
    // svelte-ignore state_referenced_locally
    let previousText = text;

    $effect.pre(() => {
        if (text !== previousText) {
            previousText = text;
            copyGeneration++;
            copyStatus = '';
        }
    });

    async function copyRaw() {
        const generation = ++copyGeneration;
        const source = text;
        try {
            const copied = await copyText(source);
            if (generation === copyGeneration && source === text) {
                copyStatus = copied ? 'Copied raw JSON.' : 'Could not copy raw JSON.';
            }
        }
        finally {
            if (generation === copyGeneration && source === text) {
                await tick();
                copyButton?.focus();
            }
        }
    }
</script>

<div class='sjd-raw-view'>
    <div class='sjd-raw-actions'>
        <button bind:this={copyButton} type='button' aria-label='Copy raw JSON' onclick={copyRaw}>Copy</button>
        {#if copyStatus}<span role='status'>{copyStatus}</span>{/if}
    </div>
    <pre aria-label='Raw JSON'>{text}</pre>
</div>
