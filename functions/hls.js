// Proxy HLS : récupère le manifest m3u8 et réécrit toutes les URLs
// pour que HLS.js n'ait jamais à faire de requête cross-origin directe.
export async function onRequest(context) {
  const reqUrl = new URL(context.request.url)
  const target = reqUrl.searchParams.get('url')
  if (!target) return new Response('Missing url', { status: 400 })

  const origin = reqUrl.origin

  function proxyUrl(url) {
    return `${origin}/proxy?target=${encodeURIComponent(url)}`
  }
  function hlsUrl(url) {
    return `${origin}/hls?url=${encodeURIComponent(url)}`
  }
  function resolve(base, rel) {
    if (/^https?:\/\//.test(rel)) return rel
    return new URL(rel, base).href
  }

  try {
    const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const text = await res.text()

    const rewritten = text.split('\n').map(line => {
      const t = line.trim()
      if (!t) return line

      // Réécrire URI= dans les tags (ex: EXT-X-KEY)
      if (t.startsWith('#') && t.includes('URI="')) {
        return t.replace(/URI="([^"]+)"/g, (_, uri) =>
          `URI="${proxyUrl(resolve(target, uri))}"`)
      }
      if (t.startsWith('#')) return line

      // Ligne URL (segment ou sous-playlist)
      const abs = resolve(target, t)
      return abs.includes('.m3u8') ? hlsUrl(abs) : proxyUrl(abs)
    }).join('\n')

    return new Response(rewritten, {
      status: res.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return new Response(String(err), { status: 502 })
  }
}
