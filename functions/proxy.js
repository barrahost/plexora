export async function onRequest(context) {
  const url = new URL(context.request.url)
  const target = url.searchParams.get('target')
  if (!target) return new Response(JSON.stringify({ error: 'Missing target' }), { status: 400 })

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    }
    try {
      const t = new URL(target)
      headers['Referer'] = `${t.protocol}//${t.host}/`
      headers['Origin'] = `${t.protocol}//${t.host}`
    } catch { /* URL invalide */ }

    // Transférer les cookies de session IPTV
    const cookie = context.request.headers.get('cookie')
    if (cookie) headers['Cookie'] = cookie

    // Transférer Range pour les vidéos (scrubbing, reprise)
    const range = context.request.headers.get('range')
    if (range) headers['Range'] = range

    const res = await fetch(target, { headers })

    // Headers de réponse à transmettre au navigateur
    const respHeaders = {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
    const contentLength = res.headers.get('Content-Length')
    if (contentLength) respHeaders['Content-Length'] = contentLength
    const contentRange = res.headers.get('Content-Range')
    if (contentRange) respHeaders['Content-Range'] = contentRange
    const acceptRanges = res.headers.get('Accept-Ranges')
    if (acceptRanges) respHeaders['Accept-Ranges'] = acceptRanges

    // Streaming direct — pas de buffering en mémoire
    return new Response(res.body, {
      status: res.status,
      headers: respHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 502 })
  }
}
