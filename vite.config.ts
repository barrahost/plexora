import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

// Proxy local identique aux Cloudflare Functions (proxy.js + hls.js)
// → évite CORS en dev sans avoir besoin que le serveur IPTV envoie des headers CORS
function devProxy(): Plugin {
  async function handleProxy(req: IncomingMessage, res: ServerResponse, targetParam: string) {
    try {
      // Construire des headers qui imitent une requête navigateur depuis le domaine IPTV
      // → contourne les vérifications Referer/Origin anti-leeching du serveur
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      }
      try {
        const t = new URL(targetParam)
        headers['Referer'] = `${t.protocol}//${t.host}/`
        headers['Origin'] = `${t.protocol}//${t.host}`
      } catch { /* URL invalide, pas de Referer */ }
      // Transférer les cookies du navigateur vers l'upstream (session IPTV)
      const cookie = (req.headers as Record<string, string>)['cookie']
      if (cookie) headers['Cookie'] = cookie
      const upstream = await fetch(targetParam, { headers })
      const body = Buffer.from(await upstream.arrayBuffer())
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(body)
    } catch (e) {
      res.statusCode = 502
      res.end(String(e))
    }
  }

  function resolveUrl(base: string, rel: string) {
    if (/^https?:\/\//.test(rel)) return rel
    return new URL(rel, base).href
  }

  async function handleHls(_req: IncomingMessage, res: ServerResponse, targetUrl: string, origin: string) {
    function proxyUrl(u: string) { return `${origin}/proxy?target=${encodeURIComponent(u)}` }
    function hlsUrl(u: string) { return `${origin}/hls?url=${encodeURIComponent(u)}` }
    try {
      const upstream = await fetch(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const text = await upstream.text()
      const rewritten = text.split('\n').map(line => {
        const t = line.trim()
        if (!t) return line
        if (t.startsWith('#') && t.includes('URI="')) {
          return t.replace(/URI="([^"]+)"/g, (_: string, uri: string) => `URI="${proxyUrl(resolveUrl(targetUrl, uri))}"`)
        }
        if (t.startsWith('#')) return line
        const abs = resolveUrl(targetUrl, t)
        return abs.includes('.m3u8') ? hlsUrl(abs) : proxyUrl(abs)
      }).join('\n')
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'no-store')
      res.end(rewritten)
    } catch (e) {
      res.statusCode = 502
      res.end(String(e))
    }
  }

  return {
    name: 'dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        const [path, qs] = rawUrl.split('?')
        const params = new URLSearchParams(qs || '')

        if (path === '/proxy') {
          const target = params.get('target')
          if (!target) { res.statusCode = 400; res.end('Missing target'); return }
          return handleProxy(req, res, target)
        }
        if (path === '/hls') {
          const url = params.get('url')
          if (!url) { res.statusCode = 400; res.end('Missing url'); return }
          const origin = `http://${req.headers.host}`
          return handleHls(req, res, url, origin)
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), devProxy()],
  server: {
    port: parseInt(process.env.PORT || '5177'),
    strictPort: false,
  },
})
