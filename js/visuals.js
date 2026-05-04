/**
 * Boucle d’affichage : fond (thème, beat punch) + application des comportements stickers.
 * Les phases (snake / boom / logo) sont dans phases.js ; la logique « réaction au son » dans behaviors.js.
 */
import { BG_THEMES, BG_THEME_INTERVAL_MS } from './config.js';
import { lerp } from './utils.js';
import { getAudioLevels } from './audio.js';
import { applyStickerBehavior } from './behaviors.js';
import { isOsWindowShakeActive, isWebcamPhaseActive } from './phases.js';

const stickersLayer = document.getElementById('stickersLayer');
const background = document.getElementById('background');
const beatOverlay = document.getElementById('beatOverlay');
const bgGradient = document.getElementById('bgGradient');
const osWindowLayerEl = document.getElementById('ssiOsWindowLayer');
const webcamLayerEl = document.getElementById('ssiWebcamPhaseLayer');

const startTime = performance.now();

let bgThemeIndex = 0;
let lastBgThemeChange = 0;
let smoothBgScale = 1;
let osWindowShakePhase = 0;
let osShakeSmoothX = 0;

function tick(now = 0) {
  if (!background || !beatOverlay || !bgGradient || !stickersLayer) return;

  const t = now - startTime;
  const levels = getAudioLevels();
  const { bass, beat } = levels;

  let beatPunch = parseFloat(background.dataset.beatPunch ?? 1);
  if (beat) {
    beatOverlay.classList.add('flash');
    setTimeout(() => beatOverlay.classList.remove('flash'), 130);
    beatPunch = 1.055;
  }
  beatPunch = lerp(beatPunch, 1, 0.18);
  background.dataset.beatPunch = String(beatPunch);

  if (now - lastBgThemeChange > BG_THEME_INTERVAL_MS) {
    lastBgThemeChange = now;
    bgThemeIndex = (bgThemeIndex + 1) % BG_THEMES.length;
    bgGradient.setAttribute('data-theme', BG_THEMES[bgThemeIndex]);
  }

  smoothBgScale = lerp(smoothBgScale, 1 + bass * 0.032, 0.08);
  background.style.transform = `scale(${smoothBgScale * beatPunch})`;

  stickersLayer.querySelectorAll('.sticker').forEach((sticker) => {
    applyStickerBehavior(sticker, levels, t);
  });

  const osShaker = osWindowLayerEl?.querySelector('.ssi-os-window-shaker');
  const webcamShaker = webcamLayerEl?.querySelector('.ssi-os-window-shaker');
  const osShake = isOsWindowShakeActive();
  const camShake = isWebcamPhaseActive();
  const activeShaker = osShake ? osShaker : camShake ? webcamShaker : null;
  if (osShaker && !osShake) osShaker.style.transform = '';
  if (webcamShaker && !camShake) webcamShaker.style.transform = '';

  if ((osShake || camShake) && activeShaker) {
    const { overall, bass, beat } = levels;
    const bump = beat ? 1 : 0;
    osWindowShakePhase += 0.14 + overall * 0.34 + bump * 0.45;
    const fast = Math.sin(osWindowShakePhase);
    const slow = Math.sin(osWindowShakePhase * 0.61);
    const amp = 1.5 + overall * 7 + bass * 4 + bump * 6;
    const targetX = fast * amp + slow * (1.2 + overall * 2.5);
    osShakeSmoothX = lerp(osShakeSmoothX, targetX, 0.24);
    activeShaker.style.transform = `translate3d(${osShakeSmoothX}px, 0, 0)`;
  } else {
    osShakeSmoothX = lerp(osShakeSmoothX, 0, 0.35);
    osWindowShakePhase *= 0.9;
  }

  requestAnimationFrame(tick);
}

export function startRenderingLoop() {
  requestAnimationFrame(tick);
}
