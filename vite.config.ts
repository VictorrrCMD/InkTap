import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import netlify from '@netlify/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

// Fetched by pdf.js on demand: CJK CMaps, the standard fonts most forms don't
// embed, and the wasm decoders for scanned pages.
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

const TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.icc': 'application/vnd.iccprofile',
}

function pdfjsAssets(): Plugin {
  const pkg = resolve(here, 'node_modules/pdfjs-dist')
  let outDir = resolve(here, 'dist')
  return {
    name: 'inktap:pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const [dir, ...rest] = path.split('/')
        if (!PDFJS_DIRS.includes(dir)) return next()
        const base = join(pkg, dir)
        const file = normalize(join(base, ...rest))
        if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      for (const dir of PDFJS_DIRS) {
        cpSync(join(pkg, dir), join(outDir, 'pdfjs', dir), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Functions, Blobs and redirects run as on Netlify; headers stay off in dev
    // because the production CSP would block Vite's inline React Refresh script.
    netlify({
      headers: { enabled: false },
      staticFiles: { enabled: false },
      edgeFunctions: { enabled: false },
      images: { enabled: false },
      geolocation: { enabled: false },
      aiGateway: { enabled: false },
      database: { enabled: false },
      server: { enabled: false },
    }),
    pdfjsAssets(),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
})
