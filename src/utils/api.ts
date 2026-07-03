import type {
  XtreamCredentials,
  XtreamAccountInfo,
  XtreamCategory,
  XtreamChannel,
  XtreamMovie,
  XtreamSeries,
  XtreamSeriesInfo,
  EPGItem,
} from '../types/xtream'

// Le proxy n'est nécessaire que si la page est servie en HTTPS :
// le navigateur bloque alors les requêtes HTTP directes (mixed content).
export function needsProxy(): boolean {
  return window.location.protocol === 'https:'
}

// Coupe réellement la connexion au flux : pause + retrait du src + load().
// Un simple `video.src = ''` laisse la connexion HTTP ouverte côté serveur,
// ce qui bloque le compte IPTV (max_connections=1).
export function stopVideo(video: HTMLVideoElement | null): void {
  if (!video) return
  try {
    video.pause()
    video.removeAttribute('src')
    video.load()
  } catch { /* ignore */ }
}

// Corrige le double encodage UTF-8 (bug côté serveur, pas côté navigateur) :
// certains champs texte du panel Xtream contiennent des octets UTF-8 valides
// qui ont été réinterprétés en Latin-1 puis ré-encodés en UTF-8, produisant
// des séquences "Ã©", "Ã¡"... au lieu des accents. Détectable et réparable :
// on ré-encode ces caractères en octets Latin-1 puis on les redécode en UTF-8.
export function fixMojibake(s: string): string {
  if (!/[ÃÂ][\x80-\xBF]/.test(s)) return s
  try {
    const bytes = Uint8Array.from(s, c => c.charCodeAt(0) & 0xFF)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { return s }
}

function fixMojibakeDeep<T>(value: T): T {
  if (typeof value === 'string') return fixMojibake(value) as unknown as T
  if (Array.isArray(value)) return value.map(fixMojibakeDeep) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = fixMojibakeDeep(v)
    return out as T
  }
  return value
}

// Normalise l'URL serveur : trim, ajoute http:// si aucun schéma, retire le / final.
// Sans ça, une URL tapée sans http:// devient une requête relative qui échoue toujours.
export function normalizeServerUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u
}

export class XtreamAPI {
  private creds: XtreamCredentials

  constructor(creds: XtreamCredentials) {
    this.creds = { ...creds, url: normalizeServerUrl(creds.url), username: creds.username.trim(), password: creds.password.trim() }
  }

  private get base() {
    const url = this.creds.url.replace(/\/$/, '')
    return `${url}/player_api.php?username=${this.creds.username}&password=${this.creds.password}`
  }

