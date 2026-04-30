/**
 * Logs console — niveaux ajustables via l'URL.
 *
 * | Paramètre URL   | Défaut | Effet |
 * |-----------------|--------|-------|
 * | `?debug=0`      | ON     | Coupe les `[DEBUG]` (transitions, playlist, warm…). |
 * | `?diag=1`       | OFF    | **Mode diagnostic** : active aussi `videoLog` + `mediaTrace` + `[SSI·DIAG·AUDIO]` sur embouteillage. |
 * | `?videoLog=1`   | OFF    | Active les événements bruts `[SSI·VIDEO]` (loadstart, stalled, canplay…). |
 * | `?mediaTrace=1` | OFF    | Active `[SSI·MEDIA]` PRÊT / LECTURE dans la console. |
 *
 * Les événements prêt/lecture importants sont toujours envoyés au terminal Python via `[SSI·LIVE]`.
 *
 * **Repérer musique / serveur** : terminal `SSI_DIAG=1 SSI_HTTP_MEDIA_LOG=1 python3 server.py` + page `?diag=1` (voir README).
 */
function readDebugFlag() {
  if (typeof window === 'undefined' || !window.location) return true;
  const v = new URLSearchParams(window.location.search).get('debug');
  if (v === '0' || v === 'false') return false;
  return true;
}

export const DEBUG = readDebugFlag();

/** Mode diagnostic page (`?diag=1`) — allume traces vidéo + média + détail `<audio>`. */
function readDiagFlag() {
  if (typeof window === 'undefined' || !window.location) return false;
  const v = new URLSearchParams(window.location.search).get('diag');
  return v === '1' || v === 'true';
}

export const DIAG = readDiagFlag();

/** Événements bruts `<video>` (loadstart, stalled, canplay…). Désactivé par défaut — `?videoLog=1` ou `?diag=1`. */
function readVideoLogFlag() {
  if (typeof window === 'undefined' || !window.location) return false;
  const v = new URLSearchParams(window.location.search).get('videoLog');
  if (v === '1' || v === 'true') return true;
  return false;
}

export const VIDEO_LOG = readVideoLogFlag() || DIAG;

/** PRÊT / LECTURE dans la console (désactivé par défaut). `?mediaTrace=1` ou `?diag=1`. */
function readMediaTraceFlag() {
  if (typeof window === 'undefined' || !window.location) return false;
  const v = new URLSearchParams(window.location.search).get('mediaTrace');
  if (v === '1' || v === 'true') return true;
  return false;
}

export const MEDIA_TRACE = readMediaTraceFlag() || DIAG;

export function videoLog(...args) {
  if (!VIDEO_LOG) return;
  console.info('[SSI·VIDEO]', ...args);
}

export function mediaTraceLog(...args) {
  if (!MEDIA_TRACE) return;
  console.info('[SSI·MEDIA]', ...args);
}

export function debugLog(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

export function debugWarn(...args) {
  if (DEBUG) console.warn('[DEBUG]', ...args);
}

/** Horodatage local HH:MM:SS.mmm — pour suivre l’ordre réel (embouteillage, phases). */
export function debugLogTs(...args) {
  if (!DEBUG) return;
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  console.log('[DEBUG]', ts, ...args);
}

/**
 * readyState : 0 rien, 1 métadonnées, 2 courant, 3 futur, 4 assez pour jouer.
 * networkState : 0 vide, 1 idle, 2 chargement, 3 pas de source.
 */
export function diagAudioNet(tag, name, audio) {
  if (!DIAG || !audio) return;
  const buffered = [];
  try {
    for (let i = 0; i < audio.buffered.length; i++) {
      buffered.push(`${audio.buffered.start(i).toFixed(1)}–${audio.buffered.end(i).toFixed(1)}`);
    }
  } catch {
    /* ignore */
  }
  console.warn('[SSI·DIAG·AUDIO]', tag, name, {
    readyState: audio.readyState,
    networkState: audio.networkState,
    paused: audio.paused,
    currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime.toFixed(2) : audio.currentTime,
    buffered: buffered.length ? buffered.join(' ; ') : '∅',
    error: audio.error ? audio.error.code : null,
  });
}
