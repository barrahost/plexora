import { useState, useEffect } from 'react'
import type { XtreamCredentials, XtreamChannel, XtreamAccountInfo, ViewType } from './types/xtream'
import { loadCredentials, clearCredentials, XtreamAPI, getActivePlaylistId, setActivePlaylistId, getPlaylists } from './utils/api'
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
      {/* Top navbar */}
      <header className="flex-shrink-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <span className="font-bold text-sm hidden sm:block">IPTV Web</span>
        </div>

        <nav className="flex items-center gap-1 ml-2">
          {([
            { id: 'live' as const, label: 'Live TV', icon: 'M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z' },
            { id: 'movies' as const, label: 'Films', icon: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z' },
            { id: 'series' as const, label: 'Séries', icon: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' },
          ]).map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${view === item.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d={item.icon}/></svg>
              <span className="hidden sm:block">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Playlist active */}
          {activeName && (
            <button
              onClick={() => setView('playlists')}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition ${view === 'playlists' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
              title="Gérer les playlists"
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

          {/* Playlists (mobile) */}
          <button
            onClick={() => setView('playlists')}
            className={`md:hidden flex items-center justify-center w-8 h-8 rounded-lg transition ${view === 'playlists' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            title="Playlists"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
            title="Déconnexion"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            <span className="hidden sm:block">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex">
        {view === 'live' && <LiveTV creds={creds} onPlay={handlePlay} />}
        {view === 'movies' && <Movies creds={creds} onPlay={handlePlay} />}
        {view === 'series' && <SeriesView creds={creds} onPlay={handlePlay} />}
        {view === 'playlists' && <PlaylistManager onSwitch={handlePlaylistSwitch} />}
      </main>

      {/* Player overlay */}
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
