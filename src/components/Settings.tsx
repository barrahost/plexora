import { useState } from 'react'
import type { XtreamCredentials } from '../types/xtream'
import PlaylistManager from './PlaylistManager'
import { getBufferMode, setBufferMode } from '../utils/buffer'
import type { BufferMode } from '../utils/buffer'

interface Props {
  onSwitch: (creds: XtreamCredentials, playlistId: string) => void
}

const BUFFER_OPTIONS: { id: BufferMode; label: string; desc: string }[] = [
  { id: 'small', label: 'Faible', desc: 'Réaction rapide, mais plus sensible aux coupures sur réseau instable.' },
  { id: 'medium', label: 'Moyen', desc: 'Équilibre recommandé pour la plupart des connexions.' },
  { id: 'high', label: 'Élevé', desc: 'Absorbe les ralentissements serveur — moins de coupures, léger délai au démarrage.' },
]

export default function Settings({ onSwitch }: Props) {
  const [tab, setTab] = useState<'comptes' | 'lecture'>('comptes')
  const [buffer, setBuffer] = useState<BufferMode>(getBufferMode())

  function handleBufferChange(mode: BufferMode) {
    setBufferMode(mode)
    setBuffer(mode)
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Sous-navigation */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 sm:px-6 pt-4 border-b border-gray-800">
        <button
          onClick={() => setTab('comptes')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${tab === 'comptes' ? 'bg-gray-900 text-white border-b-2 border-violet-500' : 'text-gray-500 hover:text-gray-300'}`}
          style={{ touchAction: 'manipulation' }}
        >
          Comptes
        </button>
        <button
          onClick={() => setTab('lecture')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${tab === 'lecture' ? 'bg-gray-900 text-white border-b-2 border-violet-500' : 'text-gray-500 hover:text-gray-300'}`}
          style={{ touchAction: 'manipulation' }}
        >
          Lecture
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'comptes' && <PlaylistManager onSwitch={onSwitch} />}

        {tab === 'lecture' && (
          <div className="max-w-lg mx-auto p-6 sm:p-8 overflow-y-auto h-full">
            <h3 className="text-white font-semibold text-lg mb-1">Taille du tampon vidéo</h3>
            <p className="text-gray-500 text-sm mb-6">Augmente-la si les chaînes coupent souvent.</p>
            <div className="space-y-3">
              {BUFFER_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handleBufferChange(opt.id)}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    buffer === opt.id ? 'bg-violet-600/15 border-violet-500' : 'bg-gray-800/50 border-gray-800 hover:border-gray-700'
                  }`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold text-sm ${buffer === opt.id ? 'text-violet-400' : 'text-white'}`}>{opt.label}</span>
                    {buffer === opt.id && (
                      <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs">{opt.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-gray-600 text-xs mt-6">S'applique à la prochaine lecture d'une chaîne ou d'un flux.</p>
          </div>
        )}
      </div>
    </div>
  )
}
