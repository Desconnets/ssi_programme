/**
 * Fond vidéo (backgrounds/) + opacité du dégradé — init locale + télécommande GET.
 */
import { BG_VIDEO_ROTATE_MS, BG_VIDEO_CROSSFADE_MS } from './config.js';
import { attachVideoLoadListeners } from './video-load-log.js';

let backgroundUrls = [];
/** @type {HTMLVideoElement | null} */
let bgVideoEl = null;
/** @type {HTMLElement | null} */
let bgGradientEl = null;
let currentIndex = 0;
let rotateTimerId = null;
/** Évite de réinitialiser l’intervalle de rotation à chaque POST phase (signature état serveur). */
let lastRemoteVideoSig = '';

function clampIndex(i) {
  if (!backgroundUrls.length) return 0;
  const n = backgroundUrls.length;
  let x = Math.floor(Number(i));
  if (!Number.isFinite(x)) x = 0;
  return ((x % n) + n) % n;
}

function clearRotateTimer() {
  if (rotateTimerId != null) {
    clearInterval(rotateTimerId);
    rotateTimerId = null;
  }
}

function startAutoRotate() {
  clearRotateTimer();
  if (backgroundUrls.length <= 1) return;
  rotateTimerId = window.setInterval(() => {
    currentIndex = (currentIndex + 1) % backgroundUrls.length;
    void crossfadeToIndex(currentIndex);
  }, BG_VIDEO_ROTATE_MS);
}

/**
 * @param {number} index
 */
function crossfadeToIndex(index) {
  const i = clampIndex(index);
  const u = backgroundUrls[i];
  if (!u || !bgVideoEl) return;
  currentIndex = i;
  return crossfadeToUrl(u);
}

/**
 * @param {string} url
 */
async function crossfadeToUrl(url) {
  const el = bgVideoEl;
  if (!el || !url) return;
  const ms = BG_VIDEO_CROSSFADE_MS;
  el.style.transition = `opacity ${ms}ms ease`;
  el.style.opacity = '0';
  await new Promise((r) => setTimeout(r, ms + 40));

  attachVideoLoadListeners(el, 'fond', url.split('/').pop() || url);
  el.src = url;
  try {
    el.load();
  } catch (_) {}

  await new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(), 12000);
    const done = () => {
      window.clearTimeout(t);
      resolve();
    };
    el.addEventListener('canplay', done, { once: true });
    el.addEventListener('error', done, { once: true });
  });
  el.play().catch(() => {});
  el.style.opacity = '1';
}

/**
 * @param {unknown} val
 */
function applyGradientOpacity(val) {
  if (!bgGradientEl) return;
  if (val == null || val === '') {
    bgGradientEl.style.removeProperty('opacity');
  } else {
    const x = Math.max(0, Math.min(1, Number(val)));
    if (Number.isFinite(x)) {
      bgGradientEl.style.opacity = String(x);
    }
  }
}

function remoteVideoSignature(data) {
  const auto = Boolean(data.backgroundAutoRotate);
  const raw = data.backgroundVideoIndex;
  const forced =
    raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
  return JSON.stringify([auto, forced]);
}

/**
 * @param {{ backgroundUrls: string[] }} opts
 */
export function initBackgroundPlayback(opts) {
  backgroundUrls = Array.isArray(opts.backgroundUrls) ? opts.backgroundUrls.filter(Boolean) : [];
  bgVideoEl = document.getElementById('bgVideo');
  bgGradientEl = document.getElementById('bgGradient');

  lastRemoteVideoSig = JSON.stringify([true, null]);

  if (!bgVideoEl || !backgroundUrls.length) {
    return;
  }

  try {
    bgVideoEl.setAttribute('fetchpriority', 'high');
  } catch (_) {}
  bgVideoEl.preload = 'auto';

  currentIndex = Math.floor(Math.random() * backgroundUrls.length);
  const u = backgroundUrls[currentIndex];
  attachVideoLoadListeners(bgVideoEl, 'fond', u.split('/').pop() || u);
  bgVideoEl.src = u;
  bgVideoEl.addEventListener(
    'canplay',
    () => {
      bgVideoEl.play().catch(() => {});
    },
    { once: true },
  );
  bgVideoEl.play().catch(() => {});

  startAutoRotate();
}

/**
 * À chaque incrément de seq (télécommande). Idempotent si l’état fond n’a pas changé.
 *
 * @param {Record<string, unknown>} data
 */
export function applyRemoteBackgroundState(data) {
  applyGradientOpacity(data.bgGradientOpacity);

  if (!bgVideoEl || !backgroundUrls.length) return;

  const sig = remoteVideoSignature(data);
  if (sig === lastRemoteVideoSig) return;
  lastRemoteVideoSig = sig;

  const auto = Boolean(data.backgroundAutoRotate);
  const raw = data.backgroundVideoIndex;
  const forced =
    raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;

  if (auto) {
    clearRotateTimer();
    startAutoRotate();
    return;
  }

  clearRotateTimer();
  if (forced != null) {
    void crossfadeToIndex(forced);
  }
}

/**
 * Rechargement de la liste des fonds (changement de thème).
 * Démarre une rotation auto avec les nouvelles URLs sans toucher au reste de la scène.
 * @param {string[]} urls
 */
export function reloadBackgrounds(urls) {
  clearRotateTimer();
  backgroundUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
  lastRemoteVideoSig = JSON.stringify([true, null]);
  if (!bgVideoEl || !backgroundUrls.length) return;
  currentIndex = Math.floor(Math.random() * backgroundUrls.length);
  void crossfadeToIndex(currentIndex);
  startAutoRotate();
}
