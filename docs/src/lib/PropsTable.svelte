<script lang="ts">
    const rows: [string, string, string, string][] = [
        ['data', 'unknown', '—', 'The value to display'],
        ['expanded', 'number | boolean', '1', 'Levels to auto-expand (true = 1; 0/false = collapsed preview)'],
        ['limit', 'number | false', '50', 'Entries rendered per expand / "show more" step (false = all)'],
        ['limitCollapsed', 'number | false', '4', 'Entries shown in a collapsed preview'],
        ['limitCompactObjectEntries', 'number | false', '0', 'Entries shown for nested objects in previews (0 renders {…})'],
        ['maxStringLength', 'number', '150', 'Max string length before truncation / becoming expandable'],
        ['maxCompactStringLength', 'number', '40', 'Max string length inside nested previews'],
        ['allowedExcessStringLength', 'number', '10', 'Slack before truncation kicks in'],
        ['maxPropertyLength', 'number', 'Infinity', 'Max property name length in expanded entries'],
        ['maxCompactPropertyLength', 'number', '35', 'Max property name length in previews'],
        ['match', 'string | RegExp | null', 'null', 'Highlight matches in strings'],
        ['theme', "'light' | 'dark' | 'auto'", "'auto'", 'Color scheme of the viewer']
    ];
</script>

<div class="table-wrap">
    <table>
        <thead>
            <tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr>
        </thead>
        <tbody>
            {#each rows as [prop, type, def, desc]}
                <tr>
                    <td><code class="prop">{prop}</code></td>
                    <td><code class="type">{type}</code></td>
                    <td><code>{def}</code></td>
                    <td>{desc}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .table-wrap {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--bg-raised);
        box-shadow: var(--shadow);
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }

    th {
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-align: left;
        color: var(--muted);
        padding: 12px 16px 8px;
        border-bottom: 1px solid var(--line);
    }

    td {
        padding: 9px 16px;
        border-bottom: 1px solid var(--line-soft);
        vertical-align: top;
    }

    tr:last-child td {
        border-bottom: none;
    }

    td code {
        white-space: nowrap;
    }

    .prop {
        color: var(--rose);
        font-weight: 600;
    }

    .type {
        color: var(--blue);
    }
</style>
