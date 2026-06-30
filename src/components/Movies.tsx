import { useEffect, useState, useMemo, useRef } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamMovie } from '../types/xtream'
import { XtreamAPI, getFavorites, toggleFavorite } from '../utils/api'
import Hls from 'hls.js'

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string) => void
}

export default function Movies({ creds, onPlay }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [movies, setMovies] = useState<XtreamMovie[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<XtreamMovie | null>(null)
  const [playing, setPlaying] = useState(false)
  const [favorites, setFavorites] = useState<number[]>(getFavorites())
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, vods] = await Promise.all([
          api.getVodCategories(),
          api.getVodStreams(),
        ])
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

  // Lance le lecteur intégré
  useEffect(() => {
    if (!playing || !selected || !videoRef.current) return
    const url = api.getVodStreamUrl(selected.stream_id, selected.container_extension || 'mp4')
    const video = videoRef.current
    hlsRef.current?.destroy()
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    } else {
      video.src = url
      video.play().catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [playing, selected, api])

  function handleSelect(m: XtreamMovie) {
    setSelected(m)
    setPlaying(false)
    hlsRef.current?.destroy()
  }

  function handlePlay() {
    setPlaying(true)
  }

  function handleFullscreen() {
    if (!selected) return
    const url = api.getVodStreamUrl(selected.stream_id, selected.container_extension || 'mp4')
    onPlay(url, selected.name, selected.stream_icon || selected.cover)
  }

  function handleFav(e: React.MouseEvent) {
    if (!selected) return
    e.stopPropagation()
    setFavorites(toggleFavorite(selected.stream_id))
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

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Chargement des films...</p>
      </div>
    </div>
  )

  // Vue détail film
  if (selected) {
    const isFav = favorites.includes(selected.stream_id)
    const posterUrl = selected.stream_icon || selected.cover || ''
    const rating = Math.round(Number(selected.rating_5based) || 0)

    return (
      <div className="flex h-full bg-gray-950 overflow-hidden">
        {/* Colonne gauche : affiche (35% de la largeur) */}
        <div className="relative bg-black flex-shrink-0" style={{ width: '35%' }}>
          {posterUrl ? (
            <img src={posterUrl} alt={selected.name} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <svg className="w-20 h-20 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
              </svg>
            </div>
          )}
          {/* Note */}
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/70 rounded-lg px-2 py-1">
            <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
            </svg>
            <span className="text-white text-xs font-bold">{rating}</span>
          </div>
          {/* Favori */}
          <button onClick={handleFav} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center hover:bg-black/90 transition">
            <svg className={`w-4 h-4 ${isFav ? 'text-red-500' : 'text-white'}`} viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
          {/* Retour */}
          <button
            onClick={() => { setSelected(null); setPlaying(false); hlsRef.current?.destroy() }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/70 hover:bg-black/90 text-white text-xs px-3 py-2 rounded-xl transition whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Retour
          </button>
        </div>

        {/* Colonne droite : titre + player + infos */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Titre / genre / étoiles */}
          <div className="px-5 pt-4 pb-2 flex-shrink-0">
            <h1 className="text-white font-bold text-xl leading-tight">{selected.name}</h1>
            {selected.genre && <p className="text-gray-400 text-sm mt-0.5">{selected.genre}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} className={`w-3.5 h-3.5 ${i < rating ? 'text-yellow-400' : 'text-gray-700'}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
                  </svg>
                ))}
              </div>
              {selected.release_date && (
                <span className="text-gray-400 text-xs">Release Date : {selected.release_date}</span>
              )}
            </div>
          </div>

          {/* Player — pleine largeur de la colonne droite */}
          <div className="flex-shrink-0 relative bg-black w-full" style={{ aspectRatio: '16/9' }}>
            {playing ? (
              <>
                <video ref={videoRef} className="w-full h-full object-contain" controls />
                <button
                  onClick={handleFullscreen}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 transition"
                  title="Plein écran"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {posterUrl && (
                  <img src={posterUrl} alt="" className="w-full h-full object-cover opacity-25 absolute inset-0" />
                )}
                <button
                  onClick={handlePlay}
                  className="relative z-10 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 flex items-center justify-center transition"
                >
                  <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Infos détaillées */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {selected.release_date && (
              <p className="text-sm">
                <span className="text-yellow-400 font-semibold">Release Date : </span>
                <span className="text-gray-300">{selected.release_date}</span>
              </p>
            )}
            {selected.genre && (
              <p className="text-sm">
                <span className="text-yellow-400 font-semibold">Genre : </span>
                <span className="text-gray-300">{selected.genre}</span>
              </p>
            )}
            {selected.plot && (
              <p className="text-sm">
                <span className="text-yellow-400 font-semibold">Description : </span>
                <span className="text-gray-300 leading-relaxed">{selected.plot}</span>
              </p>
            )}
            {selected.director && (
              <p className="text-sm">
                <span className="text-yellow-400 font-semibold">Director : </span>
                <span className="text-gray-300">{selected.director}</span>
              </p>
            )}
            {selected.cast && (
              <p className="text-sm">
                <span className="text-yellow-400 font-semibold">Cast : </span>
                <span className="text-gray-300">{selected.cast}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Vue grille
  return (
    <div className="flex h-full">
      {/* Sidebar catégories */}
      <div className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto">
        <div className="p-3">
          <button
            onClick={() => setSelectedCat('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${selectedCat === 'all' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            Tous les films
          </button>
          <div className="h-px bg-gray-800 my-2" />
          {categories.map(cat => (
            <button
              key={cat.category_id}
              onClick={() => setSelectedCat(cat.category_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 transition truncate ${selectedCat === cat.category_id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
            >
              {cat.category_name}
            </button>
          ))}
        </div>
      </div>

      {/* Grille */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un film..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filtered.length} film{filtered.length > 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucun film trouvé</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map(m => (
                <div
                  key={m.stream_id}
                  onClick={() => handleSelect(m)}
                  className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer hover:ring-2 hover:ring-blue-500 transition"
                >
                  {(m.stream_icon || m.cover) ? (
                    <img src={m.stream_icon || m.cover} alt={m.name} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                      </svg>
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
  )
}
