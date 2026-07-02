import { useEffect, useState, useMemo, useRef } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamMovie } from '../types/xtream'
import { XtreamAPI, getFavorites, toggleFavorite, needsProxy, stopVideo } from '../utils/api'
import { GridSkeleton, CodecBadge, TechChips, openInVlc } from './ui'
import type { TechInfoData } from './ui'
import Hls from 'hls.js'

interface VodInfo {
  plot?: string
  cast?: string
  director?: string
  genre?: string
  release_date?: string
  releasedate?: string
  description?: string
  audioCodec?: string
  tech?: TechInfoData
}

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string) => void
  jump?: { item: XtreamMovie; ts: number } | null
}

export default function Movies({ creds, onPlay, jump }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [movies, setMovies] = useState<XtreamMovie[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [selectedCatName, setSelectedCatName] = useState<string>('Tous les films')
  const [mobileStep, setMobileStep] = useState<'categories' | 'movies' | 'detail'>('categories')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<XtreamMovie | null>(null)
  const [vodInfo, setVodInfo] = useState<VodInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [favorites, setFavorites] = useState<number[]>(getFavorites())
  const [vlcMsg, setVlcMsg] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  // Saut depuis la recherche globale
  useEffect(() => {
    if (!jump) return
    setSelectedCat('all')
    setSelected(jump.item)
    setPlaying(false)
    setMobileStep('detail')
  }, [jump])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, vods] = await Promise.all([api.getVodCategories(), api.getVodStreams()])
        setCategories(cats)
        setMovies(vods)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [api])

  // Charge les métadonnées détaillées quand on sélectionne un film
  useEffect(() => {
    if (!selected) { setVodInfo(null); return }
    setVodInfo(null)
    setInfoLoading(true)
    api.getVodInfo(selected.stream_id)
      .then(data => {
        const info = (data?.info || {}) as Record<string, unknown>
        const movie = (data?.movie_data || {}) as Record<string, unknown>
        const merged: VodInfo = {
          plot: str(info.plot || info.description || movie.plot || selected.plot),
          cast: str(info.cast || movie.cast || selected.cast),
          director: str(info.director || movie.director || selected.director),
          genre: str(info.genre || movie.genre || selected.genre),
          release_date: str(info.release_date || info.releasedate || movie.release_date || selected.release_date),
          audioCodec: str((info.audio as Record<string, unknown> | undefined)?.codec_name),
        }
        const v = info.video as Record<string, unknown> | undefined
        const a = info.audio as Record<string, unknown> | undefined
        merged.tech = {
          videoCodec: str(v?.codec_name),
          width: Number(v?.width) || undefined,
          height: Number(v?.height) || undefined,
          audioCodec: str(a?.codec_name),
          channels: Number(a?.channels) || undefined,
          audioLang: str((a?.tags as Record<string, unknown> | undefined)?.language),
        }
        setVodInfo(merged)
      })
      .catch(() => {
        setVodInfo({
          plot: selected.plot,
          cast: selected.cast,
          director: selected.director,
          genre: selected.genre,
          release_date: selected.release_date,
        })
      })
      .finally(() => setInfoLoading(false))
  }, [selected, api])

  // Lance le lecteur intégré
  useEffect(() => {
    if (!playing || !selected || !videoRef.current) return
    const direct = api.getVodStreamUrl(selected.stream_id, selected.container_extension || 'mp4')
    const url = needsProxy() ? `/proxy?target=${encodeURIComponent(direct)}` : direct
    const video = videoRef.current
    hlsRef.current?.destroy()
    video.src = url
    video.load()
    video.play().catch(() => {})
    return () => { stopVideo(video) }
  }, [playing, selected, api])

  function handleSelectCat(id: string, name: string) {
    setSelectedCat(id)
    setSelectedCatName(name)
    setSearch('')
    setMobileStep('movies')
  }

  function handleSelect(m: XtreamMovie) {
    setSelected(m)
    setMobileStep('detail')
    setPlaying(false)
    hlsRef.current?.destroy()
  }

  function handleFav(e: React.MouseEvent) {
    if (!selected) return
    e.stopPropagation()
    setFavorites(toggleFavorite(selected.stream_id))
  }

  function handleFullscreen() {
    if (!selected) return
    const url = api.getVodStreamUrl(selected.stream_id, selected.container_extension || 'mp4')
    onPlay(url, selected.name, selected.stream_icon || selected.cover)
  }

  const filtered = useMemo(() => {
    let list = movies
    if (selectedCat !== 'all') list = list.filter(m => m.category_id === selectedCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m => m.name.toLowerCase().includes(q))
    }
    return list
  }, [movies, selectedCat, search])

  if (loading) return <div className="flex-1 overflow-hidden"><GridSkeleton count={18} /></div>

  // Vue détail film
  if (selected) {
    const isFav = favorites.includes(selected.stream_id)
    const posterUrl = selected.stream_icon || selected.cover || ''
    const rating = Math.round(Number(selected.rating_5based) || 0)
    const info = vodInfo || {}

    const stars = (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} className={`w-3.5 h-3.5 ${i < rating ? 'text-yellow-400' : 'text-gray-700'}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
          </svg>
        ))}
      </div>
    )

    const playerEl = (
      <div className="flex-shrink-0 relative bg-black w-full" style={{ aspectRatio: '16/9' }}>
        {playing ? (
          <>
            <video ref={videoRef} className="w-full h-full object-contain" controls />
            <button onClick={handleFullscreen} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 transition" style={{ touchAction: 'manipulation' }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => setPlaying(true)} style={{ touchAction: 'manipulation' }}>
            {posterUrl && <img src={posterUrl} alt="" className="w-full h-full object-cover opacity-25 absolute inset-0" />}
            <div className="relative z-10 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 flex items-center justify-center transition">
              <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        )}
      </div>
    )

    const infoEl = (
      <div className="space-y-2 px-4 py-3">
        {infoLoading && (
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Chargement des infos...
          </div>
        )}
        {info.tech && <TechChips info={info.tech} />}
        <CodecBadge audio={info.audioCodec} />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const r = await openInVlc(api.getVodStreamUrl(selected.stream_id, selected.container_extension || 'mp4'))
              setVlcMsg(r === 'copied' ? 'Lien copié — si VLC ne s\'ouvre pas : VLC > Média > Ouvrir un flux réseau > Ctrl+V' : null)
            }}
            className="flex items-center gap-2 bg-orange-600/80 hover:bg-orange-600 text-white text-xs px-3 py-2 rounded-lg transition"
            style={{ touchAction: 'manipulation' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 7h-5L12 2zm-4 12l1.5-4h5L16 14H8zm-3 8l1.8-5h10.4l1.8 5H5z"/></svg>
            Ouvrir dans VLC
          </button>
          {vlcMsg && <span className="text-gray-500 text-xs">{vlcMsg}</span>}
        </div>
        {(info.release_date || selected.release_date) && <p className="text-sm"><span className="text-yellow-400 font-semibold">Release Date : </span><span className="text-gray-300">{info.release_date || selected.release_date}</span></p>}
        {(info.genre || selected.genre) && <p className="text-sm"><span className="text-yellow-400 font-semibold">Genre : </span><span className="text-gray-300">{info.genre || selected.genre}</span></p>}
        {(info.plot || selected.plot) && <p className="text-sm"><span className="text-yellow-400 font-semibold">Description : </span><span className="text-gray-300 leading-relaxed">{info.plot || selected.plot}</span></p>}
        {(info.director || selected.director) && <p className="text-sm"><span className="text-yellow-400 font-semibold">Director : </span><span className="text-gray-300">{info.director || selected.director}</span></p>}
        {(info.cast || selected.cast) && <p className="text-sm"><span className="text-yellow-400 font-semibold">Cast : </span><span className="text-gray-300">{info.cast || selected.cast}</span></p>}
      </div>
    )

    // Sur mobile : retour vers la grille. Sur desktop : retour vers la liste globale.
    const backBtn = (
      <button
        onClick={() => {
          setPlaying(false)
          hlsRef.current?.destroy()
          setSelected(null)
          setMobileStep('movies')
        }}
        className="flex items-center gap-1.5 text-gray-300 hover:text-white transition"
        style={{ touchAction: 'manipulation' }}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        <span className="text-sm">Retour</span>
      </button>
    )

    return (
      <div className="flex h-full w-full bg-gray-950 overflow-hidden">

        {/* ── MOBILE : colonne unique ── */}
        <div className="sm:hidden flex flex-col h-full w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0">
            {backBtn}
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-sm truncate">{selected.name}</div>
              {(info.genre || selected.genre) && <div className="text-gray-500 text-xs truncate">{info.genre || selected.genre}</div>}
            </div>
            <button onClick={handleFav} className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ touchAction: 'manipulation' }}>
              <svg className={`w-5 h-5 ${isFav ? 'text-red-500' : 'text-gray-500'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
          </div>
          {/* Player full width */}
          {playerEl}
          {/* Étoiles */}
          <div className="flex items-center gap-2 px-4 pt-3 flex-shrink-0">
            {stars}
            {rating > 0 && <span className="text-gray-400 text-xs">{rating}/5</span>}
          </div>
          {/* Infos scrollables */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {infoEl}
          </div>
        </div>

        {/* ── DESKTOP : poster gauche + droite ── */}
        <div className="hidden sm:flex h-full w-full overflow-hidden">
          {/* Colonne gauche : affiche */}
          <div className="relative bg-black flex-shrink-0" style={{ width: '35%' }}>
            {posterUrl ? (
              <img src={posterUrl} alt={selected.name} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-800">
                <svg className="w-20 h-20 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
              </div>
            )}
            <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/70 rounded-lg px-2 py-1">
              <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
              <span className="text-white text-xs font-bold">{rating}</span>
            </div>
            <button onClick={handleFav} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90 transition">
              <svg className={`w-4 h-4 ${isFav ? 'text-red-500' : 'text-white'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button onClick={() => { setSelected(null); setPlaying(false); hlsRef.current?.destroy(); setMobileStep('movies') }} className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-2 rounded-xl transition whitespace-nowrap">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Retour
            </button>
          </div>
          {/* Colonne droite */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
            {/* Header titre */}
            <div className="px-5 pt-4 pb-2 flex-shrink-0">
              <h1 className="text-white font-bold text-xl leading-tight">{selected.name}</h1>
              {(info.genre || selected.genre) && <p className="text-gray-400 text-sm mt-0.5">{info.genre || selected.genre}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                {stars}
                {(info.release_date || selected.release_date) && <span className="text-gray-400 text-xs">{info.release_date || selected.release_date}</span>}
              </div>
            </div>
            {/* Zone player + infos : 50 / 50 */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Player — 50% */}
              <div className="h-1/2 relative bg-black flex-shrink-0 overflow-hidden">
                {playing ? (
                  <>
                    <video ref={videoRef} className="w-full h-full object-contain" controls />
                    <button onClick={handleFullscreen} className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 transition">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                    </button>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center cursor-pointer" onClick={() => setPlaying(true)}>
                    {posterUrl && <img src={posterUrl} alt="" className="w-full h-full object-cover opacity-25 absolute inset-0" />}
                    <div className="relative z-10 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 flex items-center justify-center transition">
                      <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                )}
              </div>
              {/* Infos — 50% */}
              <div className="h-1/2 overflow-y-auto">{infoEl}</div>
            </div>
          </div>
        </div>

      </div>
    )
  }

  // ── Écran mobile : liste des catégories ──
  const mobileCategoriesScreen = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <h2 className="text-white font-semibold text-base">Catégories</h2>
        <p className="text-gray-500 text-xs mt-0.5">{categories.length} catégories</p>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <button
          onClick={() => handleSelectCat('all', 'Tous les films')}
          className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-800/60 text-left active:bg-gray-800/50"
          style={{ touchAction: 'manipulation', minHeight: 56 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
            </div>
            <span className="text-white text-sm font-medium">Tous les films</span>
          </div>
          <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>
        {categories.map(cat => (
          <button
            key={cat.category_id}
            onClick={() => handleSelectCat(cat.category_id, cat.category_name)}
            className="w-full flex items-center justify-between px-4 py-4 border-b border-gray-800/60 text-left active:bg-gray-800/50"
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

  // ── Écran mobile : grille des films de la catégorie ──
  const mobileMoviesScreen = (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header avec retour */}
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
          <p className="text-gray-500 text-xs">{filtered.length} film{filtered.length > 1 ? 's' : ''}</p>
        </div>
      </div>
      {/* Recherche */}
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
      {/* Grille */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucun film trouvé</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(m => (
              <div
                key={m.stream_id}
                onClick={() => handleSelect(m)}
                className="relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer active:scale-95 transition"
                style={{ touchAction: 'manipulation' }}
              >
                {(m.stream_icon || m.cover) ? (
                  <img src={m.stream_icon || m.cover} alt={m.name} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                  <span className="text-white text-xs font-medium line-clamp-2">{m.name}</span>
                </div>
                {m.rating_5based > 0 && (
                  <div className="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                    {Number(m.rating_5based).toFixed(1)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // Vue grille (layout principal)
  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── MOBILE : drill-down écran par écran ── */}
      <div className="sm:hidden flex h-full w-full">
        {mobileStep === 'categories' && mobileCategoriesScreen}
        {mobileStep === 'movies' && mobileMoviesScreen}
      </div>

      {/* ── DESKTOP : sidebar + grille côte à côte ── */}
      <div className="hidden sm:flex h-full w-full">
        {/* Sidebar catégories */}
        <div className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
          <div className="p-3">
            <button onClick={() => setSelectedCat('all')} className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${selectedCat === 'all' ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
              Tous les films
            </button>
            <div className="h-px bg-gray-800 my-2" />
            {categories.map(cat => (
              <button key={cat.category_id} onClick={() => setSelectedCat(cat.category_id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition truncate ${selectedCat === cat.category_id ? 'bg-violet-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
                {cat.category_name}
              </button>
            ))}
          </div>
        </div>
        {/* Contenu */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un film..." className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-500" style={{ height: 44 }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">{filtered.length} film{filtered.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucun film trouvé</div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filtered.map(m => (
                  <div key={m.stream_id} onClick={() => handleSelect(m)} className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer hover:ring-2 hover:ring-violet-500 hover:scale-[1.03] hover:shadow-xl hover:shadow-violet-900/30 hover:z-10 transition-all duration-200">
                    {(m.stream_icon || m.cover) ? (
                      <img src={m.stream_icon || m.cover} alt={m.name} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <span className="text-white text-xs font-medium line-clamp-2">{m.name}</span>
                    </div>
                    {m.rating_5based > 0 && (
                      <div className="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                        {Number(m.rating_5based).toFixed(1)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}
