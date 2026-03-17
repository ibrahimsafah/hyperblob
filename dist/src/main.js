import { App } from './app';
async function main() {
    const canvas = document.getElementById('gpu-canvas');
    if (!canvas) {
        throw new Error('Canvas element not found');
    }
    try {
        const app = await App.create(canvas);
        app.engine.start();
        // Expose for debugging
        window.__app = app;
    }
    catch (err) {
        console.error('Initialization failed:', err);
        const overlay = document.getElementById('error-overlay');
        if (overlay)
            overlay.classList.add('visible');
    }
}
main();
