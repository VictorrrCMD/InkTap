// Serves dist/ as Netlify will (netlify.toml headers, /s/* rewrite) and proxies
// /api to the dev server. Usage: node tests/serve-dist.mjs [port]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
const port = Number(process.argv[2] ?? 4173)
const API = process.env.API_ORIGIN ?? 'http://127.0.0.1:5173'

// The [[headers]] block for "/*": every `Key = "value"` line under it.
const global = toml.split('[[headers]]').find((block) => /for = "\/\*"/.test(block)) ?? ''
const headers = Object.fromEntries([...global.matchAll(/^\s+([\w-]+) = "(.*)"$/gm)].map((m) => [m[1], m[2]]))

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname.startsWith('/api/')) {
    const upstream = request(API + url.pathname + url.search, { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    })
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
    return
  }
  let path = decodeURIComponent(url.pathname)
  if (path.startsWith('/s/') || path.startsWith('/legal') || path === '/') path = '/index.html'
  const file = normalize(join(root, path))
  if (!file.startsWith(normalize(root)) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, headers)
    res.end('Not found')
    return
  }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`dist on http://127.0.0.1:${port} (CSP: ${headers['Content-Security-Policy'] ? 'on' : 'missing'})`))
