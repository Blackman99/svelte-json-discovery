<script lang='ts'>
    import { JsonViewer } from 'svelte-json-discovery';
    import { actionsDemo, bigArray, nested, packageSchema, quickStart, schemaDemo, searchable, specialTypes, strings, themedData } from './lib/data.js';
    import Example from './lib/Example.svelte';
    import Playground from './lib/Playground.svelte';
    import PropsTable from './lib/PropsTable.svelte';
    import { theme, toggleTheme } from './lib/theme.svelte.js';

    const repo = 'https://github.com/Blackman99/svelte-json-discovery';
    const t = $derived(theme.current);

    let query = $state('discovery');
    let installCopied = $state(false);

    async function copyInstall() {
        await navigator.clipboard.writeText('pnpm add svelte-json-discovery');
        installCopied = true;
        setTimeout(() => (installCopied = false), 1500);
    }

    const navItems: [string, string][] = [
        ['install', 'Install'],
        ['quick-start', 'Quick start'],
        ['expand', 'Expand depth'],
        ['large-data', 'Large data'],
        ['strings', 'Strings'],
        ['highlight', 'Match highlighting'],
        ['special-types', 'Beyond JSON'],
        ['value-actions', 'Value actions'],
        ['schema-docs', 'Field docs'],
        ['theming', 'Theming'],
        ['playground', 'Playground'],
        ['api', 'Props'],
        ['credits', 'Credits'],
    ];

    const installTabs = [
        { label: 'pnpm', code: 'pnpm add svelte-json-discovery' },
        { label: 'npm', code: 'npm install svelte-json-discovery' },
        { label: 'yarn', code: 'yarn add svelte-json-discovery' },
    ];

    const quickStartCode = `<script>
  import { JsonViewer } from 'svelte-json-discovery';

  const data = {
    name: 'svelte-json-discovery',
    stars: 1024,
    svelte: 5,
    tags: ['json', 'viewer', 'svelte'],
    origin: { project: 'discoveryjs/discovery', view: 'struct' }
  };
<\/script>

<JsonViewer {data} />`;

    const expandCode = `<!-- open three levels deep -->
<JsonViewer data={config} expanded={3} />

<!-- expanded={0} keeps the root as a one-line preview -->
<JsonViewer data={config} expanded={0} />`;

    const largeCode = `// 500 commits + 128 latency samples
<JsonViewer data={repoStats} expanded={1} />`;

    const stringsCode = `<JsonViewer data={strings} expanded={1} maxStringLength={80} />`;

    const highlightCode = `<script>
  let query = $state('discovery');
<\/script>

<input bind:value={query} />
<JsonViewer data={registry} match={query} expanded={2} />`;

    const specialCode = `const data = {
  date: new Date(),
  regexp: /^(?:https?:)?\\/\\//i,
  set: new Set(['α', 'β', 'γ']),
  error: new TypeError('Cannot read properties of undefined'),
  typedArray: new Float64Array([3.14, 2.71, 1.41]),
  bigint: 9007199254740993n,
  fn: (x) => x * 2
};`;

    const schemaCode = `<script>
  import schema from './package.schema.json';
<\/script>

<!-- keys described by the schema get a dotted underline;
     hover one to see its documentation -->
<JsonViewer data={pkg} {schema} expanded={2} />`;

    const themingCode = `<JsonViewer data={data} theme="light" />
<JsonViewer data={data} theme="dark" />
<JsonViewer data={data} theme="auto" /> <!-- follows prefers-color-scheme -->`;
</script>

<header class='site-head'>
    <a class='brand' href='#top'>
        <img src='./logo.svg' alt="" width='30' height='30' />
        <span class='brand-name'>svelte<i>-</i>json<i>-</i>discovery</span>
    </a>
    <nav class='head-links'>
        <a href='https://www.npmjs.com/package/svelte-json-discovery' target='_blank' rel='noreferrer'>npm</a>
        <a href={repo} target='_blank' rel='noreferrer'>GitHub</a>
        <button class='theme-btn' onclick={toggleTheme} title='Toggle theme' aria-label='Toggle theme'>
            {t === 'dark' ? '☀' : '☾'}
        </button>
    </nav>
</header>

