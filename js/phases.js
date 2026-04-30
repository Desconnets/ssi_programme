/**
 * Phases visuelles : SNAKE → SUPER_BOOM → FENÊTRE_OS+VIDÉO → LOGO → WEBCAM → SNAKE (boucle).
 * Préchargement : warm HTTP centralisé dans `browser-cache-warm.js` (main) + vidéo cachée dès l’init ; prefetch au Super boom.
 * État interne : timers + URLs ; le calque DOM est #stickersLayer.
 */
import {
  STICKER_MIN_SIZE,
  STICKER_MAX_SIZE,
  STICKER_MIN_AMP,
  STICKER_MAX_AMP,
  STICKER_MIN_SPEED,
  STICKER_MAX_SPEED,
  SNAKE_SEGMENTS,
  SNAKE_SEGMENT_DELAY_MS,
  SNAKE_STICKER_LIFETIME_MS,
  SUPER_BOOM_DURATION_MS,
  LOGO_PHASE_DURATION_MS,
  OS_WINDOW_PHASE_MAX_MS,
  OS_WINDOW_MAX_WIDTH_RATIO,
  OS_WINDOW_MAX_HEIGHT_RATIO,
  OS_WINDOW_CHROME_VERTICAL_PX,
  OS_WINDOW_CHROME_HORIZONTAL_PX,
  OS_WINDOW_OPEN_CLOSE_MS,
  OS_WINDOW_LOAD_WAIT_MS,
  OS_WINDOW_MAX_LOAD_ATTEMPTS,
  OS_WINDOW_PLAY_MAX_RETRIES,
  OS_WINDOW_PLAY_RETRY_BASE_MS,
  OS_WINDOW_PLAY_WAIT_VISIBLE_MS,
  OS_WINDOW_PLAYING_WATCHDOG_MS,
  OS_WINDOW_PLAYING_RETRY_WATCHDOG_MS,
  OS_WINDOW_DIAGONAL_MIN_LOOP_MS,
  WEBCAM_PHASE_DURATION_MS,
  WEBCAM_WINDOW_MAX_HEIGHT_RATIO,
  WEBCAM_WINDOW_MAX_UPSCALE,
  WEBCAM_WINDOW_MAX_WIDTH_RATIO,
} from './config.js';
import { random } from './utils.js';
import { FALLBACK_STICKER_URL, bindStickerImage } from './sticker-fallback.js';
import { reportLiveEvent, liveShortName } from './live-telemetry.js';
import { debugLog, debugWarn, debugLogTs } from './debug.js';
import { attachVideoLoadListeners } from './video-load-log.js';
import { attachVideoLifecycle } from './video-lifecycle.js';
import { abortBrowserMediaWarm } from './browser-cache-warm.js';
import { startWebcamGrainLoop, stopWebcamGrainLoop } from './webcam-grain.js';

const stickersLayer = document.getElementById('stickersLayer');
const sceneEl = document.getElementById('scene');
const osWindowLayer = document.getElementById('ssiOsWindowLayer');
const osWindowVideo = document.getElementById('ssiOsWindowVideo');
const webcamLayer = document.getElementById('ssiWebcamPhaseLayer');
const webcamVideo = document.getElementById('ssiWebcamVideo');

/** @type {string[]} */
let allStickerUrls = [];
/** True si aucun fichier dans stickers/ : on utilise uniquement le SVG de secours */
let usingFallbackStickers = false;
let snakeSet = [];
let currentSnakeSetIndex = 0;
let snakeCyclesDone = 0;
let snakeTimer = null;
let superBoomTimer = null;
let inSuperBoom = false;
let logoTimer = null;
let logoUrl = null;

/** @type {string[]} URLs /api/phase-videos — dossier phase_videos/ */
let phaseVideoUrls = [];

/**
 * Durée minimale de lecture (ms) avant de passer au logo — 0 = désactivé (thème SSI).
 * Défini par le thème actif via setOsWindowMinLoopMs() (appelé par phase-remote.js).
 */
let _osWindowMinLoopMs = 0;

/** @param {number} ms */
export function setOsWindowMinLoopMs(ms) {
  _osWindowMinLoopMs = typeof ms === 'number' && ms > 0 ? ms : 0;
}
/**
 * File aléatoire pour la phase fenêtre OS, préparée au début du SUPER BOOM
 * (permet de précharger la même URL ~60 s avant la fin du boom).
 * @type {string[] | null}
 */
let osWindowPreparedQueue = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let osWindowLoadTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let osWindowMaxTimer = null;
/** @type {AbortController | null} */
let osWindowLoadAbort = null;
/** @type {(() => void) | null} */
let osWindowResizeListener = null;
/** Incrémenté à chaque tentative : invalide les timeouts / handlers obsolètes */
let osWindowLoadGeneration = 0;

/** @type {ReturnType<typeof setTimeout> | null} */
let webcamPhaseTimer = null;
/** @type {MediaStream | null} */
let webcamStream = null;
/** @type {(() => void) | null} */
let webcamResizeListener = null;
/** Incrémenté au démarrage d’une phase webcam : invalide handlers / timeout */
let webcamGeneration = 0;

/**
 * Contraintes simples : meilleure compatibilité (Safari / iOS) pour que la boîte de permission s’affiche.
 * Les idéaux width/height peuvent empêcher l’invite sur certains appareils.
 */
const WEBCAM_MEDIA_CONSTRAINTS = {
  video: true,
  audio: false,
};

/**
 * API moderne ou fallback navigateurs anciens — ne pas marquer « refus définitif » si l’API manque (ex. contexte).
 * @returns {((c: MediaStreamConstraints) => Promise<MediaStream>) | null}
 */
