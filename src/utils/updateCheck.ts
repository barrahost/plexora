import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

// URL du manifeste de version, déployé au même endroit que l'APK sur cPanel.
const VERSION_URL = 'http://plexora.d-infras.com/plexora-apk/version.json'
const APK_URL = 'http://plexora.d-infras.com/plexora-apk/app-debug.apk'

export interface UpdateInfo {
  versionName: string
  notes?: string
  apkUrl: string
}

// Compare le versionCode distant à celui installé (App.getInfo().build sur
// Android = versionCode). Ne s'exécute qu'en contexte natif : aucune
// signification sur le déploiement web.
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const info = await CapacitorApp.getInfo()
    const localCode = parseInt(info.build, 10)
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`)
    if (!res.ok) return null
    const remote = await res.json() as { versionCode: number; versionName: string; notes?: string }
    if (remote.versionCode > localCode) {
      return { versionName: remote.versionName, notes: remote.notes, apkUrl: APK_URL }
    }
    return null
  } catch {
    return null // pas de connexion / pas de manifeste → pas de notification, silencieux
  }
}

export function openApkUrl(url: string): void {
  window.open(url, '_system')
}
