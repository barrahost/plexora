import { useEffect, useState, useMemo } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamChannel } from '../types/xtream'
import { XtreamAPI, getFavorites, toggleFavorite } from '../utils/api'

interface Props {
  creds: XtreamCredentials
  onPlay: (url: string, title: string, cover?: string, channel?: XtreamChannel) => void
}

export default function LiveTV({ creds, onPlay }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [categories, setCategories] = useState<XtreamCategory[]>([])
  const [channels, setChannels] = useState<XtreamChannel[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<number[]>(getFavorites())

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [cats, chans] = await Promise.all([
          api.getLiveCategories(),
          api.getLiveStreams(),
        ])
        setCategories(cats)
        setChannels(chans)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [api])

  const filtered = useMemo(() => {
    let list = channels
    if (selectedCat === 'favorites') {
      list = list.filter(c => favorites.includes(c.stream_id))
    } else if (selectedCat !== 'all') {
      list = list.filter(c => c.category_id === selectedCat)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    return list
  }, [channels, selectedCat, search, favorites])

  function handleFavorite(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    setFavorites(toggleFavorite(id))
  }

  function playChannel(ch: XtreamChannel) {
    const url = api.getLiveStreamUrl(ch.stream_id, 'ts')
    onPlay(url, ch.name, ch.stream_icon, ch)
  }

  if (loading) return <LoadingGrid />

  return (
    <div className="flex h-full">
      {/* Category sidebar */}
      <div className="w-52 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto">
        <div className="p-3">
          <button
            onClick={() => setSelectedCat('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${selectedCat === 'all' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            Toutes
          </button>
          <button
            onClick={() => setSelectedCat('favorites')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition flex items-center gap-2 ${selectedCat === 'favorites' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
            </svg>
            Favoris
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

      {/* Channel list */}
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
              placeholder="Rechercher une chaine..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filtered.length} chaine{filtered.length > 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(ch => (
            <button
              key={ch.stream_id}
              onClick={() => playChannel(ch)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition border-b border-gray-800/50 text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-800 flex-shrink-0 overflow-hidden">
                {ch.stream_icon ? (
                  <img src={ch.stream_icon} alt="" className="w-full h-full object-contain p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{ch.name}</div>
              </div>
              <button
                onClick={e => handleFavorite(e, ch.stream_id)}
                className="opacity-0 group-hover:opacity-100 transition p-1"
              >
                <svg
                  className={`w-4 h-4 ${favorites.includes(ch.stream_id) ? 'text-yellow-400' : 'text-gray-600'}`}
                  viewBox="0 0 24 24"
                  fill={favorites.includes(ch.stream_id) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
                </svg>
              </button>
              <svg className="w-4 h-4 text-gray-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              Aucune chaine trouvée
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-8 h-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <p className="text-gray-400 text-sm">Chargement des chaines...</p>
      </div>
    </div>
  )
}
