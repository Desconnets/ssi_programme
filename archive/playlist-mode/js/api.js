import { debugLog, debugWarn } from './debug.js';

/**
 * Charge les listes d’URLs depuis le serveur Python.
 */
export async function loadFromServer() {
  try {
    const [settings, trackUrls, stickerUrls, backgroundUrls, virguleUrls, phaseVideoUrls] = await Promise.all([
      fetch('/api/settings').then((r) => (r.ok ? r.json() : {})),
      fetch('/api/tracks').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/stickers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/backgrounds').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/virgules').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/phase-videos').then((r) => (r.ok ? r.json() : [])),
    ]);
    const audioInput = settings && settings.audioInput === 'micro' ? 'micro' : 'playlist';
    debugLog('tracks chargés :', trackUrls.length, trackUrls);
    debugLog('virgules chargées :', virguleUrls.length, virguleUrls);
    debugLog('audioInput (serveur) :', audioInput);
    debugLog('phase-videos :', phaseVideoUrls?.length ?? 0);
    return { audioInput, trackUrls, stickerUrls, backgroundUrls, virguleUrls, phaseVideoUrls };
  } catch (e) {
    console.error('[DEBUG] Erreur loadFromServer :', e);
    return {
      audioInput: 'playlist',
      trackUrls: [],
      stickerUrls: [],
      backgroundUrls: [],
      virguleUrls: [],
      phaseVideoUrls: [],
    };
  }
}
