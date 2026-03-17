export declare class NodeRenderer {
    private highlightedNode;
    /**
     * Set which node is currently highlighted (hovered/selected).
     * Pass null to clear the highlight.
     */
    setHighlight(nodeIndex: number | null): void;
    /**
     * Get the currently highlighted node index, or null if none.
     */
    getHighlightedNode(): number | null;
}
