/**
 * Ordre de passage des morceaux — logique isolée pour pouvoir changer de stratégie
 * sans toucher à audio.js (crossfade, jingles, etc.).
 *
 * Réglages : voir `config.js` → PLAYLIST_ORDER_MODE et PLAYLIST_CUSTOM_ORDER.
 */

import { PLAYLIST_ORDER_MODE, PLAYLIST_CUSTOM_ORDER } from './config.js';

/**
 * @param {number} n — nombre de pistes (playlist.length)
 * @returns {number[]} permutation des indices 0..n-1
 */
function shuffleIndices(n) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Ordre personnalisé : indices valides d’abord (dans l’ordre donné), puis le reste en ordre API.
 * @param {number} n
 * @param {readonly number[]} custom
 */
function normalizeCustomOrder(n, custom) {
  const seen = new Set();
  const out = [];
  const arr = Array.isArray(custom) ? custom : [];
  for (const x of arr) {
    const i = Math.floor(Number(x));
    if (!Number.isFinite(i) || i < 0 || i >= n || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  for (let k = 0; k < n; k++) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

/**
 * Construit un nouveau « tour » complet (chaque piste une fois avant de recommencer).
 * @param {number} playlistLength
 * @returns {number[]}
 */
export function buildPlaylistTourOrder(playlistLength) {
  const n = playlistLength | 0;
  if (n <= 0) return [];

  switch (PLAYLIST_ORDER_MODE) {
    case 'api_order':
      return Array.from({ length: n }, (_, i) => i);

    case 'custom':
      return normalizeCustomOrder(n, PLAYLIST_CUSTOM_ORDER);

    case 'shuffle_once':
    default:
      return shuffleIndices(n);
  }
}

/** Mode actuel (utile pour debug / LIVE). */
export function getPlaylistOrderMode() {
  return PLAYLIST_ORDER_MODE;
}
