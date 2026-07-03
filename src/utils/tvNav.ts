// ── Navigation télécommande (Android TV / Fire TV) ──────────────────────────
// Sur une page web classique, les flèches directionnelles ne déplacent le
// focus nulle part (contrairement à Tab) : il faut une navigation spatiale
// maison. Ce module détecte un contexte TV, active un moteur léger qui
// déplace le focus vers l'élément focusable le plus proche dans la direction
// pressée, et bascule l'UI en échelle "10 pieds" (police plus grande).

export function isTV(): boolean {
  const ua = navigator.userAgent
  // Android TV / Fire TV (AFT*) / Google TV / téléviseurs connectés courants
  if (/\b(Android TV|AFTM|AFTB|AFTT|AFTS|AFTA|AFTN|AFTR|GoogleTV|BRAVIA|SmartTV|Tizen|Web0S|WebOS)\b/i.test(ua)) return true
  // Repli : grand écran, aucun tactile, aucun survol precis (profil TV typique)
  if (!('ontouchstart' in window) && matchMedia('(hover: none)').matches && window.innerWidth >= 960) return true
  return false
}

let enabled = false

export function enableTVNavigation(): void {
  if (enabled) return
  enabled = true
  document.documentElement.classList.add('tv-mode')
  window.addEventListener('keydown', onKeyDown, true)
  requestAnimationFrame(focusFirst)
}

function isVisible(el: HTMLElement): boolean {
  if (el.hidden || el.closest('[hidden]')) return false
  const style = getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0
}

function getFocusables(): HTMLElement[] {
  const nodes = document.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  return Array.from(nodes).filter(isVisible)
}

function focusFirst(): void {
  if (document.activeElement && document.activeElement !== document.body) return
  getFocusables()[0]?.focus()
}

function onKeyDown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return // laisser le curseur texte bouger normalement

  const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  }
  const dir = dirMap[e.key]
  if (!dir) return

  const active = document.activeElement as HTMLElement | null
  const focusables = getFocusables()
  if (!active || active === document.body || !focusables.includes(active)) {
    focusFirst()
    e.preventDefault()
    return
  }

  const next = findBestCandidate(active, focusables, dir)
  if (next) {
    e.preventDefault()
    next.focus()
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
}

// Heuristique classique de navigation spatiale : élément le plus proche dans
// l'axe pressé, pondéré pour favoriser l'alignement sur l'axe perpendiculaire.
function findBestCandidate(from: HTMLElement, candidates: HTMLElement[], dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const fromRect = from.getBoundingClientRect()
  const fx = fromRect.left + fromRect.width / 2
  const fy = fromRect.top + fromRect.height / 2

  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const el of candidates) {
    if (el === from) continue
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = cx - fx
    const dy = cy - fy
    let primary: number, secondary: number

    switch (dir) {
      case 'up': if (dy >= -1) continue; primary = -dy; secondary = Math.abs(dx); break
      case 'down': if (dy <= 1) continue; primary = dy; secondary = Math.abs(dx); break
      case 'left': if (dx >= -1) continue; primary = -dx; secondary = Math.abs(dy); break
      case 'right': if (dx <= 1) continue; primary = dx; secondary = Math.abs(dy); break
    }

    const score = primary + secondary * 2.5
    if (score < bestScore) { bestScore = score; best = el }
  }
  return best
}
