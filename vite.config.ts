import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const common = {
    assetsInclude: ['**/*.wgsl'],
    server: { port: 5173 },
  };

  if (mode === 'lib') {
    return {
      ...common,
      build: {
        lib: {
          entry: 'src/lib.ts',
          formats: ['es'],
          fileName: 'hyperblob',
        },
        target: 'esnext',
        outDir: 'dist/lib',
        rollupOptions: {},
      },
    };
  }

  if (mode === 'standalone') {
    return {
      ...common,
      build: {
        target: 'esnext',
        outDir: 'dist/standalone',
        rollupOptions: {
          input: 'standalone.html',
        },
        // Inline small assets so fewer files to bundle
        assetsInlineLimit: 100000,
      },
    };
  }

  // Default: app build
  return {
    ...common,
    build: { target: 'esnext' },
  };
});
