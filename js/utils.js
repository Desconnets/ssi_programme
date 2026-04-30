export function random(min, max) {
  return min + Math.random() * (max - min);
}

export function palier(v, steps) {
  return Math.floor(Math.max(0, Math.min(1, v)) * steps) / steps;
}

export function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
