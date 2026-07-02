import type { XtreamCredentials, EPGItem } from '../types/xtream'
import { needsProxy, normalizeServerUrl } from './api'

// ── Fallback EPG via XMLTV ───────────────────────────────────────────────────
// get_short_epg est souvent vide sur ce serveur alors que le guide complet
// xmltv.php contient les données. Comme les lecteurs natifs : on télécharge
// le XMLTV une fois par session, on le parse, on le garde en mémoire.

const TTL_MS = 6 * 3600 * 1000 // re-télécharger après 6h

let cache: { key: string; loadedAt: number; byChannel: Map<string, EPGItem[]> } | null = null
let loading: Promise<Map<string, EPGItem[]>> | null = null

async function ensureLoaded(creds: XtreamCredentials): Promise<void> {
  const key = `${creds.url}|${creds.username}`
  const fresh = cache && cache.key === key && Date.now() - cache.loadedAt < TTL_MS
  if (fresh) return
  if (!loading) loading = fetchAndParse(creds).finally(() => { loading = null })
  const byChannel = await loading
  cache = { key, loadedAt: Date.now(), byChannel }
}

// Précharge le guide en arrière-plan dès l'ouverture de l'appli :
// l'EPG est alors instantané sur toutes les chaînes.
export function prefetchXmltv(creds: XtreamCredentials): void {
  ensureLoaded(creds).catch(() => { /* pas de guide disponible */ })
}

export async function getXmltvEpg(creds: XtreamCredentials, epgChannelId: string): Promise<EPGItem[]> {
  if (!epgChannelId) return []
  await ensureLoaded(creds)
  const now = Date.now() / 1000
  // Programme en cours + suivants uniquement
  return (cache!.byChannel.get(epgChannelId) ?? []).filter(p => p.stop_timestamp > now).slice(0, 6)
}

async function fetchAndParse(creds: XtreamCredentials): Promise<Map<string, EPGItem[]>> {
  const base = normalizeServerUrl(creds.url)
  const direct = `${base}/xmltv.php?username=${creds.username}&password=${creds.password}`
  const url = needsProxy() ? `/proxy?target=${encodeURIComponent(direct)}` : direct
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  const map = new Map<string, EPGItem[]>()
  // Parsing regex : DOMParser sur ~20 MB est trop lourd, on scanne les blocs <programme>
  const progRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g
  const attrRe = (name: string, s: string) => {
    const m = s.match(new RegExp(`${name}="([^"]*)"`))
    return m ? m[1] : ''
  }
  const tagRe = (name: string, s: string) => {
    const m = s.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
    return m ? unescapeXml(m[1]) : ''
  }
  let m: RegExpExecArray | null
  while ((m = progRe.exec(text)) !== null) {
    const attrs = m[1]
    const body = m[2]
    const channel = attrRe('channel', attrs)
    if (!channel) continue
    const startTs = parseXmltvDate(attrRe('start', attrs))
    const stopTs = parseXmltvDate(attrRe('stop', attrs))
    if (!startTs || !stopTs) continue
    const item: EPGItem = {
      id: '', epg_id: '', lang: '',
      channel_id: channel,
      title: tagRe('title', body),
      description: tagRe('desc', body),
      start: new Date(startTs * 1000).toISOString(),
      end: new Date(stopTs * 1000).toISOString(),
      start_timestamp: startTs,
      stop_timestamp: stopTs,
      now_playing: 0,
      has_archive: 0,
    }
    const list = map.get(channel)
    if (list) list.push(item)
    else map.set(channel, [item])
  }
  // Trier chaque chaîne par heure de début
  map.forEach(list => list.sort((a, b) => a.start_timestamp - b.start_timestamp))
  return map
}

// "20260702193000 +0200" → timestamp unix (secondes)
function parseXmltvDate(s: string): number {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/)
  if (!m) return 0
  const [, y, mo, d, h, mi, se, tz] = m
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : 'Z'
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`)
  return isNaN(t) ? 0 : Math.floor(t / 1000)
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}
