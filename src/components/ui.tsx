import { useState } from 'react'

// ── Logo de chaîne avec fallback élégant ────────────────────────────────────
// Si pas de logo (ou logo cassé) : initiales sur un dégradé dérivé du nom.

const GRADIENTS = [
  'from-violet-600 to-fuchsia-500',
  'from-blue-600 to-cyan-400',
  'from-orange-500 to-amber-400',
  'from-emerald-600 to-teal-400',
  'from-rose-600 to-pink-400',
  'from-indigo-600 to-blue-400',
  'from-purple-600 to-violet-400',
  'from-cyan-600 to-sky-400',
]

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initials(name: string): string {
  // Retire les préfixes type "FR |" ou "-★✪" pour des initiales utiles
  const clean = name.replace(/^[^a-zA-Z0-9]*([A-Z]{2,3}\s*\|)?\s*/i, '').trim()
  const words = clean.split(/\s+/).filter(w => /[a-zA-Z0-9]/.test(w))
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase() || name.slice(0, 2).toUpperCase()
}

interface ChannelLogoProps {
  name: string
  icon?: string
  className?: string
  textClass?: string
}

export function ChannelLogo({ name, icon, className = '', textClass = 'text-xs' }: ChannelLogoProps) {
  const [broken, setBroken] = useState(false)
  const showFallback = !icon || broken
  if (showFallback) {
    const grad = GRADIENTS[hashName(name) % GRADIENTS.length]
    return (
      <div className={`bg-gradient-to-br ${grad} flex items-center justify-center ${className}`}>
        <span className={`font-bold text-white/90 ${textClass}`}>{initials(name)}</span>
      </div>
    )
  }
  return (
    <div className={`bg-gray-800 ${className}`}>
      <img src={icon} alt="" className="w-full h-full object-contain p-0.5" onError={() => setBroken(true)} loading="lazy" />
    </div>
  )
}

// ── Lecture externe (VLC) ────────────────────────────────────────────────────

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

// Ouvre le flux dans VLC. Android : intent natif fiable.
// Desktop : tente vlc:// (si le handler est installé) puis copie le lien en secours.
export async function openInVlc(streamUrl: string): Promise<'opened' | 'copied'> {
  if (isAndroid()) {
    const noScheme = streamUrl.replace(/^https?:\/\//, '')
    window.location.href = `intent://${noScheme}#Intent;package=org.videolan.vlc;action=android.intent.action.VIEW;scheme=http;type=video/*;end`
    return 'opened'
  }
  try { await navigator.clipboard.writeText(streamUrl) } catch { /* clipboard indisponible */ }
  window.location.href = `vlc://${streamUrl}`
  return 'copied'
}

// ── Avertissement codec ──────────────────────────────────────────────────────

const BROWSER_UNSUPPORTED_AUDIO = ['ac3', 'eac3', 'ac-3', 'ec-3', 'dts', 'truehd', 'mlp']

export function audioCodecWarning(codecName?: string): string | null {
  if (!codecName) return null
  if (BROWSER_UNSUPPORTED_AUDIO.includes(codecName.toLowerCase())) {
    return `Son ${codecName.toUpperCase()} (Dolby/DTS) — non lisible dans le navigateur. Utilise VLC.`
  }
  return null
}

// Chips techniques : codecs vidéo/audio, résolution, canaux, langue
export interface TechInfoData {
  videoCodec?: string
  width?: number
  height?: number
  audioCodec?: string
  channels?: number
  audioLang?: string
}

function resLabel(w?: number, h?: number): string {
  if (!h) return ''
  if (h >= 2000 || (w ?? 0) >= 3800) return '4K'
  if (h >= 1000) return '1080p'
  if (h >= 700) return '720p'
  return `${h}p`
}

function channelsLabel(ch?: number): string {
  if (!ch) return ''
  if (ch >= 8) return '7.1'
  if (ch >= 6) return '5.1'
  if (ch === 2) return 'Stéréo'
  return `${ch}ch`
}

export function TechChips({ info }: { info: TechInfoData }) {
  const chips: string[] = []
  if (info.videoCodec) chips.push([info.videoCodec.toUpperCase(), resLabel(info.width, info.height)].filter(Boolean).join(' '))
  if (info.audioCodec) chips.push([info.audioCodec.toUpperCase(), channelsLabel(info.channels), info.audioLang?.toUpperCase()].filter(Boolean).join(' '))
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 my-2">
      {chips.map((c, i) => (
        <span key={i} className="text-[10px] font-mono text-gray-400 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">{c}</span>
      ))}
    </div>
  )
}

export function CodecBadge({ audio }: { audio?: string }) {
  const warning = audioCodecWarning(audio)
  if (!warning) return null
  return (
    <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/40 text-amber-400 text-xs rounded-lg px-3 py-2 my-2">
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
      {warning}
    </div>
  )
}

// ── Skeletons ────────────────────────────────────────────────────────────────

export function ChannelRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-800/40">
      <div className="w-9 h-9 flex-shrink-0 rounded-md bg-gray-800 animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-800 rounded animate-pulse" style={{ width: `${50 + (Math.random() * 40)}%` }} />
      </div>
      <div className="w-8 h-6 bg-gray-800 rounded-md animate-pulse" />
    </div>
  )
}

export function CategorySkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-800/50">
      <div className="w-4 h-4 mt-0.5 bg-gray-800 rounded animate-pulse" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-800 rounded animate-pulse" style={{ width: `${40 + (Math.random() * 45)}%` }} />
        <div className="h-2.5 bg-gray-800/60 rounded animate-pulse w-14" />
      </div>
    </div>
  )
}

export function PosterSkeleton() {
  return (
    <div className="space-y-2">
      <div className="aspect-[2/3] bg-gray-800 rounded-xl animate-pulse" />
      <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4 mx-auto" />
    </div>
  )
}

export function LiveTVSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Catégories */}
      <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 hidden sm:block">
        {Array.from({ length: 10 }, (_, i) => <CategorySkeleton key={i} />)}
      </div>
      {/* Chaînes */}
      <div className="w-72 flex-shrink-0 bg-gray-950 border-r border-gray-800 hidden sm:block">
        <div className="p-3 border-b border-gray-800"><div className="h-9 bg-gray-800 rounded-lg animate-pulse" /></div>
        {Array.from({ length: 12 }, (_, i) => <ChannelRowSkeleton key={i} />)}
      </div>
      {/* Mobile : liste simple */}
      <div className="flex-1 sm:hidden">
        {Array.from({ length: 10 }, (_, i) => <CategorySkeleton key={i} />)}
      </div>
      {/* Zone player vide */}
      <div className="flex-1 hidden sm:flex items-center justify-center bg-gray-950">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 animate-pulse" />
      </div>
    </div>
  )
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 p-4">
      {Array.from({ length: count }, (_, i) => <PosterSkeleton key={i} />)}
    </div>
  )
}
