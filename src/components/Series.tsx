import { useEffect, useState, useMemo } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamSeries } from '../types/xtream'
import { XtreamAPI } from '../utils/api'

interface EpisodeData {
  id: string
  episode_num: number
  title: string
  container_extension?: string
  info?: {
    movie_image?: string
    duration?: string
  }
}

interface SeriesInfoData {
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
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<XtreamSeries | null>(null)
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfoData | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<string>('1')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, srs] = await Promise.all([
          api.getSeriesCategories(),
          api.getSeries(),
        ])
        setCategories(Array.isArray(cats) ? cats : [])
        setSeries(Array.isArray(srs) ? srs : [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [api])

  useEffect(() => {
    if (!selected) return
    setSeriesInfo(null)
    setLoadingInfo(true)
    api.getSeriesInfo(selected.series_id)
      .then(info => {
        const data = info as SeriesInfoData
        setSeriesInfo(data)
        const firstSeason = Object.keys(data.episodes || {})[0] || '1'
        setSelectedSeason(firstSeason)
      })
      .catch(() => setSeriesInfo({ episodes: {} }))
      .finally(() => setLoadingInfo(false))
  }, [selected, api])

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

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Chargement des séries...</p>
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
            Toutes les séries
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

      {/* Grille séries */}
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
              placeholder="Rechercher une série..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filtered.length} série{filtered.length > 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Aucune série trouvée</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(s => (
                <div
                  key={s.series_id}
                  onClick={() => setSelected(s)}
                  className={`group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer transition ${selected?.series_id === s.series_id ? 'ring-2 ring-blue-500' : 'hover:ring-2 hover:ring-blue-500/50'}`}
                >
                  {cover(s) ? (
                    <img src={cover(s)} alt={s.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-white text-xs font-medium line-clamp-2">{s.name}</span>
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
          )}
        </div>
      </div>

      {/* Panneau détail */}
      <div className="w-80 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
              </svg>
              <p className="text-gray-500 text-sm">Sélectionne une série<br/>pour voir les épisodes</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Cover */}
            <div className="relative">
              {cover(selected) ? (
                <img src={cover(selected)} alt={selected.name} className="w-full aspect-[2/3] object-cover" />
              ) : (
                <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                  </svg>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
            </div>

            <div className="p-4 -mt-10 relative">
              <h2 className="text-white font-bold text-lg leading-tight mb-2">{selected.name}</h2>

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
              </div>

              {selected.plot && (
                <p className="text-gray-300 text-sm leading-relaxed mb-4">{selected.plot}</p>
              )}

              {loadingInfo && (
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Chargement des épisodes...
                </div>
              )}

              {!loadingInfo && seasons.length === 0 && (
                <p className="text-gray-600 text-sm">Aucun épisode disponible.</p>
              )}

              {!loadingInfo && seasons.length > 0 && (
                <>
                  {/* Sélecteur saisons */}
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {seasons.map(s => (
                      <button
                        key={s}
                        onClick={() => setSelectedSeason(s)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedSeason === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                      >
                        S{s}
                      </button>
                    ))}
                  </div>

                  {/* Épisodes */}
                  <div className="space-y-2">
                    {currentEpisodes.map(ep => (
                      <div
                        key={ep.id}
                        onClick={() => {
                          const url = api.getSeriesStreamUrl(Number(ep.id), ep.container_extension || 'mp4')
                          onPlay(url, `${selected.name} · S${selectedSeason}E${ep.episode_num} ${ep.title || ''}`, cover(selected))
                        }}
                        className="flex items-center gap-3 bg-gray-800 hover:bg-gray-700 rounded-xl p-3 transition cursor-pointer"
                      >
                        {ep.info?.movie_image ? (
                          <img src={ep.info.movie_image} alt="" className="w-16 h-10 rounded-lg object-cover flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none' }} />
                        ) : (
                          <div className="w-16 h-10 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-xs font-medium truncate">
                            {ep.episode_num}. {ep.title || `Épisode ${ep.episode_num}`}
                          </div>
                          {ep.info?.duration && (
                            <div className="text-gray-500 text-xs mt-0.5">{ep.info.duration}</div>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
