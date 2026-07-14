/**
 * Point d'entrée — charge les modules, branche le micro et lance le cycle visuel.
 * Mode audio : micro exclusif (playlist archivée dans archive/playlist-mode/).
 */
import { BG_THEMES } from './config.js';
import { loadFromServer } from './api.js';
import { debugLog, debugWarn } from './debug.js';
import * as audio from './audio.js';
import {
  initStickers,
  initPhaseVideos,
  getStickerLiveInfo,
  requestWebcamPermissionEarly,
  startVisualCycleOnFirstClick,
} from './phases.js';
import { startRenderingLoop } from './visuals.js';
import { warmBrowserMediaCache, getBrowserWarmPromise } from './browser-cache-warm.js';
import { startPhaseRemotePolling } from './phase-remote.js';
import { initBackgroundPlayback } from './background-playback.js';

const bgGradient = document.getElementById('bgGradient');

/* Plein écran depuis la télécommande ou un éventuel raccourci clavier */
const btnFullscreen = document.getElementById('btnFullscreen');
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    const elem = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const request = elem.requestFullscreen || elem.webkitRequestFullscreen;
      if (request) request.call(elem);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  });
}

/* Reprendre l'AudioContext au clic (politique navigateur) */
document.body.addEventListener('click', () => {
  const ctx = audio.getAudioContext();
  if (ctx?.state === 'suspended') void ctx.resume();
});

/* Boucle visuelle immédiate */
startRenderingLoop();

/* Caméra : demander la permission le plus tôt possible */
function kickWebcamPermissionAsap() {
  queueMicrotask(() => {
    requestWebcamPermissionEarly(false).catch(() => {});
  });
}
kickWebcamPermissionAsap();

function wireWebcamPermissionOnFirstGesture() {
  const run = () => requestWebcamPermissionEarly(true).catch(() => {});
  document.addEventListener('pointerdown', run, { once: true, capture: true });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireWebcamPermissionOnFirstGesture);
} else {
  wireWebcamPermissionOnFirstGesture();
}

function refreshLiveStatusBanner(opts = {}) {
  const el = document.getElementById('liveStatus');
  if (!el) return;
  const parts = [];
  const stickers = getStickerLiveInfo();
  if (stickers.usingFallback) {
    parts.push('Stickers SECOURS (dossier stickers/ vide ou image introuvable → SVG)');
  }
  if (opts.noBackground) {
    parts.push('Fond : pas de vidéo (dossier backgrounds/ vide)');
  }
  el.textContent = parts.join(' · ');
  el.hidden = parts.length === 0;
  el.classList.toggle('live-status--warn', parts.length > 0);
}

(async () => {
  const rootEl = document.documentElement;
  rootEl.classList.add('ssi-app-init-pending');
  try {
    const { stickerUrls, backgroundUrls, phaseVideoUrls } = await loadFromServer();

    initPhaseVideos(phaseVideoUrls);
    initStickers(stickerUrls);

    warmBrowserMediaCache({
      backgroundUrls: backgroundUrls || [],
      phaseVideoUrls: phaseVideoUrls || [],
    });

    /* Feedback warm dans le startHint */
    const warmHintSpan = document.querySelector('#startHint span');
    if (warmHintSpan) warmHintSpan.textContent = '⏳ Préchauffage en cours…';
    getBrowserWarmPromise().then(() => {
      const s = document.querySelector('#startHint span');
      if (s && s.parentElement && !s.parentElement.hidden) {
        s.textContent = '▶ cliquez pour démarrer — la caméra peut être demandée ici aussi';
      }
      debugLog('[SSI] Warm terminé — démarrage autorisé');
    });

    const hasBg = Boolean(backgroundUrls && backgroundUrls.length);
    initBackgroundPlayback({ backgroundUrls: backgroundUrls || [] });
    refreshLiveStatusBanner({ noBackground: !hasBg });

    if (bgGradient) bgGradient.setAttribute('data-theme', BG_THEMES[0]);

    /* Premier clic : démarrer le micro et lancer le cycle visuel */
    const startMicOnFirstClick = async () => {
      const hint = document.getElementById('startHint');
      const ctx = audio.getAudioContext();
      if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});

      const result = await audio.startMicrophoneAnalysis();
      if (!result.ok) {
        debugWarn('Micro indisponible ou refusé :', result.reason);
        const span = hint?.querySelector('span');
        if (span) span.textContent = '⚠ recliquez ou vérifiez les permissions micro';
        return;
      }
      document.body.removeEventListener('click', startMicOnFirstClick);
      debugLog('Micro connecté — cycle visuel lancé');
      startVisualCycleOnFirstClick();
      if (hint) {
        hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 600);
      }
    };
    document.body.addEventListener('click', startMicOnFirstClick);

    rootEl.classList.remove('ssi-app-init-pending');
    startPhaseRemotePolling();
  } catch (err) {
    rootEl.classList.remove('ssi-app-init-pending');
    console.error('[SSI] Erreur au démarrage :', err);
  }
})();