  private async fetch<T>(params: string): Promise<T> {
    const directUrl = `${this.base}&${params}`
    // Page HTTPS → proxy obligatoire (mixed content bloqué par le navigateur).
    // Page HTTP (dev ou hébergement HTTP) → appel direct, le serveur IPTV envoie CORS *.
    const url = needsProxy() ? `/proxy?target=${encodeURIComponent(directUrl)}` : directUrl
    // Retry doux : 2 tentatives max, backoff long. Le serveur bannit les IPs
    // trop actives → ne jamais marteler.
    let lastErr: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 4000))
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        const res = await fetch(url, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return fixMojibakeDeep(await res.json())
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  }

  async getAccountInfo(): Promise<XtreamAccountInfo> {
    return this.fetch<XtreamAccountInfo>('')
  }

  async getLiveCategories(): Promise<XtreamCategory[]> {
    return this.fetch<XtreamCategory[]>('action=get_live_categories')
  }

  async getLiveStreams(categoryId?: string): Promise<XtreamChannel[]> {
    const param = categoryId ? `&category_id=${categoryId}` : ''
    return this.fetch<XtreamChannel[]>(`action=get_live_streams${param}`)
  }

  async getVodCategories(): Promise<XtreamCategory[]> {
    return this.fetch<XtreamCategory[]>('action=get_vod_categories')
  }

  async getVodStreams(categoryId?: string): Promise<XtreamMovie[]> {
    const param = categoryId ? `&category_id=${categoryId}` : ''
    return this.fetch<XtreamMovie[]>(`action=get_vod_streams${param}`)
  }

  async getSeriesCategories(): Promise<XtreamCategory[]> {
    return this.fetch<XtreamCategory[]>('action=get_series_categories')
  }

  async getSeries(categoryId?: string): Promise<XtreamSeries[]> {
    const param = categoryId ? `&category_id=${categoryId}` : ''
    return this.fetch<XtreamSeries[]>(`action=get_series${param}`)
  }

  async getSeriesInfo(seriesId: number): Promise<XtreamSeriesInfo> {
    return this.fetch<XtreamSeriesInfo>(`action=get_series_info&series_id=${seriesId}`)
  }

  async getVodInfo(vodId: number): Promise<{ info: Record<string, unknown>; movie_data: Record<string, unknown> }> {
    return this.fetch(`action=get_vod_info&vod_id=${vodId}`)
  }

  async getEPG(streamId: number, limit = 5): Promise<{ epg_listings: EPGItem[] }> {
    return this.fetch<{ epg_listings: EPGItem[] }>(`action=get_short_epg&stream_id=${streamId}&limit=${limit}`)
  }

  private streamUrl(path: string): string {
    const base = this.creds.url.replace(/\/$/, '')
    return `${base}/${path}`
  }

  getLiveStreamUrl(streamId: number, ext = 'ts'): string {
    return this.streamUrl(`live/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`)
  }

  // Catch-up / timeshift Xtream : format standard {server}/timeshift/{user}/{pass}/{duration_min}/{YYYY-MM-DD:HH-MM}/{id}.ts
  // Composants en UTC (déterministe, indépendant du fuseau du navigateur) — les
  // timestamps EPG sont déjà normalisés en UTC lors du parsing XMLTV/get_short_epg.
  getCatchupUrl(streamId: number, startTimestampSec: number, durationMinutes: number): string {
    const d = new Date(startTimestampSec * 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    const start = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}:${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`
    const base = this.creds.url.replace(/\/$/, '')
    return `${base}/timeshift/${this.creds.username}/${this.creds.password}/${Math.max(1, Math.ceil(durationMinutes))}/${start}/${streamId}.ts`
  }

  getVodStreamUrl(streamId: number, ext = 'mp4'): string {
    return this.streamUrl(`movie/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`)
  }

  getSeriesStreamUrl(streamId: number, ext = 'mp4'): string {
    return this.streamUrl(`series/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`)
  }
}

// ── Playlists multi-compte ──────────────────────────────────────────────────

import type { XtreamPlaylist } from '../types/xtream'

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getPlaylists(): XtreamPlaylist[] {
  try {
    const raw = localStorage.getItem('iptv_playlists')
    if (raw) return JSON.parse(raw) as XtreamPlaylist[]
    // Migration : si ancienne session unique existe
    const old = localStorage.getItem('iptv_creds')
    if (old) {
      const c = JSON.parse(old) as XtreamCredentials
      const pl: XtreamPlaylist = { id: genId(), name: c.url.replace(/https?:\/\//, '').split('/')[0], ...c }
      savePlaylists([pl])
      return [pl]
    }
    return []
  } catch { return [] }
}

export function savePlaylists(playlists: XtreamPlaylist[]): void {
  localStorage.setItem('iptv_playlists', JSON.stringify(playlists))
}

export function getActivePlaylistId(): string | null {
  return localStorage.getItem('iptv_active_id')
}

export function setActivePlaylistId(id: string): void {
  localStorage.setItem('iptv_active_id', id)
}

export function getActivePlaylist(): XtreamPlaylist | null {
  const playlists = getPlaylists()
  if (playlists.length === 0) return null
  const id = getActivePlaylistId()
  return playlists.find(p => p.id === id) ?? playlists[0]
}

export function addPlaylist(pl: Omit<XtreamPlaylist, 'id'>): XtreamPlaylist {
  const playlists = getPlaylists()
  const newPl = { ...pl, id: genId() }
  savePlaylists([...playlists, newPl])
  return newPl
}

export function updatePlaylist(id: string, patch: Partial<Omit<XtreamPlaylist, 'id'>>): void {
  const playlists = getPlaylists().map(p => p.id === id ? { ...p, ...patch } : p)
  savePlaylists(playlists)
}

export function deletePlaylist(id: string): void {
  savePlaylists(getPlaylists().filter(p => p.id !== id))
  if (getActivePlaylistId() === id) localStorage.removeItem('iptv_active_id')
}

// ── Compat ancienne API (session unique) ────────────────────────────────────

export function saveCredentials(creds: XtreamCredentials) {
  // Upsert dans la liste des playlists
  const active = getActivePlaylist()
  if (active) {
    updatePlaylist(active.id, creds)
  } else {
    const newPl = addPlaylist({ name: creds.url.replace(/https?:\/\//, '').split('/')[0], ...creds })
    setActivePlaylistId(newPl.id)
  }
  localStorage.setItem('iptv_creds', JSON.stringify(creds))
}

export function loadCredentials(): XtreamCredentials | null {
  const pl = getActivePlaylist()
  if (pl) return { url: pl.url, username: pl.username, password: pl.password }
  return null
}

export function clearCredentials() {
  localStorage.removeItem('iptv_creds')
  localStorage.removeItem('iptv_active_id')
}

export function getFavorites(): number[] {
  const raw = localStorage.getItem('iptv_favorites')
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function toggleFavorite(id: number): number[] {
  const favs = getFavorites()
  const idx = favs.indexOf(id)
  if (idx >= 0) favs.splice(idx, 1)
  else favs.push(id)
  localStorage.setItem('iptv_favorites', JSON.stringify(favs))
  return favs
}
