import { defineConfig } from 'vite'
import path from 'path'
import versionJson from '../version.json'

/**
 * Vite config for building BonkLab as a standalone single HTML file.
 * Dev-only tool — not included in production builds.
 */
export default defineConfig({
  base: '/bonk-race/',
  publicDir: false, // no public assets needed for lab
  define: {
    __APP_VERSION__: JSON.stringify(versionJson.version)
  },
  resolve: {
    alias: {
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
      '@bonk-race/shared': path.resolve(__dirname, '../shared/src/index')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-lab'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'lab.html')
    }
  }
})
