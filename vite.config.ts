import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  assetsInclude: ['**/*.wgsl', '**/*.wasm'],
  build: mode === 'lib' ? {
    lib: {
      entry: 'src/lib.ts',
      formats: ['es'],
      fileName: 'hyperblob',
    },
    target: 'esnext',
    outDir: 'dist/lib',
    rollupOptions: {
      // No externals — WGSL and WASM are inlined by Vite's ?raw imports
    },
  } : {
    target: 'esnext',
  },
  server: {
    port: 5173,
  },
}));
