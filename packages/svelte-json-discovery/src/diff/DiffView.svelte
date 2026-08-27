<script lang='ts'>
    import type { ComponentProps } from 'svelte';
    import type JsonViewer from '../JsonViewer.svelte';
    import type { JsonPath, JsonViewerHandle } from '../types.js';
    import type { Change, ChangeKind, ChangeSet } from './types.js';
    import { onDestroy } from 'svelte';
    import Viewer from '../JsonViewer.svelte';
    import { observeChangeMarkers } from './change-markers.js';
    import './diff.css';

    type ViewerProps = Omit<ComponentProps<typeof JsonViewer>, 'data'>;

    const {
        baseline,
        changeSet,
        current,
        hasBaseline,
        onSelect,
        viewerProps,
    }: {
        baseline: unknown;
        changeSet: ChangeSet;
        current: unknown;
        hasBaseline: boolean;
        onSelect?: (change: Change) => boolean | Promise<boolean | void> | void;
        viewerProps: ViewerProps;
    } = $props();

    let baselinePanel = $state<HTMLElement>();
    let baselineViewer = $state<JsonViewerHandle>();
    let currentPanel = $state<HTMLElement>();
    let currentViewer = $state<JsonViewerHandle>();
    let selectionGeneration = 0;
    let destroyed = false;
    let navigationStatus = $state('');

    const counts = $derived.by(() => {
        const result: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, moved: 0 };
        for (const change of changeSet.changes) {
            result[change.kind]++;
        }
        return result;
    });
    const diagnosticCount = $derived(changeSet.changes.filter(change => change.diagnostic).length);

    onDestroy(() => {
        destroyed = true;
        selectionGeneration++;
    });

    $effect.pre(() => {
        void baseline;
        void changeSet;
        void current;
        selectionGeneration++;
        navigationStatus = '';
    });

    $effect(() => observeChangeMarkers(currentPanel, changeSet, { markerClass: 'sjd-diff-marker', side: 'current' }));
    $effect(() => observeChangeMarkers(baselinePanel, changeSet, { markerClass: 'sjd-diff-marker', side: 'baseline' }));

    async function selectChange(change: Change) {
        const generation = ++selectionGeneration;
        navigationStatus = '';
        try {
            const shouldNavigate = await onSelect?.(change);
            if (destroyed || generation !== selectionGeneration || shouldNavigate === false) {
                return;
            }
        }
        catch {
            if (!destroyed && generation === selectionGeneration) {
                navigationStatus = `Change callback failed: ${changeLocation(change.pointer, change.path)}`;
            }
            return;
        }

        const candidates: readonly (readonly [JsonViewerHandle | undefined, JsonPath])[] = change.kind === 'removed'
            ? [[baselineViewer, change.path], [currentViewer, change.path]] as const
            : change.kind === 'moved'
            ? [[currentViewer, change.path], [baselineViewer, change.previousPath]] as const
            : [[currentViewer, change.path], [baselineViewer, change.path]] as const;
        if (await focusBest(candidates, generation)) {
            return;
        }
        if (!destroyed && generation === selectionGeneration) {
            navigationStatus = `Change target is unavailable: ${changeLocation(change.pointer, change.path)}`;
        }
    }

    async function focusBest(
        candidates: readonly (readonly [JsonViewerHandle | undefined, JsonPath])[],
        generation: number,
    ): Promise<boolean> {
        const maxDistance = Math.max(...candidates.map(([, path]) => path.length));
        for (let distance = 0; distance <= maxDistance; distance++) {
            for (const [handle, path] of candidates) {
                const length = path.length - distance;
                if (length < 0 || destroyed || generation !== selectionGeneration) {
                    continue;
                }
                const focused = await handle?.focus(path.slice(0, length));
                if (destroyed || generation !== selectionGeneration) {
                    return false;
                }
                if (focused) {
                    return true;
                }
            }
        }
        return false;
    }

    function titleCase(value: string): string {
        return value[0].toUpperCase() + value.slice(1);
    }

    function changeLabel(change: Change): string {
        const current = changeLocation(change.pointer, change.path);
        const label = change.kind === 'moved'
            ? `Moved ${changeLocation(change.previousPointer, change.previousPath)} → ${current}`
            : `${titleCase(change.kind)} ${current}`;
        return change.diagnostic ? `${label} — ${change.diagnostic.message}` : label;
    }

    function changeLocation(pointer: string | null, path: JsonPath): string {
        return pointer === null ? `non-standard ${JSON.stringify(path)}` : pointer || '<root>';
    }
</script>

<section class='sjd-diff-summary' aria-label='Diff summary'>
    <div role='status' aria-label='Change counts'>
        {counts.added} added, {counts.removed} removed, {counts.changed} changed, {counts.moved} moved{#if diagnosticCount > 0}, {diagnosticCount} diagnostics{/if}
    </div>
    {#if changeSet.truncated}
        <div role='status' aria-label='Diff truncation'>
            Truncated by the {changeSet.truncated.reason} limit ({changeSet.truncated.limit}) at {changeLocation(changeSet.truncated.pointer, changeSet.truncated.path)}.
        </div>
    {/if}
    {#if changeSet.changes.length > 0}
        <ol>
            {#each changeSet.changes as change, index (`${change.kind}:${change.pointer}:${index}`)}
                <li><button type='button' onclick={() => selectChange(change)}>{changeLabel(change)}</button></li>
            {/each}
        </ol>
    {:else}
        <p>No changes.</p>
    {/if}
</section>
{#if navigationStatus}<div class='sjd-inspector-status' role='status'>{navigationStatus}</div>{/if}
<div class='sjd-diff-values'>
    {#if hasBaseline}
        <section bind:this={baselinePanel} class='sjd-diff-value' aria-label='Baseline value'>
            <Viewer bind:this={baselineViewer} {...viewerProps} data={baseline} search={null} showSearch={false} />
        </section>
    {/if}
    <section bind:this={currentPanel} class='sjd-diff-value' aria-label='Current value'>
        <Viewer bind:this={currentViewer} {...viewerProps} data={current} search={null} showSearch={false} />
    </section>
</div>
