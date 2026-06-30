import { useState } from 'react'
import type { XtreamPlaylist, XtreamCredentials } from '../types/xtream'
import {
  getPlaylists, addPlaylist, updatePlaylist, deletePlaylist,
  getActivePlaylistId, setActivePlaylistId,
} from '../utils/api'
import { XtreamAPI } from '../utils/api'

interface Props {
  onSwitch: (creds: XtreamCredentials, playlistId: string) => void
}

interface FormState {
  name: string
  url: string
  username: string
  password: string
}

const EMPTY_FORM: FormState = { name: '', url: '', username: '', password: '' }

export default function PlaylistManager({ onSwitch }: Props) {
  const [playlists, setPlaylists] = useState<XtreamPlaylist[]>(getPlaylists)
  const activeId = getActivePlaylistId() ?? playlists[0]?.id ?? null
  const [editing, setEditing] = useState<string | null>(null) // id en cours d'édition, 'new' pour ajout
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  function refresh() { setPlaylists(getPlaylists()) }

  function handleEdit(pl: XtreamPlaylist) {
    setEditing(pl.id)
    setForm({ name: pl.name, url: pl.url, username: pl.username, password: pl.password })
    setTestResult(null)
  }

  function handleNew() {
    setEditing('new')
    setForm(EMPTY_FORM)
    setTestResult(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const api = new XtreamAPI({ url: form.url, username: form.username, password: form.password })
      const info = await api.getAccountInfo()
      setTestResult(info.user_info?.auth === 1 ? 'ok' : 'error')
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    if (!form.url || !form.username || !form.password) return
    const name = form.name.trim() || form.url.replace(/https?:\/\//, '').split('/')[0]
    if (editing === 'new') {
      const newPl = addPlaylist({ name, url: form.url, username: form.username, password: form.password })
      refresh()
      setEditing(newPl.id)
    } else if (editing) {
      updatePlaylist(editing, { name, url: form.url, username: form.username, password: form.password })
      refresh()
    }
    setForm(f => ({ ...f, name }))
  }

  function handleDelete(id: string) {
    deletePlaylist(id)
    refresh()
    if (editing === id) { setEditing(null); setForm(EMPTY_FORM) }
    setDeleteConfirm(null)
  }

  function handleSwitch(pl: XtreamPlaylist) {
    setActivePlaylistId(pl.id)
    onSwitch({ url: pl.url, username: pl.username, password: pl.password }, pl.id)
  }

  const isActive = (id: string) => id === activeId

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Colonne gauche : liste des playlists ── */}
      <div className="w-80 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold text-base">Mes playlists</h2>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Ajouter
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {playlists.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">Aucune playlist enregistrée.<br/>Clique sur Ajouter.</p>
          )}
          {playlists.map(pl => (
            <div
              key={pl.id}
              className={`rounded-xl border transition ${
                isActive(pl.id)
                  ? 'bg-blue-600/20 border-blue-500/50'
                  : editing === pl.id
                  ? 'bg-gray-800 border-gray-600'
                  : 'bg-gray-800/50 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                {/* Icône */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive(pl.id) ? 'bg-blue-600' : 'bg-gray-700'}`}>
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
                  </svg>
                </div>
                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium truncate">{pl.name}</span>
                    {isActive(pl.id) && (
                      <span className="flex-shrink-0 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-md">Actif</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs truncate mt-0.5">{pl.username}@{pl.url.replace(/https?:\/\//, '').split('/')[0]}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 px-3 pb-3">
                {!isActive(pl.id) && (
                  <button
                    onClick={() => handleSwitch(pl)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-1.5 rounded-lg transition flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    Utiliser
                  </button>
                )}
                <button
                  onClick={() => handleEdit(pl)}
                  className={`${isActive(pl.id) ? 'flex-1' : ''} bg-gray-700 hover:bg-gray-600 text-white text-xs py-1.5 rounded-lg transition flex items-center justify-center gap-1 px-3`}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Modifier
                </button>
                {deleteConfirm === pl.id ? (
                  <div className="flex gap-1">
                    <button onClick={() => handleDelete(pl.id)} className="bg-red-600 hover:bg-red-500 text-white text-xs py-1.5 px-2 rounded-lg transition">Confirmer</button>
                    <button onClick={() => setDeleteConfirm(null)} className="bg-gray-700 text-gray-300 text-xs py-1.5 px-2 rounded-lg transition">Annuler</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(pl.id)}
                    className="bg-gray-700 hover:bg-red-900/50 hover:border-red-700 text-gray-400 hover:text-red-400 text-xs py-1.5 px-2.5 rounded-lg transition"
                    title="Supprimer"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Colonne droite : formulaire ── */}
      <div className="flex-1 overflow-y-auto">
        {!editing ? (
          <div className="flex items-center justify-center h-full text-center p-8">
            <div>
              <svg className="w-16 h-16 text-gray-700 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
              <p className="text-gray-500 text-sm">Sélectionne une playlist à modifier<br/>ou clique sur Ajouter pour en créer une nouvelle.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto p-8">
            <h3 className="text-white font-semibold text-lg mb-6">
              {editing === 'new' ? 'Nouvelle playlist' : 'Modifier la playlist'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Nom (optionnel)
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Ma playlist principale"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  URL du serveur
                </label>
                <input
                  type="text"
                  value={form.url}
                  onChange={e => { setForm(f => ({ ...f, url: e.target.value })); setTestResult(null) }}
                  placeholder="http://monserveur.com"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Nom d'utilisateur
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setTestResult(null) }}
                    placeholder="username"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setTestResult(null) }}
                    placeholder="••••••••"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Test de connexion */}
              {testResult === 'ok' && (
                <div className="flex items-center gap-2 bg-green-900/30 border border-green-700/40 text-green-400 text-sm rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                  Connexion réussie
                </div>
              )}
              {testResult === 'error' && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 text-red-400 text-sm rounded-xl px-4 py-3">
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                  Identifiants incorrects ou serveur inaccessible
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !form.url || !form.username || !form.password}
                  className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2.5 rounded-xl transition"
                >
                  {testing ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  )}
                  Tester
                </button>

                <button
                  onClick={handleSave}
                  disabled={!form.url || !form.username || !form.password}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                  </svg>
                  Enregistrer
                </button>

                <button
                  onClick={() => { setEditing(null); setForm(EMPTY_FORM); setTestResult(null) }}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm px-4 py-2.5 rounded-xl transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
