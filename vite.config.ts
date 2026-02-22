import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wgsl', '**/*.wasm'],
  build: {
    target: 'esnext',
  },
  server: {
    port: 5173,
  },
});
