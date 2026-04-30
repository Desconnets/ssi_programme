/**
 * Marqueurs « prêt à lancer » et « lecture réelle » pour chaque <video> suivi.
 * - Envoie toujours vers le terminal Python ([SSI·LIVE]) via reportLiveEvent.
 * - Console navigateur : `?mediaTrace=1` → préfixe [SSI·MEDIA].
 *
 * Nouvel appel sur le même élément (ex. changement de src du fond) annule les écouteurs précédents.
 */
import { reportLiveEvent } from './live-telemetry.js';
import { mediaTraceLog } from './debug.js';

/** @type {WeakMap<HTMLVideoElement, AbortController>} */
const lifecycleAbortByVideo = new WeakMap();

/**
 * @param {HTMLVideoElement} video
 * @param {string} role ex. fond, fenêtre OS, prefetch phase
 * @param {string} displayName nom fichier court
 */
export function attachVideoLifecycle(video, role, displayName) {
  if (!video) return;
  const file = displayName || '?';

  const prev = lifecycleAbortByVideo.get(video);
  if (prev) prev.abort();
  const ac = new AbortController();
  lifecycleAbortByVideo.set(video, ac);
  const { signal } = ac;

  let readySent = false;
  const markReady = (via) => {
    if (readySent) return;
    readySent = true;
    const tIso = new Date().toISOString();
    const tPerf = Math.round(performance.now());
    reportLiveEvent('video_ready', { role, file, via, tIso, tPerf });
    mediaTraceLog('PRÊT', role, file, via, tIso);
  };

  video.addEventListener('canplay', () => markReady('canplay'), { once: true, signal });
  video.addEventListener('canplaythrough', () => markReady('canplaythrough'), { once: true, signal });

  video.addEventListener(
    'playing',
    () => {
      const tIso = new Date().toISOString();
      const tPerf = Math.round(performance.now());
      reportLiveEvent('video_playing', { role, file, tIso, tPerf });
      mediaTraceLog('LECTURE', role, file, tIso, `perf≈${tPerf}ms`);
    },
    { once: true, signal },
  );
}
