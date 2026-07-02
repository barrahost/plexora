import { useEffect, useState, useMemo, useRef } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamSeries } from '../types/xtream'
import { XtreamAPI, needsProxy, stopVideo } from '../utils/api'
import Hls from 'hls.js'

interface EpisodeData {
  id: string
  episode_num: number
  title: string
  season?: number | string
  container_extension?: string
  info?: {
    movie_image?: string
    duration?: string
    plot?: string
    releasedate?: string
    rating?: string
  }
}

interface SeriesInfoData {
  info?: {
    name?: string
    plot?: string
    cast?: string
    director?: string
    genre?: string
    release_date?: string
    rating?: string
    cover?: string
    backdrop_path?: unknown
  }
  episodes?: Record<string, EpisodeData[]>
}

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string) => void
}

export default function SeriesView({ creds, onPlay }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [series, setSeries] = useState<XtreamSeries[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [selectedCatName, setSelectedCatName] = useState<string>('Toutes les séries')
  const [mobileStep, setMobileStep] = useState<'categories' | 'series' | 'detail'>('categories')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<XtreamSeries | null>(null)
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoData | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<string>('1')
  const [infoError, setInfoError] = useState(false)
  const [activeEp, setActiveEp] = useState<EpisodeData | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, srs] = await Promise.all([api.getSeriesCategories(), api.getSeries()])
        setCategories(Array.isArray(cats) ? cats : [])
        setSeries(Array.isArray(srs) ? srs : [])
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [api])

  const loadInfo = useMemo(() => (s: XtreamSeries) => {
    setSeriesInfo(null)
    setActiveEp(null)
    setInfoError(false)
    setLoadingInfo(true)
    api.getSeriesInfo(s.series_id)
      .then(info => {
        const data = info as SeriesInfoData
        // Certains panels Xtream renvoient episodes en tableau [[ep,...],[ep,...]] au lieu d'un objet {"1":[...]}
        if (Array.isArray(data.episodes)) {
          const obj: Record<string, EpisodeData[]> = {}
          ;(data.episodes as EpisodeData[][]).forEach((eps, i) => {
            const season = eps[0]?.season != null ? String(eps[0].season) : String(i + 1)
            obj[season] = eps
          })
          data.episodes = obj
        }
        setSeriesInfo(data)
        const firstSeason = Object.keys(data.episodes || {})[0] || '1'
        setSelectedSeason(firstSeason)
      })
      .catch(() => { setSeriesInfo({ episodes: {} }); setInfoError(true) })
      .finally(() => setLoadingInfo(false))
  }, [api])

  useEffect(() => {
    if (!selected) return
    loadInfo(selected)
  }, [selected, loadInfo])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeEp || !selected) return
    const direct = api.getSeriesStreamUrl(Number(activeEp.id), activeEp.container_extension || 'mp4')
    const url = needsProxy() ? `/proxy?target=${encodeURIComponent(direct)}` : direct
    hlsRef.current?.destroy()
    video.src = url
    video.load()
    video.play().catch(() => {})
    return () => { stopVideo(video) }
  }, [activeEp, selected, api])

  function openFullscreen() {
    if (!activeEp || !selected) return
    const url = api.getSeriesStreamUrl(Number(activeEp.id), activeEp.container_extension || 'mp4')
    onPlay(url, `${selected.name} · S${selectedSeason}E${activeEp.episode_num} ${activeEp.title || ''}`, cover(selected))
  }

  function handleSelectCat(id: string, name: string) {
    setSelectedCat(id)
    setSelectedCatName(name)
    setSearch('')
    setMobileStep('series')
  }

  function handleSelectSeries(s: XtreamSeries) {
    setSelected(s)
    setMobileStep('detail')
  }

  const filtered = useMemo(() => {
    let list = series
    if (selectedCat !== 'all') list = list.filter(s => s.category_id === selectedCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s => s.name?.toLowerCase().includes(q))
    }
    return list
  }, [series, selectedCat, search])

  const cover = (s: XtreamSeries) => (typeof s.cover === 'string' ? s.cover : '')

  const episodes = seriesInfo?.episodes || {}
  const seasons = Object.keys(episodes)
  const currentEpisodes: EpisodeData[] = episodes[selectedSeason] || []
  const info = seriesInfo?.info
  const plot = info?.plot || selected?.plot || ''
  const genre = info?.genre || selected?.genre || ''
  const director = info?.director || ''
  const cast = info?.cast || selected?.cast || ''
  const releaseDate = info?.release_date || selected?.release_date || ''

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-violet-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Chargement des séries...</p>
      </div>
    </div>
  )

  // ── Grille commune (utilisée mobile + desktop) ──
  const seriesGrid = (cols: string) => (
    <div className={`grid ${cols} gap-2 sm:gap-3`}>
      {filtered.map(s => (
        <div
          key={s.series_id}
          onClick={() => handleSelectSeries(s)}
          className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer hover:ring-2 hover:ring-violet-500 transition active:scale-95"
          style={{ touchAction: 'manipulation' }}
        >
          {cover(s) ? (
            <img src={cover(s)} alt={s.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
              </svg>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
            <span className="text-white text-xs font-medium line-clamp-2 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity">{s.name}</span>
          </div>
          {s.rating_5based > 0 && (
            <div className="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
              {Number(s.rating_5based).toFixed(1)}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  // ── MOBILE : écran catégories ──
  const mobileCategoriesScreen = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <h2 className="text-white font-semibold text-base">Catégories</h2>
        <p className="text-gray-500 text-xs mt-0.5">{categories.length} catégories</p>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <button
          onClick={() => handleSelectCat('all', 'Toutes les séries')}
          className="w-full flex items-center justify-between px-4 border-b border-gray-800/60 text-left active:bg-gray-800/50"
          style={{ touchAction: 'manipulation', minHeight: 56 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
            </div>
            <span className="text-white text-sm font-medium">Toutes les séries</span>
          </div>
          <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        {categories.map(cat => (
          <button
            key={cat.category_id}
            onClick={() => handleSelectCat(cat.category_id, cat.category_name)}
            className="w-full flex items-center justify-between px-4 border-b border-gray-800/60 text-left active:bg-gray-800/50"
            style={{ touchAction: 'manipulation', minHeight: 56 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
              </div>
              <span className="text-gray-200 text-sm">{cat.category_name}</span>
            </div>
            <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        ))}
      </div>
    </div>
  )

  // ── MOBILE : écran grille des séries ──
  const mobileSeriesScreen = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setMobileStep('categories')}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 text-gray-300 flex-shrink-0"
          style={{ touchAction: 'manipulation' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-sm truncate">{selectedCatName}</h2>
          <p className="text-gray-500 text-xs">{filtered.length} série{filtered.length > 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="px-3 py-2.5 border-b border-gray-800 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500"
            style={{ height: 40 }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-3">
        {filtered.length === 0
          ? <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucune série trouvée</div>
          : seriesGrid('grid-cols-2')}
      </div>
    </div>
  )

  // ── MOBILE : écran détail série (saisons + épisodes + player) ──
  const mobileDetailScreen = selected ? (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => { setSelected(null); setActiveEp(null); hlsRef.current?.destroy(); setMobileStep('series') }}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-800 text-gray-300 flex-shrink-0"
          style={{ touchAction: 'manipulation' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold text-sm truncate">{selected.name}</h2>
          {genre && <p className="text-gray-500 text-xs truncate">{genre}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {/* Player */}
        <div className="relative bg-black w-full flex-shrink-0" style={{ aspectRatio: '16/9' }}>
          {activeEp ? (
            <>
              <video ref={videoRef} className="w-full h-full object-contain" controls />
              <button
                onClick={openFullscreen}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-lg p-1.5"
                style={{ touchAction: 'manipulation' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              </button>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
              <svg className="w-12 h-12 mb-2" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <p className="text-sm">Sélectionne un épisode</p>
            </div>
          )}
        </div>

        {/* Épisode actif */}
        {activeEp && (
          <div className="px-4 py-2 border-b border-gray-800">
            <p className="text-yellow-400 text-xs font-semibold">
              S{selectedSeason.padStart(2,'0')}·E{String(activeEp.episode_num).padStart(2,'0')} — {activeEp.title || `Épisode ${activeEp.episode_num}`}
            </p>
          </div>
        )}

        {/* Saisons — pills horizontaux */}
        {loadingInfo ? (
          <div className="flex items-center gap-2 px-4 py-3 text-gray-500 text-xs">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
            Chargement des épisodes...
          </div>
        ) : seasons.length > 0 && (
          <div className="flex overflow-x-auto gap-2 px-4 py-3 border-b border-gray-800" style={{ scrollbarWidth: 'none' }}>
            {seasons.map(s => (
              <button
                key={s}
                onClick={() => { setSelectedSeason(s); setActiveEp(null) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${selectedSeason === s ? 'bg-yellow-400 text-gray-900' : 'bg-gray-800 text-gray-300'}`}
                style={{ touchAction: 'manipulation' }}
              >
                S{s}
                <span className="ml-1 opacity-60">· {(episodes[s] || []).length}ep</span>
              </button>
            ))}
          </div>
        )}

        {/* Liste épisodes */}
        <div className="border-b border-gray-800">
          {currentEpisodes.map(ep => (
            <div
              key={ep.id}
              onClick={() => setActiveEp(ep)}
              className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 cursor-pointer transition ${activeEp?.id === ep.id ? 'bg-yellow-400/10' : 'active:bg-gray-800/50'}`}
              style={{ touchAction: 'manipulation', minHeight: 52 }}
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${activeEp?.id === ep.id ? 'bg-yellow-400 text-gray-900' : 'bg-gray-800 text-gray-400'}`}>
                {ep.episode_num}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${activeEp?.id === ep.id ? 'text-yellow-400' : 'text-gray-300'}`}>
                  S{selectedSeason.padStart(2,'0')}·E{String(ep.episode_num).padStart(2,'0')}
                </p>
                <p className="text-gray-500 text-xs truncate">{ep.title || `Épisode ${ep.episode_num}`}</p>
              </div>
              {ep.info?.duration && <span className="text-gray-600 text-xs flex-shrink-0">{ep.info.duration}</span>}
              {activeEp?.id === ep.id && (
                <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </div>
          ))}
          {currentEpisodes.length === 0 && !loadingInfo && (
            infoError ? (
              <div className="flex flex-col items-center justify-center gap-2 h-24 text-sm">
                <span className="text-red-400">Le serveur n'a pas répondu</span>
                <button onClick={() => selected && loadInfo(selected)} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">Réessayer</button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 text-gray-600 text-sm">Aucun épisode</div>
            )
          )}
        </div>

        {/* Infos série */}
        <div className="px-4 py-4 space-y-2">
          {plot && <p className="text-gray-300 text-sm leading-relaxed">{plot}</p>}
          {releaseDate && <p className="text-sm"><span className="text-yellow-400 font-semibold">Sortie : </span><span className="text-gray-300">{releaseDate}</span></p>}
          {director && <p className="text-sm"><span className="text-yellow-400 font-semibold">Réalisateur : </span><span className="text-gray-300">{director}</span></p>}
          {cast && <p className="text-sm"><span className="text-yellow-400 font-semibold">Avec : </span><span className="text-gray-300">{cast}</span></p>}
        </div>
      </div>
    </div>
  ) : null

  // ── Vue détail DESKTOP (3 colonnes) ──
  if (selected) {
    return (
      <div className="flex h-full w-full overflow-hidden">

        {/* MOBILE drill-down */}
        <div className="sm:hidden flex h-full w-full">
          {mobileDetailScreen}
        </div>

        {/* DESKTOP 3 colonnes */}
        <div className="hidden sm:flex h-full w-full">
          {/* Col gauche : affiche + saisons */}
          <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
            <div className="relative flex-shrink-0">
              {cover(selected) ? (
                <img src={cover(selected)} alt={selected.name} className="w-full aspect-[2/3] object-cover" />
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <button
                onClick={() => { setSelected(null); setActiveEp(null) }}
                className="w-full flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-3 transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Retour
              </button>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Saisons</p>
              {loadingInfo ? (
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                  Chargement...
                </div>
              ) : seasons.map(s => (
                <button
                  key={s}
                  onClick={() => { setSelectedSeason(s); setActiveEp(null) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl mb-1.5 text-sm font-medium transition ${selectedSeason === s ? 'bg-yellow-400 text-gray-900' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                >
                  <span>Saison {s}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${selectedSeason === s ? 'bg-yellow-500/50 text-gray-900' : 'bg-gray-700 text-gray-400'}`}>
                    {(episodes[s] || []).length} Ep
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Col centre : épisodes */}
          <div className="w-64 flex-shrink-0 border-r border-gray-800 bg-gray-950 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-gray-800 flex-shrink-0">
              <p className="text-white font-semibold text-sm truncate">{selected.name}</p>
              <p className="text-gray-500 text-xs mt-0.5">Saison {selectedSeason} · {currentEpisodes.length} épisodes</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {currentEpisodes.map(ep => (
                <div
                  key={ep.id}
                  onClick={() => setActiveEp(ep)}
                  className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/50 cursor-pointer transition ${activeEp?.id === ep.id ? 'bg-yellow-400/10 border-l-2 border-l-yellow-400' : 'hover:bg-gray-800/60'}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${activeEp?.id === ep.id ? 'bg-yellow-400 text-gray-900' : 'bg-gray-800 text-gray-400'}`}>
                    {ep.episode_num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${activeEp?.id === ep.id ? 'text-yellow-400' : 'text-gray-200'}`}>
                      S{selectedSeason.padStart(2,'0')}·E{String(ep.episode_num).padStart(2,'0')}
                    </p>
                    <p className="text-gray-500 text-xs truncate">{ep.title || `Épisode ${ep.episode_num}`}</p>
                  </div>
                  {ep.info?.duration && <span className="text-gray-600 text-xs flex-shrink-0">{ep.info.duration}</span>}
                </div>
              ))}
              {currentEpisodes.length === 0 && !loadingInfo && (
                infoError ? (
                  <div className="flex flex-col items-center justify-center gap-2 h-24 text-sm">
                    <span className="text-red-400">Le serveur n'a pas répondu</span>
                    <button onClick={() => selected && loadInfo(selected)} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">Réessayer</button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-20 text-gray-600 text-sm">Aucun épisode</div>
                )
              )}
            </div>
          </div>

          {/* Col droite : player + infos 50/50 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-950 min-h-0">
            {/* Player — 50% */}
            <div className="h-1/2 relative bg-black flex-shrink-0 overflow-hidden">
              {activeEp ? (
                <>
                  <video ref={videoRef} className="w-full h-full object-contain" controls />
                  <button onClick={openFullscreen} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 transition">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                  <svg className="w-14 h-14 mb-2" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  <p className="text-sm">Sélectionne un épisode</p>
                </div>
              )}
            </div>
            {/* Infos — 50% */}
            <div className="h-1/2 overflow-y-auto p-4">
              <h2 className="text-white font-bold text-lg mb-1">{selected.name}</h2>
              {activeEp && (
                <p className="text-yellow-400 text-sm font-medium mb-2">
                  S{selectedSeason.padStart(2,'0')}·E{String(activeEp.episode_num).padStart(2,'0')} — {activeEp.title || `Épisode ${activeEp.episode_num}`}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                {releaseDate && <div className="text-sm"><span className="text-yellow-400 font-semibold">Date de sortie : </span><span className="text-gray-300">{releaseDate}</span></div>}
                {genre && <div className="text-sm"><span className="text-yellow-400 font-semibold">Genre : </span><span className="text-gray-300">{genre}</span></div>}
              </div>
              {selected.rating_5based > 0 && (
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <svg key={i} className={`w-4 h-4 ${i < Math.round(selected.rating_5based) ? 'text-yellow-400' : 'text-gray-700'}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
                    </svg>
                  ))}
                </div>
              )}
              {plot && <div className="mb-3"><span className="text-yellow-400 text-sm font-semibold">Description : </span><span className="text-gray-300 text-sm leading-relaxed">{plot}</span></div>}
              {director && <div className="mb-2"><span className="text-yellow-400 text-sm font-semibold">Réalisateur : </span><span className="text-gray-300 text-sm">{director}</span></div>}
              {cast && <div><span className="text-yellow-400 text-sm font-semibold">Avec : </span><span className="text-gray-300 text-sm">{cast}</span></div>}
            </div>
          </div>
        </div>

      </div>
    )
  }

  // ── Vue liste (catégories + grille) ──
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* MOBILE */}
      <div className="sm:hidden flex h-full w-full">
        {mobileStep === 'categories' && mobileCategoriesScreen}
        {mobileStep === 'series' && mobileSeriesScreen}
      </div>

      {/* DESKTOP : sidebar + grille */}
      <div className="hidden sm:flex h-full w-full">
        <div className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto">
          <div className="p-3">
            <button onClick={() => setSelectedCat('all')} className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${selectedCat === 'all' ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
              Toutes les séries
            </button>
            <div className="h-px bg-gray-800 my-2" />
            {categories.map(cat => (
              <button key={cat.category_id} onClick={() => setSelectedCat(cat.category_id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition truncate ${selectedCat === cat.category_id ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                {cat.category_name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une série..." className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500" />
            </div>
            <p className="text-xs text-gray-500 mt-2">{filtered.length} série{filtered.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {filtered.length === 0
              ? <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucune série trouvée</div>
              : seriesGrid('grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6')}
          </div>
        </div>
      </div>

    </div>
  )
}
