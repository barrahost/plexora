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

export class XtreamAPI {
  private creds: XtreamCredentials

  constructor(creds: XtreamCredentials) {
    this.creds = creds
  }

  private get base() {
    const url = this.creds.url.replace(/\/$/, '')
    return `${url}/player_api.php?username=${this.creds.username}&password=${this.creds.password}`
  }

  private async fetch<T>(params: string): Promise<T> {
    const res = await fetch(`${this.base}&${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
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

  async getEPG(streamId: number): Promise<{ epg_listings: EPGItem[] }> {
    return this.fetch<{ epg_listings: EPGItem[] }>(`action=get_short_epg&stream_id=${streamId}&limit=5`)
  }

  getLiveStreamUrl(streamId: number, ext = 'ts'): string {
    const url = this.creds.url.replace(/\/$/, '')
    return `${url}/live/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`
  }

  getVodStreamUrl(streamId: number, ext = 'mp4'): string {
    const url = this.creds.url.replace(/\/$/, '')
    return `${url}/movie/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`
  }

  getSeriesStreamUrl(streamId: number, ext = 'mp4'): string {
    const url = this.creds.url.replace(/\/$/, '')
    return `${url}/series/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`
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
