import { debugLog } from './debug.js';

/**
 * Charge les listes de médias depuis le serveur.
 * La playlist (tracks, virgules) est archivée dans archive/playlist-mode/.
 */
export async function loadFromServer() {
  try {
    const [stickerUrls, backgroundUrls, phaseVideoUrls] = await Promise.all([
      fetch('/api/stickers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/backgrounds').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/phase-videos').then((r) => (r.ok ? r.json() : [])),
    ]);
    debugLog('stickers :', stickerUrls.length);
    debugLog('backgrounds :', backgroundUrls.length);
    debugLog('phase-videos :', phaseVideoUrls.length);
    return { stickerUrls, backgroundUrls, phaseVideoUrls };
  } catch (e) {
    console.error('[SSI] Erreur loadFromServer :', e);
    return { stickerUrls: [], backgroundUrls: [], phaseVideoUrls: [] };
  }
}
