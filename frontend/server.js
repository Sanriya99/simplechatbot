// Production server for Azure App Service.
// Serves the built app from dist/ and proxies /api/* to Open WebUI,
// attaching the API key server-side (same job the Vite dev proxy does locally).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const port = process.env.PORT || 8080
const target = process.env.OPENWEBUI_URL || 'http://localhost:8080'
const apiKey = process.env.OPENWEBUI_API_KEY || ''

if (!apiKey) console.warn('[chatbot] OPENWEBUI_API_KEY is not set - requests will be rejected.')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

async function proxy(req, res) {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const upstream = await fetch(new URL(req.url, target), {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    })
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    })
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
    else res.end()
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ detail: `Could not reach Open WebUI at ${target}: ${err.message}` }))
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(root, urlPath)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, 'index.html') // SPA fallback
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}

http
  .createServer((req, res) => (req.url.startsWith('/api/') ? proxy(req, res) : serveStatic(req, res)))
  .listen(port, () => console.log(`[chatbot] listening on port ${port}, proxying /api to ${target}`))
