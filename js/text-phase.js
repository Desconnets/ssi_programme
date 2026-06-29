import { TEXT_PHASE_DURATION_MS, SMOOTH_SCALE, SMOOTH_ROTATE } from "./config.js";
import { lerp } from "./utils.js";

let textPhaseTimer = null;
let layerEl = null;
let contentEl = null;

function getElements() {
  if (!layerEl) layerEl = document.getElementById('ssiTextPhaseLayer');
  if (!contentEl) contentEl = document.getElementById('ssiTextPhaseContent');
  return { layer: layerEl, content: contentEl };
}

export function isTextPhaseActive() {
  const { layer } = getElements();
  return layer?.classList.contains('ssi-text-phase-layer--open') ?? false;
}

export function applyTextPulse(levels, t) {
  const { content } = getElements();
  if (!content || !isTextPhaseActive()) return;

  const { overall, mid, beat } = levels;

  const floatY = Math.sin(t * 0.0005) * 15;
  const targetScale = 1 + overall * 0.45 + (beat ? 0.22 : 0);
  const targetRotate = Math.sin(t * 0.0007) * (3 + mid * 6) + (beat ? 5 * (Math.random() > 0.5 ? 1 : -1) : 0);

  let smoothScale = parseFloat(content.dataset.smoothScale ?? 1);
  let smoothRotate = parseFloat(content.dataset.smoothRotate ?? 0);
  smoothScale = lerp(smoothScale, targetScale, SMOOTH_SCALE);
  smoothRotate = lerp(smoothRotate, targetRotate, SMOOTH_ROTATE);
  content.dataset.smoothScale = String(smoothScale);
  content.dataset.smoothRotate = String(smoothRotate);

  content.style.transform = `translateY(${floatY}px) scale(${smoothScale}) rotate(${smoothRotate}deg)`;
}

// Public: call from remote command or cycle
export function startTextPhase(text, durationMs, callback) {
  const { layer, content } = getElements();
  content.textContent = text ?? '';
  layer.classList.add('ssi-text-phase-layer--open');
  const dur = durationMs ?? TEXT_PHASE_DURATION_MS;
  textPhaseTimer = setTimeout(() => {
    closeTextPhase(callback); // or wherever in cycle
  }, dur);
}

export function closeTextPhase(callback) {
  const { layer, content } = getElements();
  layer.classList.remove('ssi-text-phase-layer--open');
  if (content) {
    content.dataset.smoothScale = '1';
    content.dataset.smoothRotate = '0';
  }
  clearTimeout(textPhaseTimer);
  textPhaseTimer = null;
  if (callback) callback();
}