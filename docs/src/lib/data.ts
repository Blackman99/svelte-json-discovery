// sample datasets used across the docs examples

export const quickStart = {
    name: 'svelte-json-discovery',
    stars: 1024,
    svelte: 5,
    tags: ['json', 'viewer', 'svelte'],
    origin: {
        project: 'discoveryjs/discovery',
        view: 'struct',
        url: 'https://github.com/discoveryjs/discovery',
    },
};

export const nested = {
    app: {
        server: {
            host: 'localhost',
            port: 8080,
            tls: { enabled: true, cert: '/etc/certs/fullchain.pem' },
        },
        clients: [
            { id: 1, agent: 'cli', retries: [250, 500, 1000] },
            { id: 2, agent: 'browser', retries: [100, 200] },
        ],
    },
    flags: { beta: false, telemetry: null },
};

export const bigArray = {
    total: 500,
    commits: Array.from({ length: 500 }, (_, i) => ({
        sha: (0x100000 + i * 7919).toString(16).padStart(7, 'a'),
        message: `commit #${i}: ${i % 3 === 0 ? 'fix' : i % 3 === 1 ? 'feat' : 'chore'} something`,
        additions: (i * 37) % 400,
        deletions: (i * 13) % 120,
        merged: i % 5 !== 0,
    })),
    // arrays of numbers never auto-expand — click to open
    latencies: Array.from({ length: 128 }, (_, i) => Math.round(20 + 80 * Math.abs(Math.sin(i / 5)))),
};

export const strings = {
    short: 'fits on one line',
    url: 'https://github.com/discoveryjs/discovery',
    multiline: [
        'Strings longer than maxStringLength (or containing newlines/tabs)',
        'become expandable. Once expanded you get:',
        '  - a character count badge',
        '  - escaped output ("\\n", "\\t") by default',
        '  - an "as text" toggle for the raw, unescaped view',
    ].join('\n'),
    long: 'The struct view keeps long one-line strings compact by cutting them at 150 characters and showing how many characters are left — expand to read everything, or bump maxStringLength if your data is chatty. '.repeat(2),
};

export const searchable = {
    packages: [
        { name: 'discovery', description: 'Frontend framework for rapid data exploration' },
        { name: 'jora', description: 'JavaScript object query language, used by discovery' },
        { name: 'json-ext', description: 'Streaming JSON parser/stringifier for big payloads' },
    ],
    note: 'Type in the input above — matches are highlighted in previews and in expanded strings, including the window-around-match logic for truncated strings.',
};

export const specialTypes = {
    date: new Date('2026-08-14T09:30:00Z'),
    regexp: /^(?:https?:)?\/\//i,
    set: new Set(['α', 'β', 'γ']),
    error: new TypeError('Cannot read properties of undefined'),
    typedArray: new Float64Array([3.14, 2.71, 1.41]),
    bigint: 9007199254740993n,
    fn: (x: number) => x * 2,
    empty: { object: {}, array: [] as unknown[] },
};

export const actionsDemo = {
    package: {
        'name': 'svelte-json-discovery',
        'exports': { types: './dist/index.d.ts', svelte: './dist/index.js' },
        'nested key with spaces': { deep: { value: 42 } },
    },
};

export const themedData = {
    theme: 'auto',
    honors: ['--discovery-fmt-*', 'light-dark()'],
    values: { string: 'green', number: 123, keyword: null },
};
