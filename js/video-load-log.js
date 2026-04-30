/**
 * Suivi du chargement des <video> (fond, fenêtre OS, prefetch) — console `[SSI·VIDEO]` si `?videoLog=1`.
 * + cycle de vie prêt / lecture → LIVE Python (`attachVideoLifecycle`).
 */
import { videoLog } from './debug.js';
import { attachVideoLifecycle } from './video-lifecycle.js';

/** @type {WeakMap<HTMLVideoElement, AbortController>} */
const loadLogAbortByVideo = new WeakMap();

/**
 * @param {HTMLVideoElement} video
 * @param {string} role ex. « fond », « fenêtre OS », « prefetch phase »
 * @param {string} name court (fichier)
 */
export function attachVideoLoadListeners(video, role, name) {
  if (!video) return;
  const prev = loadLogAbortByVideo.get(video);
  if (prev) prev.abort();
  const ac = new AbortController();
  loadLogAbortByVideo.set(video, ac);
  const { signal } = ac;

  const tag = `${role} — ${name}`;

  const log = (ev) => {
    if (ev.type === 'error') {
      const err = video.error;
      videoLog(ev.type, tag, err ? `code ${err.code} ${err.message || ''}` : '(pas de détail)');
      return;
    }
    if (ev.type === 'loadedmetadata' && video.videoWidth) {
      videoLog(ev.type, tag, `${video.videoWidth}×${video.videoHeight}`);
      return;
    }
    if (ev.type === 'progress' && video.buffered?.length) {
      try {
        const end = video.buffered.end(video.buffered.length - 1);
        const d = video.duration;
        if (isFinite(d) && d > 0) {
          videoLog('progress', tag, `buffer ≈ ${((100 * end) / d).toFixed(0)}%`);
        } else {
          videoLog('progress', tag, `buffer ≈ ${end.toFixed(1)}s`);
        }
      } catch (_) {
        videoLog('progress', tag);
      }
      return;
    }
    if (ev.type !== 'progress') {
      videoLog(ev.type, tag);
    }
  };

  const types = [
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'canplaythrough',
    'waiting',
    'stalled',
    'error',
  ];
  types.forEach((type) => {
    video.addEventListener(type, log, { once: true, signal });
  });
  /* Un seul log « progress » tôt dans le chargement */
  video.addEventListener('progress', log, { once: true, signal });

  attachVideoLifecycle(video, role, name);
}
