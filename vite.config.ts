import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Dual-mode Vite config:
 *   npm run dev / preview  → multi-page app (demo + editor)
 *   npm run build:lib      → library bundle (ESM + CJS + .d.ts)
 *   npm run build          → multi-page app build (demo + editor)
 */
const isLib = process.env.BUILD_MODE === 'lib';

export default defineConfig({
  build: isLib
    ? {
        target: 'es2020',
        lib: {
          entry:    resolve(__dirname, 'src/index.ts'),
          name:     'LuxIso',
          fileName: (format) => `luxiso.${format === 'es' ? 'mjs' : 'cjs'}`,
          formats:  ['es', 'cjs'],
        },
        rollupOptions: {
          // No external deps — pure Canvas 2D, no runtime dependencies
          external: [],
        },
        // Emit .d.ts via tsc separately (see build:lib script)
        copyPublicDir: false,
      }
    : {
        target: 'es2022',
        rollupOptions: {
          input: {
            main:   resolve(__dirname, 'index.html'),
            editor: resolve(__dirname, 'editor.html'),
          },
        },
      },
});
