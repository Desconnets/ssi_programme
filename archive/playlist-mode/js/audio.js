import {
  BEAT_THRESHOLD,
  BEAT_COOLDOWN_MS,
  BASS_BEAT_THRESHOLD,
  BASS_BEAT_COOLDOWN_MS,
  JINGLE_TO_MUSIC_OVERLAP_SEC,
  MUSIC_TO_MUSIC_OVERLAP_SEC,
  MUSIC_TO_JINGLE_OVERLAP_SEC,
  TRACKS_PER_JINGLE,
  MUSIC_CROSSFADE_MS,
  MUSIC_FADE_IN_FIRST_MS,
  JINGLE_FADE_IN_MS,
  JINGLE_MUSIC_CROSSFADE_MS,
  MUSIC_DUCK_FOR_JINGLE_MS,
} from './config.js';
import { buildPlaylistTourOrder, getPlaylistOrderMode } from './playlist-order.js';
import { debugLog, debugWarn, debugLogTs, diagAudioNet } from './debug.js';
import { reportLiveEvent, liveShortName } from './live-telemetry.js';

/** Throttle LIVE : waiting/stalled peuvent spammer si le serveur est saturé */
let _trackStarveLast = 0;
let _trackStarveKey = '';
function reportTrackBufferStarve(kind, name, extra = {}) {
  const key = `${kind}|${name}`;
  const now = Date.now();
  if (_trackStarveKey === key && now - _trackStarveLast < 4500) return;
  _trackStarveKey = key;
  _trackStarveLast = now;
  reportLiveEvent('track_buffer_starve', { kind, name, ...extra });
}

let _jingleStarveLast = 0;
let _jingleStarveKey = '';
function reportJingleBufferStarve(kind, name) {
  const key = `${kind}|${name}`;
  const now = Date.now();
  if (_jingleStarveKey === key && now - _jingleStarveLast < 4500) return;
  _jingleStarveKey = key;
  _jingleStarveLast = now;
  reportLiveEvent('jingle_buffer_starve', { kind, name });
}

let _audioCtxSuspendLiveAt = 0;
let _tabHiddenLiveInstalled = false;
let _tabHiddenLast = 0;

function installPlaybackVisibilityLive() {
  if (_tabHiddenLiveInstalled || typeof document === 'undefined') return;
  _tabHiddenLiveInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    const a = currentAudio;
    if (!a || a.paused || a.ended) return;
    const now = Date.now();
    if (now - _tabHiddenLast < 12000) return;
    _tabHiddenLast = now;
    const nm =
      (currentIndex >= 0 && playlist[currentIndex]?.name) ||
      liveShortName(a.src || '') ||
      '?';
    reportLiveEvent('tab_hidden_playing', { name: nm });
  });
}

let audioContext = null;
let analyser = null;
/** @type {MediaElementAudioSourceNode | null} */
let audioSource = null;
/** @type {GainNode | null} */
let musicOutputGain = null;
let currentAudio = null;
let jingleAudio = null;
let playlist = [];
/** Permutation des indices 0..n-1 : un « tour » joue chaque fichier une fois avant remélange (indépendant du cycle visuel snake/boom/logo). */
let tourOrder = [];
let currentIndex = -1;
let jingleUrls = [];
let tracksSinceJingle = 0;
let dataArray = null;
let bufferLength = 0;
let lastBeatTime = 0;
let lastBassBeatTime = 0;
let transitionTimer = null;

/** Chaîne en cours de fondu sortant (crossfade musique → musique) */
let outgoingMusic = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let crossfadeEndTimer = null;

/** Évite les doublons : reprise AudioContext quand l’onglet redevient visible (crossfade / auto-next sans geste). */
let audioResumeHooksInstalled = false;

/** @type {'playlist' | 'micro'} — défini par le serveur (GET /api/settings), avant le 1er AudioContext */
let audioInputMode = 'playlist';
/** En mode micro : sortie analyseur muette (évite renvoi micro → enceintes). */
let monitorMuteGain = null;
let micStream = null;
/** @type {MediaStreamAudioSourceNode | null} */
let micSourceNode = null;

/** @type {{ btnPlayPause: HTMLButtonElement | null }} */
const ui = { btnPlayPause: null };

/**
 * Après createMediaElementSource + lecture, vider src déclenche souvent `error` sur l’élément.
 * Sans ce marquage, l’écouteur « vraie erreur réseau » appelle skipToNext → boucle [track → track_fail].
 */
const intentionallyReleasedMedia = new WeakSet();

