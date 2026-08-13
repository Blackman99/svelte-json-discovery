import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// deployed to GitHub Pages under /svelte-json-discovery/
export default defineConfig(({ command }) => ({
    base: command === 'build' ? '/svelte-json-discovery/' : '/',
    plugins: [svelte()]
}));