function getWebcamGetUserMedia() {
  if (typeof navigator === 'undefined') return null;
  if (navigator.mediaDevices?.getUserMedia) {
    return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
  }
  const legacy =
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;
  if (typeof legacy !== 'function') return null;
  return (constraints) =>
    new Promise((resolve, reject) => {
      try {
        legacy.call(navigator, constraints, resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
}

/** Flux obtenu au chargement / 1er clic — consommé au début de la phase webcam */
let webcamPrefetchedStream = null;
let webcamNoCamera = false;
/** Refus après geste utilisateur ou pas de matériel : on ne redemande pas au milieu du show */
let webcamAccessRefusedFinal = false;
/** @type {Promise<boolean> | null} */
let webcamPrefetchPromise = null;

function hasLiveWebcamVideoTrack(stream) {
  try {
    return Boolean(
      stream && stream.getVideoTracks().some((t) => t.readyState === 'live'),
    );
  } catch (_) {
    return false;
  }
}

/**
 * Demande la caméra dès l’ouverture (pas au moment de la phase).
 * @param {boolean} afterUserGesture Mettre true au 1er clic si la 1ʳᵉ tentative sans geste a échoué (NotAllowed).
 * @returns {Promise<boolean>}
 */
export function requestWebcamPermissionEarly(afterUserGesture = false) {
  if (hasLiveWebcamVideoTrack(webcamPrefetchedStream)) {
    return Promise.resolve(true);
  }
  if (webcamNoCamera || webcamAccessRefusedFinal) {
    return Promise.resolve(false);
  }
  const gum = getWebcamGetUserMedia();
  if (!gum) {
    if (typeof globalThis !== 'undefined' && globalThis.isSecureContext === false) {
      debugWarn(
        '[SSI] Webcam : contexte non sécurisé — utilisez https:// ou http://127.0.0.1 / localhost pour voir la demande d’accès.',
      );
    } else {
      debugWarn('[SSI] Webcam : getUserMedia indisponible (navigateur ou permissions système).');
    }
    return Promise.resolve(false);
  }
  /* Ne pas réutiliser la promesse « sans geste » pour un 2ᵉ essai après clic (Safari / Chrome stricts). */
  if (!afterUserGesture && webcamPrefetchPromise) {
    return webcamPrefetchPromise;
  }

  const p = gum(WEBCAM_MEDIA_CONSTRAINTS)
    .then((stream) => {
      webcamPrefetchedStream = stream;
      debugLog('[SSI] Webcam — permission OK, flux réservé pour la phase');
      return true;
    })
    .catch((err) => {
      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      if (name === 'NotFoundError') {
        webcamNoCamera = true;
        webcamAccessRefusedFinal = true;
      } else if (name === 'NotAllowedError' && afterUserGesture) {
        webcamAccessRefusedFinal = true;
      }
      debugLog('[SSI] Webcam préflight :', name || err);
      return false;
    })
    .finally(() => {
      if (!afterUserGesture && webcamPrefetchPromise === p) {
        webcamPrefetchPromise = null;
      }
    });

  if (!afterUserGesture) {
    webcamPrefetchPromise = p;
  }

  return p;
}

function takePrefetchedWebcamStream() {
  if (!hasLiveWebcamVideoTrack(webcamPrefetchedStream)) {
    return null;
  }
  const s = webcamPrefetchedStream;
  webcamPrefetchedStream = null;
  return s;
}

/**
 * @returns {Promise<{ stream: MediaStream | null, reason?: string }>}
 */
function acquireWebcamStreamForPhase() {
  const pref = takePrefetchedWebcamStream();
  if (pref) {
    return Promise.resolve({ stream: pref });
  }

  const gum = getWebcamGetUserMedia();
  if (!gum) {
    return Promise.resolve({ stream: null, reason: 'api_absente' });
  }
  if (webcamNoCamera) {
    return Promise.resolve({ stream: null, reason: 'pas_de_caméra' });
  }
  if (webcamAccessRefusedFinal) {
    return Promise.resolve({ stream: null, reason: 'permission_refusée' });
  }

  return gum(WEBCAM_MEDIA_CONSTRAINTS).then(
    (stream) => ({ stream }),
    (err) => {
      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
      const reason =
        name === 'NotAllowedError'
          ? 'permission_refusée'
          : name === 'NotFoundError'
            ? 'pas_de_caméra'
            : 'getUserMedia_échec';
      return { stream: null, reason };
    },
  );
}

function prepareSnakeSet() {
  const pool = allStickerUrls.slice();
  if (!pool.length) {
    snakeSet = [];
    return;
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  snakeSet = pool.slice(0, Math.min(3, pool.length));
  currentSnakeSetIndex = 0;
  snakeCyclesDone = 0;
}

function clearStickers() {
  if (!stickersLayer) return;
  while (stickersLayer.firstChild) {
    stickersLayer.removeChild(stickersLayer.firstChild);
  }
}

function animateStickersOut(callback) {
  if (!stickersLayer) {
    if (callback) callback();
    return;
  }
  const stickers = Array.from(stickersLayer.children);
  if (!stickers.length) {
    if (callback) callback();
    return;
  }
  stickers.forEach((sticker) => {
    sticker.classList.add('sticker-out-plop');
  });
  setTimeout(() => {
    clearStickers();
    if (callback) callback();
  }, 380);
}

function startVisualCycle() {
  if (inSuperBoom) return;
  if (!snakeSet.length && allStickerUrls.length) {
    prepareSnakeSet();
  }
  playNextSnakeSticker();
}

function playNextSnakeSticker() {
  if (snakeTimer) {
    clearTimeout(snakeTimer);
    snakeTimer = null;
  }

  if (!snakeSet.length) return;

  if (snakeCyclesDone >= 3) {
    animateStickersOut(() => startSuperBoom());
    return;
  }

  const url = snakeSet[currentSnakeSetIndex];

  reportLiveEvent('snake', {
    fichier: liveShortName(url),
    etape_snake: `${snakeCyclesDone + 1}/3`,
    dans_set: `${currentSnakeSetIndex + 1}/${snakeSet.length}`,
  });

  animateStickersOut(() => {
    spawnSnakeForSticker(url);
    currentSnakeSetIndex = (currentSnakeSetIndex + 1) % snakeSet.length;
    snakeCyclesDone += 1;

    snakeTimer = setTimeout(() => {
      playNextSnakeSticker();
    }, SNAKE_STICKER_LIFETIME_MS);
  });
}

function spawnSnakeForSticker(url) {
  for (let i = 0; i < SNAKE_SEGMENTS; i++) {
    addSnakeSticker(url, i);
  }
}

function addSnakeSticker(url, index) {
  if (!stickersLayer) return;
  const img = document.createElement('img');
  img.className = 'sticker';
  bindStickerImage(img, url);

  const baseX = random(15, 85);
  const baseY = random(20, 80);
  const size = random(STICKER_MIN_SIZE, STICKER_MAX_SIZE);

  img.dataset.baseX = String(baseX);
  img.dataset.baseY = String(baseY);
  img.dataset.size = String(size);

  const basePhase = random(0, Math.PI * 2);
  img.dataset.phaseX = String(basePhase + index * 0.35);
  img.dataset.phaseY = String(basePhase + index * 0.27);

  const ampFactor = 1 + (index / SNAKE_SEGMENTS) * 0.4;
  img.dataset.ampX = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP) * ampFactor);
  img.dataset.ampY = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP) * ampFactor);
  img.dataset.floatSpeed = String(random(STICKER_MIN_SPEED, STICKER_MAX_SPEED));

  img.dataset.behavior = String(Math.floor(random(0, 6)));

  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = baseX + '%';
  img.style.top = baseY + '%';
  img.style.transform = 'translate(-50%, -50%) scale(1)';
  img.style.opacity = '0';
  stickersLayer.appendChild(img);

  const delay = index * SNAKE_SEGMENT_DELAY_MS;
  setTimeout(() => img.classList.add('sticker-visible', 'sticker-in-pop'), delay);
}

/** Mélange Fisher–Yates (copie) */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** @type {HTMLVideoElement | null} */
let phasePrefetchVideoEl = null;

/** Élément vidéo caché : même URL que la 1ʳᵉ tentative → cache HTTP / buffer navigateur */
function getPhasePrefetchVideo() {
  if (phasePrefetchVideoEl?.isConnected) {
    return phasePrefetchVideoEl;
  }
  let el = document.getElementById('ssiPhaseVideoPrefetch');
  if (!el) {
    el = document.createElement('video');
    el.id = 'ssiPhaseVideoPrefetch';
    el.className = 'ssi-phase-video-prefetch';
    el.setAttribute('preload', 'auto');
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  phasePrefetchVideoEl = el;
  return el;
}

/**
 * Deux <video> sur la même URL (prefetch caché + fenêtre OS) font souvent échouer play() sur le 2e
 * (Chrome : NotAllowedError / blocage décodeur). Libérer le prefetch avant d’assigner src sur #ssiOsWindowVideo.
 */
function releasePhasePrefetchMediaForOsWindow() {
  const el = phasePrefetchVideoEl || document.getElementById('ssiPhaseVideoPrefetch');
  if (el) {
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
      delete el.dataset.ssiPrefetchSrc;
    } catch (e) {
      debugWarn('[SSI] Libération prefetch phase :', e);
    }
  }
  debugLog('[SSI] Prefetch phase relâché (évite conflit 2× même URL sur Chrome)');
}

function prefetchOsWindowVideoUrl(url) {
  if (!url) return;
  try {
    const el = getPhasePrefetchVideo();
    if (el.dataset.ssiPrefetchSrc === url) return;
    el.dataset.ssiPrefetchSrc = url;
    el.preload = 'auto';
    /* Pas de <link rel=preload as=video> : Chrome signale « unsupported as » + href relatif / Unicode cassé */
    el.src = url;
    attachVideoLoadListeners(el, 'prefetch phase', liveShortName(url));
  } catch (e) {
    debugWarn('[SSI] Prefetch phase_videos :', e);
  }
}

/**
 * Chrome : en arrière-plan, play() peut échouer (AbortError « save power ») même si la vidéo est prête.
 */
function playOsWindowVideoResilient(video, isStale, onPlaying, onGiveUp) {
  let visHandler = null;
  let waitTimer = null;

  const cleanup = () => {
    if (visHandler) {
      document.removeEventListener('visibilitychange', visHandler);
      visHandler = null;
    }
    if (waitTimer != null) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
  };

  const attempt = (n) => {
    if (isStale()) {
      cleanup();
      return;
    }

    video
      .play()
      .then(() => {
        if (isStale()) return;
        cleanup();
        onPlaying();
      })
      .catch((err) => {
        if (isStale()) return;
        const msg = String(err?.message || '');
        const powerSaveAbort =
          err?.name === 'AbortError' && (msg.includes('save power') || msg.includes('interrupted'));
        const canRetry = powerSaveAbort && n < OS_WINDOW_PLAY_MAX_RETRIES;

        if (!canRetry) {
          cleanup();
          onGiveUp(err);
          return;
        }

        const delay = OS_WINDOW_PLAY_RETRY_BASE_MS + n * 380;

        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
          visHandler = () => {
            if (document.visibilityState !== 'visible' || isStale()) return;
            cleanup();
            setTimeout(() => attempt(n + 1), 100);
          };
          document.addEventListener('visibilitychange', visHandler);
          waitTimer = setTimeout(() => {
            waitTimer = null;
            if (visHandler) {
              document.removeEventListener('visibilitychange', visHandler);
              visHandler = null;
            }
            if (!isStale()) attempt(n + 1);
          }, OS_WINDOW_PLAY_WAIT_VISIBLE_MS);
          return;
        }

        setTimeout(() => attempt(n + 1), delay);
      });
  };

  attempt(0);
}

