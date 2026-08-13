import { defineConfig } from 'taze';

export default defineConfig({
    // check every workspace package
    recursive: true,
    // `pnpm deps:check` to preview, `pnpm deps:update` to apply;
    // the weekly workflow PRs minor/patch bumps, majors stay manual
    ignorePaths: ['**/node_modules/**', '**/dist/**'],
});
