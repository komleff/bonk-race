import { defineConfig } from 'vite'
import path from 'path'
import { execFileSync } from 'node:child_process'
import versionJson from '../version.json'

// Самостоятельный стенд со штатной точкой входа BonkLab и относительными ресурсами.
export default defineConfig({
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(versionJson.version),
    __TUGLAB_COMMIT__: JSON.stringify(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname }).toString().trim())
  },
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      '@bonk-race/shared': path.resolve(__dirname, '../shared/src/index')
    }
  },
  plugins: [{
    name: 'tuglab-index',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['tuglab.html']
      if (html) { html.fileName = 'index.html'; bundle['index.html'] = html; delete bundle['tuglab.html'] }
    }
  }],
  build: {
    outDir: path.resolve(__dirname, 'dist-tuglab'),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'tuglab.html') }
  }
})