<div class='shell' id='top'>
    <aside class='side'>
        <nav aria-label='Sections'>
            <span class='side-title'>Contents</span>
            {#each navItems as [id, label] (id)}
                <a href='#{id}'>{label}</a>
            {/each}
        </nav>
    </aside>

    <main>
        <!-- ——— hero ——— -->
        <section class='hero'>
            <p class='eyebrow reveal' style='--d: 0'>Svelte 5 component · ported from discovery.js</p>
            <h1 class='reveal' style='--d: 1'>Point a <em>lens</em> at your JSON.</h1>
            <p class='lede reveal' style='--d: 2'>
                The <code>struct</code> view from
                <a href='https://github.com/discoveryjs/discovery' target='_blank' rel='noreferrer'>discoveryjs/discovery</a>
                — the interactive JSON tree with type-aware previews, pagination and copy actions —
                extracted into a standalone, dependency-free Svelte component.
            </p>
            <div class='hero-actions reveal' style='--d: 3'>
                <button class='install-pill' onclick={copyInstall}>
                    <span class='dollar'>$</span> pnpm add svelte-json-discovery
                    <span class='pill-copy'>{installCopied ? '✓' : '⧉'}</span>
                </button>
                <a class='ghost-btn' href={repo} target='_blank' rel='noreferrer'>Star on GitHub</a>
            </div>
            <div class='hero-demo reveal' style='--d: 4'>
                <JsonViewer data={quickStart} expanded={2} theme={t} />
            </div>
        </section>

        <!-- ——— install ——— -->
        <Example
            id='install'
            title='Install'
            intro='One peer dependency: <code>svelte ^5</code>. Nothing else ships with it.'
            tabs={installTabs}
            lang='bash'
        />

        <!-- ——— quick start ——— -->
        <Example
            id='quick-start'
            title='Quick start'
            intro='Hand it any value. Objects and arrays become an explorable tree; every collapsed value shows a type-colored preview.'
            code={quickStartCode}
        >
            <JsonViewer data={quickStart} expanded={1} theme={t} />
        </Example>

        <!-- ——— expand depth ——— -->
        <Example
            id='expand'
            title='Expand depth'
            intro='<code>expanded</code> controls how many levels open automatically. The original heuristics apply: long strings and arrays of numbers stay collapsed no matter the depth.'
            code={expandCode}
            note='Click any preview to expand it; the <code>–</code> button collapses it back. Clicking a collapsed root block works anywhere in its padding, just like in discovery.'
        >
            <JsonViewer data={nested} expanded={3} theme={t} />
            <div style='height: 10px'></div>
            <JsonViewer data={nested} expanded={0} theme={t} />
        </Example>

        <!-- ——— large data ——— -->
        <Example
            id='large-data'
            title='Large data'
            intro='Collections render 50 entries at a time (configurable via <code>limit</code>) with <em>Show 50 more…</em> / <em>Show all the rest…</em> buttons, entry counters every ten rows, and size badges.'
            code={largeCode}
            note="Expand <code>commits</code> and scroll — rendering stays snappy because off-screen entries simply don't exist yet."
        >
            <JsonViewer data={bigArray} expanded={1} theme={t} />
        </Example>

        <!-- ——— strings ——— -->
        <Example
            id='strings'
            title='Strings'
            intro='Long or multi-line strings truncate with a character count and become expandable. Expanded strings show their length, escape control characters, and offer an <em>as text</em> toggle for the raw view. URLs turn into links.'
            code={stringsCode}
        >
            <JsonViewer data={strings} expanded={1} maxStringLength={80} theme={t} />
        </Example>

        <!-- ——— match highlighting ——— -->
        <Example
            id='highlight'
            title='Match highlighting'
            intro='Pass a substring or <code>RegExp</code> as <code>match</code> and every occurrence lights up — in previews, in expanded strings, and even inside truncated strings, which slide their visible window to the first match.'
            code={highlightCode}
        >
            <input class='demo-input' bind:value={query} placeholder='type to highlight…' aria-label='Highlight query' />
            <JsonViewer data={searchable} match={query.trim() === '' ? null : query} expanded={2} theme={t} />
        </Example>

        <!-- ——— special types ——— -->
        <Example
            id='special-types'
            title='Beyond JSON'
            intro='Not just JSON: dates, regexps, sets, errors, typed arrays, bigints and functions all render with dedicated treatments, faithfully to the original view.'
            code={specialCode}
            lang='ts'
        >
            <JsonViewer data={specialTypes} expanded={1} theme={t} />
        </Example>

        <!-- ——— value actions ——— -->
        <Example
            id='value-actions'
            title='Value actions'
            intro='Every expanded value grows a <code>ƒ</code> button: copy the path to that value (<code>package.exports.types</code>-style, quoting keys when needed), or copy the subtree as formatted / compact JSON — with byte sizes and circular-structure detection. Strings get quoted, unquoted and raw copy variants.'
            note='Try it: expand a node, press <code>ƒ</code>, then paste somewhere. Objects with unsorted keys also get a <code>keys ↓</code> toggle.'
        >
            <JsonViewer data={actionsDemo} expanded={2} theme={t} />
        </Example>

        <!-- ——— schema field docs ——— -->
        <Example
            id='schema-docs'
            title='Field docs'
            intro='Pass a <code>schema</code> (JSON Schema) describing your data and documented keys grow a dotted underline — hover one to read its <code>title</code>, <code>description</code>, type, <code>enum</code>, <code>default</code>, examples and deprecation status. Local <code>$ref</code> pointers, <code>items</code>, <code>additionalProperties</code>, <code>patternProperties</code> and <code>allOf</code>/<code>anyOf</code>/<code>oneOf</code> are resolved along the way.'
            code={schemaCode}
            note='Try hovering <code>license</code> (enum + default), <code>author</code> → <code>email</code> (resolved through <code>$ref</code>), a key inside <code>scripts</code> (<code>additionalProperties</code>) or <code>legacyMain</code> (deprecated).'
        >
            <JsonViewer data={schemaDemo} schema={packageSchema} expanded={2} theme={t} />
        </Example>

        <!-- ——— theming ——— -->
        <Example
            id='theming'
            title='Theming'
            intro='Three modes via the <code>theme</code> prop — <code>auto</code> follows <code>prefers-color-scheme</code>. The palette matches discovery exactly, and every <code>--discovery-fmt-*</code> / <code>--discovery-background-color</code> CSS custom property is honored, so the component drops into a discovery-themed app unchanged.'
            code={themingCode}
        >
            <div class='theme-grid'>
                <JsonViewer data={themedData} expanded={2} theme='light' />
                <JsonViewer data={themedData} expanded={2} theme='dark' />
            </div>
        </Example>

        <!-- ——— playground ——— -->
        <Example
            id='playground'
            title='Playground'
            intro='Paste your own JSON and poke at it. This is the same component instance you get from npm — the docs consume the package through the pnpm workspace.'
        >
            <Playground />
        </Example>

        <!-- ——— props ——— -->
        <section class='example' id='api'>
            <h2>Props</h2>
            <p class='intro-copy'>All options mirror the original struct view config, defaults included.</p>
            <PropsTable />
        </section>

        <!-- ——— credits ——— -->
        <footer id='credits'>
            <div class='rule'></div>
            <p>
                All rendering logic, styling and UX derive from
                <a href='https://github.com/discoveryjs/discovery' target='_blank' rel='noreferrer'>discoveryjs/discovery</a>
                (<code>src/views/struct</code>) by Roman Dvornov &amp; contributors — thank you.
                Re-implemented as a Svelte 5 component. MIT licensed.
            </p>
            <p class='fine'>
                Docs built with the component they document · <a href={repo} target='_blank' rel='noreferrer'>source on GitHub</a>
            </p>
        </footer>
    </main>
</div>

<style>
    /* ——— header ——— */
    .site-head {
        position: sticky;
        top: 0;
        z-index: 50;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 22px;
        background: color-mix(in srgb, var(--bg) 82%, transparent);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--line-soft);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--ink);
    }

    .brand:hover {
        text-decoration: none;
    }

    .brand-name {
        font-family: var(--font-mono);
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.02em;
    }

    .brand-name i {
        font-style: normal;
        color: var(--accent);
    }

    .head-links {
        display: flex;
        align-items: center;
        gap: 18px;
        font-family: var(--font-mono);
        font-size: 13px;
    }

    .head-links a {
        color: var(--muted);
    }

    .head-links a:hover {
        color: var(--accent-ink);
        text-decoration: none;
    }

    .theme-btn {
        font-size: 15px;
        line-height: 1;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: var(--bg-raised);
        color: var(--ink);
        cursor: pointer;
    }

    .theme-btn:hover {
        border-color: var(--accent);
        color: var(--accent-ink);
    }

    /* ——— layout ——— */
    .shell {
        display: grid;
        grid-template-columns: 208px minmax(0, 1fr);
        gap: 40px;
        max-width: 1080px;
        margin: 0 auto;
        padding: 0 22px 40px;
    }

    @media (max-width: 900px) {
        .shell {
            grid-template-columns: minmax(0, 1fr);
        }

        .side {
            display: none;
        }
    }

    .side nav {
        position: sticky;
        top: 76px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-top: 48px;
    }

    .side-title {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--faint);
        margin-bottom: 10px;
    }

    .side a {
        font-size: 13.5px;
        color: var(--muted);
        padding: 3px 10px;
        margin-left: -10px;
        border-left: 2px solid transparent;
        border-radius: 0 6px 6px 0;
    }

    .side a:hover {
        color: var(--accent-ink);
        border-left-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 7%, transparent);
        text-decoration: none;
    }

    main {
        min-width: 0;
        padding-top: 48px;
    }

    /* ——— hero ——— */
    .hero {
        margin-bottom: 84px;
    }

    .eyebrow {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
        margin: 0 0 14px;
    }

    h1 {
        font-size: clamp(38px, 6vw, 58px);
        font-weight: 750;
        margin-bottom: 18px;
    }

    h1 em {
        font-style: italic;
        color: var(--accent);
        font-variation-settings: 'opsz' 144;
    }

    .lede {
        font-size: 18px;
        max-width: 62ch;
        color: var(--muted);
        margin: 0 0 26px;
    }

    .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-bottom: 34px;
    }

    .install-pill {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        font-family: var(--font-mono);
        font-size: 14px;
        color: #ece5da;
        background: var(--code-bg);
        border: 1px solid rgba(236, 229, 218, 0.14);
        border-radius: 99px;
        padding: 9px 18px;
        cursor: pointer;
        transition: border-color 0.15s, transform 0.15s;
    }

    .install-pill:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
    }

    .dollar {
        color: var(--accent);
        font-weight: 600;
    }

    .pill-copy {
        color: #8d8379;
        font-size: 13px;
    }

    .ghost-btn {
        font-family: var(--font-mono);
        font-size: 13.5px;
        color: var(--ink);
        border: 1px solid var(--line);
        border-radius: 99px;
        padding: 9px 18px;
        transition: border-color 0.15s, color 0.15s;
    }

    .ghost-btn:hover {
        border-color: var(--accent);
        color: var(--accent-ink);
        text-decoration: none;
    }

    .hero-demo {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px;
        background: var(--bg-raised);
        box-shadow: var(--shadow);
    }

    /* staggered reveal — fill "backwards" only: a retained transform
       animation would make the element a containing block for
       position: fixed descendants */
    .reveal {
        animation: rise 0.65s cubic-bezier(0.2, 0.7, 0.2, 1) backwards;
        animation-delay: calc(var(--d) * 90ms);
    }

    @keyframes rise {
        from {
            opacity: 0;
            transform: translateY(14px);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .reveal {
            animation: none;
        }
    }

    /* ——— shared bits ——— */
    .demo-input {
        display: block;
        width: min(320px, 100%);
        margin: 2px 0 12px;
        font-family: var(--font-mono);
        font-size: 13.5px;
        color: var(--ink);
        background: var(--bg);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 7px 12px;
        outline: none;
    }

    .demo-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
    }

    .theme-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
    }

    .example {
        margin: 0 0 72px;
        scroll-margin-top: 84px;
    }

    .example h2 {
        font-size: 28px;
        font-weight: 650;
        margin-bottom: 12px;
    }

    .intro-copy {
        margin: 0 0 18px;
        max-width: 68ch;
        color: var(--muted);
    }

    /* ——— footer ——— */
    footer {
        margin-top: 40px;
        color: var(--muted);
        font-size: 14.5px;
        max-width: 68ch;
    }

    .rule {
        height: 3px;
        width: 64px;
        background: var(--accent);
        border-radius: 2px;
        margin-bottom: 22px;
    }

    .fine {
        font-size: 13px;
        color: var(--faint);
    }
</style>
