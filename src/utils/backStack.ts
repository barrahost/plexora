// ── Coordination du bouton Retour ────────────────────────────────────────────
// Plusieurs niveaux peuvent être montés en même temps (ex. formulaire
// d'édition de playlist dans l'onglet Comptes dans Paramètres) : une vraie
// pile est nécessaire. L'ordre de montage React (parent avant enfant) place
// naturellement le niveau le plus profond en haut de pile, donc vérifié en
// premier — comportement correct sans coordination explicite entre écrans.

import { useEffect, useRef } from 'react'

type BackHandler = () => boolean

let stack: BackHandler[] = []

function push(fn: BackHandler): () => void {
  stack.push(fn)
  return () => { stack = stack.filter(h => h !== fn) }
}

export function tryHandleBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true
  }
  return false
}

// Enregistre un handler de recul tant que le composant est monté. `fn` peut
// changer à chaque rendu (fermer sur l'état courant) sans jamais re-empiler :
// une ref garde toujours la version la plus récente.
export function useBackHandler(fn: () => boolean): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const stable: BackHandler = () => ref.current()
    return push(stable)
  }, [])
}
