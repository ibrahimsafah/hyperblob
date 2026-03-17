/**
 * Inlines all JS and CSS assets into a single standalone HTML file.
 * Run after: vite build --mode standalone
 * Produces: dist/standalone/hyperblob-standalone.html
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const distDir = resolve(import.meta.dirname, '..', 'dist', 'standalone');

let html = readFileSync(resolve(distDir, 'standalone.html'), 'utf8');

// Inline <script type="module" crossorigin src="/assets/...">
html = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
  (_, src) => {
    const filePath = resolve(distDir, src.replace(/^\//, ''));
    const js = readFileSync(filePath, 'utf8');
    return `<script type="module">${js}</script>`;
  },
);

// Inline <link rel="stylesheet" crossorigin href="/assets/...">
html = html.replace(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
  (_, href) => {
    const filePath = resolve(distDir, href.replace(/^\//, ''));
    const css = readFileSync(filePath, 'utf8');
    return `<style>${css}</style>`;
  },
);

const outPath = resolve(distDir, 'hyperblob-standalone.html');
writeFileSync(outPath, html);

// Report size
const sizeKB = (readFileSync(outPath).byteLength / 1024).toFixed(1);
console.log(`Created ${outPath} (${sizeKB} KB)`);
