// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import * as mainEntry from '../index.js';
import { JsonInspector } from './index.js';

describe('json inspector package boundary', () => {
    it('imports and renders without a browser environment', () => {
        const result = render(JsonInspector, { props: { data: { ssr: true } } });

        expect(result.body).toContain('Inspector views');
        expect(result.body).toContain('JSON data');
    });

    it('publishes only through the optional subpath and stays out of the main entry graph', () => {
        expect(packageJson.exports['./inspector']).toBeTruthy();
        expect(mainEntry).not.toHaveProperty('JsonInspector');
    });
});
