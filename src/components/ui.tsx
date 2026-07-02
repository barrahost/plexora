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
