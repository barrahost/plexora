import { useEffect, useState, useMemo } from 'react'
import type { XtreamCredentials, XtreamCategory, XtreamChannel, EPGItem } from '../types/xtream'
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
  const [activeChannel, setActiveChannel] = useState<XtreamChannel | null>(null)
  const [epg, setEpg] = useState<EPGItem[]>([])
  const [epgLoading, setEpgLoading] = useState(false)

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

  useEffect(() => {
    if (!activeChannel) return
    setEpg([])
    setEpgLoading(true)
    api.getEPG(activeChannel.stream_id)
      .then(data => setEpg(Array.isArray(data.epg_listings) ? data.epg_listings : []))
      .catch(() => setEpg([]))
      .finally(() => setEpgLoading(false))
  }, [activeChannel, api])

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

  function handlePlay() {
    if (!activeChannel) return
    const url = api.getLiveStreamUrl(activeChannel.stream_id, 'ts')
    onPlay(url, activeChannel.name, activeChannel.stream_icon, activeChannel)
  }

  if (loading) return (
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

  const nowPlaying = epg.find(e => e.now_playing === 1)
  const upcoming = epg.filter(e => e.now_playing === 0).slice(0, 4)

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
              placeholder="Rechercher une chaine..."
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filtered.length} chaine{filtered.length > 1 ? 's' : ''}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map(ch => (
            <div
              key={ch.stream_id}
              onClick={() => setActiveChannel(ch)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition border-b border-gray-800/50 cursor-pointer group ${activeChannel?.stream_id === ch.stream_id ? 'bg-gray-800' : 'hover:bg-gray-800/60'}`}
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
              <div
                onClick={e => handleFavorite(e, ch.stream_id)}
                className="opacity-0 group-hover:opacity-100 transition p-1 cursor-pointer flex-shrink-0"
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
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              Aucune chaine trouvée
            </div>
          )}
        </div>
      </div>

      {/* EPG / Info panel */}
      <div className={`w-80 flex-shrink-0 border-l border-gray-800 bg-gray-900 flex flex-col transition-all`}>
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div>
              <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              </svg>
              <p className="text-gray-500 text-sm">Sélectionne une chaine<br/>pour voir les infos EPG</p>
            </div>
          </div>
        ) : (
          <>
            {/* Channel header */}
            <div className="p-5 border-b border-gray-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gray-800 flex-shrink-0 overflow-hidden">
                  {activeChannel.stream_icon ? (
                    <img src={activeChannel.stream_icon} alt="" className="w-full h-full object-contain p-1.5" onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-white font-semibold text-base leading-tight">{activeChannel.name}</h2>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                    <span className="text-xs text-gray-400">LIVE</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handlePlay}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Regarder
              </button>
            </div>

            {/* EPG */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Programme</h3>

              {epgLoading && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Chargement EPG...
                </div>
              )}

              {!epgLoading && epg.length === 0 && (
                <p className="text-gray-600 text-sm">Aucune donnée EPG disponible.</p>
              )}

              {!epgLoading && nowPlaying && (
                <div className="bg-blue-600/20 border border-blue-600/40 rounded-xl p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-blue-400 uppercase">En cours</span>
                    <span className="text-xs text-gray-400">{formatTime(nowPlaying.start)} - {formatTime(nowPlaying.end)}</span>
                  </div>
                  <p className="text-white text-sm font-medium leading-snug">{decodeHtml(nowPlaying.title)}</p>
                  {nowPlaying.description && (
                    <p className="text-gray-400 text-xs mt-1.5 line-clamp-3">{decodeHtml(nowPlaying.description)}</p>
                  )}
                  {/* Progress bar */}
                  <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${getProgress(nowPlaying.start_timestamp, nowPlaying.stop_timestamp)}%` }}
                    />
                  </div>
                </div>
              )}

              {!epgLoading && upcoming.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600 uppercase tracking-wider font-semibold mb-2">À venir</p>
                  {upcoming.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-800/60 last:border-0">
                      <span className="text-xs text-gray-500 flex-shrink-0 mt-0.5 w-10">{formatTime(item.start)}</span>
                      <span className="text-gray-300 text-sm leading-snug">{decodeHtml(item.title)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function getProgress(start: number, stop: number): number {
  const now = Math.floor(Date.now() / 1000)
  if (!start || !stop || stop <= start) return 0
  const pct = ((now - start) / (stop - start)) * 100
  return Math.min(100, Math.max(0, pct))
}

function decodeHtml(str: string): string {
  if (!str) return ''
  try {
    const txt = document.createElement('textarea')
    txt.innerHTML = str
    return txt.value
  } catch {
    return str
  }
}
