import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import versionJson from '../version.json'

/**
 * Vite plugin: rewrite /lab → /lab.html in dev mode
 * so that navigating to http://localhost:5173/lab serves the lab entry point.
 */
function labRewritePlugin(): Plugin {
  return {
    name: 'lab-rewrite',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/lab' || req.url === '/lab/') {
          req.url = '/lab.html'
        }
        next()
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const hmrHost = env.VITE_HMR_HOST
  const hmrProtocol = env.VITE_HMR_PROTOCOL || 'ws'

  return {
    plugins: [labRewritePlugin()],
    // Оптимизированные ассеты для production (только используемые файлы)
    publicDir: path.resolve(__dirname, '../assets-dist'),
    // Инжекция версии из version.json (единый источник правды)
    define: {
      __APP_VERSION__: JSON.stringify(versionJson.version)
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true, // Разрешить доступ из локальной сети
      hmr: hmrHost
        ? {
            host: hmrHost,
            protocol: hmrProtocol
          }
        : true,
      // Проксирование API для доступа с других устройств в локальной сети
      // Телефон: http://192.168.x.x:5173/api/v1/... → localhost:3000/api/v1/...
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
        '@bonk-race/shared': path.resolve(__dirname, '../shared/src/index')
      }
    },
  }
})
