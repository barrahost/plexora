// ── Taille du tampon vidéo ───────────────────────────────────────────────────
// Plus le tampon est grand, plus le lecteur absorbe les ralentissements
// réseau/serveur sans couper — au prix d'un léger délai avant que l'image
// bouge (moins critique en IPTV qu'en direct sportif serré).

export type BufferMode = 'small' | 'medium' | 'high'

interface Preset {
  maxBufferLength: number
  maxMaxBufferLength: number
  liveSyncDurationCount: number
  lowLatencyMode: boolean
}

const PRESETS: Record<BufferMode, Preset> = {
  small:  { maxBufferLength: 10, maxMaxBufferLength: 30,  liveSyncDurationCount: 3, lowLatencyMode: true },
  medium: { maxBufferLength: 30, maxMaxBufferLength: 90,  liveSyncDurationCount: 5, lowLatencyMode: false },
  high:   { maxBufferLength: 60, maxMaxBufferLength: 180, liveSyncDurationCount: 8, lowLatencyMode: false },
}

const KEY = 'iptv_buffer_mode'

export function getBufferMode(): BufferMode {
  const v = localStorage.getItem(KEY)
  return v === 'small' || v === 'medium' || v === 'high' ? v : 'medium'
}

export function setBufferMode(mode: BufferMode): void {
  localStorage.setItem(KEY, mode)
}

export function getHlsBufferConfig(): Preset {
  return PRESETS[getBufferMode()]
}
