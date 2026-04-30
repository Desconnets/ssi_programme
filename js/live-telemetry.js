/**
 * Envoie l’état LIVE au serveur Python → lignes [SSI·LIVE] dans le terminal.
 * Fire-and-forget (ne bloque pas l’UI).
 */

const ENDPOINT = '/api/live-log';

export function liveShortName(url) {
  if (!url || typeof url !== 'string') return '?';
  if (url.startsWith('data:')) return '(SVG secours)';
  try {
    const part = url.split('/').pop() || url;
    return decodeURIComponent(part.split('?')[0]);
  } catch {
    return url.slice(0, 80);
  }
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
export function reportLiveEvent(event, detail = {}) {
  try {
    const body = JSON.stringify({ event, ...detail, t: Date.now() });
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