function startSuperBoom() {
  inSuperBoom = true;
  if (!stickersLayer) return;

  /* Libère le serveur Python : plus de fetch warm en parallèle quand la vidéo va être demandée */
  abortBrowserMediaWarm();

  reportLiveEvent('super_boom', { nombre: allStickerUrls.length });

  /* Prépare la file + précharge la 1ʳᵉ vidéo tout de suite (durée = SUPER_BOOM_DURATION_MS dans config) */
  if (phaseVideoUrls.length) {
    const q = shuffleInPlace(phaseVideoUrls.slice());
    osWindowPreparedQueue = q;
    prefetchOsWindowVideoUrl(q[0]);
    debugLog('[PHASE·VIDÉO] Préchargement —', liveShortName(q[0]), '(pendant le Boom,', q.length, 'vidéo(s) en file)');
  } else {
    osWindowPreparedQueue = null;
  }

  allStickerUrls.forEach((url, idx) => {
    const img = document.createElement('img');
    img.className = 'sticker sticker-visible sticker-in-pop';
    bindStickerImage(img, url);

    const baseX = random(5, 95);
    const baseY = random(10, 90);
    const size = random(STICKER_MIN_SIZE * 0.9, STICKER_MAX_SIZE * 1.1);

    img.dataset.baseX = String(baseX);
    img.dataset.baseY = String(baseY);
    img.dataset.size = String(size);
    img.dataset.phaseX = String(random(0, Math.PI * 2));
    img.dataset.phaseY = String(random(0, Math.PI * 2));
    img.dataset.ampX = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP * 1.3));
    img.dataset.ampY = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP * 1.3));
    img.dataset.floatSpeed = String(random(STICKER_MIN_SPEED, STICKER_MAX_SPEED * 1.2));
    const boomBehaviors = [0, 3, 4, 5];
    img.dataset.behavior = String(boomBehaviors[idx % boomBehaviors.length]);

    img.style.width = size + 'px';
    img.style.height = 'auto';
    img.style.left = baseX + '%';
    img.style.top = baseY + '%';
    img.style.transform = 'translate(-50%, -50%) scale(1)';
    img.style.opacity = '1';
    stickersLayer.appendChild(img);
  });

  if (superBoomTimer) {
    clearTimeout(superBoomTimer);
    superBoomTimer = null;
  }

  superBoomTimer = setTimeout(() => {
    inSuperBoom = false;
    clearStickers();
    startOsWindowPhase();
  }, SUPER_BOOM_DURATION_MS);
}

