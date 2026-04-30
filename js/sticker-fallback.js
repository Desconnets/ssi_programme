/**
 * Sticker de secours (data URL SVG) — jamais de requête réseau : évite écran vide en LIVE.
 * Charte SSI : violet / rose / jaune / turquoise.
 */
import { reportLiveEvent, liveShortName } from './live-telemetry.js';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6b00dd"/>
      <stop offset="100%" style="stop-color:#ff309c"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#g)"/>
  <rect x="20" y="20" width="280" height="280" rx="24" fill="none" stroke="#02d1ae" stroke-width="5"/>
  <text x="160" y="168" text-anchor="middle" fill="#ffde01" font-family="system-ui,sans-serif" font-size="44" font-weight="800">SSI</text>
  <text x="160" y="214" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="13" opacity="0.9">secours LIVE</text>
</svg>`;

export const FALLBACK_STICKER_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;

/**
 * Charge une image sticker ; en cas d’échec (404, fichier manquant), bascule une fois sur le SVG de secours.
 * @param {HTMLImageElement} img
 * @param {string} url
 */
export function bindStickerImage(img, url) {
  const onError = () => {
    img.removeEventListener('error', onError);
    if (img.dataset.ssiFallbackApplied === '1') return;
    img.dataset.ssiFallbackApplied = '1';
    if (typeof url === 'string' && !url.startsWith('data:')) {
      reportLiveEvent('sticker_fail', { fichier: liveShortName(url) });
    }
    img.src = FALLBACK_STICKER_URL;
  };
  img.addEventListener('error', onError);
  img.src = url;
}
