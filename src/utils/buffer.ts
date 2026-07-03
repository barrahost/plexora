// ── Taille du tampon vidéo ───────────────────────────────────────────────────
// Plus le tampon est grand, plus le lecteur absorbe les ralentissements
// réseau/serveur sans couper — au prix d'un léger délai avant que l'image
// bouge (moins critique en IPTV qu'en direct sportif serré).

export type BufferMode = 'small' | 'medium' | 'high'

interface Preset {
  maxBufferLength: number
  maxMaxBufferLength: number
}

// Uniquement des réglages "sûrs" : combien tamponner UNE FOIS la lecture
// démarrée. On ne touche pas à liveSyncDurationCount/lowLatencyMode — ces
// options gouvernent le nombre de segments à charger AVANT de démarrer la
// lecture, et une valeur trop haute peut empêcher le direct de démarrer du
// tout sur un serveur IPTV aussi instable que celui-ci (régression constatée).
const PRESETS: Record<BufferMode, Preset> = {
  small:  { maxBufferLength: 15, maxMaxBufferLength: 30 },
  medium: { maxBufferLength: 30, maxMaxBufferLength: 60 },
  high:   { maxBufferLength: 60, maxMaxBufferLength: 120 },
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
