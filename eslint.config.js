import antfu from '@antfu/eslint-config';

export default antfu(
    {
        svelte: true,
        // match the codebase style (ported from discovery, 4-space + semicolons)
        stylistic: {
            indent: 4,
            semi: true,
            quotes: 'single',
        },
        ignores: [
            '**/dist/**',
            '**/.svelte-kit/**',
        ],
    },
    {
        // docs interpolate their own curated copy strings
        files: ['docs/**/*.svelte'],
        rules: {
            'svelte/no-at-html-tags': 'off',
        },
    },
    {
        // YAML stays at its conventional 2-space indent
        files: ['**/*.yml', '**/*.yaml'],
        rules: {
            'yaml/indent': ['error', 2],
        },
    },
    {
        // npm applies files entries in order, so publish exclusions must follow dist
        files: ['packages/svelte-json-discovery/package.json'],
        rules: {
            'jsonc/sort-array-values': 'off',
        },
    },
);
