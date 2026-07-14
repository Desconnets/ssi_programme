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

export const DEFAULT_PHASE = PHASE.SNAKE;

export let currentPhase = PHASE.SNAKE;

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
    console.log("AUTO ADVANCE ENABLED? ", autoAdvanceEnabled);
    if(!autoAdvanceEnabled){
        startPhase(currentPhase);
        return;
    }
    const idx = PHASE_ORDER.indexOf(currentPhase);
    const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
    startPhase(next);
}

export function setPhaseAutoAdvance(enabled) {
  autoAdvanceEnabled = Boolean(enabled);
}