/** À appeler avant pause / src vide pour ignorer l’error « fantôme » du navigateur. */
function releaseMediaElementSilently(el) {
  if (!el) return;
  intentionallyReleasedMedia.add(el);
  try {
    el.pause();
  } catch (_) {}
  try {
    el.removeAttribute('src');
    el.load();
  } catch (_) {}
}

export function setUiControls({ btnPlayPause }) {
  ui.btnPlayPause = btnPlayPause ?? null;
}

/**
 * À appeler tout de suite après le fetch config (avant toute lecture / AudioContext).
 * @param {'playlist' | 'micro'} mode
 */
export function setAudioInputMode(mode) {
  audioInputMode = mode === 'micro' ? 'micro' : 'playlist';
}

export function isMicrophoneMode() {
  return audioInputMode === 'micro';
}

/**
 * Active l’analyse du micro pour les effets (sans mix avec la playlist).
 * À déclencher après un geste utilisateur (politique navigateur).
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function startMicrophoneAnalysis() {
  if (!isMicrophoneMode()) {
    return { ok: false, reason: 'not_micro_mode' };
  }
  if (micSourceNode) {
    return { ok: true };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'no_getusermedia' };
  }
  ensureAudioContext();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
  } catch {
    return { ok: false, reason: 'permission_denied' };
  }
  const source = audioContext.createMediaStreamSource(micStream);
  source.connect(analyser);
  micSourceNode = source;
  reportLiveEvent('mic_input', { ok: true });
  return { ok: true };
}

export function stopMicrophoneAnalysis() {
  if (micSourceNode) {
    try {
      micSourceNode.disconnect();
    } catch (_) {}
    micSourceNode = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function rebuildTourOrder() {
  tourOrder = buildPlaylistTourOrder(playlist.length);
  if (tourOrder.length) {
    debugLog('[SSI] Tour playlist — mode:', getPlaylistOrderMode(), '| ordre indices:', tourOrder.join('→'));
  }
}

/**
 * Morceau suivant dans le tour en cours (chaque MP3 une fois par tour, puis nouveau mélange).
 * @param {number} currentPlaylistIndex
 */
function computeNextInTour(currentPlaylistIndex) {
  if (!playlist.length) return 0;
  if (!tourOrder.length || tourOrder.length !== playlist.length) {
    rebuildTourOrder();
  }
  const pos = tourOrder.indexOf(currentPlaylistIndex);
  if (pos === -1) {
    debugWarn('[SSI] Piste hors tour — resynchronisation du tour');
    rebuildTourOrder();
    return tourOrder[0];
  }
  if (pos + 1 >= tourOrder.length) {
    debugLog(
      '[SSI] Fin du tour playlist (tous les MP3 ont été joués) — nouveau tour — la musique continue, sans lien avec le cycle visuel.',
    );
    reportLiveEvent('playlist_tour_complete', {
      total: playlist.length,
      mode: getPlaylistOrderMode(),
    });
    rebuildTourOrder();
    return tourOrder[0];
  }
  return tourOrder[pos + 1];
}

function computePrevInTour(currentPlaylistIndex) {
  if (!playlist.length) return 0;
  if (!tourOrder.length || tourOrder.length !== playlist.length) {
    rebuildTourOrder();
  }
  const pos = tourOrder.indexOf(currentPlaylistIndex);
  if (pos === -1) {
    return tourOrder[tourOrder.length - 1];
  }
  const prevPos = (pos - 1 + tourOrder.length) % tourOrder.length;
  return tourOrder[prevPos];
}

/** Premier morceau du tour actuel (après virgule intro ou reprise). */
export function getFirstTourPlaylistIndex() {
  if (!playlist.length) return 0;
  if (!tourOrder.length || tourOrder.length !== playlist.length) {
    rebuildTourOrder();
  }
  return tourOrder[0];
}

export function initPlaylist(trackUrls) {
  playlist = trackUrls.map((url) => ({
    url,
    name: decodeURIComponent((url.split('/').pop() || '').replace(/\.(mp3|wav|ogg|m4a|aac|webm)$/i, '')),
  }));
  rebuildTourOrder();
}

export function setJingleUrls(urls) {
  jingleUrls = urls || [];
}

export function getJingleUrls() {
  return jingleUrls;
}

export function getPlaylistLength() {
  return playlist.length;
}

export function getCurrentAudio() {
  return currentAudio;
}

export function setTracksSinceJingle(n) {
  tracksSinceJingle = n;
}

export function getAudioContext() {
  return audioContext;
}

function clearTransitionTimer() {
  if (transitionTimer) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
}

function clearCrossfadeEndTimer() {
  if (crossfadeEndTimer) {
    clearTimeout(crossfadeEndTimer);
    crossfadeEndTimer = null;
  }
}

