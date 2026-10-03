import { defineConfig } from 'vite';
import path from 'path';
import tuglabConfig from './vite.config.tuglab';

// Отдельная оболочка переиспользует разрешение модулей и сборочный контракт TugLab.
export default defineConfig({
  ...tuglabConfig,
  plugins: [{ name: 'u2taglab-index', enforce: 'post', generateBundle(_, bundle) {
    const html = bundle['u2taglab.html'];
    if (html) { html.fileName = 'index.html'; bundle['index.html'] = html; delete bundle['u2taglab.html']; }
  } }],
  build: { outDir: path.resolve(__dirname, 'dist-u2taglab'), emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'u2taglab.html') } },
});