function clearOsWindowLoadTimer() {
  if (osWindowLoadTimer) {
    clearTimeout(osWindowLoadTimer);
    osWindowLoadTimer = null;
  }
}

function clearOsWindowMaxTimer() {
  if (osWindowMaxTimer) {
    clearTimeout(osWindowMaxTimer);
    osWindowMaxTimer = null;
  }
}

function clearOsWindowTimers() {
  clearOsWindowLoadTimer();
  clearOsWindowMaxTimer();
}

/** Options layout pour la phase webcam (fenêtre plus grande + upscale autorisé). */
const WEBCAM_LAYOUT_OPTS = {
  maxWidthRatio: WEBCAM_WINDOW_MAX_WIDTH_RATIO,
  maxHeightRatio: WEBCAM_WINDOW_MAX_HEIGHT_RATIO,
  maxScale: WEBCAM_WINDOW_MAX_UPSCALE,
};

/**
 * Taille la « fenêtre » (shell + cadre) selon le ratio de la vidéo.
 * @param {HTMLElement | null} layerRoot ex. #ssiOsWindowLayer ou #ssiWebcamPhaseLayer
 * @param {HTMLVideoElement} video
 * @param {{ maxWidthRatio?: number, maxHeightRatio?: number, maxScale?: number }} [opts]
 */
function layoutPhaseWindowFromVideo(layerRoot, video, opts = {}) {
  const scene = sceneEl;
  if (!scene || !video || !layerRoot) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const maxWR = opts.maxWidthRatio ?? OS_WINDOW_MAX_WIDTH_RATIO;
  const maxHR = opts.maxHeightRatio ?? OS_WINDOW_MAX_HEIGHT_RATIO;
  const maxScale = opts.maxScale ?? 1;
  const maxContentW = Math.max(
    64,
    scene.clientWidth * maxWR - OS_WINDOW_CHROME_HORIZONTAL_PX,
  );
  const maxContentH = Math.max(
    48,
    scene.clientHeight * maxHR - OS_WINDOW_CHROME_VERTICAL_PX,
  );
  const scale = Math.min(maxContentW / vw, maxContentH / vh, maxScale);
  const contentW = Math.round(vw * scale);
  const contentH = Math.round(vh * scale);
  const shell = layerRoot.querySelector('.ssi-os-video-shell');
  const winEl = layerRoot.querySelector('.ssi-os-window');
  if (shell) {
    shell.style.width = `${contentW}px`;
    shell.style.height = `${contentH}px`;
  }
  if (winEl) {
    const framePad = Math.max(0, OS_WINDOW_CHROME_HORIZONTAL_PX - 4);
    winEl.style.width = `${contentW + framePad}px`;
    winEl.style.maxWidth = `${Math.round(scene.clientWidth * maxWR)}px`;
  }
}

function layoutOsWindowFromVideo(video) {
  if (!osWindowLayer) return;
  layoutPhaseWindowFromVideo(osWindowLayer, video);
}

/** Durée minimale d'affichage de l'effet « aucun signal » (ms) — visible même si la vidéo démarre instantanément du cache. */
const NO_SIGNAL_MIN_DISPLAY_MS = 900;
let _noSignalArmedAt = 0;
let _noSignalClearTimer = null;

function clearOsWindowVideoSignalWait() {
  if (!osWindowLayer) return;
  if (_noSignalClearTimer != null) {
    clearTimeout(_noSignalClearTimer);
    _noSignalClearTimer = null;
  }
  const elapsed = Date.now() - _noSignalArmedAt;
  const remaining = NO_SIGNAL_MIN_DISPLAY_MS - elapsed;
  if (remaining > 0) {
    _noSignalClearTimer = setTimeout(() => {
      _noSignalClearTimer = null;
      if (osWindowLayer) osWindowLayer.classList.remove('ssi-os-window-layer--video-signal-wait');
    }, remaining);
  } else {
    osWindowLayer.classList.remove('ssi-os-window-layer--video-signal-wait');
  }
}

/** Effet « aucun signal / vieille TV » (CSS) — visible au moins NO_SIGNAL_MIN_DISPLAY_MS ms même si la vidéo démarre instantanément. */
function armOsWindowVideoSignalWait() {
  if (!osWindowLayer) return;
  if (_noSignalClearTimer != null) {
    clearTimeout(_noSignalClearTimer);
    _noSignalClearTimer = null;
  }
  _noSignalArmedAt = Date.now();
  osWindowLayer.classList.add('ssi-os-window-layer--video-signal-wait');
}

/** Nettoyage immédiat (sans animation) — reset tremblement inclus */
function hideOsWindowLayerImmediate() {
  if (!osWindowLayer || !osWindowVideo) return;
  clearOsWindowVideoSignalWait();
  if (osWindowLoadAbort) {
    try {
      osWindowLoadAbort.abort();
    } catch (_) {}
    osWindowLoadAbort = null;
  }
  if (osWindowResizeListener) {
    window.removeEventListener('resize', osWindowResizeListener);
    osWindowResizeListener = null;
  }
  osWindowVideo.onended = null;
  osWindowVideo.onerror = null;
  osWindowVideo.pause();
  try {
    osWindowVideo.removeAttribute('src');
    osWindowVideo.load();
  } catch (_) {}
  osWindowLayer.classList.remove(
    'ssi-os-window-layer--open',
    'ssi-os-window-layer--buffering',
  );
  const shaker = osWindowLayer.querySelector('.ssi-os-window-shaker');
  if (shaker) shaker.style.transform = '';
  osWindowLayer.hidden = true;
  osWindowLayer.setAttribute('aria-hidden', 'true');
}

