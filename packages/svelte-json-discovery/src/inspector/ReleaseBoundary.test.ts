// @vitest-environment node
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

const packageRoot = resolve(import.meta.dirname, '../..');
const distRoot = resolve(packageRoot, 'dist');

const consumerSource = `
import type { JsonValidator } from 'svelte-json-discovery/validation';
import { JsonViewer } from 'svelte-json-discovery';
import { compareJson } from 'svelte-json-discovery/diff';
import { JsonInspector } from 'svelte-json-discovery/inspector';
import { ajvErrorsToIssues } from 'svelte-json-discovery/validation/ajv';
import { valibotIssuesToIssues } from 'svelte-json-discovery/validation/valibot';
import { zodIssuesToIssues } from 'svelte-json-discovery/validation/zod';
import { render } from 'svelte/server';

export async function verify() {
    const data = { value: 1 };
    const validate: JsonValidator = async () => [];
    const viewer = render(JsonViewer, { props: { data } });
    const inspector = render(JsonInspector, { props: { data, validate } });
    const changes = await compareJson(data, { value: 0 });
    ajvErrorsToIssues([], { data });
    zodIssuesToIssues([], { data });
    valibotIssuesToIssues([], { data });
    return {
        changes: changes.changes.length,
        inspector: inspector.body.includes('Inspector views'),
        viewer: viewer.body.includes('JSON data'),
    };
}
`;

describe('release package boundaries', () => {
    it('ships runtime and generated type targets for every public subpath', () => {
        for (const [subpath, target] of Object.entries(packageJson.exports)) {
            if (subpath === './package.json')
                continue;
            expect(target, `${subpath} should use a conditional export`).toBeTypeOf('object');
            const entry = target as { default?: string; svelte?: string; types?: string };
            expect(entry.types, `${subpath} should publish generated types`).toBeTypeOf('string');
            expect(existsSync(resolve(packageRoot, entry.types!)), `${subpath} types target`).toBe(true);
            const runtime = entry.svelte ?? entry.default;
            expect(runtime, `${subpath} should publish a runtime target`).toBeTypeOf('string');
            expect(existsSync(resolve(packageRoot, runtime!)), `${subpath} runtime target`).toBe(true);
        }
    });

    it('keeps the main published graph isolated and within its size snapshot', () => {
        const graph = collectGraph(resolve(distRoot, 'index.js'));
        const relativeFiles = graph.files.map(file => relative(distRoot, file));
        expect(relativeFiles).toEqual([
            'ActionsPopup.svelte',
            'JsonViewer.svelte',
            'Preview.svelte',
            'SchemaTooltip.svelte',
            'ValueNode.svelte',
            'collection.js',
            'index.js',
            'node.js',
            'portal.js',
            'preview.js',
            'schema.js',
            'search.js',
            'struct-helpers.js',
            'struct.css',
            'types.js',
            'utils.js',
        ]);
        expect(relativeFiles.some(file => /^(?:diff|inspector|validation)\//.test(file))).toBe(false);
        expect(graph.bareImports).toEqual(['svelte']);
        const output = Buffer.concat(graph.files.map(file => readFileSync(file)));
        expect(output.byteLength).toBeLessThanOrEqual(120_000);
        expect(gzipSync(output).byteLength).toBeLessThanOrEqual(27_000);
        expect('dependencies' in packageJson && packageJson.dependencies).toBe(false);
    });

    it('publishes a type-safe, SSR-consumable tarball with isolated subpaths', { timeout: 30_000 }, async () => {
        const temporaryRoot = mkdtempSync(join(tmpdir(), 'sjd-release-'));
        try {
            const output = execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporaryRoot], {
                cwd: packageRoot,
                encoding: 'utf8',
            });
            const [manifest] = JSON.parse(output) as Array<{ filename: string; files: Array<{ path: string }>; size: number }>;
            const files = manifest.files.map(file => file.path);
            expect(files.some(file => /(?:^|\/)tests?(?:\/|\.)|\.test\./i.test(file))).toBe(false);
            expect(files.some(file => file.endsWith('.map'))).toBe(false);
            expect(manifest.size).toBeLessThanOrEqual(150_000);

            const consumerRoot = resolve(temporaryRoot, 'consumer');
            const modulesRoot = resolve(consumerRoot, 'node_modules');
            const publishedRoot = resolve(modulesRoot, packageJson.name);
            mkdirSync(publishedRoot, { recursive: true });
            execFileSync('tar', [
                '-xzf',
                resolve(temporaryRoot, manifest.filename),
                '-C',
                publishedRoot,
                '--strip-components=1',
            ]);
            symlinkSync(resolve(packageRoot, 'node_modules/svelte'), resolve(modulesRoot, 'svelte'), 'dir');
            writeFileSync(resolve(consumerRoot, 'consumer.ts'), consumerSource);

            execFileSync(resolve(packageRoot, 'node_modules/.bin/tsc'), [
                '--noEmit',
                '--strict',
                '--skipLibCheck',
                '--target',
                'ES2022',
                '--module',
                'ESNext',
                '--moduleResolution',
                'Bundler',
                resolve(consumerRoot, 'consumer.ts'),
            ], { cwd: consumerRoot, stdio: 'pipe' });

            const server = await createServer({
                appType: 'custom',
                configFile: false,
                logLevel: 'silent',
                plugins: [svelte()],
                root: consumerRoot,
                server: { middlewareMode: true },
                ssr: { noExternal: [packageJson.name] },
            });
            try {
                const consumer = await server.ssrLoadModule('/consumer.ts') as {
                    verify: () => Promise<{ changes: number; inspector: boolean; viewer: boolean }>;
                };
                await expect(consumer.verify()).resolves.toEqual({
                    changes: 1,
                    inspector: true,
                    viewer: true,
                });
            }
            finally {
                await server.close();
            }
        }
        finally {
            rmSync(temporaryRoot, { force: true, recursive: true });
        }
    });
});

function collectGraph(entry: string): { bareImports: string[]; files: string[] } {
    const files = new Set<string>();
    const bareImports = new Set<string>();
    const visit = (file: string) => {
        const normalized = normalize(file);
        if (files.has(normalized) || !existsSync(normalized) || statSync(normalized).isDirectory())
            return;
        files.add(normalized);
        const source = readFileSync(normalized, 'utf8');
        for (const specifier of importSpecifiers(source)) {
            if (!specifier.startsWith('.')) {
                bareImports.add(packageName(specifier));
                continue;
            }
            const imported = resolve(dirname(normalized), specifier);
            const target = [imported, `${imported}.js`, `${imported}.svelte`, `${imported}.css`]
                .find(candidate => existsSync(candidate));
            if (target)
                visit(target);
        }
    };
    visit(entry);
    return { bareImports: [...bareImports].sort(), files: [...files].sort() };
}

function importSpecifiers(source: string): string[] {
    const fromImports = source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g);
    const sideEffectImports = source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g);
    const dynamicImports = source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    return [...fromImports, ...sideEffectImports, ...dynamicImports].map(match => match[1]);
}

function packageName(specifier: string): string {
    const [scope, name] = specifier.split('/');
    return scope.startsWith('@') ? `${scope}/${name}` : scope;
}
