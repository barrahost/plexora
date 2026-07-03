import { useEffect, useState } from 'react'
import { listResume } from '../utils/resume'

interface Props {
  onResume: (url: string, title: string, cover?: string) => void
}

export default function Home({ onResume }: Props) {
  const [items, setItems] = useState(() => listResume())

  // Rafraîchit quand on revient sur l'onglet (après avoir quitté un lecteur)
  useEffect(() => {
    const onFocus = () => setItems(listResume())
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <h2 className="text-white font-bold text-lg mb-4">Continuer à regarder</h2>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <svg className="w-10 h-10 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/></svg>
            <p className="text-gray-500 text-sm">Les films et épisodes que tu commences à regarder<br/>apparaîtront ici pour reprendre où tu en étais.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {items.map(item => {
              const progress = item.d ? Math.min(100, (item.t / item.d) * 100) : 0
              return (
                <div
                  key={item.key}
                  onClick={() => onResume(item.key, item.meta.title, item.meta.poster)}
                  className="group relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3] cursor-pointer hover:ring-2 hover:ring-violet-500 hover:scale-[1.03] hover:shadow-xl hover:shadow-violet-900/30 hover:z-10 transition-all duration-200"
                  style={{ touchAction: 'manipulation' }}
                >
                  {item.meta.poster ? (
                    <img src={item.meta.poster} alt="" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent flex items-end justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center mb-6">
                      <svg className="w-6 h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-2 pt-4">
                    <span className="text-white text-xs font-medium line-clamp-2 block mb-1.5">{item.meta.title}</span>
                    <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-semibold uppercase tracking-wide bg-black/70 text-gray-300 px-1.5 py-0.5 rounded">
                    {item.meta.kind === 'episode' ? 'Série' : 'Film'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
