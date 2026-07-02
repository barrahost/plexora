import { useState, useEffect } from 'react'
import type { XtreamCredentials, XtreamChannel, XtreamAccountInfo, ViewType } from './types/xtream'
import { loadCredentials, clearCredentials, XtreamAPI, getActivePlaylistId, getPlaylists } from './utils/api'
import Login from './components/Login'
import LiveTV from './components/LiveTV'
import Movies from './components/Movies'
import SeriesView from './components/Series'
import Player from './components/Player'
import PlaylistManager from './components/PlaylistManager'

interface PlayInfo {
  url: string
  title: string
  cover?: string
  channel?: XtreamChannel
}

const NAV_ITEMS = [
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

  useEffect(() => {
    if (!creds) return
    new XtreamAPI(creds).getAccountInfo().then(setAccountInfo).catch(() => {})
  }, [creds])

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

  const playlists = getPlaylists()
  const activePlaylistId = getActivePlaylistId() ?? playlists[0]?.id ?? null
  const activeName = playlists.find(p => p.id === activePlaylistId)?.name ?? null

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
          {NAV_ITEMS.map(item => (
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
          {activeName && (
            <button
              onClick={() => setView('playlists')}
              className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                view === 'playlists' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
              <span className="max-w-[120px] truncate">{activeName}</span>
            </button>
          )}

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
        {view === 'live'      && <LiveTV creds={creds} onPlay={handlePlay} />}
        {view === 'movies'    && <Movies creds={creds} onPlay={handlePlay} />}
        {view === 'series'    && <SeriesView creds={creds} onPlay={handlePlay} />}
        {view === 'playlists' && <PlaylistManager onSwitch={handlePlaylistSwitch} />}
      </main>

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
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors"
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
