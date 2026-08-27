<script lang='ts'>
    import type { JsonViewerRendererProps } from '../../src/index.js';

    const { node }: JsonViewerRendererProps = $props();

    function renderFailure(): never {
        throw new Error(`renderer failed at ${node.pointer}`);
    }
</script>

<span>{renderFailure()}</span>
