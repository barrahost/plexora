import { useState, useEffect } from 'react'
import type { XtreamCredentials, XtreamChannel, XtreamMovie, XtreamSeries, XtreamAccountInfo, ViewType } from './types/xtream'
import { loadCredentials, clearCredentials, XtreamAPI, stopVideo } from './utils/api'
import Login from './components/Login'
import Home from './components/Home'
import LiveTV from './components/LiveTV'
import Movies from './components/Movies'
import SeriesView from './components/Series'
import Radio from './components/Radio'
import Player from './components/Player'
import PlaylistManager from './components/PlaylistManager'
import GlobalSearch from './components/GlobalSearch'
import { prefetchXmltv } from './utils/epg'
import { isTV, enableTVNavigation } from './utils/tvNav'

interface PlayInfo {
  url: string
  title: string
  cover?: string
  channel?: XtreamChannel
}

const NAV_ITEMS = [
  {
    id: 'home' as const,
    label: 'Accueil',
    icon: 'M12 3l9 8h-3v9h-5v-6H11v6H6v-9H3l9-8z',
  },
  {
    id: 'live' as const,
    label: 'Live TV',
    icon: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z',
  },
  {
    id: 'movies' as const,
    label: 'Films',
    icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
  },
  {
    id: 'series' as const,
    label: 'Séries',
    icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z',
  },
]

// Onglets secondaires : regroupés sous "Plus" sur mobile (limite 5 items bottom nav),
// affichés normalement dans la navbar desktop.
const MORE_ITEMS = [
  {
    id: 'radio' as const,
    label: 'Radio',
    icon: 'M20 4H6.83l3.58-3.59L9 0 4 5v1c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm8-9h-2V8h2v2z',
  },
  {
    id: 'playlists' as const,
    label: 'Playlists',
    icon: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z',
  },
]

