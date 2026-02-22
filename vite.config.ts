import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.wgsl'],
  build: {
    target: 'esnext',
  },
  server: {
    port: 5173,
  },
});
