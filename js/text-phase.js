import { TEXT_PHASE_DURATION_MS, SMOOTH_SCALE, SMOOTH_ROTATE } from "./config.js";
import { onPhaseEnded } from "./phase-manager.js";
import { lerp } from "./utils.js";

let textPhaseTimer = null;
let layerEl = null;
let contentEl = null;

export let textContent;

function getElements() {
  if (!layerEl) layerEl = document.getElementById('ssiTextPhaseLayer');
  if (!contentEl) contentEl = document.getElementById('ssiTextPhaseContent');
  return { layer: layerEl, content: contentEl };
}

const FIT_TEXT_MIN_PX = 16;

/**
 * The CSS sets a max size (vmin-based clamp, see style.css) to fill a good
 * chunk of the screen. A message too long for that size is then shrunk here
 * until it fits inside the scene (which has overflow:hidden — otherwise a
 * long text would get clipped top/bottom).
 */
function fitTextToLayer(content, layer) {
  if (!content || !layer) return;
  content.style.fontSize = '';
  const cs = getComputedStyle(layer);
  const availW = layer.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = layer.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let fontSizePx = parseFloat(getComputedStyle(content).fontSize);
  let guard = 30;
  while (
    guard-- > 0 &&
    fontSizePx > FIT_TEXT_MIN_PX &&
    (content.scrollWidth > availW || content.scrollHeight > availH)
  ) {
    fontSizePx = Math.max(FIT_TEXT_MIN_PX, fontSizePx - Math.max(1, fontSizePx * 0.04));
    content.style.fontSize = `${fontSizePx}px`;
  }
}

export function updateTextContent(newContent){
  textContent = newContent ?? '';
  const { layer, content } = getElements();
  if (!content) return;
  content.innerHTML = textContent;
  fitTextToLayer(content, layer);
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
  const resolved = text ?? '';
  if (resolved.trim() === '') {
    /* Nothing to display (e.g. the auto cycle reaches Text before the operator has
       set any message) — skip immediately instead of leaving a blank screen for the
       full phase duration. Same "nothing to show" pattern as the video window phase. */
    onPhaseEnded();
    return;
  }
  textContent = resolved;
  const { layer, content } = getElements();
  content.innerHTML = textContent;
  fitTextToLayer(content, layer);
  layer.classList.add('ssi-text-phase-layer--open');
  const dur = durationMs ?? TEXT_PHASE_DURATION_MS;
  textPhaseTimer = setTimeout(() => {
    closeTextPhase(callback); // or wherever in cycle
    onPhaseEnded();
  }, dur);
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (!isTextPhaseActive()) return;
    const { layer, content } = getElements();
    fitTextToLayer(content, layer);
  });
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