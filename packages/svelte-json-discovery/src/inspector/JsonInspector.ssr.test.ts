// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import * as diffEntry from '../diff/index.js';
import * as mainEntry from '../index.js';
import * as validationEntry from '../validation/index.js';
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

    it('keeps comparison utilities in a stable optional Diff entry', () => {
        expect(packageJson.exports['./diff']).toBeTruthy();
        expect(diffEntry).toHaveProperty('compareJson');
        expect(mainEntry).not.toHaveProperty('compareJson');
        expect('dependencies' in packageJson && packageJson.dependencies).toBeFalsy();
    });

    it('keeps the Ajv adapter in its own optional entry graph', () => {
        expect(packageJson.exports['./validation']).toBeTruthy();
        expect(packageJson.exports['./validation/ajv']).toBeTruthy();
        expect(mainEntry).not.toHaveProperty('createAjvValidator');
        expect(validationEntry).not.toHaveProperty('createAjvValidator');
        expect('dependencies' in packageJson && packageJson.dependencies).toBeFalsy();
        expect(packageJson.devDependencies.ajv).toBeTruthy();
    });

    it('keeps the Zod adapter in its own optional entry graph', () => {
        expect(packageJson.exports['./validation/zod']).toBeTruthy();
        expect(mainEntry).not.toHaveProperty('createZodValidator');
        expect(validationEntry).not.toHaveProperty('createZodValidator');
        expect('dependencies' in packageJson && packageJson.dependencies).toBeFalsy();
        expect(packageJson.devDependencies.zod).toBeTruthy();
    });

    it('keeps the Valibot adapter in its own optional entry graph', () => {
        expect(packageJson.exports['./validation/valibot']).toBeTruthy();
        expect(mainEntry).not.toHaveProperty('createValibotValidator');
        expect(validationEntry).not.toHaveProperty('createValibotValidator');
        expect('dependencies' in packageJson && packageJson.dependencies).toBeFalsy();
        expect(packageJson.devDependencies.valibot).toBeTruthy();
    });
});
