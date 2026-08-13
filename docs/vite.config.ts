import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// deployed to GitHub Pages under /svelte-json-discovery/;
// the same base applies in dev and preview so all three behave alike
export default defineConfig({
    base: '/svelte-json-discovery/',
    plugins: [svelte()]
});
