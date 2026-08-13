import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// deployed to GitHub Pages under /svelte-json-discovery/;
// the same base applies in dev and preview so all three behave alike
export default defineConfig({
    base: '/svelte-json-discovery/',
    plugins: [svelte()],
});
