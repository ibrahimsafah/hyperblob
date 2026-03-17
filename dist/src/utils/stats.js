export class Stats {
    el;
    frames = [];
    lastTime = 0;
    nodeCount = 0;
    edgeCount = 0;
    constructor(container) {
        this.el = document.createElement('div');
        this.el.id = 'stats';
        container.appendChild(this.el);
        this.lastTime = performance.now();
    }
    setDataInfo(nodes, edges) {
        this.nodeCount = nodes;
        this.edgeCount = edges;
    }
    update() {
        const now = performance.now();
        const dt = now - this.lastTime;
        this.lastTime = now;
        this.frames.push(dt);
        if (this.frames.length > 60)
            this.frames.shift();
        const avgDt = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
        const fps = 1000 / avgDt;
        this.el.textContent =
            `${fps.toFixed(0)} fps | ${avgDt.toFixed(1)} ms` +
                (this.nodeCount > 0 ? `\n${this.nodeCount.toLocaleString()} nodes | ${this.edgeCount.toLocaleString()} hyperedges` : '');
        this.el.style.whiteSpace = 'pre';
    }
}
