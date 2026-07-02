import { useEffect, useState, useMemo, useRef } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamChannel, EPGItem } from '../types/xtream'
import { XtreamAPI, getFavorites, toggleFavorite, needsProxy } from '../utils/api'
import Hls from 'hls.js'

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string, channel?: XtreamChannel) => void
}

type MobileStep = 'categories' | 'channels' | 'player'

export default function LiveTV({ creds, onPlay }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [channels, setChannels] = useState<XtreamChannel[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('favorites')
  const [selectedCatName, setSelectedCatName] = useState<string>('Favorites')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<number[]>(getFavorites())
  const [activeChannel, setActiveChannel] = useState<XtreamChannel | null>(null)
  const [epg, setEpg] = useState<EPGItem[]>([])
  const [epgLoading, setEpgLoading] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [mobileStep, setMobileStep] = useState<MobileStep>('categories')
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, chans] = await Promise.all([api.getLiveCategories(), api.getLiveStreams()])
        setCategories(cats)
        setChannels(chans)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [api])

  useEffect(() => {
    if (!activeChannel || !videoRef.current) return
    setPlayerError(null)
    const m3u8 = api.getLiveStreamUrl(activeChannel.stream_id, 'm3u8')
    // Page HTTP : HLS.js direct (serveur IPTV envoie CORS *). Page HTTPS : proxy /hls (mixed content).
    const url = needsProxy() ? `/hls?url=${encodeURIComponent(m3u8)}` : m3u8
    const video = videoRef.current
    hlsRef.current?.destroy()
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setPlayerError(`${data.type} / ${data.details}`)
      })
    } else {
      video.src = url
      video.play().catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [activeChannel, api])

  useEffect(() => {
    if (!activeChannel) return
    setEpg([])
    setEpgLoading(true)
    api.getEPG(activeChannel.stream_id)
      .then(data => setEpg(Array.isArray(data.epg_listings) ? data.epg_listings : []))
      .catch(() => setEpg([]))
      .finally(() => setEpgLoading(false))
  }, [activeChannel, api])

  const countByCat = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ch of channels) map[ch.category_id] = (map[ch.category_id] || 0) + 1
    return map
  }, [channels])

  const filtered = useMemo(() => {
    let list = channels
    if (selectedCat === 'favorites') list = list.filter(c => favorites.includes(c.stream_id))
    else if (selectedCat !== 'all') list = list.filter(c => c.category_id === selectedCat)
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(c => c.name.toLowerCase().includes(q)) }
    return list
  }, [channels, selectedCat, search, favorites])

  function handleFavorite(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    setFavorites(toggleFavorite(id))
  }

  function handleFullscreen() {
    if (!activeChannel) return
    const m3u8 = api.getLiveStreamUrl(activeChannel.stream_id, 'm3u8')
    const url = `/hls?url=${encodeURIComponent(m3u8)}`
    onPlay(url, activeChannel.name, activeChannel.stream_icon, activeChannel)
  }

  function handleSelectCat(id: string, name: string) {
    setSelectedCat(id)
    setSelectedCatName(name)
    setMobileStep('channels')
  }

  function handleSelectChannel(ch: XtreamChannel) {
    setActiveChannel(ch)
    setMobileStep('player')
  }

  const nowSec = Date.now() / 1000
  const nowPlaying = epg.find(e => e.start_timestamp <= nowSec && e.stop_timestamp > nowSec)
    ?? epg.find(e => Number(e.now_playing) === 1) // fallback si timestamps absents
  const upcoming = epg.filter(e => e.start_timestamp > nowSec).slice(0, 3)

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-violet-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Chargement des chaînes...</p>
      </div>
    </div>
  )

  /* ─────────────── MOBILE VIEW ─────────────── */
  const mobileCategories = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Favoris */}
        <button
          onClick={() => handleSelectCat('favorites', 'Favorites')}
          className={`w-full flex items-center gap-3 px-4 border-b border-gray-800 transition-colors ${selectedCat === 'favorites' ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`}
          style={{ minHeight: 56, touchAction: 'manipulation' }}
        >
          <svg className={`w-5 h-5 flex-shrink-0 ${selectedCat === 'favorites' ? 'text-orange-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <div className="flex-1 text-left">
            <div className={`text-sm font-medium ${selectedCat === 'favorites' ? 'text-orange-400' : 'text-gray-200'}`}>Favorites</div>
            <div className="text-xs text-gray-500">{favorites.length} chaînes</div>
          </div>
          <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        {/* Toutes */}
        <button
          onClick={() => handleSelectCat('all', 'Toutes les chaînes')}
          className={`w-full flex items-center gap-3 px-4 border-b border-gray-800 transition-colors ${selectedCat === 'all' ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`}
          style={{ minHeight: 56, touchAction: 'manipulation' }}
        >
          <svg className={`w-5 h-5 flex-shrink-0 ${selectedCat === 'all' ? 'text-orange-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
          </svg>
          <div className="flex-1 text-left">
            <div className={`text-sm font-medium ${selectedCat === 'all' ? 'text-orange-400' : 'text-gray-200'}`}>Toutes</div>
            <div className="text-xs text-gray-500">{channels.length} chaînes</div>
          </div>
          <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        {categories.map(cat => {
          const active = selectedCat === cat.category_id
          return (
            <button
              key={cat.category_id}
              onClick={() => handleSelectCat(cat.category_id, cat.category_name)}
              className={`w-full flex items-center gap-3 px-4 border-b border-gray-800/50 transition-colors text-left ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`}
              style={{ minHeight: 56, touchAction: 'manipulation' }}
            >
              <svg className={`w-5 h-5 flex-shrink-0 ${active ? 'text-orange-400' : 'text-gray-600'}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              </svg>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${active ? 'text-orange-400' : 'text-gray-200'}`}>{cat.category_name}</div>
                <div className="text-xs text-gray-500">{countByCat[cat.category_id] || 0} chaînes</div>
              </div>
              <svg className="w-4 h-4 text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          )
        })}
      </div>
    </div>
  )

  const mobileChannels = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header avec retour */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setMobileStep('categories')}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 text-gray-300"
          style={{ touchAction: 'manipulation' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">{selectedCatName}</div>
          <div className="text-gray-500 text-xs">{filtered.length} chaînes</div>
        </div>
      </div>
      {/* Recherche */}
      <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-3 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500"
            style={{ height: 44 }}
          />
        </div>
      </div>
      {/* Liste */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Aucune chaîne</div>
        ) : filtered.map((ch, idx) => {
          const active = activeChannel?.stream_id === ch.stream_id
          const isFav = favorites.includes(ch.stream_id)
          return (
            <div
              key={ch.stream_id}
              onClick={() => handleSelectChannel(ch)}
              className={`flex items-center gap-3 px-4 border-b border-gray-800/40 transition-colors ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'active:bg-gray-800'}`}
              style={{ minHeight: 60, touchAction: 'manipulation', cursor: 'pointer' }}
            >
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-gray-800 overflow-hidden">
                {ch.stream_icon ? (
                  <img src={ch.stream_icon} alt="" className="w-full h-full object-contain p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">{ch.name.slice(0, 2).toUpperCase()}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium truncate ${active ? 'text-orange-400' : 'text-gray-200'}`}>{ch.name}</div>
              </div>
              <div
                onClick={e => handleFavorite(e, ch.stream_id)}
                className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                style={{ touchAction: 'manipulation' }}
              >
                <svg className={`w-4 h-4 ${isFav ? 'text-red-400' : 'text-gray-700'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </div>
              <div className="flex-shrink-0 w-8 h-6 bg-violet-700 rounded-md flex items-center justify-center text-white text-xs font-bold">{idx + 1}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const mobilePlayer = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header retour */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setMobileStep('channels')}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 text-gray-300"
          style={{ touchAction: 'manipulation' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {activeChannel?.stream_icon && (
            <div className="w-8 h-8 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
              <img src={activeChannel.stream_icon} alt="" className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{activeChannel?.name}</div>
            {nowPlaying && <div className="text-gray-500 text-xs truncate">{decodeHtml(nowPlaying.title)}</div>}
          </div>
        </div>
        <button
          onClick={handleFullscreen}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-700 text-white"
          style={{ touchAction: 'manipulation' }}
          title="Plein écran"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        </button>
      </div>

      {/* Player */}
      <div className="flex-shrink-0 bg-black w-full" style={{ aspectRatio: '16/9' }}>
        <video ref={videoRef} className="w-full h-full object-contain" />
      </div>

      {/* EPG */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {epgLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs p-4">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Chargement EPG...
          </div>
        )}
        {!epgLoading && nowPlaying && (
          <div className="bg-orange-400/15 border-l-4 border-orange-400 p-4">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-orange-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <div className="text-white font-semibold text-sm leading-snug">{decodeHtml(nowPlaying.title)}</div>
            </div>
            {nowPlaying.description && <div className="text-gray-400 text-xs mb-2 line-clamp-2">{decodeHtml(nowPlaying.description)}</div>}
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>{formatTime(nowPlaying.start)}</span><span>{formatTime(nowPlaying.end)}</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${getProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp)}%` }} />
            </div>
          </div>
        )}
        {!epgLoading && upcoming.map((item, i) => (
          <div key={i} className="px-4 py-3 border-b border-gray-800/50">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
              </svg>
              <div className="text-gray-200 text-sm font-medium">{decodeHtml(item.title)}</div>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{formatTime(item.start)}</span><span>{formatTime(item.end)}</span>
            </div>
          </div>
        ))}
        {!epgLoading && epg.length === 0 && (
          <div className="p-4 text-gray-600 text-sm">Aucune donnée EPG.</div>
        )}
      </div>
    </div>
  )

  /* ─────────────── DESKTOP VIEW (3 colonnes) ─────────────── */
  const desktopView = (
    <div className="flex h-full w-full overflow-hidden">
      {/* Col 1 : Catégories */}
      <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        <button onClick={() => setSelectedCat('favorites')} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800 transition-colors ${selectedCat === 'favorites' ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`} style={{ touchAction: 'manipulation' }}>
          <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selectedCat === 'favorites' ? 'text-orange-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <div className="text-left min-w-0">
            <div className={`text-sm font-medium truncate ${selectedCat === 'favorites' ? 'text-orange-400' : 'text-gray-300'}`}>Favorites List</div>
            <div className="text-xs text-gray-500">Total: {favorites.length}</div>
          </div>
        </button>
        <button onClick={() => setSelectedCat('all')} className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800 transition-colors ${selectedCat === 'all' ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`} style={{ touchAction: 'manipulation' }}>
          <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selectedCat === 'all' ? 'text-orange-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
          <div className="text-left min-w-0">
            <div className={`text-sm font-medium ${selectedCat === 'all' ? 'text-orange-400' : 'text-gray-300'}`}>Toutes</div>
            <div className="text-xs text-gray-500">Total: {channels.length}</div>
          </div>
        </button>
        <div className="flex-1 overflow-y-auto">
          {categories.map(cat => {
            const active = selectedCat === cat.category_id
            return (
              <button key={cat.category_id} onClick={() => setSelectedCat(cat.category_id)} className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 transition-colors text-left ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800'}`} style={{ touchAction: 'manipulation' }}>
                <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? 'text-orange-400' : 'text-gray-600'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${active ? 'text-orange-400' : 'text-gray-300'}`}>{cat.category_name}</div>
                  <div className="text-xs text-gray-500">Total: {countByCat[cat.category_id] || 0}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Col 2 : Chaînes */}
      <div className="w-72 flex-shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Aucune chaîne</div>
          ) : filtered.map((ch, idx) => {
            const active = activeChannel?.stream_id === ch.stream_id
            const isFav = favorites.includes(ch.stream_id)
            return (
              <div key={ch.stream_id} onClick={() => setActiveChannel(ch)} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/40 cursor-pointer transition-colors group ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800/60'}`} style={{ touchAction: 'manipulation' }}>
                <div className="w-9 h-9 flex-shrink-0 rounded-md bg-gray-800 overflow-hidden">
                  {ch.stream_icon ? <img src={ch.stream_icon} alt="" className="w-full h-full object-contain p-0.5" onError={e => (e.currentTarget.style.display = 'none')} /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs font-bold">{ch.name.slice(0, 2).toUpperCase()}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${active ? 'text-orange-400' : 'text-gray-200'}`}>{ch.name}</div>
                </div>
                <div onClick={e => handleFavorite(e, ch.stream_id)} className="opacity-0 group-hover:opacity-100 transition flex-shrink-0 cursor-pointer p-1" style={{ touchAction: 'manipulation' }}>
                  <svg className={`w-3.5 h-3.5 ${isFav ? 'text-red-400' : 'text-gray-600'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </div>
                <div className="flex-shrink-0 w-8 h-6 bg-violet-700 rounded-md flex items-center justify-center text-white text-xs font-bold">{idx + 1}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Col 3 : Player + EPG 50/50 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-950 min-w-0 min-h-0">
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <svg className="w-14 h-14 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
              <p className="text-gray-500 text-sm">Sélectionne une chaîne<br/>pour voir le live et l'EPG</p>
            </div>
          </div>
        ) : (
          <>
            <div className="h-1/2 relative bg-black w-full overflow-hidden flex-shrink-0">
              <video ref={videoRef} className="w-full h-full object-contain" />
              {playerError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                  <div className="text-center">
                    <div className="text-red-400 text-xs font-mono bg-red-900/30 px-3 py-2 rounded">{playerError}</div>
                  </div>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-end justify-between">
                <div className="flex items-center gap-2">
                  {activeChannel.stream_icon && <div className="w-8 h-8 bg-white/10 rounded-md overflow-hidden flex-shrink-0"><img src={activeChannel.stream_icon} alt="" className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} /></div>}
                  <div>
                    <div className="text-white text-sm font-semibold leading-tight">{activeChannel.name}</div>
                    {nowPlaying && <div className="text-gray-300 text-xs">{formatTime(nowPlaying.start)} – {formatTime(nowPlaying.end)}</div>}
                  </div>
                </div>
                <button onClick={handleFullscreen} className="bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition" style={{ touchAction: 'manipulation' }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                </button>
              </div>
            </div>
            <div className="h-1/2 overflow-y-auto">
              {epgLoading && <div className="flex items-center gap-2 text-gray-500 text-xs p-4"><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Chargement EPG...</div>}
              {!epgLoading && nowPlaying && (
                <div className="bg-orange-400/15 border-l-4 border-orange-400 p-4">
                  <div className="flex items-start gap-2 mb-1">
                    <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <div className="min-w-0">
                      <div className="text-white font-semibold text-sm leading-snug">{decodeHtml(nowPlaying.title)}</div>
                      {nowPlaying.description && <div className="text-gray-400 text-xs mt-1 line-clamp-2">{decodeHtml(nowPlaying.description)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-2 mb-1.5"><span>{formatTime(nowPlaying.start)}</span><span>{formatTime(nowPlaying.end)}</span></div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${getProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp)}%` }} /></div>
                  <div className="text-xs text-gray-600 mt-1">{formatDate(nowPlaying.start)}</div>
                </div>
              )}
              {!epgLoading && upcoming.map((item, i) => (
                <div key={i} className="px-4 py-3 border-b border-gray-800/50">
                  <div className="flex items-start gap-2 mb-1">
                    <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
                    <div className="min-w-0">
                      <div className="text-gray-200 text-sm font-medium leading-snug">{decodeHtml(item.title)}</div>
                      {item.description && <div className="text-gray-500 text-xs mt-0.5 line-clamp-2">{decodeHtml(item.description)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-1.5"><span>{formatTime(item.start)}</span><span>{formatTime(item.end)}</span></div>
                </div>
              ))}
              {!epgLoading && epg.length === 0 && <div className="p-4 text-gray-600 text-sm">Aucune donnée EPG disponible.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Mobile: drill-down (< sm) */}
      <div className="sm:hidden flex-1 flex flex-col overflow-hidden bg-gray-950">
        {mobileStep === 'categories' && mobileCategories}
        {mobileStep === 'channels'   && mobileChannels}
        {mobileStep === 'player'     && mobilePlayer}
      </div>
      {/* Desktop: 3 colonnes (≥ sm) */}
      <div className="hidden sm:flex flex-1 overflow-hidden">
        {desktopView}
      </div>
    </div>
  )
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return dateStr }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return '' }
}

function getProgress(start: number, stop: number): number {
  const now = Math.floor(Date.now() / 1000)
  if (!start || !stop || stop <= start) return 0
  return Math.min(100, Math.max(0, ((now - start) / (stop - start)) * 100))
}

function decodeHtml(str: string): string {
  if (!str) return ''
  try {
    // Les titres/descriptions Xtream Codes sont souvent en base64
    const decoded = /^[A-Za-z0-9+/]+=*$/.test(str.trim()) ? atob(str.trim()) : str
    const t = document.createElement('textarea')
    t.innerHTML = decoded
    return t.value
  } catch { return str }
}
