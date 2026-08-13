// Moves an element to document.body so position: fixed coordinates are
// always viewport-relative — a transformed/filtered/animated ancestor would
// otherwise become its containing block and displace it (discovery appends
// its popups to the body for the same reason).
export function portal(node: HTMLElement) {
    document.body.appendChild(node);

    return {
        destroy() {
            node.remove();
        }
    };
}