export default function App() {
  const [creds, setCreds] = useState<XtreamCredentials | null>(loadCredentials)
  const [view, setView] = useState<ViewType>('live')
  const [playing, setPlaying] = useState<PlayInfo | null>(null)
  const [accountInfo, setAccountInfo] = useState<XtreamAccountInfo | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  // "Sauts" déclenchés par la recherche globale (ts force le re-déclenchement)
  const [jumpChannel, setJumpChannel] = useState<{ item: XtreamChannel; ts: number } | null>(null)
  const [jumpMovie, setJumpMovie] = useState<{ item: XtreamMovie; ts: number } | null>(null)
  const [jumpSeries, setJumpSeries] = useState<{ item: XtreamSeries; ts: number } | null>(null)

  // Raccourci Ctrl+K (ou "/") : recherche globale
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(o => !o) }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!creds) return
    new XtreamAPI(creds).getAccountInfo().then(setAccountInfo).catch(() => {})
    // Précharger le guide XMLTV en arrière-plan → EPG instantané partout
    prefetchXmltv(creds)
  }, [creds])

  // Android TV / Fire TV / téléviseurs connectés : navigation D-pad + échelle 10 pieds
  useEffect(() => {
    if (isTV()) enableTVNavigation()
  }, [])

  // Fermeture d'onglet / navigation : couper tous les flux pour libérer
  // la connexion IPTV (max_connections=1) immédiatement côté serveur
  useEffect(() => {
    const stopAll = () => document.querySelectorAll('video').forEach(v => stopVideo(v))
    window.addEventListener('pagehide', stopAll)
    return () => window.removeEventListener('pagehide', stopAll)
  }, [])

  function handleLogin(c: XtreamCredentials) {
    setCreds(c)
    setView('live')
  }

  function handleLogout() {
    clearCredentials()
    setCreds(null)
    setPlaying(null)
    setAccountInfo(null)
  }

  function handlePlay(url: string, title: string, cover?: string, channel?: XtreamChannel) {
    setPlaying({ url, title, cover, channel })
  }

  function handlePlaylistSwitch(c: XtreamCredentials) {
    setCreds(c)
    setPlaying(null)
    setAccountInfo(null)
    setView('live')
    new XtreamAPI(c).getAccountInfo().then(setAccountInfo).catch(() => {})
  }


  if (!creds) return <Login onLogin={handleLogin} />

  const expDate = accountInfo?.user_info?.exp_date
    ? new Date(Number(accountInfo.user_info.exp_date) * 1000).toLocaleDateString('fr-FR')
    : null

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── Top navbar (desktop) ── */}
      <header className="flex-shrink-0 h-24 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4">
        <div className="flex items-center">
          <img src="/logo-plexora-nav.png" alt="Plexora" className="h-20 w-auto" />
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1 ml-2">
          {[...NAV_ITEMS, ...MORE_ITEMS].map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === item.id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d={item.icon}/></svg>
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Recherche globale */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border border-gray-800"
            style={{ touchAction: 'manipulation' }}
            title="Recherche globale (Ctrl+K)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <span className="hidden md:block text-xs text-gray-500">Rechercher</span>
            <kbd className="hidden md:block text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>
          {accountInfo && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-gray-500 px-2">
              <div className={`w-1.5 h-1.5 rounded-full ${accountInfo.user_info.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>{accountInfo.user_info.username}</span>
              {expDate && <span>· {expDate}</span>}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:gap-1.5 sm:px-3 sm:py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Déconnexion"
            style={{ touchAction: 'manipulation' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            <span className="hidden sm:block">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      {/* pb-16 on mobile reserves space above bottom nav */}
      <main className="flex-1 overflow-hidden flex pb-16 sm:pb-0">
        {view === 'home'      && <Home onResume={handlePlay} />}
        {view === 'live'      && <LiveTV creds={creds} onPlay={handlePlay} jump={jumpChannel} />}
        {view === 'movies'    && <Movies creds={creds} onPlay={handlePlay} jump={jumpMovie} />}
        {view === 'series'    && <SeriesView creds={creds} onPlay={handlePlay} jump={jumpSeries} />}
        {view === 'radio'     && <Radio creds={creds} />}
        {view === 'playlists' && <PlaylistManager onSwitch={handlePlaylistSwitch} />}
      </main>

      {/* ── Recherche globale (Ctrl+K) ── */}
      <GlobalSearch
        creds={creds}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectChannel={ch => { setView('live'); setJumpChannel({ item: ch, ts: Date.now() }) }}
        onSelectMovie={m => { setView('movies'); setJumpMovie({ item: m, ts: Date.now() }) }}
        onSelectSeries={s => { setView('series'); setJumpSeries({ item: s, ts: Date.now() }) }}
      />

      {/* ── Menu "Plus" mobile (Radio, Playlists) ── */}
      {mobileMoreOpen && (
        <div className="sm:hidden fixed inset-0 z-40" onClick={() => setMobileMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute bottom-16 left-0 right-0 bg-gray-900 border-t border-gray-800 rounded-t-2xl p-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }} onClick={e => e.stopPropagation()}>
            {MORE_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setMobileMoreOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${view === item.id ? 'bg-violet-600/20 text-violet-400' : 'text-gray-300 hover:bg-gray-800'}`}
                style={{ touchAction: 'manipulation' }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d={item.icon}/></svg>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom nav (mobile only) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex bg-gray-900 border-t border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {NAV_ITEMS.map(item => {
          const active = view === item.id
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors relative"
              style={{ touchAction: 'manipulation' }}
              aria-label={item.label}
            >
              <svg
                className={`w-6 h-6 transition-colors ${active ? 'text-violet-400' : 'text-gray-500'}`}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d={item.icon}/>
              </svg>
              <span className={`text-[10px] font-medium transition-colors ${active ? 'text-violet-400' : 'text-gray-500'}`}>
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-violet-500 rounded-full" />
              )}
            </button>
          )
        })}
        {(() => {
          const moreActive = MORE_ITEMS.some(m => m.id === view)
          return (
            <button
              onClick={() => setMobileMoreOpen(o => !o)}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors relative"
              style={{ touchAction: 'manipulation' }}
              aria-label="Plus"
            >
              <svg className={`w-6 h-6 transition-colors ${moreActive ? 'text-violet-400' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              <span className={`text-[10px] font-medium transition-colors ${moreActive ? 'text-violet-400' : 'text-gray-500'}`}>Plus</span>
              {moreActive && <span className="absolute bottom-0 w-8 h-0.5 bg-violet-500 rounded-full" />}
            </button>
          )
        })()}
      </nav>

      {/* ── Player overlay ── */}
      {playing && (
        <Player
          streamUrl={playing.url}
          title={playing.title}
          cover={playing.cover}
          channel={playing.channel}
          creds={creds}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  )
}
