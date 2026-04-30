/**
 * Grain webcam : bruit en pixels réels (canvas), pas de feTurbulence SVG —
 * rendu plus « sale » type neige VHS / caméscope.
 * Blocs + persistance temporelle entre les frames pour éviter le côté numérique trop propre.
 */

const BLOCK = 3;
/** ~22 images / s : en dessous ça « clignote » par à-coups (effet stroboscope avec le blend). */
const FRAME_INTERVAL_MS = 1000 / 22;
/** Plus haut = transitions plus douces entre deux tirages (moins de flash). */
const TEMPORAL = 0.84;

let rafId = 0;
let lastFrameTime = 0;
let shellEl = null;
/** @type {ResizeObserver | null} */
let resizeObs = null;
/** @type {Float32Array | null} */
let prevBlocks = null;

function grainCanvas() {
  return document.getElementById('ssiWebcamGrainCanvas');
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 */
function resizeToShell(canvas, ctx) {
  const shell = canvas.closest('.ssi-webcam-shell');
  if (!shell) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = shell.getBoundingClientRect();
  const cssW = Math.max(32, Math.floor(rect.width));
  const cssH = Math.max(32, Math.floor(rect.height));
  const w = Math.max(1, Math.ceil((cssW * dpr) / BLOCK)) * BLOCK;
  const h = Math.max(1, Math.ceil((cssH * dpr) / BLOCK)) * BLOCK;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    prevBlocks = null;
  }
  ctx.imageSmoothingEnabled = false;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {boolean} [staticOnly]
 */
function paintGrain(canvas, ctx, staticOnly = false) {
  const w = canvas.width;
  const h = canvas.height;
  if (w < BLOCK || h < BLOCK) return;

  const bw = Math.ceil(w / BLOCK);
  const bh = Math.ceil(h / BLOCK);
  const nBlocks = bw * bh;
  const need = nBlocks * 4;

  if (!prevBlocks || prevBlocks.length !== need) {
    prevBlocks = new Float32Array(need);
    for (let i = 0; i < need; i += 4) {
      prevBlocks[i] = 128;
      prevBlocks[i + 1] = 128;
      prevBlocks[i + 2] = 128;
      prevBlocks[i + 3] = 90;
    }
  }

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const mixNew = staticOnly ? 1 : 1 - TEMPORAL;
  const mixOld = staticOnly ? 0 : TEMPORAL;

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const bi = by * bw + bx;
      const p = bi * 4;

      const base = Math.random() * 255;
      const cr = (Math.random() - 0.5) * 42;
      const cg = (Math.random() - 0.5) * 26;
      const cb = (Math.random() - 0.5) * 42;

      let r = base + cr;
      let g = base + cg;
      let b = base + cb;
      /* Alpha moins extrême = moins de variation brutale d’intensité à chaque tick */
      let a = 58 + Math.random() * 48;

      r = r * mixNew + prevBlocks[p] * mixOld;
      g = g * mixNew + prevBlocks[p + 1] * mixOld;
      b = b * mixNew + prevBlocks[p + 2] * mixOld;
      a = a * mixNew + prevBlocks[p + 3] * mixOld;

      prevBlocks[p] = r;
      prevBlocks[p + 1] = g;
      prevBlocks[p + 2] = b;
      prevBlocks[p + 3] = a;

      const r8 = Math.max(0, Math.min(255, r | 0));
      const g8 = Math.max(0, Math.min(255, g | 0));
      const b8 = Math.max(0, Math.min(255, b | 0));
      const a8 = Math.max(0, Math.min(255, a | 0));

      const y0 = by * BLOCK;
      const x0 = bx * BLOCK;
      for (let dy = 0; dy < BLOCK && y0 + dy < h; dy++) {
        for (let dx = 0; dx < BLOCK && x0 + dx < w; dx++) {
          const i = ((y0 + dy) * w + (x0 + dx)) * 4;
          data[i] = r8;
          data[i + 1] = g8;
          data[i + 2] = b8;
          data[i + 3] = a8;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
}

function tick(time) {
  rafId = window.requestAnimationFrame(tick);
  const canvas = grainCanvas();
  if (!canvas || canvas.dataset.active !== '1') return;

  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!ctx) return;

  resizeToShell(canvas, ctx);

  if (reducedMotion()) {
    if (canvas.dataset.staticGrain !== '1') {
      paintGrain(canvas, ctx, true);
      canvas.dataset.staticGrain = '1';
    }
    return;
  }
  canvas.dataset.staticGrain = '0';

  if (time - lastFrameTime < FRAME_INTERVAL_MS) return;
  lastFrameTime = time;

  paintGrain(canvas, ctx, false);
}

export function startWebcamGrainLoop() {
  const canvas = grainCanvas();
  if (!canvas) return;

  stopWebcamGrainLoop();

  canvas.dataset.active = '1';
  canvas.dataset.staticGrain = '0';
  lastFrameTime = 0;

  shellEl = canvas.closest('.ssi-webcam-shell');
  if (shellEl && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => {
      const c = grainCanvas();
      const cx = c?.getContext('2d', { alpha: true, willReadFrequently: true });
      if (c && cx && c.dataset.active === '1') resizeToShell(c, cx);
    });
    resizeObs.observe(shellEl);
  }

  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (ctx) {
    resizeToShell(canvas, ctx);
    if (reducedMotion()) {
      paintGrain(canvas, ctx, true);
      canvas.dataset.staticGrain = '1';
    }
  }

  rafId = window.requestAnimationFrame(tick);
}

export function stopWebcamGrainLoop() {
  const canvas = grainCanvas();
  if (canvas) {
    canvas.dataset.active = '0';
    canvas.dataset.staticGrain = '0';
    const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (ctx && canvas.width > 0 && canvas.height > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (resizeObs && shellEl) {
    try {
      resizeObs.disconnect();
    } catch (_) {}
    resizeObs = null;
    shellEl = null;
  }
  prevBlocks = null;
  lastFrameTime = 0;
}
