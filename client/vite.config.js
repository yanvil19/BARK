import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * injectPrecacheManifest
 * ----------------------
 * After the production build finishes, reads Vite's manifest.json,
 * collects all hashed output file paths, and writes them into sw.js
 * so the service worker precaches the full app shell on install.
 *
 * Why a custom plugin instead of vite-plugin-pwa?
 *   No new runtime dependency, stays simple, fully transparent.
 */
function injectPrecacheManifest() {
  return {
    name: 'inject-precache-manifest',
    apply: 'build',   // only runs during `vite build`, not `vite dev`
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const manifestPath = resolve(outDir, '.vite', 'manifest.json');

      let assets = ['/', '/index.html', '/manifest.webmanifest'];

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        for (const entry of Object.values(manifest)) {
          // entry.file is the hashed output path, e.g. "assets/index-Bk3hQ1xZ.js"
          if (entry.file) assets.push('/' + entry.file);
          // Also include CSS imports declared in the manifest
          if (Array.isArray(entry.css)) {
            entry.css.forEach((css) => assets.push('/' + css));
          }
        }
        // Deduplicate
        assets = [...new Set(assets)];
      } catch (e) {
        console.warn('[inject-precache-manifest] Could not read manifest.json:', e.message);
      }

      const swPath = resolve(outDir, 'sw.js');
      try {
        let sw = readFileSync(swPath, 'utf-8');
        const json = JSON.stringify(assets, null, 2);
        // Replace the fallback placeholder assignment with the real manifest
        sw = sw.replace(
          /self\.__PRECACHE_MANIFEST__\s*\|\|\s*\[[\s\S]*?\]/,
          json
        );
        writeFileSync(swPath, sw, 'utf-8');
        console.log(`[inject-precache-manifest] Injected ${assets.length} assets into sw.js`);
      } catch (e) {
        console.warn('[inject-precache-manifest] Could not update sw.js:', e.message);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), injectPrecacheManifest()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        configure: (proxy) => {
          // Disable response buffering for SSE (Server-Sent Events)
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.headers.accept === 'text/event-stream' ||
                proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
              proxyRes.headers['cache-control'] = 'no-cache';
            }
          });
        },
      }
    }
  },
  // Preview server (npm run preview) — same proxy as dev so you can
  // test the production build locally against your local backend.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emit Vite's manifest.json so the plugin can read it
    manifest: true,
  },
});