function forceCleanupMusicChain(audio, source, gain) {
  try {
    source?.disconnect();
  } catch (_) {}
  try {
    gain?.disconnect();
  } catch (_) {}
  releaseMediaElementSilently(audio);
}

/** Termine tout crossfade en cours et nettoie la chaîne sortante */
function abortCrossfadeAndOutgoing() {
  clearCrossfadeEndTimer();
  if (outgoingMusic) {
    forceCleanupMusicChain(outgoingMusic.audio, outgoingMusic.source, outgoingMusic.gain);
    outgoingMusic = null;
  }
}

function installAudioContextResumeHooks() {
  if (audioResumeHooksInstalled || typeof document === 'undefined') return;
  audioResumeHooksInstalled = true;
  const tryResume = () => {
    if (audioContext?.state === 'suspended') {
      void audioContext.resume().then(() => {
        if (audioContext?.state === 'running') {
          debugLog('[SSI] AudioContext repris (visibilité / focus)');
        }
      });
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryResume();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) tryResume();
  });
  window.addEventListener('focus', tryResume);
}

/**
 * Les rampes Web Audio (gain) n’avancent pas si le contexte est suspendu : play() peut réussir mais silence.
 * Toujours appeler avant rampGainLinear après audio.play() (crossfade, auto-next, etc.).
 * @returns {Promise<void>}
 */
function resumeAudioContextIfNeeded() {
  ensureAudioContext();
  installAudioContextResumeHooks();
  if (!audioContext) return Promise.resolve();
  if (audioContext.state !== 'suspended') return Promise.resolve();

  /* audioContext.resume() peut ne jamais résoudre si Chrome bloque silencieusement.
     On laisse 2 s max puis on continue quand même (la musique sera muette mais pas bloquée). */
  const resumePromise = audioContext.resume().catch(() => {});
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      if (audioContext && audioContext.state === 'suspended') {
        debugWarn('[RADIO] AudioContext toujours suspendu après 2 s — le son peut être muet. Recliquez sur la page.');
        reportLiveEvent('audio_context_stuck', { ms: 2000, state: audioContext.state });
      }
      resolve();
    }, 2000);
  });
  return Promise.race([resumePromise, timeoutPromise]);
}

