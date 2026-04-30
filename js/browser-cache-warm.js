/**
 * Préremplit le cache HTTP du navigateur au chargement (vidéos fond, phase_videos, virgules, option musique).
 * File séquentielle : limite la charge disque/réseau côté navigateur (le serveur est threadé).
 *
 * Au début du Super Boom, appeler `abortBrowserMediaWarm()` pour libérer le serveur avant la lecture réelle.
 */
import {
  BROWSER_PREWARM_ENABLED,
  BROWSER_PREWARM_GAP_MS,
  BROWSER_PREWARM_BACKGROUNDS,
  BROWSER_PREWARM_PHASE_VIDEOS,
  BROWSER_PREWARM_VIRGULES,
  BROWSER_PREWARM_MAX_TRACKS,
} from './config.js';
import { debugLog, debugWarn } from './debug.js';

/** @type {AbortController | null} */
let warmAbortController = null;

/** Promesse résolue quand le warm est terminé (ou interrompu/erreur). Toujours définie après warmBrowserMediaCache(). */
let _warmPromise = Promise.resolve();

/** Retourne une promesse qui se résout quand le warm est terminé (ou tout de suite si jamais démarré). */
export function getBrowserWarmPromise() {
  return _warmPromise;
}

/** Stoppe le warm en cours (si actif). Appelé au début du Super Boom. */
export function abortBrowserMediaWarm() {
  if (warmAbortController) {
    warmAbortController.abort();
    warmAbortController = null;
    debugLog('[SSI] Warm cache HTTP interrompu (début Super Boom — serveur libéré pour la phase vidéo)');
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function fetchOne(url, signal) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'default', signal });
  if (!r.ok) throw new Error(String(r.status));
  await r.blob();
}

/**
 * @param {{
 *   backgroundUrls?: string[],
 *   phaseVideoUrls?: string[],
 *   virguleUrls?: string[],
 *   trackUrls?: string[],
 * }} opts
 */
export function warmBrowserMediaCache(opts = {}) {
  _warmPromise = _runWarm(opts).catch(() => {});
  return _warmPromise;
}

async function _runWarm(opts = {}) {
  if (!BROWSER_PREWARM_ENABLED) return;

  if (warmAbortController) warmAbortController.abort();
  warmAbortController = new AbortController();
  const { signal } = warmAbortController;

  const {
    backgroundUrls = [],
    phaseVideoUrls = [],
    virguleUrls = [],
    trackUrls = [],
  } = opts;

  /** @type {string[]} */
  const urls = [];
  if (BROWSER_PREWARM_BACKGROUNDS) {
    for (const u of backgroundUrls) if (typeof u === 'string' && u.length) urls.push(u);
  }
  if (BROWSER_PREWARM_PHASE_VIDEOS) {
    for (const u of phaseVideoUrls) if (typeof u === 'string' && u.length) urls.push(u);
  }
  if (BROWSER_PREWARM_VIRGULES) {
    for (const u of virguleUrls) if (typeof u === 'string' && u.length) urls.push(u);
  }
  const nTracks = Math.max(0, Math.min(BROWSER_PREWARM_MAX_TRACKS, trackUrls.length));
  for (let i = 0; i < nTracks; i++) {
    const u = trackUrls[i];
    if (typeof u === 'string' && u.length) urls.push(u);
  }

  if (!urls.length) return;

  debugLog('[SSI] Warm cache HTTP démarré —', urls.length, 'fichier(s)');
  let done = 0;
  for (let i = 0; i < urls.length; i++) {
    if (signal.aborted) break;
    const url = urls[i];
    try {
      await fetchOne(url, signal);
      done += 1;
    } catch (e) {
      if (e.name === 'AbortError') break;
      debugWarn('[SSI] Warm cache échec —', (url.split('/').pop() || url).slice(0, 60), e);
    }
    if (signal.aborted) break;
    if (i < urls.length - 1) {
      try {
        await sleep(BROWSER_PREWARM_GAP_MS, signal);
      } catch {
        break;
      }
    }
  }

  if (!signal.aborted) {
    warmAbortController = null;
    debugLog('[SSI] Warm cache HTTP terminé —', done, '/', urls.length, 'fichier(s) en cache');
  }
}
