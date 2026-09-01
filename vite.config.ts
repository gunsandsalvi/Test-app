import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    // Relative asset URLs so the same build works at any mount path (GitHub Pages serves
    // this under /Test-app/, local preview serves it at /).
    base: './',
    plugins: [react(), tailwindcss()],
    // The engine reads process.env flags (harness/debug switches) without guards; in the
    // browser bundle they all read as undefined, which is each flag's off state.
    define: {
      'process.env': {},
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // native-kernels.ts imports node:module for its Node-only addon loader; give the
        // browser bundle a shim so rollup finds the named export (never called in a browser).
        'node:module': path.resolve(__dirname, 'src/shims/node-module-browser.ts'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
