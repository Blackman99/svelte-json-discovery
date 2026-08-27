<script lang='ts'>
    import type { ComponentProps } from 'svelte';
    import type JsonViewer from '../JsonViewer.svelte';
    import type { JsonPath, JsonViewerHandle } from '../types.js';
    import type { Change, ChangeKind, ChangeSet } from './types.js';
    import { onDestroy } from 'svelte';
    import Viewer from '../JsonViewer.svelte';
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

    $effect(() => observeMarkers(currentPanel, changeSet, 'current'));
    $effect(() => observeMarkers(baselinePanel, changeSet, 'baseline'));

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
                navigationStatus = `Change callback failed: ${change.pointer || '<root>'}`;
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
            navigationStatus = `Change target is unavailable: ${change.pointer || '<root>'}`;
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

    function observeMarkers(panel: HTMLElement | undefined, set: ChangeSet, side: 'baseline' | 'current') {
        if (!panel) {
            return;
        }
        let queued = false;
        let disposed = false;
        const sync = () => {
            queued = false;
            if (!disposed) {
                syncMarkers(panel, set, side);
            }
        };
        const schedule = () => {
            if (!queued) {
                queued = true;
                queueMicrotask(sync);
            }
        };
        sync();
        const observer = new MutationObserver(schedule);
        observer.observe(panel, { childList: true, subtree: true });
        return () => {
            disposed = true;
            observer.disconnect();
            panel.querySelectorAll('.sjd-diff-marker').forEach(marker => marker.remove());
        };
    }

    function syncMarkers(panel: HTMLElement, set: ChangeSet, side: 'baseline' | 'current') {
        const byPath: Record<string, ChangeKind[]> = Object.create(null);
        for (const change of set.changes) {
            if ((side === 'current' && change.kind === 'removed') || (side === 'baseline' && change.kind === 'added')) {
                continue;
            }
            const path = side === 'baseline' && change.kind === 'moved' ? change.previousPath : change.path;
            const encoded = JSON.stringify(path);
            const kinds = byPath[encoded] ?? [];
            if (!kinds.includes(change.kind)) {
                kinds.push(change.kind);
            }
            byPath[encoded] = kinds;
        }
        for (const node of panel.querySelectorAll<HTMLElement>('[role="treeitem"][data-json-path]')) {
            const kinds = byPath[node.dataset.jsonPath ?? ''];
            const existing = node.querySelector<HTMLElement>(':scope > .sjd-diff-marker');
            if (!kinds || kinds.length === 0) {
                existing?.remove();
                continue;
            }
            const marker = existing ?? document.createElement('span');
            const labels = kinds.map(titleCase);
            const kindValue = kinds.join(' ');
            const labelValue = labels.join(', ');
            const textValue = labels.map(label => label[0]).join('');
            marker.className = 'sjd-diff-marker';
            marker.setAttribute('role', 'img');
            if (marker.dataset.kind !== kindValue) {
                marker.dataset.kind = kindValue;
            }
            if (marker.getAttribute('aria-label') !== labelValue) {
                marker.setAttribute('aria-label', labelValue);
            }
            if (marker.textContent !== textValue) {
                marker.textContent = textValue;
            }
            if (!existing) {
                const group = [...node.children].find(child => child.getAttribute('role') === 'group');
                node.insertBefore(marker, group ?? null);
            }
        }
    }

    function titleCase(value: string): string {
        return value[0].toUpperCase() + value.slice(1);
    }

    function changeLabel(change: Change): string {
        const current = change.pointer || '<root>';
        return change.kind === 'moved'
            ? `Moved ${change.previousPointer || '<root>'} → ${current}`
            : `${titleCase(change.kind)} ${current}`;
    }
</script>

<section class='sjd-diff-summary' aria-label='Diff summary'>
    <div role='status' aria-label='Change counts'>
        {counts.added} added, {counts.removed} removed, {counts.changed} changed, {counts.moved} moved
    </div>
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
