import { useEffect, useState, useMemo } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamMovie } from '../types/xtream'
import { XtreamAPI } from '../utils/api'

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

  const filtered = useMemo(() => {
    let list = movies
    if (selectedCat !== 'all') list = list.filter(m => m.category_id === selectedCat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m => m.name.toLowerCase().includes(q))
    }
    return list
  }, [movies, selectedCat, search])

  function playMovie(m: XtreamMovie) {
    const url = api.getVodStreamUrl(m.stream_id, m.container_extension || 'mp4')
    onPlay(url, m.name, m.stream_icon || m.cover)
  }

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

  return (
    <div className="flex h-full">
      {/* Sidebar */}
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

      {/* Content */}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(m => (
              <button
                key={m.stream_id}
                onClick={() => setSelected(m)}
                className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] hover:ring-2 hover:ring-blue-500 transition"
              >
                {m.stream_icon || m.cover ? (
                  <img
                    src={m.stream_icon || m.cover}
                    alt={m.name}
                    className="w-full h-full object-cover"
                    onError={e => (e.currentTarget.style.display = 'none')}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                    </svg>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-white text-xs font-medium line-clamp-2 text-left">{m.name}</span>
                </div>
                {m.rating_5based > 0 && (
                  <div className="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-xs px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                    {m.rating_5based.toFixed(1)}
                  </div>
                )}
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              Aucun film trouvé
            </div>
          )}
        </div>
      </div>

      {/* Movie detail modal */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="relative h-56">
              {selected.stream_icon || selected.cover ? (
                <img src={selected.stream_icon || selected.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
              <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/80 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-5 -mt-8 relative">
              <h2 className="text-white font-bold text-xl mb-1">{selected.name}</h2>
              <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                {selected.genre && <span>{selected.genre}</span>}
                {selected.release_date && <span>{selected.release_date.slice(0, 4)}</span>}
                {selected.rating_5based > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                    {selected.rating_5based.toFixed(1)}
                  </span>
                )}
              </div>
              {selected.plot && <p className="text-gray-300 text-sm mb-4 line-clamp-4">{selected.plot}</p>}
              {selected.cast && <p className="text-gray-500 text-xs mb-4">Avec : {selected.cast}</p>}
              <button
                onClick={() => { playMovie(selected); setSelected(null) }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Regarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
