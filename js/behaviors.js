/**
 * Réactions des stickers au son — un comportement par `dataset.behavior` (0–5).
 * Pour en ajouter : étendre le switch ou brancher sur un registre.
 */
import { SMOOTH_POS, SMOOTH_SCALE, SMOOTH_ROTATE, PALIER_STEPS } from './config.js';
import { palier, lerp } from './utils.js';

/**
 * @param {HTMLElement} sticker
 * @param {{ bass: number, mid: number, high: number, overall: number, beat: boolean, bassBeat: boolean }} levels
 * @param {number} t temps animation (ms depuis démarrage)
 */
export function applyStickerBehavior(sticker, levels, t) {
  const baseX = parseFloat(sticker.dataset.baseX ?? 50);
  const baseY = parseFloat(sticker.dataset.baseY ?? 50);
  const phaseX = parseFloat(sticker.dataset.phaseX ?? 0);
  const phaseY = parseFloat(sticker.dataset.phaseY ?? 0);
  const ampX = parseFloat(sticker.dataset.ampX ?? 10);
  const ampY = parseFloat(sticker.dataset.ampY ?? 10);
  const floatSpeed = parseFloat(sticker.dataset.floatSpeed ?? 0.00025);
  const behavior = parseInt(sticker.dataset.behavior ?? 0, 10);

  let smoothFloatX = parseFloat(sticker.dataset.smoothFloatX ?? 0);
  let smoothFloatY = parseFloat(sticker.dataset.smoothFloatY ?? 0);
  let smoothScale = parseFloat(sticker.dataset.smoothScale ?? 1);
  let smoothRotate = parseFloat(sticker.dataset.smoothRotate ?? 0);
  let kickEnv = parseFloat(sticker.dataset.kickEnv ?? 0);

  const { bass, mid, high, overall, beat, bassBeat } = levels;
  const o = palier(overall, PALIER_STEPS);
  const b = palier(bass, PALIER_STEPS);
  const m = palier(mid, PALIER_STEPS);
  const h = palier(high, PALIER_STEPS);

  let targetFloatX = Math.sin(t * floatSpeed + phaseX) * ampX * (0.85 + 0.2 * overall);
  let targetFloatY = Math.cos(t * floatSpeed * 0.8 + phaseY) * ampY * (0.85 + 0.2 * overall);

  if (behavior === 1) {
    targetFloatY *= 1.4 + 0.8 * b;
  }
  if (behavior === 2) {
    targetFloatX += Math.sin(t * floatSpeed * 2 + phaseX * 1.5) * ampX * 0.35 * h;
  }
  if (behavior === 5) {
    const orbit = Math.sin(t * floatSpeed * 1.6 + phaseX + phaseY) * (ampX + ampY) * (0.6 + 0.4 * m);
    targetFloatX += orbit * 0.5;
    targetFloatY += orbit * 0.3;
  }

  smoothFloatX = lerp(smoothFloatX, targetFloatX, SMOOTH_POS);
  smoothFloatY = lerp(smoothFloatY, targetFloatY, SMOOTH_POS);
  const x = baseX + smoothFloatX;
  const y = baseY + smoothFloatY;

  const isVisible = sticker.classList.contains('sticker-visible');

  let targetScale = 1;
  let targetRotate = 0;

  switch (behavior) {
    case 0:
      targetScale = 1 + o * 0.85 + (beat ? 0.6 : 0);
      break;
    case 1:
      targetRotate = b * 22 + (beat ? 12 : 0);
      targetScale = 1 + o * 0.7 + (beat ? 0.45 : 0);
      break;
    case 2:
      targetScale = 1 + h * 0.9 + (beat ? 0.55 : 0);
      break;
    case 3:
      targetScale = 1 + m * 0.8 + (beat ? 0.6 : 0);
      break;
    case 4:
      if (bassBeat) {
        kickEnv = 1;
      } else {
        kickEnv = lerp(kickEnv, 0, 0.18);
      }
      sticker.dataset.kickEnv = String(kickEnv);
      targetScale = 1 + kickEnv * 2.0;
      break;
    case 5:
      targetRotate = m * 12 + (beat ? 28 : 0);
      targetScale = 1 + m * 0.7 + (beat ? 0.5 : 0);
      break;
    default:
      targetScale = 1 + o * 0.65;
  }

  smoothScale = lerp(smoothScale, targetScale, SMOOTH_SCALE);
  smoothRotate = lerp(smoothRotate, targetRotate, SMOOTH_ROTATE);

  sticker.style.opacity = isVisible ? '1' : '0';

  sticker.dataset.smoothFloatX = String(smoothFloatX);
  sticker.dataset.smoothFloatY = String(smoothFloatY);
  sticker.dataset.smoothScale = String(smoothScale);
  sticker.dataset.smoothRotate = String(smoothRotate);

  sticker.style.left = x + '%';
  sticker.style.top = y + '%';
  sticker.style.transform = `translate(-50%, -50%) scale(${smoothScale}) rotate(${smoothRotate}deg)`;
}
