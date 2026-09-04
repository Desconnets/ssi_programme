import { LOGO_PHASE_DURATION_MS, SUPER_BOOM_DURATION_MS, TEXT_PHASE_DURATION_MS } from "./config.js";
import { prepareSnakeSet, playNextSnakeSticker, startSuperBoom, startOsWindowPhase, interruptAllPhases, startLogoPhase, startWebcamPhase, stopSuperBoom, stopLogoPhase } from "./phases.js";
import { closeTextPhase, startTextPhase, textContent } from './text-phase.js'; 

export const PHASE = Object.freeze({
  SNAKE:        'snake',
  SUPER_BOOM:   'super_boom',
  VIDEO:        'os_video',
  LOGO:         'logo',
  WEBCAM:       'webcam',
  TEXT:         'text',
});

export const PHASE_ORDER = [
    PHASE.SNAKE,
    PHASE.SUPER_BOOM,
    PHASE.VIDEO,
    PHASE.LOGO,
    PHASE.WEBCAM,
    PHASE.TEXT
];

let phaseSelectMode = 'sequential'; // 'sequential' | 'random'
let enabledPhases = new Set(PHASE_ORDER);

export const DEFAULT_PHASE = PHASE.SNAKE;
export let currentPhase = DEFAULT_PHASE;

let currentPhaseTimeout = null;
let autoAdvanceEnabled = true;

/* Super Boom / Logo : leur timer de fin vit ici (pas dans phases.js). En mode manuel
   (autoAdvanceEnabled === false) on ne coupe pas la phase — on reboucle simplement
   le même timeout au lieu d'appeler stopSuperBoom()/stopLogoPhase(). */
function armSuperBoomTimeout(){
    currentPhaseTimeout = setTimeout(() => {
        if(!autoAdvanceEnabled){
            armSuperBoomTimeout();
            return;
        }
        stopSuperBoom();
    }, SUPER_BOOM_DURATION_MS);
}

function armLogoTimeout(){
    currentPhaseTimeout = setTimeout(() => {
        if(!autoAdvanceEnabled){
            armLogoTimeout();
            return;
        }
        stopLogoPhase();
    }, LOGO_PHASE_DURATION_MS);
}

export function startPhase(phase, params){
    if(currentPhaseTimeout){
        clearTimeout(currentPhaseTimeout);
        currentPhaseTimeout = null;
    }
    interruptAllPhases(() => {
        currentPhase = phase;
        switch(phase){
            case PHASE.SNAKE:
                prepareSnakeSet();
                playNextSnakeSticker();
                break;
            case PHASE.SUPER_BOOM:
                startSuperBoom();
                armSuperBoomTimeout();
                break;
            case PHASE.VIDEO:
                startOsWindowPhase(params);
                break;
            case PHASE.LOGO:
                startLogoPhase();
                armLogoTimeout();
                break;
            case PHASE.WEBCAM:
                startWebcamPhase();
                break;
            case PHASE.TEXT:
                startTextPhase(params.textContent ?? '', TEXT_PHASE_DURATION_MS);
                break;
        }
    });
}

/**
 * Switches to the next phase and loop back to first one once phase list ended
 */
export function onPhaseEnded(){
    if(!autoAdvanceEnabled){
        return;
    }
    startPhase(pickNextPhase());
}

export function pickNextPhase() {
  const pool = PHASE_ORDER.filter((p) => enabledPhases.has(p));
  if (!pool.length) return PHASE_ORDER[0];

  // random element
  if (phaseSelectMode === 'random') {
    const others = pool.filter((p) => p !== currentPhase);
    const choices = others.length ? others : pool;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  const idx = PHASE_ORDER.indexOf(currentPhase);
  for (let step = 1; step <= PHASE_ORDER.length; step++) {
    const candidate = PHASE_ORDER[(idx + step) % PHASE_ORDER.length];
    if (enabledPhases.has(candidate)) return candidate;
  }
  return pool[0];
}

export function setPhaseAutoAdvance(enabled) {
  autoAdvanceEnabled = Boolean(enabled);
}

/** Getter for the auto advance enabled flag */
export function isAutoAdvanceEnabled() {
  return autoAdvanceEnabled;
}

export function setPhaseSelectMode(mode) {
  phaseSelectMode = mode === 'random' ? 'random' : 'sequential';
}

export function setEnabledPhases(ids) {
  const next = new Set((ids || []).filter((id) => PHASE_ORDER.includes(id)));
  enabledPhases = next.size > 0 ? next : new Set(PHASE_ORDER);
}