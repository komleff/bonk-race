import { defineConfig } from 'vite';
import path from 'path';
import { execFileSync } from 'node:child_process';
import baseConfig from './vite.config.tuglab';

// Новая оболочка сохраняет относительные ресурсы для корня и общей подпапки Pages.
export default defineConfig({
  ...baseConfig,
  define: { ...baseConfig.define, __TUGLAB2_VERSION__: JSON.stringify('0.1.0'),
    __TUGLAB2_SOURCE_SHA__: JSON.stringify(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname }).toString().trim()) },
  plugins: [{ name: 'tuglab2-index', enforce: 'post', generateBundle(_, bundle) {
    const html = bundle['tuglab2.html'];
    if (html) { html.fileName = 'index.html'; bundle['index.html'] = html; delete bundle['tuglab2.html']; }
  } }],
  build: { outDir: path.resolve(__dirname, 'dist-tuglab2'), emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'tuglab2.html') } },
});
