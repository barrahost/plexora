import { useEffect, useMemo, useRef, useState } from 'react'
import type { XtreamCredentials, XtreamChannel, XtreamMovie, XtreamSeries } from '../types/xtream'
import { XtreamAPI } from '../utils/api'
import { ChannelLogo } from './ui'

interface Props {
  creds: XtreamCredentials
  open: boolean
  onClose: () => void
  onSelectChannel: (ch: XtreamChannel) => void
  onSelectMovie: (m: XtreamMovie) => void
  onSelectSeries: (s: XtreamSeries) => void
}

// Cache session : évite de re-solliciter le serveur à chaque ouverture
let cache: { key: string; channels: XtreamChannel[]; movies: XtreamMovie[]; series: XtreamSeries[] } | null = null

export default function GlobalSearch({ creds, open, onClose, onSelectChannel, onSelectMovie, onSelectSeries }: Props) {
  const api = useMemo(() => new XtreamAPI(creds), [creds])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [channels, setChannels] = useState<XtreamChannel[]>([])
  const [movies, setMovies] = useState<XtreamMovie[]>([])
  const [series, setSeries] = useState<XtreamSeries[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const cacheKey = `${creds.url}|${creds.username}`

  useEffect(() => {
    if (!open) return
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 50)
    if (cache && cache.key === cacheKey) {
      setChannels(cache.channels); setMovies(cache.movies); setSeries(cache.series)
      return
    }
    setLoading(true)
    Promise.allSettled([api.getLiveStreams(), api.getVodStreams(), api.getSeries()])
      .then(([c, m, s]) => {
        const ch = c.status === 'fulfilled' && Array.isArray(c.value) ? c.value : []
        const mo = m.status === 'fulfilled' && Array.isArray(m.value) ? m.value : []
        const se = s.status === 'fulfilled' && Array.isArray(s.value) ? s.value : []
        cache = { key: cacheKey, channels: ch, movies: mo, series: se }
        setChannels(ch); setMovies(mo); setSeries(se)
      })
      .finally(() => setLoading(false))
  }, [open, api, cacheKey])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const q = query.trim().toLowerCase()
  const chResults = q ? channels.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6) : []
  const movResults = q ? movies.filter(m => m.name.toLowerCase().includes(q)).slice(0, 6) : []
  const serResults = q ? series.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6) : []
  const hasResults = chResults.length + movResults.length + serResults.length > 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Champ de recherche */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-800">
          <svg className="w-4 h-4 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une chaîne, un film, une série..."
            className="flex-1 bg-transparent text-white text-sm py-4 focus:outline-none placeholder-gray-500"
          />
          <kbd className="hidden sm:block text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Échap</kbd>
        </div>

        {/* Résultats */}
        <div className="max-h-[55vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 text-xs p-4">
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
              Chargement du catalogue...
            </div>
          )}
          {!loading && q && !hasResults && (
            <div className="p-6 text-center text-gray-500 text-sm">Aucun résultat pour « {query} »</div>
          )}
          {!loading && !q && (
            <div className="p-6 text-center text-gray-600 text-xs">Tape pour chercher dans {channels.length} chaînes, {movies.length} films et {series.length} séries</div>
          )}

          {chResults.length > 0 && (
            <Section title="Chaînes TV">
              {chResults.map(ch => (
                <ResultRow key={`c${ch.stream_id}`} onClick={() => { onSelectChannel(ch); onClose() }}>
                  <ChannelLogo name={ch.name} icon={ch.stream_icon} className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0" />
                  <span className="text-sm text-gray-200 truncate">{ch.name}</span>
                </ResultRow>
              ))}
            </Section>
          )}
          {movResults.length > 0 && (
            <Section title="Films">
              {movResults.map(m => (
                <ResultRow key={`m${m.stream_id}`} onClick={() => { onSelectMovie(m); onClose() }}>
                  {m.stream_icon
                    ? <img src={m.stream_icon} alt="" className="w-8 h-11 rounded object-cover flex-shrink-0" loading="lazy" />
                    : <div className="w-8 h-11 rounded bg-gray-800 flex-shrink-0" />}
                  <span className="text-sm text-gray-200 truncate">{m.name}</span>
                </ResultRow>
              ))}
            </Section>
          )}
          {serResults.length > 0 && (
            <Section title="Séries">
              {serResults.map(s => (
                <ResultRow key={`s${s.series_id}`} onClick={() => { onSelectSeries(s); onClose() }}>
                  {s.cover
                    ? <img src={s.cover} alt="" className="w-8 h-11 rounded object-cover flex-shrink-0" loading="lazy" />
                    : <div className="w-8 h-11 rounded bg-gray-800 flex-shrink-0" />}
                  <span className="text-sm text-gray-200 truncate">{s.name}</span>
                </ResultRow>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</div>
      {children}
    </div>
  )
}

function ResultRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800 transition-colors text-left"
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </button>
  )
}
