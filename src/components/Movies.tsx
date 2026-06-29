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

      {/* Grille films */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(m => (
                <div
                  key={m.stream_id}
                  onClick={() => setSelected(m)}
                  className={`group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer transition ${selected?.stream_id === m.stream_id ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-blue-500/50'}`}
                >
                  {(m.stream_icon || m.cover) ? (
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

      {/* Panneau détail */}
      <div className="w-80 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
              </svg>
              <p className="text-gray-500 text-sm">Sélectionne un film<br/>pour voir les détails</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Affiche */}
            <div className="relative">
              {(selected.stream_icon || selected.cover) ? (
                <img
                  src={selected.stream_icon || selected.cover}
                  alt={selected.name}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
            </div>

            <div className="p-4 -mt-10 relative">
              <h2 className="text-white font-bold text-lg leading-tight mb-2">{selected.name}</h2>

              {/* Méta */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {selected.rating_5based > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400 text-xs">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                    {Number(selected.rating_5based).toFixed(1)}
                  </span>
                )}
                {selected.release_date && (
                  <span className="text-gray-400 text-xs">{String(selected.release_date).slice(0, 4)}</span>
                )}
                {selected.genre && (
                  <span className="text-gray-400 text-xs bg-gray-800 px-2 py-0.5 rounded-full">{selected.genre}</span>
                )}
                {selected.episode_run_time && (
                  <span className="text-gray-400 text-xs">{selected.episode_run_time} min</span>
                )}
              </div>

              <button
                onClick={() => playMovie(selected)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition mb-4"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Regarder
              </button>

              {selected.plot && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Synopsis</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{selected.plot}</p>
                </div>
              )}

              {selected.cast && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Avec</h3>
                  <p className="text-gray-400 text-sm">{selected.cast}</p>
                </div>
              )}

              {selected.director && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Réalisateur</h3>
                  <p className="text-gray-400 text-sm">{selected.director}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