/**
 * Fermeture type « fenêtre » (fade + scale + glissement), puis nettoyage.
 * @param {() => void} [onDone]
 */
function hideOsWindowLayerAnimated(onDone) {
  if (!osWindowLayer || !osWindowVideo) {
    onDone?.();
    return;
  }
  if (!osWindowLayer.classList.contains('ssi-os-window-layer--open')) {
    hideOsWindowLayerImmediate();
    onDone?.();
    return;
  }
  osWindowLayer.classList.remove('ssi-os-window-layer--open');
  window.setTimeout(() => {
    hideOsWindowLayerImmediate();
    onDone?.();
  }, OS_WINDOW_OPEN_CLOSE_MS);
}

function clearWebcamTimers() {
  if (webcamPhaseTimer) {
    clearTimeout(webcamPhaseTimer);
    webcamPhaseTimer = null;
  }
}

/** Nettoyage immédiat flux webcam + calque */
function hideWebcamLayerImmediate() {
  stopWebcamGrainLoop();
  clearWebcamTimers();
  if (webcamResizeListener) {
    window.removeEventListener('resize', webcamResizeListener);
    webcamResizeListener = null;
  }
  if (webcamStream) {
    try {
      webcamStream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    webcamStream = null;
  }
  if (webcamVideo) {
    webcamVideo.onloadedmetadata = null;
    try {
      webcamVideo.srcObject = null;
    } catch (_) {}
  }
  if (webcamLayer) {
    webcamLayer.classList.remove('ssi-os-window-layer--open');
    const shaker = webcamLayer.querySelector('.ssi-os-window-shaker');
    if (shaker) shaker.style.transform = '';
    webcamLayer.hidden = true;
    webcamLayer.setAttribute('aria-hidden', 'true');
  }
}

function hideWebcamLayerAnimated(onDone) {
  if (!webcamLayer || !webcamVideo) {
    onDone?.();
    return;
  }
  if (!webcamLayer.classList.contains('ssi-os-window-layer--open')) {
    hideWebcamLayerImmediate();
    onDone?.();
    return;
  }
  webcamLayer.classList.remove('ssi-os-window-layer--open');
  window.setTimeout(() => {
    hideWebcamLayerImmediate();
    onDone?.();
  }, OS_WINDOW_OPEN_CLOSE_MS);
}

/** Génération d’interruption télécommande (invalide les callbacks de l’interruption précédente). */
let remoteInterruptGen = 0;

function runWhenBothOsWebcamClosed(done) {
  let n = 0;
  const step = () => {
    n += 1;
    if (n >= 2) done();
  };
  hideOsWindowLayerAnimated(step);
  hideWebcamLayerAnimated(step);
}

/**
 * Arrête timers et ferme calques avec les mêmes animations / sorties stickers que le cycle normal.
 * @param {() => void} done
 */
function interruptAllPhases(done) {
  const myGen = ++remoteInterruptGen;

  if (snakeTimer) {
    clearTimeout(snakeTimer);
    snakeTimer = null;
  }
  if (superBoomTimer) {
    clearTimeout(superBoomTimer);
    superBoomTimer = null;
  }
  if (logoTimer) {
    clearTimeout(logoTimer);
    logoTimer = null;
  }
  clearWebcamTimers();
  clearOsWindowTimers();
  inSuperBoom = false;

  osWindowLoadGeneration += 1;
  webcamGeneration += 1;
  if (osWindowLoadAbort) {
    try {
      osWindowLoadAbort.abort();
    } catch (_) {}
    osWindowLoadAbort = null;
  }
  releasePhasePrefetchMediaForOsWindow();

  animateStickersOut(() => {
    if (myGen !== remoteInterruptGen) return;
    runWhenBothOsWebcamClosed(() => {
      if (myGen !== remoteInterruptGen) return;
      done();
    });
  });
}

function clampPhaseVideoIndex(idx) {
  if (!phaseVideoUrls.length) return 0;
  const n = Number(idx);
  const i = Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.max(0, Math.min(phaseVideoUrls.length - 1, i));
}

/**
 * Télécommande HTTP : interrompt le cycle en cours puis lance la phase demandée (mêmes animations).
 * @param {string} phase snake | super_boom | os_video | logo | webcam
 * @param {number | null | undefined} [videoIndex] index dans la liste API phase-videos (os_video)
 */
export function applyRemotePhaseCommand(phase, videoIndex) {
  const p = String(phase || '')
    .toLowerCase()
    .replace(/-/g, '_');
  const known = new Set(['snake', 'super_boom', 'os_video', 'logo', 'webcam']);
  if (!known.has(p)) {
    debugWarn('[SSI] Télécommande phase inconnue :', phase);
    return;
  }
  interruptAllPhases(() => {
    if (p === 'snake') {
      snakeCyclesDone = 0;
      currentSnakeSetIndex = 0;
      prepareSnakeSet();
      playNextSnakeSticker();
      return;
    }
    if (p === 'super_boom') {
      startSuperBoom();
      return;
    }
    if (p === 'os_video') {
      const url = phaseVideoUrls.length ? phaseVideoUrls[clampPhaseVideoIndex(videoIndex)] : null;
      if (url) {
        startOsWindowPhase({ forcedUrl: url });
      } else {
        reportLiveEvent('os_window_skip', { reason: 'telecommande_sans_video' });
        startLogoPhase();
      }
      return;
    }
    if (p === 'logo') {
      startLogoPhase();
      return;
    }
    if (p === 'webcam') {
      startWebcamPhase();
    }
  });
}

/** Reprise boucle standard (snake) après délai sans commande télécommande. */
export function forceIdleResumeStandardCycle() {
  interruptAllPhases(() => {
    snakeCyclesDone = 0;
    currentSnakeSetIndex = 0;
    prepareSnakeSet();
    playNextSnakeSticker();
  });
}

function resumeSnakeAfterWebcam() {
  prepareSnakeSet();
  startVisualCycle();
}

/**
 * Après le logo : affiche le flux déjà obtenu au chargement (requestWebcamPermissionEarly).
 * Si refus / pas de caméra : skip + télémétrie, retour snake. Nouveau getUserMedia seulement
 * pour les tours suivants du cycle (souvent sans nouvelle boîte de dialogue).
 */
function startWebcamPhase() {
  clearWebcamTimers();
  hideWebcamLayerImmediate();
  webcamGeneration += 1;
  const gen = webcamGeneration;

  if (!webcamLayer || !webcamVideo) {
    reportLiveEvent('webcam_phase_skip', { reason: 'dom_manquant' });
    debugWarn('[SSI] Phase webcam : #ssiWebcamPhaseLayer ou #ssiWebcamVideo absent');
    resumeSnakeAfterWebcam();
    return;
  }

  acquireWebcamStreamForPhase().then((result) => {
    if (gen !== webcamGeneration) {
      try {
        result.stream?.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      return;
    }

    const { stream, reason } = result;
    if (!stream) {
      reportLiveEvent('webcam_phase_skip', {
        reason: reason || 'flux_indisponible',
      });
      debugLog('[SSI] Phase webcam : pas de flux → snake', reason || '');
      resumeSnakeAfterWebcam();
      return;
    }

    webcamStream = stream;
    webcamVideo.srcObject = stream;
    attachVideoLifecycle(webcamVideo, 'webcam', 'flux_direct');

    const onMeta = () => {
      if (gen !== webcamGeneration) return;
      layoutPhaseWindowFromVideo(webcamLayer, webcamVideo, WEBCAM_LAYOUT_OPTS);
      webcamResizeListener = () => {
        if (webcamLayer && !webcamLayer.hidden && webcamVideo.videoWidth) {
          layoutPhaseWindowFromVideo(webcamLayer, webcamVideo, WEBCAM_LAYOUT_OPTS);
        }
      };
      window.addEventListener('resize', webcamResizeListener);

      webcamLayer.hidden = false;
      webcamLayer.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== webcamGeneration) return;
          webcamLayer.classList.add('ssi-os-window-layer--open');
          startWebcamGrainLoop();
        });
      });

      webcamVideo
        .play()
        .then(() => {
          if (gen !== webcamGeneration) return;
          reportLiveEvent('webcam_phase', {});
          webcamPhaseTimer = setTimeout(() => {
            if (gen !== webcamGeneration) return;
            hideWebcamLayerAnimated(() => {
              resumeSnakeAfterWebcam();
            });
          }, WEBCAM_PHASE_DURATION_MS);
        })
        .catch(() => {
          if (gen !== webcamGeneration) return;
          reportLiveEvent('webcam_phase_skip', { reason: 'play_refusé' });
          debugLog('[SSI] Phase webcam : lecture refusée → snake');
          hideWebcamLayerImmediate();
          resumeSnakeAfterWebcam();
        });
    };

    webcamVideo.addEventListener('loadedmetadata', onMeta, { once: true });
  });
}

