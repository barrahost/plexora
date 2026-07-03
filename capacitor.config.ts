import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dinfras.plexora',
  appName: 'Plexora',
  webDir: 'dist',
  server: {
    // L'app tourne en HTTP (comme le déploiement web) : le serveur IPTV n'a
    // pas de certificat SSL, et charger l'appli elle-même en HTTP évite tout
    // blocage "mixed content" sur les flux vidéo, sans code de proxy.
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Route fetch()/XHR vers le reseau natif Android (OkHttp) au lieu du
    // moteur JS du WebView. Contourne le CORS (regle propre aux navigateurs,
    // absente des apps natives comme TiviMate) sur les appels API JSON.
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
