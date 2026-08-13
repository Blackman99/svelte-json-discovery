<script lang="ts">
    import { JsonViewer } from 'svelte-json-discovery';
    import { theme } from './theme.svelte.js';

    let source = $state(JSON.stringify({
        playground: true,
        edit: 'the JSON on the left',
        numbers: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144],
        nested: { a: { b: { c: 'deep' } }, url: 'https://svelte.dev' },
        long: 'This string is long enough to demonstrate truncation in previews and expansion behavior once it crosses the configured maximum string length threshold.'
    }, null, 2));
    let expanded = $state(2);
    let matchInput = $state('');

    const parsed = $derived.by(() => {
        try {
            return { ok: true as const, value: JSON.parse(source) };
        } catch (e) {
            return { ok: false as const, error: (e as Error).message };
        }
    });
</script>

<div class="playground">
    <div class="input-pane">
        <div class="pane-head">
            <span>json input</span>
            <label>expanded <input type="number" min="0" max="10" bind:value={expanded} /></label>
            <label>match <input type="text" placeholder="highlight…" bind:value={matchInput} /></label>
        </div>
        <textarea bind:value={source} spellcheck="false" aria-label="JSON input"></textarea>
    </div>
    <div class="output-pane">
        {#if parsed.ok}
            <JsonViewer
                data={parsed.value}
                expanded={expanded}
                match={matchInput.trim() === '' ? null : matchInput}
                theme={theme.current}
            />
        {:else}
            <div class="parse-error">⚠ {parsed.error}</div>
        {/if}
    </div>
</div>

<style>
    .playground {
        display: grid;
        grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
        gap: 14px;
        align-items: stretch;
    }

    @media (max-width: 800px) {
        .playground {
            grid-template-columns: 1fr;
        }
    }

    .input-pane {
        display: flex;
        flex-direction: column;
        background: var(--code-bg);
        border: 1px solid var(--line-soft);
        border-radius: 10px;
        overflow: hidden;
    }

    .pane-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 12px;
        border-bottom: 1px solid rgba(236, 229, 218, 0.08);
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #7d746a;
    }

    .pane-head label {
        display: flex;
        align-items: center;
        gap: 5px;
        text-transform: none;
        letter-spacing: normal;
    }

    .pane-head input {
        font-family: var(--font-mono);
        font-size: 12px;
        color: #ece5da;
        background: rgba(236, 229, 218, 0.07);
        border: 1px solid rgba(236, 229, 218, 0.15);
        border-radius: 4px;
        padding: 1px 6px;
    }

    .pane-head input[type='number'] {
        width: 52px;
    }

    .pane-head input[type='text'] {
        width: 110px;
    }

    textarea {
        flex: 1;
        min-height: 320px;
        resize: vertical;
        border: none;
        outline: none;
        padding: 14px 16px;
        background: transparent;
        color: #d8d0c4;
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.6;
        white-space: pre;
    }

    .output-pane {
        min-width: 0;
        background: var(--bg-raised);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px;
        box-shadow: var(--shadow);
    }

    .output-pane :global(.view-struct) {
        height: 100%;
        max-height: 420px;
    }

    .parse-error {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--rose);
        padding: 12px;
    }
</style>