/**
 * Après SUPER BOOM : vidéo dans fausse fenêtre. Plusieurs fichiers / long timeout / annulation propre.
 * Audio : indépendant ; les silences viennent souvent d’un enchaînement manquant → filet dans audio.js.
 */
/**
 * @param {{ forcedUrl?: string | null }} [opts] forcedUrl — vidéo imposée (télécommande), sinon file comme après Super Boom.
 */
function startOsWindowPhase(opts = {}) {
  const forcedUrl =
    typeof opts.forcedUrl === 'string' && opts.forcedUrl.length > 0 ? opts.forcedUrl : null;

  if (!forcedUrl && !phaseVideoUrls.length) {
    reportLiveEvent('os_window_skip', { reason: 'aucune_vidéo' });
    debugLog('[SSI] Phase fenêtre OS : aucun fichier dans phase_videos/ → enchaînement logo');
    startLogoPhase();
    return;
  }
  if (!osWindowLayer || !osWindowVideo) {
    reportLiveEvent('os_window_skip', { reason: 'dom_manquant' });
    debugWarn('[SSI] Phase fenêtre OS : #ssiOsWindowLayer ou vidéo absent');
    startLogoPhase();
    return;
  }

  let queue;
  if (forcedUrl) {
    queue = [forcedUrl];
    osWindowPreparedQueue = null;
  } else if (
    osWindowPreparedQueue &&
    osWindowPreparedQueue.length &&
    osWindowPreparedQueue.length === phaseVideoUrls.length
  ) {
    queue = osWindowPreparedQueue;
    osWindowPreparedQueue = null;
  } else {
    osWindowPreparedQueue = null;
    queue = shuffleInPlace(phaseVideoUrls.slice());
  }
  const maxAttempts = Math.min(queue.length, OS_WINDOW_MAX_LOAD_ATTEMPTS);
  let attemptIndex = 0;

  const goLogoAfterExhausted = () => {
    reportLiveEvent('os_window_skip', { reason: 'épuisement_tentatives' });
    debugLog('[PHASE·VIDÉO] ✗ Toutes les tentatives épuisées → enchaînement logo');
    hideOsWindowLayerImmediate();
    startLogoPhase();
  };

  const tryOne = () => {
    if (attemptIndex >= maxAttempts) {
      goLogoAfterExhausted();
      return;
    }

    const url = queue[attemptIndex];
    attemptIndex += 1;

    debugLog('[PHASE·VIDÉO] Tentative', attemptIndex + '/' + maxAttempts, '—', liveShortName(url));

    clearOsWindowTimers();
    hideOsWindowLayerImmediate();
    releasePhasePrefetchMediaForOsWindow();

    osWindowLoadGeneration += 1;
    const gen = osWindowLoadGeneration;

    osWindowLoadAbort = new AbortController();
    const { signal } = osWindowLoadAbort;

    let opened = false;
    let phaseFinishing = false;
    /** Filet « fenêtre ouverte mais vidéo qui ne tourne pas » */
    let playingWatchdogTimer = null;
    /** Horodatage du premier play() réussi — pour la boucle min duration (thème Diagonal). */
    let phaseStartMs = 0;

    const clearPlayingWatchdog = () => {
      if (playingWatchdogTimer != null) {
        clearTimeout(playingWatchdogTimer);
        playingWatchdogTimer = null;
      }
    };

    const completePhase = (reason) => {
      if (phaseFinishing) return;
      if (gen !== osWindowLoadGeneration) return;
      phaseFinishing = true;
      clearPlayingWatchdog();
      clearOsWindowTimers();
      hideOsWindowLayerAnimated(() => {
        debugLog('[PHASE·VIDÉO] Fin —', reason, '—', liveShortName(url));
        startLogoPhase();
      });
    };

    const failAttempt = (why) => {
      if (gen !== osWindowLoadGeneration) return;
      if (phaseFinishing) return;
      clearPlayingWatchdog();
      clearOsWindowTimers();
      try {
        osWindowLoadAbort?.abort();
      } catch (_) {}
      osWindowLoadAbort = null;
      hideOsWindowLayerImmediate();
      debugLog('[PHASE·VIDÉO] ✗ Échec —', why, '—', liveShortName(url));
      reportLiveEvent('os_window_skip', { reason: why, fichier: liveShortName(url) });
      tryOne();
    };

    osWindowLoadTimer = setTimeout(() => {
      if (gen !== osWindowLoadGeneration) return;
      failAttempt('chargement_incomplet');
    }, OS_WINDOW_LOAD_WAIT_MS);

    osWindowVideo.onerror = () => {
      if (gen !== osWindowLoadGeneration) return;
      reportLiveEvent('os_window_fail', { fichier: liveShortName(url) });
      if (opened) {
        completePhase('erreur_lecture');
      } else {
        failAttempt('erreur_décode');
      }
    };

    const maybeOpen = () => {
      if (gen !== osWindowLoadGeneration || phaseFinishing) return;
      if (opened) return;
      const vw = osWindowVideo.videoWidth;
      const vh = osWindowVideo.videoHeight;
      if (!vw || !vh) return;

      debugLog('[PHASE·VIDÉO] Vidéo prête —', vw + '×' + vh, '—', liveShortName(url));

      opened = true;
      clearOsWindowLoadTimer();
      try {
        osWindowLoadAbort?.abort();
      } catch (_) {}
      osWindowLoadAbort = null;

      osWindowLayer.classList.remove('ssi-os-window-layer--buffering');

      layoutOsWindowFromVideo(osWindowVideo);
      osWindowResizeListener = () => {
        if (!osWindowLayer.hidden && osWindowVideo.videoWidth) {
          layoutOsWindowFromVideo(osWindowVideo);
        }
      };
      window.addEventListener('resize', osWindowResizeListener);
      osWindowLayer.hidden = false;
      osWindowLayer.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== osWindowLoadGeneration) return;
          osWindowLayer.classList.add('ssi-os-window-layer--open');
        });
      });

      debugLog('[PHASE·VIDÉO] Fenêtre ouverte —', liveShortName(url));
      armOsWindowVideoSignalWait();

      reportLiveEvent('os_window', { fichier: liveShortName(url) });

      osWindowVideo.onended = () => {
        const elapsed = phaseStartMs > 0 ? Date.now() - phaseStartMs : Infinity;
        if (_osWindowMinLoopMs > 0 && elapsed < _osWindowMinLoopMs) {
          /* Reboucle : pas encore assez de temps — maxTimer continue comme garde-fou absolu */
          osWindowVideo.currentTime = 0;
          osWindowVideo.play().catch(() => {
            clearOsWindowMaxTimer();
            completePhase('loop_ended');
          });
          return;
        }
        clearOsWindowMaxTimer();
        completePhase('ended');
      };

      osWindowVideo.muted = true;
      osWindowVideo.defaultMuted = true;
      try {
        osWindowVideo.playsInline = true;
      } catch (_) {}

      playOsWindowVideoResilient(
        osWindowVideo,
        () => gen !== osWindowLoadGeneration || phaseFinishing,
        () => {
          if (gen !== osWindowLoadGeneration) return;
          debugLog('[PHASE·VIDÉO] Lecture démarrée —', liveShortName(url));
          if (phaseStartMs === 0) phaseStartMs = Date.now();

          /* play() peut tenir sans image qui avance (buffer, Chrome…) → surveillance courte */
          let playingConfirmed = false;
          const markPlaying = () => {
            playingConfirmed = true;
            clearPlayingWatchdog();
            clearOsWindowVideoSignalWait();
          };
          const onPlayingOnce = () => markPlaying();
          if (!osWindowVideo.paused) {
            markPlaying();
          } else {
            osWindowVideo.addEventListener('playing', onPlayingOnce, { once: true });
          }

          if (!playingConfirmed) {
            clearPlayingWatchdog();
            playingWatchdogTimer = setTimeout(() => {
              playingWatchdogTimer = null;
              if (gen !== osWindowLoadGeneration || phaseFinishing || playingConfirmed) return;
              if (osWindowVideo.paused && !osWindowVideo.ended) {
                debugWarn('[PHASE·VIDÉO] Fenêtre visible mais vidéo en pause — nouvel essai play()…');
                osWindowVideo.play().catch(() => failAttempt('lecture_bloquée'));
                playingWatchdogTimer = setTimeout(() => {
                  playingWatchdogTimer = null;
                  if (gen !== osWindowLoadGeneration || phaseFinishing || playingConfirmed) return;
                  if (osWindowVideo.paused && !osWindowVideo.ended) {
                    failAttempt('lecture_bloquée');
                  }
                }, OS_WINDOW_PLAYING_RETRY_WATCHDOG_MS);
              }
            }, OS_WINDOW_PLAYING_WATCHDOG_MS);
          }

          osWindowMaxTimer = setTimeout(() => {
            if (gen !== osWindowLoadGeneration) return;
            debugLog('[SSI] Phase fenêtre OS : durée max (garde-fou) → logo');
            completePhase('timeout_max');
          }, OS_WINDOW_PHASE_MAX_MS);
        },
        (err) => {
          if (gen !== osWindowLoadGeneration) return;
          debugWarn(
            '[PHASE·VIDÉO] play() refusé après toutes les reprises —',
            err?.name, err?.message || '',
            '— readyState=', osWindowVideo.readyState,
            '— fichier:', liveShortName(url),
          );
          reportLiveEvent('os_window_fail', { fichier: liveShortName(url) });
          failAttempt('play_refusé');
        },
      );
    };

    /* loadedmetadata + canplay : ouverture normale.
       progress : filet si loadedmetadata arrive sans dimensions (mauvais encodage) — maybeOpen est idempotent. */
    try {
      osWindowVideo.addEventListener('loadedmetadata', maybeOpen, { once: true, signal });
      osWindowVideo.addEventListener('canplay', maybeOpen, { once: true, signal });
      osWindowVideo.addEventListener('progress', maybeOpen, { signal });

      /* Détection embouteillage serveur — toujours visible (pas derrière ?videoLog) */
      let stalledCount = 0;
      osWindowVideo.addEventListener('loadstart', () => {
        debugLogTs('[PHASE·VIDÉO] loadstart —', liveShortName(url));
      }, { once: true, signal });
      osWindowVideo.addEventListener('stalled', () => {
        stalledCount += 1;
        debugLogTs(
          '[EMBOUTEILLAGE] Vidéo stalled ×' + stalledCount + ' —',
          liveShortName(url),
          '— readyState:', osWindowVideo.readyState,
          '— réseau/serveur saturé ?',
        );
      }, { signal });
      osWindowVideo.addEventListener('waiting', () => {
        debugLogTs(
          '[EMBOUTEILLAGE] Vidéo waiting —',
          liveShortName(url),
          '— readyState:', osWindowVideo.readyState,
        );
      }, { signal });
    } catch (_) {
      osWindowVideo.addEventListener('loadedmetadata', maybeOpen, { once: true });
      osWindowVideo.addEventListener('canplay', maybeOpen, { once: true });
      osWindowVideo.addEventListener('progress', maybeOpen);
    }

    osWindowVideo.preload = 'auto';
    try {
      osWindowVideo.setAttribute('fetchpriority', 'high');
    } catch (_) {}
    attachVideoLoadListeners(osWindowVideo, 'fenêtre OS', liveShortName(url));
    osWindowVideo.src = url;
    /* Fenêtre visible tout de suite : l’utilisateur voit le chrome pendant le buffer (gros .mov, etc.) */
    osWindowLayer.hidden = false;
    osWindowLayer.setAttribute('aria-hidden', 'false');
    osWindowLayer.classList.add('ssi-os-window-layer--buffering');
    osWindowLayer.classList.remove('ssi-os-window-layer--open');
    /* NO SIGNAL dès le buffering — avant maybeOpen (sinon invisible si timeout / pas de métadonnées) */
    armOsWindowVideoSignalWait();
    debugLogTs('[PHASE·VIDÉO] Fenêtre buffering + NO SIGNAL —', liveShortName(url));
    reportLiveEvent('os_window_buffering', { fichier: liveShortName(url) });
  };

  tryOne();
}

