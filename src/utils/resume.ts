// ── Reprise de lecture ───────────────────────────────────────────────────────
// Mémorise la position des films/épisodes en localStorage et la restaure
// au retour. Clé = URL du flux (stable et unique par contenu).

const STORE_KEY = 'iptv_resume'
const MAX_ENTRIES = 200
const MIN_SECONDS = 30 // en dessous, pas la peine de reprendre

interface ResumeEntry {
  t: number // position (secondes)
  d: number // durée totale connue
  at: number // timestamp de sauvegarde
}

function loadStore(): Record<string, ResumeEntry> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}

function saveStore(store: Record<string, ResumeEntry>): void {
  // Limiter la taille : garder les plus récents
  const entries = Object.entries(store)
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b[1].at - a[1].at)
    store = Object.fromEntries(entries.slice(0, MAX_ENTRIES))
  }
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch { /* stockage plein */ }
}

export function getResume(key: string): number | null {
  const e = loadStore()[key]
  if (!e || e.t < MIN_SECONDS) return null
  if (e.d && e.t > e.d * 0.95) return null // quasi terminé → repartir du début
  return e.t
}

function setResume(key: string, t: number, d: number): void {
  const store = loadStore()
  store[key] = { t: Math.floor(t), d: Math.floor(d || 0), at: Date.now() }
  saveStore(store)
}

function clearResume(key: string): void {
  const store = loadStore()
  delete store[key]
  saveStore(store)
}

// Branche la reprise sur un élément video. Retourne une fonction de nettoyage.
export function attachResume(video: HTMLVideoElement, key: string): () => void {
  let lastSave = 0

  const onLoaded = () => {
    const t = getResume(key)
    if (t !== null) video.currentTime = t
  }
  const onTime = () => {
    const now = Date.now()
    if (now - lastSave > 5000 && video.currentTime > MIN_SECONDS) {
      lastSave = now
      setResume(key, video.currentTime, video.duration)
    }
  }
  const onEnded = () => clearResume(key)

  video.addEventListener('loadedmetadata', onLoaded)
  video.addEventListener('timeupdate', onTime)
  video.addEventListener('ended', onEnded)

  return () => {
    if (video.currentTime > MIN_SECONDS) setResume(key, video.currentTime, video.duration)
    video.removeEventListener('loadedmetadata', onLoaded)
    video.removeEventListener('timeupdate', onTime)
    video.removeEventListener('ended', onEnded)
  }
}
