import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import type { XtreamChannel, XtreamMovie, EPGItem } from '../types/xtream'
import { XtreamAPI, needsProxy, stopVideo } from '../utils/api'
import { attachResume } from '../utils/resume'
import type { XtreamCredentials } from '../types/xtream'

interface Props {
  streamUrl: string
  title: string
  cover?: string
  channel?: XtreamChannel
  movie?: XtreamMovie
  creds: XtreamCredentials
  onClose: () => void
}

export default function Player({ streamUrl, title, cover, channel, creds, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const mpegtsRef = useRef<mpegts.Player | null>(null)
  const [epg, setEpg] = useState<EPGItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setError(null)

    const isHlsStream = streamUrl.includes('.m3u8')
    // .ts brut (live direct ou catch-up) : ni HLS.js ni <video src> ne le lisent nativement → mpegts.js
    const isRawTs = !isHlsStream && streamUrl.includes('.ts')
    // Page HTTPS → passer par le proxy pour éviter le mixed content
    const url = needsProxy()
      ? (isHlsStream ? `/hls?url=${encodeURIComponent(streamUrl)}` : `/proxy?target=${encodeURIComponent(streamUrl)}`)
      : streamUrl

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError('Impossible de lire ce contenu.') })
    } else if (isRawTs && mpegts.isSupported()) {
      const player = mpegts.createPlayer({ type: 'mse', isLive: false, url })
      mpegtsRef.current = player
      player.attachMediaElement(video)
      player.on(mpegts.Events.ERROR, () => setError('Ce programme n\'est pas disponible en replay sur cet abonnement.'))
      player.load()
      player.play()?.catch?.(() => {})
    } else {
      // VOD (.mp4/.mkv) ou HLS natif (Safari) : lecture directe
      video.src = url
      video.play().catch(() => {})
    }
    // Reprise de lecture pour la VOD (pas pour le live) — kind déduit du titre
    // (les épisodes contiennent "S01E02", Player ne reçoit pas cette distinction en prop)
    const kind = /S\d+E\d+/i.test(title) ? 'episode' : 'movie'
    const detachResume = (isHlsStream || isRawTs) ? null : attachResume(video, streamUrl, { title, poster: cover, kind })

    return () => {
      detachResume?.()
      hlsRef.current?.destroy()
      hlsRef.current = null
      mpegtsRef.current?.destroy()
      mpegtsRef.current = null
      stopVideo(video)
    }
  }, [streamUrl])

  useEffect(() => {
    if (!channel) return
    const api = new XtreamAPI(creds)
    api.getEPG(channel.stream_id).then(data => {
      setEpg(data.epg_listings || [])
    }).catch(() => {})
  }, [channel, creds])

  function handleMouseMove() {
    setShowControls(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShowControls(false), 3000)
  }

  function toggleFullscreen() {
    const el = document.getElementById('player-container')
    if (!document.fullscreenElement) {
      el?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const currentEpg = epg.find(e => e.now_playing === 1)
  const nextEpg = epg.find(e => e.now_playing === 0)

  return (
    <div
      id="player-container"
      className="fixed inset-0 bg-black z-50 flex flex-col"
      onMouseMove={handleMouseMove}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls={false}
        autoPlay
      />

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 z-10">
          <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <div className="text-gray-300 text-sm text-center max-w-xs">{error}</div>
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition">Fermer</button>
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/90 to-transparent p-4 flex items-center gap-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div className="flex items-center gap-3">
          {cover && <img src={cover} className="w-8 h-8 rounded object-cover" alt="" />}
          <div>
            <div className="text-white font-semibold text-sm">{title}</div>
            {currentEpg && (
              <div className="text-gray-300 text-xs">{decodeHtml(currentEpg.title)}</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {currentEpg && (
          <div className="mb-3">
            <div className="flex items-center gap-2 text-xs text-gray-300 mb-1">
              <span className="bg-violet-600 text-white px-2 py-0.5 rounded text-xs font-medium">EN COURS</span>
              <span>{decodeHtml(currentEpg.title)}</span>
              <span className="text-gray-500">·</span>
              <span>{formatTime(currentEpg.start)} - {formatTime(currentEpg.end)}</span>
            </div>
            {nextEpg && (
              <div className="text-xs text-gray-500">
                Ensuite : {decodeHtml(nextEpg.title)} à {formatTime(nextEpg.start)}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const v = videoRef.current
                if (v) v.muted = !v.muted
              }}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            </button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>
        </div>
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

function decodeHtml(str: string): string {
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}
