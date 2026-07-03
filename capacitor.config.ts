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
}

export default config
