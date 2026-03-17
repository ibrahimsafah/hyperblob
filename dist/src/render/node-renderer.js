// Node renderer — lightweight wrapper for node highlight/selection state
// The core node rendering pipeline lives in app.ts; this module manages
// highlight state and provides a future extension point for frustum culling
export class NodeRenderer {
    highlightedNode = null;
    /**
     * Set which node is currently highlighted (hovered/selected).
     * Pass null to clear the highlight.
     */
    setHighlight(nodeIndex) {
        this.highlightedNode = nodeIndex;
    }
    /**
     * Get the currently highlighted node index, or null if none.
     */
    getHighlightedNode() {
        return this.highlightedNode;
    }
}
