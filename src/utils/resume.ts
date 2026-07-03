// ── Reprise de lecture ───────────────────────────────────────────────────────
// Mémorise la position des films/épisodes en localStorage et la restaure
// au retour. Clé = URL du flux (stable et unique par contenu).

const STORE_KEY = 'iptv_resume'
const MAX_ENTRIES = 200
const MIN_SECONDS = 30 // en dessous, pas la peine de reprendre

export interface ResumeMeta {
  title: string
  poster?: string
  kind: 'movie' | 'episode'
}

interface ResumeEntry {
  t: number // position (secondes)
  d: number // durée totale connue
  at: number // timestamp de sauvegarde
  meta?: ResumeMeta
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

function setResume(key: string, t: number, d: number, meta?: ResumeMeta): void {
  const store = loadStore()
  const prevMeta = store[key]?.meta
  store[key] = { t: Math.floor(t), d: Math.floor(d || 0), at: Date.now(), meta: meta ?? prevMeta }
  saveStore(store)
}

function clearResume(key: string): void {
  const store = loadStore()
  delete store[key]
  saveStore(store)
}

// Liste pour la vitrine "Continuer à regarder" : entrées avec métadonnées,
// non terminées, triées par date de visionnage la plus récente.
export function listResume(limit = 20): Array<{ key: string; t: number; d: number; meta: ResumeMeta }> {
  const store = loadStore()
  return Object.entries(store)
    .filter((e): e is [string, ResumeEntry & { meta: ResumeMeta }] => !!e[1].meta && e[1].t >= MIN_SECONDS && (!e[1].d || e[1].t <= e[1].d * 0.95))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([key, e]) => ({ key, t: e.t, d: e.d, meta: e.meta }))
}

// Branche la reprise sur un élément video. Retourne une fonction de nettoyage.
export function attachResume(video: HTMLVideoElement, key: string, meta?: ResumeMeta): () => void {
  let lastSave = 0

  const onLoaded = () => {
    const t = getResume(key)
    if (t !== null) video.currentTime = t
  }
  const onTime = () => {
    const now = Date.now()
    if (now - lastSave > 5000 && video.currentTime > MIN_SECONDS) {
      lastSave = now
      setResume(key, video.currentTime, video.duration, meta)
    }
  }
  const onEnded = () => clearResume(key)

  video.addEventListener('loadedmetadata', onLoaded)
  video.addEventListener('timeupdate', onTime)
  video.addEventListener('ended', onEnded)

  return () => {
    if (video.currentTime > MIN_SECONDS) setResume(key, video.currentTime, video.duration, meta)
    video.removeEventListener('loadedmetadata', onLoaded)
    video.removeEventListener('timeupdate', onTime)
    video.removeEventListener('ended', onEnded)
  }
}
