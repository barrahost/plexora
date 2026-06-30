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

export function saveCredentials(creds: XtreamCredentials) {
  localStorage.setItem('iptv_creds', JSON.stringify(creds))
}

export function loadCredentials(): XtreamCredentials | null {
  const raw = localStorage.getItem('iptv_creds')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearCredentials() {
  localStorage.removeItem('iptv_creds')
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
