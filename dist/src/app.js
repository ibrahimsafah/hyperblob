// App — thin demo shell wrapping HyperblobEngine
// Adds Panel (UI controls), Stats (FPS overlay), and default dataset loading.
// Library consumers import HyperblobEngine directly from './lib'.
import { HyperblobEngine } from './lib';
import { Stats } from './utils/stats';
export class App {
    engine;
    stats;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panelInstance = null;
    disposed = false;
    constructor(engine, stats) {
        this.engine = engine;
        this.stats = stats;
    }
    static async create(canvas) {
        const engine = await HyperblobEngine.create(canvas, {
            tooltip: true,
            // Default click behavior (neighborhood selection) is built into the engine
        });
        const stats = new Stats(canvas.parentElement);
        const app = new App(engine, stats);
        await app.setupPanel();
        await app.loadDefaultDataset();
        // Start the render loop (also starts stats updates)
        const originalStart = engine.start.bind(engine);
        engine.start = () => {
            originalStart();
            app.startStatsLoop();
        };
        return app;
    }
    async setupPanel() {
        try {
            const panelModule = await import(/* @vite-ignore */ './ui/panel');
            const panelContainer = document.getElementById('panel');
            if (!panelContainer)
                return;
            const generatorModule = await import(/* @vite-ignore */ './data/generator').catch(() => null);
            this.panelInstance = new panelModule.Panel(panelContainer, {
                simParams: this.engine.simParams,
                renderParams: this.engine.renderParams,
                camera: this.engine.camera,
                onLoadFile: (data) => {
                    this.engine.setData(data);
                    this.stats.setDataInfo(data.nodes.length, data.hyperedges.length);
                    this.panelInstance?.updateDataInfo(data);
                },
                onGenerate: (nodeCount, heCount, maxSize) => {
                    if (generatorModule) {
                        const data = generatorModule.generateRandomHypergraph(nodeCount, heCount, maxSize);
                        this.engine.setData(data);
                        this.stats.setDataInfo(data.nodes.length, data.hyperedges.length);
                        this.panelInstance?.updateDataInfo(data);
                    }
                },
                onSimulationToggle: (running) => { this.engine.simParams.running = running; },
                onSimulationReset: () => this.engine.resetSimulation(),
                onSimulationConverge: () => this.engine.converge(),
                onFitToScreen: () => this.engine.fitToScreen(),
            });
        }
        catch {
            // Panel module not built yet
        }
    }
    async loadDefaultDataset() {
        try {
            const hifModule = await import(/* @vite-ignore */ './data/hif-loader');
            const response = await fetch('/data/got.json');
            if (!response.ok)
                return;
            const json = await response.json();
            const data = hifModule.parseHIF(json);
            this.engine.setData(data);
            this.stats.setDataInfo(data.nodes.length, data.hyperedges.length);
            this.panelInstance?.updateDataInfo(data);
        }
        catch (e) {
            console.warn('Could not load default dataset:', e);
        }
    }
    startStatsLoop() {
        const loop = () => {
            if (this.disposed)
                return;
            this.stats.update();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
    dispose() {
        this.disposed = true;
        this.engine.dispose();
        this.panelInstance?.dispose();
        this.panelInstance = null;
    }
}
