import { prepareSnakeSet, playNextSnakeSticker, startSuperBoom, startOsWindowPhase, startLogoPhase, startWebcamPhase } from "./phases.js";

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

export function startPhase(phase, params){
    switch(phase){
        case PHASE.SNAKE:
            //prepareSnakeSet();
            playNextSnakeSticker();
            break;
        case PHASE.SUPER_BOOM:
            startSuperBoom();
            break;
        case PHASE.VIDEO:
            startOsWindowPhase();
            break;
        case PHASE.LOGO:
            startLogoPhase();
            break;
        case PHASE.WEBCAM:
            startWebcamPhase();
            break;
    }
}

export function onPhaseEnded(){
    const idx = PHASE_ORDER.indexOf(currentPhase);
    const next = PHASE_ORDER[(idx + 1) % PHASE_ORDER.length];
    currentPhase = next;
    startPhase(next);
}
