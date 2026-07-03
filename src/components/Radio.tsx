import { useEffect, useMemo, useRef, useState } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamChannel } from '../types/xtream'
import { XtreamAPI, needsProxy, stopVideo } from '../utils/api'
import { ChannelLogo, LoadMore, PAGE_SIZE, tvProps } from './ui'
import { loadCached, saveCached, cacheKey } from '../utils/cache'
import { getHlsBufferConfig } from '../utils/buffer'
import Hls from 'hls.js'

interface Props {
  creds: XtreamCredentials
}

export default function Radio({ creds }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [stations, setStations] = useState<XtreamChannel[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<XtreamChannel | null>(null)
  const [playing, setPlaying] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const audioRef = useRef<HTMLAudioElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    // Même source que Live TV (get_live_streams) : on partage son cache pour
    // éviter de retélécharger 4000+ chaînes une seconde fois.
    const key = cacheKey('live', creds)
    function applyRadio(cats: XtreamCategory[], chans: XtreamChannel[]) {
      const radioCats = cats.filter(c => /radio/i.test(c.category_name))
      const radioCatIds = new Set(radioCats.map(c => c.category_id))
      setCategories(radioCats)
      setStations(chans.filter(c => radioCatIds.has(c.category_id)))
    }
    async function load() {
      const cached = loadCached<{ categories: XtreamCategory[]; channels: XtreamChannel[] }>(key)
      if (cached) {
        applyRadio(cached.categories, cached.channels)
        setLoading(false)
      } else {
        setLoading(true)
      }
      try {
        const [cats, chans] = await Promise.all([api.getLiveCategories(), api.getLiveStreams()])
        applyRadio(cats, chans)
        saveCached(key, { categories: cats, channels: chans })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [api, creds])

  const filtered = useMemo(() => {
    let list = stations
    if (selectedCat !== 'all') list = list.filter(s => s.category_id === selectedCat)
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(s => s.name.toLowerCase().includes(q)) }
    return list
  }, [stations, selectedCat, search])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [selectedCat, search])
  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  useEffect(() => {
    const audio = audioRef.current
    if (!active || !audio) return
    setPlaying(false)
    const m3u8 = api.getLiveStreamUrl(active.stream_id, 'm3u8')
    const url = needsProxy() ? `/hls?url=${encodeURIComponent(m3u8)}` : m3u8
    hlsRef.current?.destroy()
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, ...getHlsBufferConfig() })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(audio)
      hls.on(Hls.Events.MANIFEST_PARSED, () => audio.play().then(() => setPlaying(true)).catch(() => {}))
    } else {
      audio.src = url
      audio.play().then(() => setPlaying(true)).catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; stopVideo(audio as unknown as HTMLVideoElement) }
  }, [active, api])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => {})
    else { audio.pause(); setPlaying(false) }
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <svg className="animate-spin w-8 h-8 text-violet-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
    </div>
  )

  if (categories.length === 0) return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <div>
        <svg className="w-14 h-14 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        <p className="text-gray-500 text-sm">Aucune station radio disponible sur cet abonnement.</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full w-full overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* Liste des stations */}
      <div className="w-full sm:w-80 flex-shrink-0 bg-gray-950 sm:border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-800 space-y-2">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une station..." className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setSelectedCat('all')} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition ${selectedCat === 'all' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Toutes</button>
            {categories.map(c => (
              <button key={c.category_id} onClick={() => setSelectedCat(c.category_id)} className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition whitespace-nowrap ${selectedCat === c.category_id ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400'}`}>{c.category_name}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Aucune station</div>
          ) : visible.map(s => {
            const isActive = active?.stream_id === s.stream_id
            return (
              <div
                key={s.stream_id}
                {...tvProps(() => setActive(s))}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/40 cursor-pointer transition-colors ${isActive ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800/60'}`}
                style={{ touchAction: 'manipulation' }}
              >
                <ChannelLogo name={s.name} icon={s.stream_icon} className="w-9 h-9 flex-shrink-0 rounded-full overflow-hidden" />
                <span className={`text-sm font-medium truncate ${isActive ? 'text-orange-400' : 'text-gray-200'}`}>{s.name}</span>
                {isActive && playing && (
                  <div className="ml-auto flex items-end gap-0.5 h-3 flex-shrink-0">
                    <span className="w-0.5 bg-orange-400 animate-pulse" style={{ height: '60%' }} />
                    <span className="w-0.5 bg-orange-400 animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }} />
                    <span className="w-0.5 bg-orange-400 animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>
            )
          })}
          <LoadMore hasMore={hasMore} onMore={() => setVisibleCount(c => c + PAGE_SIZE)} />
        </div>
      </div>

      {/* Lecteur */}
      <div className="hidden sm:flex flex-1 items-center justify-center bg-gray-950">
        {!active ? (
          <div className="text-center">
            <svg className="w-14 h-14 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <p className="text-gray-500 text-sm">Sélectionne une station radio</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <ChannelLogo name={active.name} icon={active.stream_icon} className="w-40 h-40 rounded-3xl overflow-hidden shadow-2xl" textClass="text-4xl" />
            <div className="text-center">
              <div className="text-white text-xl font-bold">{active.name}</div>
              <div className="text-gray-500 text-sm mt-1">{playing ? 'En direct' : 'En pause'}</div>
            </div>
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition"
              style={{ touchAction: 'manipulation' }}
            >
              {playing ? (
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
              ) : (
                <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Mini-player mobile fixe en bas */}
      {active && (
        <div className="sm:hidden fixed bottom-16 left-0 right-0 z-30 bg-gray-900 border-t border-gray-800 flex items-center gap-3 px-4 py-2.5">
          <ChannelLogo name={active.name} icon={active.stream_icon} className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{active.name}</div>
            <div className="text-gray-500 text-xs">{playing ? 'En direct' : 'En pause'}</div>
          </div>
          <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center rounded-full bg-violet-600 flex-shrink-0" style={{ touchAction: 'manipulation' }}>
            {playing ? (
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            ) : (
              <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
