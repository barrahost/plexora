import { useEffect, useState, useMemo, useRef } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamChannel, EPGItem } from '../types/xtream'
import { XtreamAPI, getFavorites, toggleFavorite, needsProxy, stopVideo, fixMojibake } from '../utils/api'
import { ChannelLogo, LiveTVSkeleton, LoadMore, PAGE_SIZE, tvProps } from './ui'
import { getXmltvEpg } from '../utils/epg'
import { loadCached, saveCached, cacheKey } from '../utils/cache'
import { getHlsBufferConfig } from '../utils/buffer'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string, channel?: XtreamChannel) => void
  jump?: { item: XtreamChannel; ts: number } | null
}

type MobileStep = 'categories' | 'channels' | 'player'

export default function LiveTV({ creds, onPlay, jump }: Props) {
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
  const [videoReady, setVideoReady] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [numBuffer, setNumBuffer] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([])
  const [currentAudio, setCurrentAudio] = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => (localStorage.getItem('iptv_channel_view') === 'grid' ? 'grid' : 'list'))
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const numTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Saut depuis la recherche globale
  useEffect(() => {
    if (!jump) return
    setSelectedCat('all')
    setActiveChannel(jump.item)
    setMobileStep('player')
  }, [jump])

  useEffect(() => {
    const key = cacheKey('live', creds)
    async function load() {
      // Affiche immédiatement la dernière copie connue (comme un lecteur natif),
      // rafraîchit en arrière-plan sans bloquer l'affichage
      const cached = loadCached<{ categories: XtreamCategory[]; channels: XtreamChannel[] }>(key)
      if (cached) {
        setCategories(cached.categories)
        setChannels(cached.channels)
        setLoading(false)
      } else {
        setLoading(true)
      }
      try {
        const [cats, chans] = await Promise.all([api.getLiveCategories(), api.getLiveStreams()])
        setCategories(cats)
        setChannels(chans)
        saveCached(key, { categories: cats, channels: chans })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [api, creds])

  useEffect(() => {
    if (!activeChannel || !videoRef.current) return
    setPlayerError(null)
    setEpg([])
    setEpgLoading(true)
    setVideoReady(false)
    setAudioTracks([])
    // Bannière info façon box TV : visible au zapping, disparaît après 4s
    setShowBanner(true)
    if (bannerTimer.current) clearTimeout(bannerTimer.current)
    bannerTimer.current = setTimeout(() => setShowBanner(false), 4000)
    const video = videoRef.current
    let cancelled = false
    const onPlaying = () => setVideoReady(true)
    video.addEventListener('playing', onPlaying)

    // 1) Charger l'EPG AVANT d'ouvrir le flux : avec max_connections=1,
    // le serveur refuse souvent les requêtes API pendant qu'un flux est ouvert.
    // Si get_short_epg est vide (fréquent sur ce serveur), fallback sur le
    // guide XMLTV complet (téléchargé une fois par session).
    const epgPromise = api.getEPG(activeChannel.stream_id, 24)
      .then(data => (Array.isArray(data.epg_listings) ? data.epg_listings : []))
      .catch(() => [] as EPGItem[])
      .then(async list => {
        if (list.length === 0) {
          try { list = await getXmltvEpg(creds, activeChannel!.epg_channel_id) } catch { /* pas de guide */ }
        }
        if (!cancelled) setEpg(list)
      })
      .finally(() => { if (!cancelled) setEpgLoading(false) })

    // 2) Puis démarrer la lecture (sans attendre plus de 5s si l'EPG traîne)
    // Fallback : si le flux HLS (.m3u8) échoue, retenter en MPEG-TS brut (.ts)
    // via mpegts.js — certaines chaînes ne fonctionnent qu'ainsi.
    function startMpegtsFallback() {
      if (cancelled || !mpegts.isSupported()) {
        if (!cancelled) setPlayerError('Cette chaîne ne répond pas pour le moment.')
        return
      }
      hlsRef.current?.destroy(); hlsRef.current = null
      const ts = api.getLiveStreamUrl(activeChannel!.stream_id, 'ts')
      const url = needsProxy() ? `/proxy?target=${encodeURIComponent(ts)}` : ts
      const player = mpegts.createPlayer({ type: 'mse', isLive: true, url })
      mpegtsRef.current = player
      player.attachMediaElement(video)
      player.on(mpegts.Events.ERROR, () => {
        if (!cancelled) setPlayerError('Cette chaîne ne répond pas pour le moment.')
      })
      player.load()
      player.play()?.catch?.(() => {})
    }

    function startPlayback() {
      if (cancelled) return
      const m3u8 = api.getLiveStreamUrl(activeChannel!.stream_id, 'm3u8')
      // Page HTTP : HLS.js direct (serveur IPTV envoie CORS *). Page HTTPS : proxy /hls (mixed content).
      const url = needsProxy() ? `/hls?url=${encodeURIComponent(m3u8)}` : m3u8
      hlsRef.current?.destroy()
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, ...getHlsBufferConfig() })
        hlsRef.current = hls
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          // Le manifest HLS ne répond pas → tenter le flux .ts brut avant d'abandonner
          if (data.details.includes('manifestLoad') || data.details.includes('manifestParsing') || data.details.includes('levelLoad')) {
            startMpegtsFallback()
          } else {
            setPlayerError(friendlyPlayerError(data.details))
          }
        })
        // Pistes audio multiples (VF/VO...) si le flux HLS les déclare
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          if (cancelled) return
          const tracks = hls.audioTracks.map((t, i) => ({ id: i, name: t.name || t.lang || `Piste ${i + 1}` }))
          setAudioTracks(tracks.length > 1 ? tracks : [])
          setCurrentAudio(hls.audioTrack)
        })
      } else {
        video.src = url
        video.play().catch(() => {})
      }
    }
    Promise.race([epgPromise, new Promise(r => setTimeout(r, 5000))]).then(startPlayback)

    return () => {
      cancelled = true
      video.removeEventListener('playing', onPlaying)
      hlsRef.current?.destroy(); hlsRef.current = null
      mpegtsRef.current?.destroy(); mpegtsRef.current = null
      stopVideo(video)
    }
  }, [activeChannel, api, retryTick])

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

  // Rendu progressif (4000+ chaînes) — le zapping numérique garde la liste complète
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [selectedCat, search])
  const visibleChannels = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length
  const loadMore = () => setVisibleCount(c => c + PAGE_SIZE)

  // Zapping numérique : taper le numéro de chaîne (1.5s de délai ou Entrée pour valider)
  const filteredRef = useRef(filtered)
  filteredRef.current = filtered
  const numBufferRef = useRef('')
  useEffect(() => {
    const zap = () => {
      const n = parseInt(numBufferRef.current, 10)
      numBufferRef.current = ''
      setNumBuffer('')
      const ch = filteredRef.current[n - 1]
      if (ch) { setActiveChannel(ch); setMobileStep('player') }
    }
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) {
        numBufferRef.current = (numBufferRef.current + e.key).slice(0, 4)
        setNumBuffer(numBufferRef.current)
        if (numTimer.current) clearTimeout(numTimer.current)
        numTimer.current = setTimeout(zap, 1500)
      } else if (e.key === 'Enter' && numBufferRef.current) {
        if (numTimer.current) clearTimeout(numTimer.current)
        zap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (numTimer.current) clearTimeout(numTimer.current)
    }
  }, [])

  function handleFavorite(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    setFavorites(toggleFavorite(id))
  }

  function toggleViewMode() {
    setViewMode(m => {
      const next = m === 'list' ? 'grid' : 'list'
      localStorage.setItem('iptv_channel_view', next)
      return next
    })
  }

  const ViewModeToggle = (
    <button
      onClick={toggleViewMode}
      className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
      style={{ touchAction: 'manipulation' }}
      title={viewMode === 'list' ? 'Vue grille' : 'Vue liste'}
    >
      {viewMode === 'list' ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
      )}
    </button>
  )

  function handleFullscreen() {
    if (!activeChannel) return
    const m3u8 = api.getLiveStreamUrl(activeChannel.stream_id, 'm3u8')
    const url = `/hls?url=${encodeURIComponent(m3u8)}`
    onPlay(url, activeChannel.name, activeChannel.stream_icon, activeChannel)
  }

  // Catch-up : rejoue un programme déjà diffusé (nécessite tv_archive sur la chaîne)
  function handleCatchup(item: EPGItem) {
    if (!activeChannel) return
    const durationMin = Math.round((item.stop_timestamp - item.start_timestamp) / 60)
    const direct = api.getCatchupUrl(activeChannel.stream_id, item.start_timestamp, durationMin)
    const url = needsProxy() ? `/proxy?target=${encodeURIComponent(direct)}` : direct
    onPlay(url, `${activeChannel.name} · ${decodeHtml(item.title)}`, activeChannel.stream_icon)
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

  if (loading) return <LiveTVSkeleton />

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
        {ViewModeToggle}
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
        ) : viewMode === 'grid' ? (
          <ChannelGrid channels={visibleChannels} activeChannel={activeChannel} favorites={favorites} onSelect={handleSelectChannel} onFavorite={handleFavorite} hasMore={hasMore} onMore={loadMore} />
        ) : (
          <>
            {visibleChannels.map((ch, idx) => {
              const active = activeChannel?.stream_id === ch.stream_id
              const isFav = favorites.includes(ch.stream_id)
              return (
                <div
                  key={ch.stream_id}
                  onClick={() => handleSelectChannel(ch)}
                  className={`flex items-center gap-3 px-4 border-b border-gray-800/40 transition-colors ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'active:bg-gray-800'}`}
                  style={{ minHeight: 60, touchAction: 'manipulation', cursor: 'pointer' }}
                >
                  <ChannelLogo name={ch.name} icon={ch.stream_icon} className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden" />
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
            <LoadMore hasMore={hasMore} onMore={loadMore} />
          </>
        )}
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
          {activeChannel && <ChannelLogo name={activeChannel.name} icon={activeChannel.stream_icon} className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" />}
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
      <div className="flex-shrink-0 bg-black w-full relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <video ref={videoRef} className={`w-full h-full object-contain transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`} />
        {!videoReady && !playerError && activeChannel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-950">
            <ChannelLogo name={activeChannel.name} icon={activeChannel.stream_icon} className="w-14 h-14 rounded-xl overflow-hidden shadow-2xl" textClass="text-lg" />
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Connexion...
            </div>
          </div>
        )}
        {playerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950 p-4">
            <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <div className="text-gray-300 text-sm text-center">{playerError}</div>
            <button onClick={() => setRetryTick(t => t + 1)} className="text-xs px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition" style={{ touchAction: 'manipulation' }}>Réessayer</button>
          </div>
        )}
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
        {!epgLoading && epg.length > 0 && (
          <EPGTimeline items={epg} nowSec={nowSec} canArchive={activeChannel?.tv_archive === 1} onCatchup={handleCatchup} />
        )}
        {!epgLoading && epg.length === 0 && (
          <div className="p-4 text-gray-600 text-sm">Guide des programmes non fourni pour cette chaîne.</div>
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
        <div className="p-3 border-b border-gray-800 flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500" />
          </div>
          {ViewModeToggle}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-600 text-sm">Aucune chaîne</div>
          ) : viewMode === 'grid' ? (
            <ChannelGrid channels={visibleChannels} activeChannel={activeChannel} favorites={favorites} onSelect={setActiveChannel} onFavorite={handleFavorite} hasMore={hasMore} onMore={loadMore} />
          ) : (
            <>
              {visibleChannels.map((ch, idx) => {
                const active = activeChannel?.stream_id === ch.stream_id
                const isFav = favorites.includes(ch.stream_id)
                return (
                  <div key={ch.stream_id} {...tvProps(() => setActiveChannel(ch))} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/40 cursor-pointer transition-colors group ${active ? 'bg-orange-500/20 border-l-4 border-l-orange-400' : 'hover:bg-gray-800/60'}`} style={{ touchAction: 'manipulation' }}>
                    <ChannelLogo name={ch.name} icon={ch.stream_icon} className="w-9 h-9 flex-shrink-0 rounded-md overflow-hidden" />
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
              <LoadMore hasMore={hasMore} onMore={loadMore} />
            </>
          )}
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
            <div className="h-1/2 relative bg-black w-full overflow-hidden flex-shrink-0 group/player">
              <video ref={videoRef} className={`w-full h-full object-contain transition-opacity duration-300 ${videoReady ? 'opacity-100' : 'opacity-0'}`} />
              {/* Overlay de chargement : logo chaîne pendant l'ouverture du flux */}
              {!videoReady && !playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950">
                  <ChannelLogo name={activeChannel.name} icon={activeChannel.stream_icon} className="w-20 h-20 rounded-2xl overflow-hidden shadow-2xl" textClass="text-2xl" />
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    Connexion au flux...
                  </div>
                </div>
              )}
              {playerError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-950 p-4">
                  <svg className="w-10 h-10 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  <div className="text-gray-300 text-sm text-center max-w-xs">{playerError}</div>
                  <button onClick={() => setRetryTick(t => t + 1)} className="text-xs px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition" style={{ touchAction: 'manipulation' }}>Réessayer</button>
                </div>
              )}
              {/* Bannière info façon box TV : 4s au zapping, réapparaît au survol */}
              <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-8 flex items-end justify-between transition-opacity duration-500 ${showBanner ? 'opacity-100' : 'opacity-0 group-hover/player:opacity-100'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <ChannelLogo name={activeChannel.name} icon={activeChannel.stream_icon} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold leading-tight truncate">{activeChannel.name}</div>
                    {nowPlaying && (
                      <>
                        <div className="text-gray-300 text-xs truncate">{decodeHtml(nowPlaying.title)}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-gray-400 text-[10px]">{formatTime(nowPlaying.start)}</span>
                          <div className="w-24 h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-400 rounded-full" style={{ width: `${getProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp)}%` }} />
                          </div>
                          <span className="text-gray-400 text-[10px]">{formatTime(nowPlaying.end)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {audioTracks.length > 0 && (
                    <select
                      value={currentAudio}
                      onChange={e => {
                        const i = Number(e.target.value)
                        setCurrentAudio(i)
                        if (hlsRef.current) hlsRef.current.audioTrack = i
                      }}
                      className="bg-black/60 text-white text-xs rounded-lg px-2 py-2 border border-gray-700 focus:outline-none"
                      title="Piste audio"
                    >
                      {audioTracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  {document.pictureInPictureEnabled && (
                    <button
                      onClick={() => {
                        const v = videoRef.current
                        if (!v) return
                        if (document.pictureInPictureElement) document.exitPictureInPicture()
                        else v.requestPictureInPicture().catch(() => {})
                      }}
                      className="bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition"
                      style={{ touchAction: 'manipulation' }}
                      title="Fenêtre flottante (PiP)"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor"/></svg>
                    </button>
                  )}
                  <button onClick={handleFullscreen} className="bg-black/60 hover:bg-black/80 text-white rounded-lg p-2 transition" style={{ touchAction: 'manipulation' }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                  </button>
                </div>
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
              {!epgLoading && epg.length > 0 && (
                <EPGTimeline items={epg} nowSec={nowSec} canArchive={activeChannel?.tv_archive === 1} onCatchup={handleCatchup} />
              )}
              {!epgLoading && epg.length === 0 && <div className="p-4 text-gray-600 text-sm">Guide des programmes non fourni pour cette chaîne.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {/* Zapping numérique : numéro tapé affiché façon box TV */}
      {numBuffer && (
        <div className="absolute top-4 right-4 z-30 bg-black/80 border border-gray-700 rounded-xl px-4 py-2 shadow-2xl">
          <span className="text-3xl font-bold text-white tracking-widest font-mono">{numBuffer}</span>
        </div>
      )}
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

// Traduit les erreurs techniques HLS.js en message compréhensible
function friendlyPlayerError(details: string): string {
  if (details.includes('manifestLoad') || details.includes('manifestParsing'))
    return 'Cette chaîne ne répond pas pour le moment.'
  if (details.includes('levelLoad') || details.includes('fragLoad'))
    return 'Le flux de cette chaîne est interrompu.'
  if (details.includes('bufferStalled'))
    return 'Connexion trop lente, le flux est en pause.'
  if (details.includes('mediaError') || details.includes('bufferAppend'))
    return 'Format vidéo non supporté par le navigateur.'
  return 'Impossible de lire cette chaîne.'
}

// ── Grille de chaînes (mode alternatif à la liste) ──────────────────────────
function ChannelGrid({ channels, activeChannel, favorites, onSelect, onFavorite, hasMore, onMore }: {
  channels: XtreamChannel[]
  activeChannel: XtreamChannel | null
  favorites: number[]
  onSelect: (ch: XtreamChannel) => void
  onFavorite: (e: React.MouseEvent, id: number) => void
  hasMore: boolean
  onMore: () => void
}) {
  return (
    <div className="p-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {channels.map((ch, idx) => {
          const active = activeChannel?.stream_id === ch.stream_id
          const isFav = favorites.includes(ch.stream_id)
          return (
            <div
              key={ch.stream_id}
              {...tvProps(() => onSelect(ch))}
              className={`group relative rounded-xl overflow-hidden cursor-pointer transition ${active ? 'ring-2 ring-orange-400' : 'hover:ring-2 hover:ring-violet-500'}`}
              style={{ touchAction: 'manipulation' }}
            >
              <ChannelLogo name={ch.name} icon={ch.stream_icon} className="w-full aspect-square" textClass="text-lg" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-4">
                <span className={`text-[10px] font-medium line-clamp-1 ${active ? 'text-orange-400' : 'text-gray-200'}`}>{ch.name}</span>
              </div>
              <span className="absolute top-1 left-1 text-[9px] font-bold bg-black/70 text-white px-1 py-0.5 rounded">{idx + 1}</span>
              <div
                onClick={e => onFavorite(e, ch.stream_id)}
                className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                style={{ touchAction: 'manipulation' }}
              >
                <svg className={`w-3.5 h-3.5 drop-shadow ${isFav ? 'text-red-400' : 'text-white'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </div>
            </div>
          )
        })}
      </div>
      <LoadMore hasMore={hasMore} onMore={onMore} />
    </div>
  )
}

// ── Timeline EPG horizontale ─────────────────────────────────────────────────
// Cartes défilables : programmes passés (catch-up si dispo), en cours, à venir.
function EPGTimeline({ items, nowSec, canArchive, onCatchup }: {
  items: EPGItem[]
  nowSec: number
  canArchive: boolean
  onCatchup: (item: EPGItem) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-800/50" style={{ scrollbarWidth: 'thin' }}>
      {items.map((item, i) => {
        const isPast = item.stop_timestamp <= nowSec
        const isNow = item.start_timestamp <= nowSec && item.stop_timestamp > nowSec
        const clickable = isPast && canArchive
        return (
          <div
            key={i}
            {...(clickable ? tvProps(() => onCatchup(item)) : { onClick: undefined })}
            className={`flex-shrink-0 w-36 rounded-lg p-2.5 border transition ${
              isNow ? 'bg-orange-400/15 border-orange-400/50'
              : clickable ? 'bg-gray-800/80 border-gray-700 hover:border-violet-500 cursor-pointer'
              : 'bg-gray-800/40 border-gray-800'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-[10px] font-mono ${isNow ? 'text-orange-400' : 'text-gray-500'}`}>{formatTime(item.start)}</span>
              {isNow && <span className="text-[9px] font-bold text-orange-400 uppercase">Direct</span>}
              {clickable && <svg className="w-3 h-3 text-violet-400" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
            </div>
            <div className={`text-xs font-medium leading-snug line-clamp-2 ${isPast && !clickable ? 'text-gray-600' : 'text-gray-200'}`}>
              {decodeHtml(item.title)}
            </div>
            {isNow && (
              <div className="h-1 bg-white/20 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${getProgress(item.start_timestamp, item.stop_timestamp)}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function decodeHtml(str: string): string {
  if (!str) return ''
  try {
    let decoded = str
    // Les titres get_short_epg sont en base64 ; les titres XMLTV sont en clair.
    // On ne décode que si le résultat est du texte lisible, sinon un mot
    // ordinaire ("Journal") serait transformé en binaire.
    const trimmed = str.trim()
    if (trimmed.length >= 8 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
      const binary = atob(trimmed)
      // atob() renvoie une chaîne latin1 (1 char = 1 octet) ; le contenu réel
      // est de l'UTF-8 → sans reconversion, les accents s'affichent "Ã©" etc.
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      const candidate = new TextDecoder('utf-8').decode(bytes)
      const printable = candidate.split('').filter(c => c >= ' ' || c === '\n').length / candidate.length
      if (printable > 0.9) decoded = candidate
    }
    const t = document.createElement('textarea')
    t.innerHTML = decoded
    return fixMojibake(t.value)
  } catch { return str }
}
