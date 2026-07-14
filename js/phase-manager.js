import { LOGO_PHASE_DURATION_MS, SUPER_BOOM_DURATION_MS } from "./config.js";
import { prepareSnakeSet, playNextSnakeSticker, startSuperBoom, startOsWindowPhase, interruptAllPhases, startLogoPhase, startWebcamPhase, stopSuperBoom, stopLogoPhase } from "./phases.js";

export const PHASE = Object.freeze({
  SNAKE:        'snake',
  SUPER_BOOM:   'super_boom',
  VIDEO:        'os_video',
  LOGO:         'logo',
  WEBCAM:       'webcam',
});

export const PHASE_ORDER = [
    PHASE.SNAKE,
    PHASE.SUPER_BOOM,
    PHASE.VIDEO,
    PHASE.LOGO,
    PHASE.WEBCAM
];

let phaseSelectMode = 'sequential'; // 'sequential' | 'random'
let enabledPhases = new Set(PHASE_ORDER);

export const DEFAULT_PHASE = PHASE.SNAKE;
export let currentPhase = DEFAULT_PHASE;

let currentPhaseTimeout = null;
let autoAdvanceEnabled = true;

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
                currentPhaseTimeout = setTimeout(stopSuperBoom, SUPER_BOOM_DURATION_MS);
                break;
            case PHASE.VIDEO:
                startOsWindowPhase(params);
                break;
            case PHASE.LOGO:
                startLogoPhase();
                currentPhaseTimeout = setTimeout(stopLogoPhase, LOGO_PHASE_DURATION_MS);
                break;
            case PHASE.WEBCAM:
                startWebcamPhase();
                break;
        }
    });
}

/**
 * Switches to the next phase and loop back to first one once phase list ended
 */
export function onPhaseEnded(){
    if(!autoAdvanceEnabled){
        startPhase(currentPhase);
        return;
    }
    startPhase(pickNextPhase());
}

export function pickNextPhase() {
  const pool = PHASE_ORDER.filter((p) => enabledPhases.has(p));
  if (!pool.length) return PHASE_ORDER[0];

  // random element
  if (phaseSelectMode === 'random') {
    console.log("mode random")
    const others = pool.filter((p) => p !== currentPhase);
    const choices = others.length ? others : pool;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  const idx = PHASE_ORDER.indexOf(currentPhase);
  for (let step = 1; step <= PHASE_ORDER.length; step++) {
    const candidate = PHASE_ORDER[(idx + step) % PHASE_ORDER.length];
    console.log("checking for next sequential", candidate, enabledPhases);
    if (enabledPhases.has(candidate)) return candidate;
  }
  return pool[0];
}

export function setPhaseAutoAdvance(enabled) {
  autoAdvanceEnabled = Boolean(enabled);
}

export function setPhaseSelectMode(mode) {
  phaseSelectMode = mode === 'random' ? 'random' : 'sequential';
}

export function setEnabledPhases(ids) {
  const next = new Set((ids || []).filter((id) => PHASE_ORDER.includes(id)));
  enabledPhases = next.size > 0 ? next : new Set(PHASE_ORDER);
}