import { TEXT_PHASE_DURATION_MS } from "./config.js"; 

let textPhaseTimer = null;

// Public: call from remote command or cycle
export function startTextPhase(text, durationMs, callback) {
  const layer = document.getElementById('ssiTextPhaseLayer');
  const content = document.getElementById('ssiTextPhaseContent');
  content.textContent = text ?? '';
  layer.classList.add('ssi-text-phase-layer--open');
  const dur = durationMs ?? TEXT_PHASE_DURATION_MS;
  textPhaseTimer = setTimeout(() => {
    closeTextPhase(callback); // or wherever in cycle
  }, dur);
}

export function closeTextPhase(callback) {
  const layer = document.getElementById('ssiTextPhaseLayer');
  layer.classList.remove('ssi-text-phase-layer--open');
  clearTimeout(textPhaseTimer);
  textPhaseTimer = null;
  if (callback) callback();
}