function startLogoPhase() {
  clearStickers();
  if (!logoUrl) {
    startWebcamPhase();
    return;
  }

  if (!stickersLayer) return;

  reportLiveEvent('logo', { fichier: liveShortName(logoUrl) });

  const img = document.createElement('img');
  img.className = 'sticker sticker-visible';
  bindStickerImage(img, logoUrl);

  const baseX = 50;
  const baseY = 50;
  const size = 540;

  img.dataset.baseX = String(baseX);
  img.dataset.baseY = String(baseY);
  img.dataset.size = String(size);
  img.dataset.phaseX = '0';
  img.dataset.phaseY = '0';
  img.dataset.ampX = String(STICKER_MIN_AMP * 0.8);
  img.dataset.ampY = String(STICKER_MIN_AMP * 0.8);
  img.dataset.floatSpeed = String(STICKER_MIN_SPEED * 0.6);
  img.dataset.behavior = '4';

  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = baseX + '%';
  img.style.top = baseY + '%';
  img.style.transform = 'translate(-50%, -50%) scale(1)';
  img.style.opacity = '1';
  stickersLayer.appendChild(img);

  if (logoTimer) {
    clearTimeout(logoTimer);
    logoTimer = null;
  }

  logoTimer = setTimeout(() => {
    clearStickers();
    startWebcamPhase();
  }, LOGO_PHASE_DURATION_MS);
}

