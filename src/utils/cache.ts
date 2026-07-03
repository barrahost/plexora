// ── Cache local "stale-while-revalidate" ────────────────────────────────────
// Les catalogues (chaînes, films, séries) sont volumineux et le serveur IPTV
// est lent/instable. Comme TiviMate/HotPlayer : on affiche immédiatement la
// dernière copie connue depuis localStorage, pendant qu'une requête fraîche
// tourne en arrière-plan et remplace silencieusement les données à l'arrivée.

export function loadCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

export function saveCached<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* quota dépassé, tant pis */ }
}

export function cacheKey(prefix: string, creds: { url: string; username: string }): string {
  return `iptv_cache_${prefix}_${creds.url}_${creds.username}`
}
