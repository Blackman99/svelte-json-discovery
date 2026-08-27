import type { JsonPath } from '../types.js';
import type { Change, ChangeSet } from './types.js';

export interface ChangeMarkerOptions {
    readonly fallbackToAncestor?: boolean;
    readonly markerClass: string;
    readonly nodeClass?: string;
    readonly side: 'baseline' | 'current';
}

export function observeChangeMarkers(
    panel: HTMLElement | undefined,
    changeSet: ChangeSet,
    options: ChangeMarkerOptions,
): (() => void) | undefined {
    if (!panel)
        return;
    let queued = false;
    let disposed = false;
    const sync = () => {
        queued = false;
        if (!disposed)
            syncChangeMarkers(panel, changeSet, options);
    };
    const schedule = () => {
        if (!queued) {
            queued = true;
            queueMicrotask(sync);
        }
    };
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(panel, { attributeFilter: ['data-json-path'], attributes: true, childList: true, subtree: true });
    return () => {
        disposed = true;
        observer.disconnect();
        clearChangeMarkers(panel, options);
    };
}

function syncChangeMarkers(panel: HTMLElement, changeSet: ChangeSet, options: ChangeMarkerOptions): void {
    const nodes = [...panel.querySelectorAll<HTMLElement>('[data-json-path]')];
    const nodesByPath = new Map<string, HTMLElement[]>();
    for (const node of nodes) {
        const encoded = node.dataset.jsonPath;
        if (encoded === undefined)
            continue;
        const related = nodesByPath.get(encoded) ?? [];
        related.push(node);
        nodesByPath.set(encoded, related);
    }

    const changesByNode = new Map<HTMLElement, Change[]>();
    for (const change of changeSet.changes) {
        const path = markerPath(change, options);
        if (path === null)
            continue;
        const targets = findTargets(nodesByPath, path, options.fallbackToAncestor === true);
        for (const target of targets) {
            const related = changesByNode.get(target) ?? [];
            related.push(change);
            changesByNode.set(target, related);
        }
    }

    for (const node of nodes) {
        const related = changesByNode.get(node) ?? [];
        const marker = node.querySelector<HTMLElement>(`:scope > .${options.markerClass}`);
        if (related.length === 0) {
            marker?.remove();
            if (options.nodeClass)
                node.classList.remove(options.nodeClass);
            delete node.dataset.changeKind;
            restoreAccessibleLabel(node);
            continue;
        }
        const kinds = [...new Set(related.map(change => change.kind))];
        const labels = kinds.map(titleCase);
        const diagnosticMessages = related.flatMap(change => change.diagnostic ? [change.diagnostic.message] : []);
        const label = diagnosticMessages.length > 0
            ? `${labels.join(', ')}: ${diagnosticMessages.join('; ')}`
            : labels.join(', ');
        const current = marker ?? document.createElement('span');
        const kindValue = kinds.join(' ');
        const text = labels.map(value => value[0]).join('');
        current.className = options.markerClass;
        current.dataset.kind = kindValue;
        applyAccessibleLabel(node, current, label);
        if (current.textContent !== text)
            current.textContent = text;
        node.dataset.changeKind = kindValue;
        if (options.nodeClass)
            node.classList.add(options.nodeClass);
        if (!marker) {
            const group = [...node.children].find(child => child.getAttribute('role') === 'group');
            node.insertBefore(current, group ?? null);
        }
    }
}

function markerPath(change: Change, options: ChangeMarkerOptions): JsonPath | null {
    if ((options.side === 'current' && change.kind === 'removed') || (options.side === 'baseline' && change.kind === 'added'))
        return options.fallbackToAncestor ? change.path.slice(0, -1) : null;
    return options.side === 'baseline' && change.kind === 'moved' ? change.previousPath : change.path;
}

function findTargets(nodesByPath: Map<string, HTMLElement[]>, path: JsonPath, fallback: boolean): HTMLElement[] {
    for (let length = path.length; length >= 0; length--) {
        const targets = nodesByPath.get(JSON.stringify(path.slice(0, length)));
        if (targets && targets.length > 0)
            return targets;
        if (!fallback)
            break;
    }
    return [];
}

function clearChangeMarkers(panel: HTMLElement, options: ChangeMarkerOptions): void {
    panel.querySelectorAll(`.${options.markerClass}`).forEach(marker => marker.remove());
    for (const node of panel.querySelectorAll<HTMLElement>('[data-change-kind]')) {
        if (options.nodeClass)
            node.classList.remove(options.nodeClass);
        delete node.dataset.changeKind;
        restoreAccessibleLabel(node);
    }
}

function applyAccessibleLabel(node: HTMLElement, marker: HTMLElement, changeLabel: string): void {
    const currentLabel = node.getAttribute('aria-label');
    const appliedLabel = node.dataset.changeAppliedLabel;
    if (appliedLabel !== undefined && currentLabel !== appliedLabel) {
        if (currentLabel === null) {
            delete node.dataset.changeBaseLabel;
        }
        else {
            node.dataset.changeBaseLabel = currentLabel;
        }
        delete node.dataset.changeAppliedLabel;
    }
    if (!Object.hasOwn(node.dataset, 'changeBaseLabel')) {
        const baseLabel = currentLabel;
        if (baseLabel !== null)
            node.dataset.changeBaseLabel = baseLabel;
    }
    const baseLabel = node.dataset.changeBaseLabel;
    if (baseLabel !== undefined) {
        const nextLabel = `${baseLabel}; update: ${changeLabel}`;
        node.setAttribute('aria-label', nextLabel);
        node.dataset.changeAppliedLabel = nextLabel;
        marker.removeAttribute('role');
        marker.removeAttribute('aria-label');
        marker.setAttribute('aria-hidden', 'true');
        return;
    }
    marker.removeAttribute('aria-hidden');
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', changeLabel);
}

function restoreAccessibleLabel(node: HTMLElement): void {
    const baseLabel = node.dataset.changeBaseLabel;
    if (baseLabel === undefined)
        return;
    if (node.getAttribute('aria-label') === node.dataset.changeAppliedLabel)
        node.setAttribute('aria-label', baseLabel);
    delete node.dataset.changeBaseLabel;
    delete node.dataset.changeAppliedLabel;
}

function titleCase(value: string): string {
    return value[0].toUpperCase() + value.slice(1);
}