function warnIfContextStillBlocked(phase) {
  if (!audioContext || audioContext.state === 'running') return;
  debugWarn(
    `[SSI] AudioContext « ${audioContext.state} » après ${phase} — le son peut rester muet jusqu’à un clic ou le retour sur l’onglet.`,
  );
  reportLiveEvent('audio_context_blocked', { state: audioContext.state, phase });
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.addEventListener('statechange', () => {
      if (!audioContext) return;
      if (audioContext.state === 'suspended') {
        const now = Date.now();
        if (now - _audioCtxSuspendLiveAt < 6000) return;
        _audioCtxSuspendLiveAt = now;
        reportLiveEvent('audio_context_state', {
          state: 'suspended',
          hint: 'Web Audio suspendu (onglet caché / économie) → silence possible',
        });
      }
    });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    if (isMicrophoneMode()) {
      monitorMuteGain = audioContext.createGain();
      monitorMuteGain.gain.value = 0;
      analyser.connect(monitorMuteGain);
      monitorMuteGain.connect(audioContext.destination);
    } else {
      analyser.connect(audioContext.destination);
    }
    installAudioContextResumeHooks();
    installPlaybackVisibilityLive();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

/**
 * @param {GainNode} gainNode
 * @param {number} from
 * @param {number} to
 * @param {number} durationSec
 */
function rampGainLinear(gainNode, from, to, durationSec) {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  const g = gainNode.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(from, t);
  g.linearRampToValueAtTime(to, t + Math.max(0.001, durationSec));
}

/**
 * @param {HTMLMediaElement} el
 * @param {number} from
 * @param {number} to
 * @param {number} durationMs
 * @param {() => void} [onDone]
 */
function rampHtmlVolume(el, from, to, durationMs, onDone) {
  const t0 = performance.now();
  function step() {
    const u = Math.min(1, (performance.now() - t0) / durationMs);
    el.volume = from + (to - from) * u;
    if (u < 1) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  }
  requestAnimationFrame(step);
}

/**
 * Branche element → gain → analyser (ne déconnecte pas l’ancien : à faire avant si besoin)
 * @returns {{ source: MediaElementAudioSourceNode, gain: GainNode }}
 */
function attachMusicToAnalyser(audio) {
  ensureAudioContext();
  const source = audioContext.createMediaElementSource(audio);
  const gain = audioContext.createGain();
  source.connect(gain);
  gain.connect(analyser);
  return { source, gain };
}

function disconnectCurrentMusicGraph() {
  try {
    audioSource?.disconnect();
  } catch (_) {}
  try {
    musicOutputGain?.disconnect();
  } catch (_) {}
  audioSource = null;
  musicOutputGain = null;
}

/**
 * Si le timeout de transition ne part pas (onglet en veille, bug navigateur), le morceau se termine quand même.
 */
function bindTrackEndedFallback(audio, item, nextIndex) {
  audio.addEventListener(
    'ended',
    () => {
      if (intentionallyReleasedMedia.has(audio)) return;
      if (currentAudio !== audio) return;
      clearTransitionTimer();
      debugLog('[SSI] Filet audio : morceau terminé sans enchaînement → piste suivante');
      reportLiveEvent('audio_ended_fallback', { name: item.name || liveShortName(item.url) });
      playTrack(nextIndex, { crossfade: false });
    },
    { once: true },
  );
}

/**
 * @param {string | null} [overlapLiveTag] — si défini, LIVE au moment du déclenchement (fin morceau / overlap)
 */
function scheduleNearEnd(audio, overlapSec, callback, overlapLiveTag = null) {
  const doSchedule = () => {
    if (!isFinite(audio.duration) || audio.duration <= 0) {
      debugWarn('scheduleNearEnd — durée invalide pour', audio.src);
      audio.addEventListener('ended', callback, { once: true });
      return;
    }
    const delayMs = Math.max(0, (audio.duration - overlapSec - audio.currentTime) * 1000);
    debugLogTs(
      '[RADIO] scheduleNearEnd — durée:',
      audio.duration.toFixed(2) + 's',
      '| overlap:',
      overlapSec + 's',
      '| dans:',
      (delayMs / 1000).toFixed(2) + 's',
    );
    transitionTimer = setTimeout(() => {
      if (overlapLiveTag) {
        reportLiveEvent('track_overlap_fire', { tag: overlapLiveTag, overlapSec });
      }
      callback();
    }, delayMs);
  };

  if (isFinite(audio.duration) && audio.duration > 0) {
    doSchedule();
  } else {
    audio.addEventListener('loadedmetadata', doSchedule, { once: true });
  }
}

export function playJingle(jingleUrl, thenPlayIndex) {
  if (isMicrophoneMode()) return;
  clearTransitionTimer();
  abortCrossfadeAndOutgoing();

  if (jingleAudio) {
    releaseMediaElementSilently(jingleAudio);
  }
  const jingleName = liveShortName(jingleUrl);
  debugLog('[VIRGULE] Démarrage —', jingleName);

  jingleAudio = new Audio(jingleUrl);
  jingleAudio.volume = 0;

  jingleAudio.addEventListener('loadstart', () => {
    debugLogTs('[VIRGULE] loadstart —', jingleName);
    reportLiveEvent('jingle_load_start', { name: jingleName });
  }, { once: true });
  jingleAudio.addEventListener('canplay', () => {
    debugLogTs('[VIRGULE] buffer prêt (canplay) —', jingleName);
    reportLiveEvent('jingle_buffer_ready', { name: jingleName });
  }, { once: true });
  jingleAudio.addEventListener('waiting', () => {
    debugLogTs('[EMBOUTEILLAGE] Virgule waiting —', jingleName);
    diagAudioNet('virgule waiting', jingleName, jingleAudio);
    reportJingleBufferStarve('waiting', jingleName);
  });
  let jingleStallN = 0;
  jingleAudio.addEventListener('stalled', () => {
    jingleStallN += 1;
    debugLogTs('[EMBOUTEILLAGE] Virgule stalled ×' + jingleStallN + ' —', jingleName);
    diagAudioNet('virgule stalled', jingleName, jingleAudio);
    reportJingleBufferStarve('stalled', jingleName);
  });

  jingleAudio.addEventListener(
    'error',
    () => {
      debugWarn('[VIRGULE] ✗ Fichier illisible —', jingleName, '→ enchaînement musique directe');
      reportLiveEvent('jingle_fail', { name: jingleName });
      playTrack(thenPlayIndex, { fromJingle: false, crossfade: false });
    },
    { once: true },
  );

  // Baisse très légère de la musique sous la virgule (Web Audio)
  if (musicOutputGain && audioContext) {
    const now = audioContext.currentTime;
    const g = musicOutputGain.gain;
    const cur = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(cur, now);
    g.linearRampToValueAtTime(0, now + MUSIC_DUCK_FOR_JINGLE_MS / 1000);
  }

  jingleAudio
    .play()
    .then(() => {
      const dur = jingleAudio.duration;
      debugLog('[VIRGULE] Lecture OK —', jingleName, '— durée :', isFinite(dur) ? dur.toFixed(1) + 's' : '?');
      reportLiveEvent('jingle', { name: jingleName });
      rampHtmlVolume(jingleAudio, 0, 1, JINGLE_FADE_IN_MS);
      scheduleNearEnd(
        jingleAudio,
        JINGLE_TO_MUSIC_OVERLAP_SEC,
        () => {
          debugLog('[VIRGULE] Fin approchée → musique index', thenPlayIndex);
          playTrack(thenPlayIndex, { fromJingle: true });
        },
        `virgule→piste ${thenPlayIndex}`,
      );
    })
    .catch((err) => {
      debugWarn('[VIRGULE] ✗ play() refusé —', err?.name, err?.message || '', '→ enchaînement musique directe');
      reportLiveEvent('jingle_fail', { name: jingleName });
      playTrack(thenPlayIndex, { fromJingle: false, crossfade: false });
    });
}

const MAX_AUDIO_RECOVERY_DEPTH = 24;

/** Après échec virgule, playTrack est souvent hors « pile » du clic → play() musique = NotAllowedError ; ne pas enchaîner 24 pistes. */
function isAutoplayOrGesturePolicyError(err) {
  if (!err) return false;
  const n = err.name || '';
  if (n === 'NotAllowedError') return true;
  const msg = String(err.message || '').toLowerCase();
  if (
    n === 'AbortError' &&
    (msg.includes("user didn't interact") || msg.includes('not allowed') || msg.includes('play() request'))
  ) {
    return true;
  }
  return false;
}

let autoplayBlockedNotified = false;

function notifyAutoplayBlockedOnce() {
  if (autoplayBlockedNotified) return;
  autoplayBlockedNotified = true;
  /* Toujours visible (hors ?debug=1) : évite la boucle silencieuse sur toute la playlist */
  console.warn(
    '[SSI] Audio : lecture refusée par le navigateur (autoplay). Recliquez sur la page — souvent après une virgule injouable ou sans geste actif.',
  );
  reportLiveEvent('audio_autoplay_blocked', { reason: 'play_refusé_politique_navigateur' });
}

function clearAutoplayBlockedNotifyFlag() {
  autoplayBlockedNotified = false;
}

/**
 * @param {HTMLAudioElement} audioEl
 * @param {unknown} err
 * @param {{ skipToNext: () => void, crossfadeUndo?: () => void }} actions
 */
function handleMusicPlayRejected(audioEl, err, actions) {
  if (isAutoplayOrGesturePolicyError(err)) {
    if (actions.crossfadeUndo) {
      actions.crossfadeUndo();
    } else {
      if (audioEl && !intentionallyReleasedMedia.has(audioEl)) {
        try {
          releaseMediaElementSilently(audioEl);
        } catch (_) {}
      }
      disconnectCurrentMusicGraph();
      currentAudio = null;
    }
    outgoingMusic = null;
    /* Toujours logguer même si déjà notifié — sinon la musique s'arrête en silence */
    if (!autoplayBlockedNotified) {
      notifyAutoplayBlockedOnce();
    } else {
      debugWarn('[RADIO] ✗ Lecture bloquée à nouveau (autoplay) — recliquez sur la page');
    }
    updatePlayButton();
    return;
  }
  debugWarn('[RADIO] ✗ play() rejeté —', err?.name, err?.message || err);
  actions.skipToNext();
}

/**
 * @param {number} index
 * @param {{ recoveryDepth?: number, fromJingle?: boolean, crossfade?: boolean }} [options]
 */
export function playTrack(index, options = {}) {
  if (isMicrophoneMode()) return;
  clearTransitionTimer();
  clearCrossfadeEndTimer();

  if (index < 0 || index >= playlist.length) return;

  const recoveryDepth = options.recoveryDepth ?? 0;
  const fromJingle = options.fromJingle === true;
  const allowCrossfade = options.crossfade !== false;

  if (recoveryDepth > MAX_AUDIO_RECOVERY_DEPTH) {
    debugWarn('[SSI] Trop de pistes injouables — vérifiez le dossier musique/');
    reportLiveEvent('audio_abort', { reason: 'trop de pistes injouables d’affilée (vérifiez musique/)' });
    updatePlayButton();
    return;
  }

  if (outgoingMusic) {
    forceCleanupMusicChain(outgoingMusic.audio, outgoingMusic.source, outgoingMusic.gain);
    outgoingMusic = null;
  }

  const item = playlist[index];
  const nextIndex = computeNextInTour(index);

  debugLog('playTrack index:', index, '| recoveryDepth:', recoveryDepth, '| fromJingle:', fromJingle, '| url:', item.url);

  const canMusicCrossfade =
    allowCrossfade &&
    !fromJingle &&
    recoveryDepth === 0 &&
    currentAudio &&
    !currentAudio.paused &&
    audioContext &&
    audioSource &&
    musicOutputGain;

  if (fromJingle) {
    // Nouveau morceau : fondu avec la virgule (volume HTML), chaîne musique neuve
    if (currentAudio) {
      releaseMediaElementSilently(currentAudio);
    }
    disconnectCurrentMusicGraph();
    currentAudio = null;
  } else if (!canMusicCrossfade) {
    if (currentAudio) {
      releaseMediaElementSilently(currentAudio);
    }
    disconnectCurrentMusicGraph();
    currentAudio = null;
  }

  currentIndex = index;

  const audio = new Audio(item.url);

  /* Détection embouteillage serveur sur la piste audio */
  let audioStalledCount = 0;
  audio.addEventListener('loadstart', () => {
    debugLogTs('[MUSIQUE] loadstart —', item.name);
    reportLiveEvent('track_load_start', {
      name: item.name,
      index: index + 1,
      total: playlist.length,
    });
  }, { once: true });
  audio.addEventListener('canplay', () => {
    debugLogTs('[MUSIQUE] buffer prêt (canplay) —', item.name);
    reportLiveEvent('track_buffer_ready', { name: item.name, index: index + 1 });
  }, { once: true });
  audio.addEventListener('stalled', () => {
    audioStalledCount += 1;
    debugLogTs('[EMBOUTEILLAGE] Musique stalled ×' + audioStalledCount + ' —', item.name);
    diagAudioNet('musique stalled', item.name, audio);
    reportTrackBufferStarve('stalled', item.name, { count: audioStalledCount });
  });
  audio.addEventListener('waiting', () => {
    debugLogTs('[EMBOUTEILLAGE] Musique waiting —', item.name);
    diagAudioNet('musique waiting', item.name, audio);
    reportTrackBufferStarve('waiting', item.name);
  });

  let recoveryScheduled = false;
  const skipToNext = () => {
    if (recoveryScheduled) return;
    recoveryScheduled = true;
    clearTransitionTimer();
    clearCrossfadeEndTimer();
    if (outgoingMusic) {
      forceCleanupMusicChain(outgoingMusic.audio, outgoingMusic.source, outgoingMusic.gain);
      outgoingMusic = null;
    }
    debugWarn('[SSI] Piste injouable, passage au suivant :', item.name || item.url);
    reportLiveEvent('track_fail', { name: item.name || liveShortName(item.url) });
    transitionTimer = setTimeout(() => playTrack(nextIndex, { recoveryDepth: recoveryDepth + 1, crossfade: false }), 380);
  };

  const onDecodeError = () => {
    if (intentionallyReleasedMedia.has(audio)) return;
    skipToNext();
  };
  audio.addEventListener('error', onDecodeError, { once: true });

  if (fromJingle) {
    const { source, gain } = attachMusicToAnalyser(audio);
    audioSource = source;
    musicOutputGain = gain;
    gain.gain.value = 0;
    currentAudio = audio;

    const ja = jingleAudio;
    const fadeMs = JINGLE_MUSIC_CROSSFADE_MS;
    const fadeSec = fadeMs / 1000;

    audio
      .play()
      .then(() =>
        resumeAudioContextIfNeeded().then(() => {
          clearAutoplayBlockedNotifyFlag();
          warnIfContextStillBlocked('après play (virgule→musique)');
          if (ja && jingleAudio === ja && !ja.paused) {
            rampHtmlVolume(ja, ja.volume, 0, fadeMs, () => {
              if (jingleAudio === ja) {
                releaseMediaElementSilently(ja);
              }
            });
          }
          rampGainLinear(gain, 0, 1, fadeSec);

          tracksSinceJingle += 1;
          const capturedCount = tracksSinceJingle;
          reportLiveEvent('track', {
            name: item.name,
            index: index + 1,
            total: playlist.length,
          });
          const remainingBeforeJingle = TRACKS_PER_JINGLE - capturedCount;
          debugLog('[RADIO] ▶', item.name, '— morceau', capturedCount, '/', TRACKS_PER_JINGLE,
            remainingBeforeJingle <= 0 ? '— virgule après ce morceau' : '— encore ' + remainingBeforeJingle + ' avant virgule');

          const needsJingle = capturedCount >= TRACKS_PER_JINGLE && jingleUrls.length > 0;
          const overlapSec = needsJingle ? MUSIC_TO_JINGLE_OVERLAP_SEC : MUSIC_TO_MUSIC_OVERLAP_SEC;
          scheduleNearEnd(
            audio,
            overlapSec,
            () => {
              if (currentAudio !== audio) return;
              if (needsJingle) {
                tracksSinceJingle = 0;
                const ju = jingleUrls[Math.floor(Math.random() * jingleUrls.length)];
                debugLog('[RADIO] → Virgule programmée :', liveShortName(ju));
                playJingle(ju, nextIndex);
              } else {
                debugLog('[RADIO] → Morceau suivant index', nextIndex);
                playTrack(nextIndex);
              }
            },
            item.name || liveShortName(item.url),
          );
          bindTrackEndedFallback(audio, item, nextIndex);
        }),
      )
      .catch((err) => {
        handleMusicPlayRejected(audio, err, { skipToNext });
      });

    updatePlayButton();
    return;
  }

  if (canMusicCrossfade) {
    const oldAudio = currentAudio;
    const oldSource = audioSource;
    const oldGain = musicOutputGain;
    outgoingMusic = { audio: oldAudio, source: oldSource, gain: oldGain };

    const { source: newSource, gain: newGain } = attachMusicToAnalyser(audio);
    newGain.gain.value = 0;
    audioSource = newSource;
    musicOutputGain = newGain;
    currentAudio = audio;

    const fadeMs = MUSIC_CROSSFADE_MS;
    const fadeSec = fadeMs / 1000;

    const undoCrossfadeAttempt = () => {
      outgoingMusic = null;
      forceCleanupMusicChain(audio, newSource, newGain);
      if (oldAudio && oldSource && oldGain) {
        audioSource = oldSource;
        musicOutputGain = oldGain;
        currentAudio = oldAudio;
      } else {
        disconnectCurrentMusicGraph();
        currentAudio = null;
      }
    };

    audio
      .play()
      .then(() =>
        resumeAudioContextIfNeeded().then(() => {
          clearAutoplayBlockedNotifyFlag();
          warnIfContextStillBlocked('après play (crossfade)');
          rampGainLinear(oldGain, oldGain.gain.value, 0, fadeSec);
          rampGainLinear(newGain, 0, 1, fadeSec);

          crossfadeEndTimer = setTimeout(() => {
            crossfadeEndTimer = null;
            if (outgoingMusic && outgoingMusic.audio === oldAudio) {
              forceCleanupMusicChain(oldAudio, oldSource, oldGain);
              outgoingMusic = null;
            }
          }, fadeMs + 80);

          tracksSinceJingle += 1;
          const capturedCount = tracksSinceJingle;
          reportLiveEvent('track', {
            name: item.name,
            index: index + 1,
            total: playlist.length,
          });
          const remainingBeforeJingle = TRACKS_PER_JINGLE - capturedCount;
          debugLog('[RADIO] ▶', item.name, '— morceau', capturedCount, '/', TRACKS_PER_JINGLE,
            remainingBeforeJingle <= 0 ? '— virgule après ce morceau' : '— encore ' + remainingBeforeJingle + ' avant virgule');

          const needsJingle = capturedCount >= TRACKS_PER_JINGLE && jingleUrls.length > 0;
          const overlapSec = needsJingle ? MUSIC_TO_JINGLE_OVERLAP_SEC : MUSIC_TO_MUSIC_OVERLAP_SEC;
          scheduleNearEnd(
            audio,
            overlapSec,
            () => {
              if (currentAudio !== audio) return;
              if (needsJingle) {
                tracksSinceJingle = 0;
                const ju = jingleUrls[Math.floor(Math.random() * jingleUrls.length)];
                debugLog('[RADIO] → Virgule programmée :', liveShortName(ju));
                playJingle(ju, nextIndex);
              } else {
                debugLog('[RADIO] → Morceau suivant index', nextIndex);
                playTrack(nextIndex);
              }
            },
            item.name || liveShortName(item.url),
          );
          bindTrackEndedFallback(audio, item, nextIndex);
        }),
      )
      .catch((err) => {
        handleMusicPlayRejected(audio, err, {
          skipToNext: () => {
            undoCrossfadeAttempt();
            skipToNext();
          },
          crossfadeUndo: undoCrossfadeAttempt,
        });
      });

    updatePlayButton();
    return;
  }

  // Première piste, reprise après pause, ou recovery : une seule chaîne
  const { source, gain } = attachMusicToAnalyser(audio);
  audioSource = source;
  musicOutputGain = gain;
  const fadeInMs = recoveryDepth === 0 ? MUSIC_FADE_IN_FIRST_MS : 0;
  gain.gain.value = fadeInMs > 0 ? 0 : 1;
  currentAudio = audio;

  audio
    .play()
    .then(() =>
      resumeAudioContextIfNeeded().then(() => {
        clearAutoplayBlockedNotifyFlag();
        warnIfContextStillBlocked('après play');
        if (fadeInMs > 0) {
          rampGainLinear(gain, 0, 1, fadeInMs / 1000);
        }

        tracksSinceJingle += 1;
        const capturedCount = tracksSinceJingle;
        reportLiveEvent('track', {
          name: item.name,
          index: index + 1,
          total: playlist.length,
        });
        const dur = audio.duration;
        const remainingBeforeJingle = TRACKS_PER_JINGLE - capturedCount;
        debugLog('[RADIO] ▶', item.name,
          '—', isFinite(dur) ? dur.toFixed(0) + 's' : '?',
          '— morceau', capturedCount, '/', TRACKS_PER_JINGLE,
          remainingBeforeJingle <= 0 ? '— virgule après ce morceau' : '— encore ' + remainingBeforeJingle + ' avant virgule');

        const needsJingle = capturedCount >= TRACKS_PER_JINGLE && jingleUrls.length > 0;
        const overlapSec = needsJingle ? MUSIC_TO_JINGLE_OVERLAP_SEC : MUSIC_TO_MUSIC_OVERLAP_SEC;

        scheduleNearEnd(
          audio,
          overlapSec,
          () => {
            if (currentAudio !== audio) return;
            if (needsJingle) {
              tracksSinceJingle = 0;
              const ju = jingleUrls[Math.floor(Math.random() * jingleUrls.length)];
              debugLog('[RADIO] → Virgule programmée :', liveShortName(ju));
              playJingle(ju, nextIndex);
            } else {
              debugLog('[RADIO] → Morceau suivant index', nextIndex);
              playTrack(nextIndex);
            }
          },
          item.name || liveShortName(item.url),
        );
        bindTrackEndedFallback(audio, item, nextIndex);
      }),
    )
    .catch((err) => {
      handleMusicPlayRejected(audio, err, { skipToNext });
    });

  updatePlayButton();
}

export function nextTrack() {
  if (isMicrophoneMode()) return;
  if (!playlist.length) return;
  if (currentIndex < 0) {
    playTrack(getFirstTourPlaylistIndex());
    return;
  }
  playTrack(computeNextInTour(currentIndex));
}

export function prevTrack() {
  if (isMicrophoneMode()) return;
  if (!playlist.length) return;
  if (currentIndex < 0) {
    playTrack(getFirstTourPlaylistIndex());
    return;
  }
  playTrack(computePrevInTour(currentIndex));
}

export function updatePlayButton() {
  if (!ui.btnPlayPause) return;
  const isPlaying = currentAudio && !currentAudio.paused;
  ui.btnPlayPause.textContent = isPlaying ? '⏸' : '▶';
}

export function togglePlay() {
  if (isMicrophoneMode()) return;
  if (!playlist.length) {
    debugWarn(
      '[SSI] Pas de piste : playlist pas encore chargée (attendez 1–2 s) ou dossier musique/ vide.',
    );
    return;
  }
  if (!currentAudio) {
    playTrack(getFirstTourPlaylistIndex());
    return;
  }
  if (currentAudio.paused) {
    void resumeAudioContextIfNeeded().then(() => {
      currentAudio?.play().catch(() => {});
    });
  } else {
    currentAudio.pause();
  }
  updatePlayButton();
}

export function getAudioLevels() {
  if (!analyser || !dataArray) {
    return {
      bass: 0,
      mid: 0,
      high: 0,
      overall: 0,
      beat: false,
      bassBeat: false,
    };
  }
  analyser.getByteFrequencyData(dataArray);
  const len = bufferLength;
  const bass =
    dataArray.slice(0, Math.floor(len * 0.1)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(len * 0.1));
  const mid =
    dataArray.slice(Math.floor(len * 0.1), Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(len * 0.4));
  const high =
    dataArray.slice(Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(len * 0.5));
  const overall = (bass + mid + high) / 3;
  const now = Date.now();
  const beat = overall / 255 > BEAT_THRESHOLD && now - lastBeatTime > BEAT_COOLDOWN_MS;
  if (beat) lastBeatTime = now;
  const bassBeat = bass / 255 > BASS_BEAT_THRESHOLD && now - lastBassBeatTime > BASS_BEAT_COOLDOWN_MS;
  if (bassBeat) lastBassBeatTime = now;
  return {
    bass: bass / 255,
    mid: mid / 255,
    high: high / 255,
    overall: overall / 255,
    beat,
    bassBeat,
  };
}