/**
 * @param {string[]} stickerUrls URLs renvoyées par l’API
 */
/**
 * @param {string[]} urls URLs renvoyées par GET /api/phase-videos
 */
export function initPhaseVideos(urls) {
  phaseVideoUrls = (urls || []).filter((u) => typeof u === 'string' && u.length > 0);
  debugLog('[SSI] phase_videos :', phaseVideoUrls.length, 'fichier(s) — chargement pendant le Super Boom');
  /* Pas de prefetch ici : la vidéo fait ≤ 6 Mo, le boom (15 s) est largement suffisant.
     Le seul prefetch utile est dans startSuperBoom(). */
}

export function initStickers(stickerUrls) {
  const raw = (stickerUrls || []).filter((u) => typeof u === 'string' && u.length > 0);
  usingFallbackStickers = raw.length === 0;
  allStickerUrls = raw.length ? raw : [FALLBACK_STICKER_URL];
  logoUrl =
    allStickerUrls.find((u) => /ssi-logo/i.test(u)) ||
    allStickerUrls.find((u) => /logo/i.test(u)) ||
    allStickerUrls[0] ||
    FALLBACK_STICKER_URL;
  prepareSnakeSet();
  /* startVisualCycle() est appelé explicitement depuis main.js au 1er clic utilisateur */
}

/** Lance le cycle visuel (Snake → Boom → Vidéo → Logo → Webcam). Appelé au 1er clic depuis main.js. */
export function startVisualCycleOnFirstClick() {
  startVisualCycle();
}

/** Infos pour bandeau opérateur / debug (LIVE) */
export function getStickerLiveInfo() {
  return {
    usingFallback: usingFallbackStickers,
    stickerCount: allStickerUrls.length,
    phaseVideoCount: phaseVideoUrls.length,
  };
}

/** Pour visuals.js : tremblement horizontal réactif au son */
export function isOsWindowShakeActive() {
  return Boolean(
    osWindowLayer &&
      !osWindowLayer.hidden &&
      osWindowLayer.classList.contains('ssi-os-window-layer--open'),
  );
}

/** Phase webcam : même tremblement que la fenêtre OS (un seul des deux actif à la fois) */
export function isWebcamPhaseActive() {
  return Boolean(
    webcamLayer &&
      !webcamLayer.hidden &&
      webcamLayer.classList.contains('ssi-os-window-layer--open'),
  );
}
