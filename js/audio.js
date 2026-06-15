/**
 * Analyse audio par microphone ambiant — pilote tous les effets visuels de la scène.
 *
 * Ce module connecte le micro du navigateur à un AnalyserNode Web Audio.
 * Il expose getAudioLevels() : bass, mid, high, overall, beat, bassBeat.
 * visuals.js appelle getAudioLevels() à chaque frame (requestAnimationFrame).
 *
 * La playlist (musique/, virgules/, mini-contrôles) est archivée dans archive/playlist-mode/.
 * Pour la réactiver, voir archive/playlist-mode/README.txt.
 */
import {
  BEAT_THRESHOLD,
  BEAT_COOLDOWN_MS,
  BASS_BEAT_THRESHOLD,
  BASS_BEAT_COOLDOWN_MS,
} from './config.js';
import { debugLog, debugWarn } from './debug.js';
import { reportLiveEvent } from './live-telemetry.js';

let audioContext = null;
let analyser = null;
let dataArray = null;
let bufferLength = 0;
let lastBeatTime = 0;
let lastBassBeatTime = 0;

/** Nœud de gain à 0 pour éviter le renvoi micro → enceintes. */
let monitorMuteGain = null;
/** @type {MediaStream | null} */
let micStream = null;
/** @type {MediaStreamAudioSourceNode | null} */
let micSourceNode = null;

/** Toujours vrai — le mode playlist est archivé. */
export function isMicrophoneMode() {
  return true;
}

function ensureAudioContext() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return;
  }
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;
  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  /* Sortie muette : l'analyser doit être connecté à destination mais
     on ne veut pas réinjecter le micro dans les enceintes. */
  monitorMuteGain = audioContext.createGain();
  monitorMuteGain.gain.value = 0;
  analyser.connect(monitorMuteGain);
  monitorMuteGain.connect(audioContext.destination);

  /* Reprendre le contexte quand l'onglet redevient visible */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioContext?.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
  });
  window.addEventListener('focus', () => {
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  });
}

export function getAudioContext() {
  return audioContext;
}

/**
 * Branche le micro sur l'analyser.
 * À appeler après un geste utilisateur (politique navigateur).
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function startMicrophoneAnalysis() {
  if (micSourceNode) return { ok: true };
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
    try { micSourceNode.disconnect(); } catch (_) {}
    micSourceNode = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

/**
 * Niveaux audio + détection de beat — appelé à chaque frame par visuals.js.
 * @returns {{ bass: number, mid: number, high: number, overall: number, beat: boolean, bassBeat: boolean }}
 */
export function getAudioLevels() {
  if (!analyser || !dataArray) {
    return { bass: 0, mid: 0, high: 0, overall: 0, beat: false, bassBeat: false };
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
    dataArray.slice(Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(len * 0.5));
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
