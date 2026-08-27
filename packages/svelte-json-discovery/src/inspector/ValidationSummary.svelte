<script lang='ts'>
    import type { ValidationIssue } from './types.js';
    import type { ValidationState } from './validation.js';
    import { pathToQuery } from '../utils.js';

    const { onSelect, state: validation }: { onSelect: (issue: ValidationIssue) => void; state: ValidationState } = $props();
    const BATCH_SIZE = 50;
    let visibleCount = $state(BATCH_SIZE);
    const visibleIssues = $derived(validation.issues.slice(0, visibleCount));
    const remaining = $derived(Math.max(validation.issues.length - visibleIssues.length, 0));

    function countLabel(count: number, label: string): string {
        if (label === 'info' && count !== 1) {
            return `${count} info issues`;
        }
        return `${count} ${label}${count === 1 ? '' : 's'}`;
    }

    function location(issue: ValidationIssue): string {
        return issue.pointer ?? (pathToQuery(issue.path) || '<non-standard path>');
    }

    function issueLabel(issue: ValidationIssue): string {
        const severity = issue.severity[0].toUpperCase() + issue.severity.slice(1);
        return `${severity} ${issue.code}: ${issue.message} at ${location(issue)} from ${issue.source}`;
    }

    function showMore(): void {
        visibleCount += Math.min(BATCH_SIZE, remaining);
    }
</script>

{#if validation.issues.length > 0}
    <section class='sjd-validation-summary' aria-label='Validation summary'>
        <span role='status' aria-label='Validation issue counts'>
            {countLabel(validation.counts.error, 'error')},
            {countLabel(validation.counts.warning, 'warning')},
            {countLabel(validation.counts.info, 'info')}
        </span>
        <ul class='sjd-validation-list'>
            {#each visibleIssues as issue, index (`${issue.source}:${issue.code}:${JSON.stringify(issue.path)}:${index}`)}
                <li>
                    <button
                        type='button'
                        class:sjd-validation-error={issue.severity === 'error'}
                        class:sjd-validation-warning={issue.severity === 'warning'}
                        class:sjd-validation-info={issue.severity === 'info'}
                        aria-label={issueLabel(issue)}
                        onclick={() => onSelect(issue)}
                    >
                        <strong>{issue.severity}</strong>
                        <code>{location(issue)}</code>
                        <span>{issue.message}</span>
                    </button>
                </li>
            {/each}
        </ul>
        {#if remaining > 0}
            <span role='status' aria-label='Validation issue window'>Showing {visibleIssues.length} of {validation.issues.length} validation issues.</span>
            <button type='button' onclick={showMore} aria-label={`Show ${Math.min(BATCH_SIZE, remaining)} more validation issues`}>
                Show {Math.min(BATCH_SIZE, remaining)} more
            </button>
        {/if}
    </section>
{/if}
