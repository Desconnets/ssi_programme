/**
 * Préremplit le cache HTTP du navigateur au chargement (vidéos fond, phase_videos).
 * File séquentielle : limite la charge disque/réseau côté navigateur (le serveur est threadé).
 * Appeler `abortBrowserMediaWarm()` au début du Super Boom pour libérer le serveur.
 */
import {
  BROWSER_PREWARM_ENABLED,
  BROWSER_PREWARM_GAP_MS,
  BROWSER_PREWARM_BACKGROUNDS,
  BROWSER_PREWARM_PHASE_VIDEOS,
} from './config.js';
import { debugLog, debugWarn } from './debug.js';

/** @type {AbortController | null} */
let warmAbortController = null;
let _warmPromise = Promise.resolve();

export function getBrowserWarmPromise() {
  return _warmPromise;
}

export function abortBrowserMediaWarm() {
  if (warmAbortController) {
    warmAbortController.abort();
    warmAbortController = null;
    debugLog('[SSI] Warm cache HTTP interrompu (début Super Boom)');
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

async function fetchOne(url, signal) {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'default', signal });
  if (!r.ok) throw new Error(String(r.status));
  await r.blob();
}

/**
 * @param {{ backgroundUrls?: string[], phaseVideoUrls?: string[] }} opts
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
  const { backgroundUrls = [], phaseVideoUrls = [] } = opts;

  const urls = [];
  if (BROWSER_PREWARM_BACKGROUNDS) {
    for (const u of backgroundUrls) if (typeof u === 'string' && u.length) urls.push(u);
  }
  if (BROWSER_PREWARM_PHASE_VIDEOS) {
    for (const u of phaseVideoUrls) if (typeof u === 'string' && u.length) urls.push(u);
  }
  if (!urls.length) return;

  debugLog('[SSI] Warm cache HTTP démarré —', urls.length, 'fichier(s)');
  let done = 0;
  for (let i = 0; i < urls.length; i++) {
    if (signal.aborted) break;
    try {
      await fetchOne(urls[i], signal);
      done += 1;
    } catch (e) {
      if (e.name === 'AbortError') break;
      debugWarn('[SSI] Warm cache échec —', (urls[i].split('/').pop() || urls[i]).slice(0, 60), e);
    }
    if (signal.aborted) break;
    if (i < urls.length - 1) {
      try { await sleep(BROWSER_PREWARM_GAP_MS, signal); } catch { break; }
    }
  }
  if (!signal.aborted) {
    warmAbortController = null;
    debugLog('[SSI] Warm cache HTTP terminé —', done, '/', urls.length, 'fichier(s) en cache');
  }
}
