/**
 * Télécommande phases : lit GET /api/phase-remote et applique les commandes POST (panneau Python, etc.).
 * Désactiver : ?phaseRemote=0 dans l’URL de la page.
 *
 * Optimisations : intervalle plus long si onglet masqué ; annulation du fetch précédent si la requête traîne.
 */
import {
  PHASE_REMOTE_POLL_MS,
  PHASE_REMOTE_POLL_MS_HIDDEN,
  PHASE_REMOTE_IDLE_RESUME_MS,
  OS_WINDOW_DIAGONAL_MIN_LOOP_MS,
} from './config.js';
import {
  applyRemotePhaseCommand,
  forceIdleResumeStandardCycle,
  initStickers,
  initPhaseVideos,
  setOsWindowMinLoopMs,
  setPhasePaused,
} from './phases.js';
import { applyRemoteBackgroundState, reloadBackgrounds } from './background-playback.js';

const ENDPOINT = '/api/phase-remote';

function phaseRemoteDisabled() {
  if (typeof window === 'undefined' || !window.location) return true;
  const v = new URLSearchParams(window.location.search).get('phaseRemote');
  return v === '0' || v === 'false';
}

function pollIntervalMs() {
  if (typeof document !== 'undefined' && document.hidden) {
    return PHASE_REMOTE_POLL_MS_HIDDEN;
  }
  return PHASE_REMOTE_POLL_MS;
}

/**
 * À appeler une fois après init (stickers + phase_videos chargés).
 */
export function startPhaseRemotePolling() {
  if (phaseRemoteDisabled()) return;

  let appliedSeq = 0;
  /** Dernier POST qui incluait une phase (évite de relancer la phase à chaque POST fond / opacité). */
  let lastAppliedPhaseCommandSeq = 0;
  /** Évite de rappeler la reprise idle en boucle pour le même horodatage de commande. */
  let idleFiredForLastCommandMs = null;
  /** Thème identité actuellement appliqué sur la page scène. */
  let lastAppliedTheme = null;
  /** État pause phases appliqué sur la page scène. */
  let lastAppliedPaused = null;
  /** @type {AbortController | null} */
  let abortCtl = null;
  let timeoutId = 0;

  const schedule = (ms) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = window.setTimeout(tick, ms);
  };

  const tick = async () => {
    abortCtl?.abort();
    abortCtl = new AbortController();
    const signal = abortCtl.signal;

    try {
      const r = await fetch(ENDPOINT, { signal });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const seq = Number(data.seq) || 0;
      if (seq > appliedSeq) {
        appliedSeq = seq;
        applyRemoteBackgroundState(data);
        const pcs = Number(data.phaseCommandSeq) || 0;
        if (pcs > lastAppliedPhaseCommandSeq) {
          lastAppliedPhaseCommandSeq = pcs;
          const ph = data.phase;
          if (ph) {
            applyRemotePhaseCommand(ph, data.videoIndex, data.textContent);
          }
        }
      }

      /* Pause / reprise du cycle visuel */
      const isPaused = Boolean(data.phasesPaused);
      if (isPaused !== lastAppliedPaused) {
        lastAppliedPaused = isPaused;
        setPhasePaused(isPaused);
      }

      /* Changement de thème identité (indépendant de seq — peut changer sans phase) */
      const newTheme = typeof data.theme === 'string' ? data.theme : 'ssi';
      if (newTheme !== lastAppliedTheme) {
        lastAppliedTheme = newTheme;
        document.documentElement.dataset.appTheme = newTheme;
        setOsWindowMinLoopMs(newTheme === 'diagonal' ? OS_WINDOW_DIAGONAL_MIN_LOOP_MS : 0);
        /* Rechargement des bibliothèques de médias du nouveau thème */
        try {
          const [stickerUrls, phaseVideoUrls, bgUrls] = await Promise.all([
            fetch('/api/stickers').then((r) => (r.ok ? r.json() : [])),
            fetch('/api/phase-videos').then((r) => (r.ok ? r.json() : [])),
            fetch('/api/backgrounds').then((r) => (r.ok ? r.json() : [])),
          ]);
          initStickers(stickerUrls);
          initPhaseVideos(phaseVideoUrls);
          reloadBackgrounds(bgUrls);
        } catch (_) {
          /* silencieux : les médias actuels restent en service */
        }
      }
      const ts = data.lastCommandMs;
      if (ts != null && typeof ts === 'number') {
        const ir = Number(data.idleResumeMs);
        const idleMs =
          Number.isFinite(ir) && ir > 0 ? ir : PHASE_REMOTE_IDLE_RESUME_MS;
        const stale = Date.now() - ts > idleMs;
        if (stale && idleFiredForLastCommandMs !== ts) {
          idleFiredForLastCommandMs = ts;
          /* Ne pas relancer le cycle si les phases sont en pause */
          if (!data.phasesPaused) {
            forceIdleResumeStandardCycle();
          }
        }
        if (!stale) {
          idleFiredForLastCommandMs = null;
        }
      }
    } catch (e) {
      if (signal.aborted || (e && e.name === 'AbortError')) {
        schedule(pollIntervalMs());
        return;
      }
      /* serveur arrêté / réseau : on réessaie */
    }
    schedule(pollIntervalMs());
  };

  /* Onglet visible à nouveau : couper un fetch lent pour repasser tout de suite au poll court. */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        abortCtl?.abort();
      }
    });
  }

  tick();
}
