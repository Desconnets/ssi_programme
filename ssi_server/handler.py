"""
Serveur HTTP du programme de scène live SSI / Diagonal Cinéma.

Rôles :
  - Sert les fichiers statiques (index.html, JS, CSS, médias).
  - Expose les routes API JSON (/api/*).
  - Filtre les logs pour garder le terminal lisible en live (sans spam MP4/JS/CSS).
  - Interprète les événements POST /api/live-log envoyés par le navigateur
    et les affiche avec le préfixe [SSI·LIVE].

Routes GET  : /api/stickers  /api/backgrounds  /api/phase-videos
              /api/phase-remote  /api/health
Routes POST : /api/phase-remote  /api/live-log

Pour ajouter une route : ajouter un bloc `if path == '/api/xxx':` dans _do_get() ou _do_post().
Pour ajouter un event LIVE : une ligne dans le dict _LIVE_EVENTS (en haut du fichier).
"""
import json
import os
import re
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler

from .config import ROOT_DIR, IMAGE_EXT, VIDEO_EXT
from .fsutil import list_files, list_files_themed
from .logutil import api, diag, http_error, http_media, live, remote_cmd
from .runtime_config import get_audio_input_mode
from . import phase_remote_state


def _ssi_media_log_enabled() -> bool:
    return os.environ.get('SSI_HTTP_MEDIA_LOG', '').lower() in ('1', 'true', 'yes', 'on')


def _ssi_diag_enabled() -> bool:
    return os.environ.get('SSI_DIAG', '').lower() in ('1', 'true', 'yes', 'on')


def _ssi_is_heavy_static_path(path_only: str) -> bool:
    """GET qui peuvent être longs (gros fichiers)."""
    p = path_only.split('?', 1)[0]
    return (
        p.startswith('/backgrounds/')
        or p.startswith('/phase_videos/')
    )


# Requêtes GET « lourdes » qu’on ne logue pas en succès (évite noyer le terminal en LIVE)
_QUIET_OK_PATTERNS = tuple(
    re.compile(p)
    for p in (
        r'^/stickers/',
        r'^/backgrounds/',
        r'^/phase_videos/',
        r'^/js/',
        r'^/favicon\.ico$',
        r'^/style\.css$',
        r'^/index\.html$',
        r'^/phase_panel\.html$',
        r'^/api/phase-videos$',
        r'^/api/phase-remote$',
    )
)


def _should_quiet_log(path_only: str, code: int) -> bool:
    # Favicon : 204 ou 200 sans bruit (le navigateur le demande systématiquement)
    if path_only == '/favicon.ico' and code in (200, 204):
        return True
    if code != 200:
        return False
    for rx in _QUIET_OK_PATTERNS:
        if rx.match(path_only):
            return True
    return path_only == '/' or path_only == ''


def _fmt_os_window_skip(d: dict) -> None:
    r = d.get('reason', '?')
    fichier = d.get('fichier')
    if r == 'lecture_bloquée' and fichier:
        live(f'! Fenêtre — ouverte mais vidéo figée → fichier suivant (était : « {fichier} »)')
    elif fichier:
        live(f'! Fenêtre — skip ({r}) → « {fichier} »')
    else:
        live(f'! Fenêtre — skip phase → {r}')


def _fmt_video_playing(d: dict) -> None:
    role = str(d.get('role') or '?')
    fichier = str(d.get('file') or '?')
    tiso = str(d.get('tIso') or '')
    tperf = d.get('tPerf')
    perf_txt = f' perf≈{tperf}ms' if tperf is not None else ''
    live(f'Vidéo LECTURE [{role}] « {fichier} » @ {tiso}{perf_txt}')


# ── Handlers des événements POST /api/live-log ──────────────────────────────
# Ajouter un nouvel event : une ligne ici.
# Les lambdas gèrent les cas simples ; les fonctions dédiées (_fmt_*) les cas complexes.
_LIVE_EVENTS: dict = {
    'mic_input':          lambda d: live('Micro ▶ entrée ambiante branchée sur les effets'),
    'snake':              lambda d: live(f'Snake ▶ « {d.get("fichier","?")} »  '
                                         f'(sticker {d.get("etape_snake","?")} du cycle, '
                                         f'n°{d.get("dans_set","?")} dans le set)'),
    'super_boom':         lambda d: live(f'SUPER BOOM ▶ {d.get("nombre","?")} sticker(s) affichés'),
    'os_window':          lambda d: live(f'Fenêtre ▶ « {d.get("fichier","?")} »'),
    'os_window_buffering':lambda d: live(f'Fenêtre — buffering + NO SIGNAL → « {d.get("fichier","?")} »'),
    'os_window_skip':     _fmt_os_window_skip,
    'os_window_fail':     lambda d: live(f'! Fenêtre — échec lecture → « {d.get("fichier","?")} » (retry ou logo)'),
    'logo':               lambda d: live(f'Logo ▶ « {d.get("fichier","?")} »'),
    'webcam_phase':       lambda d: live('Webcam ▶ phase signal direct (VHS)'),
    'webcam_phase_skip':  lambda d: live(f'! Webcam — skip phase → {d.get("reason","?")}'),
    'sticker_fail':       lambda d: live(f'! Sticker non chargé → fallback SVG : « {d.get("fichier","?")} »'),
    'video_ready':        lambda d: live(f'Vidéo PRÊTE [{d.get("role","?")}] '
                                         f'« {d.get("file","?")} » ({d.get("via","?")}) @ {d.get("tIso","")}'),
    'video_playing':      _fmt_video_playing,
}


class AppRequestHandler(SimpleHTTPRequestHandler):
    """Sert la racine du projet + endpoints /api/*."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def _path_only(self) -> str:
        return self.path.split('?', 1)[0].split('#', 1)[0]

    def log_message(self, format, *args):
        """
        Filtre les logs : garde erreurs + API utiles ; coupe le bruit MP3/MP4/CSS/JS OK.
        """
        try:
            msg = format % args
        except (TypeError, ValueError):
            super().log_message(format, *args)
            return
        # format Apache-like: "code message"
        # Ex. : "GET /api/phase-remote HTTP/1.1" 200 -
        m = re.search(r'"(?:GET|POST) ([^ ]+)\s+HTTP/1\.\d"\s+(\d{3})', msg)
        if m:
            raw_path = urllib.parse.unquote(m.group(1).split('?', 1)[0])
            code = int(m.group(2))
            # Télémétrie LIVE : pas de ligne Apache pour chaque événement
            if raw_path == '/api/live-log' and code == 204:
                return
            if _should_quiet_log(raw_path, code):
                return
            if raw_path.startswith('/api/') and code != 200:
                http_error(f'{raw_path} → {code}')
                return
        if ' 404 ' in msg or ' 500 ' in msg or ' 403 ' in msg:
            # Anciennes sessions / cache : bruit Chrome DevTools (idem traitement do_GET)
            if ' 404 ' in msg and 'com.chrome.devtools.json' in msg:
                return
            http_error(msg.strip())
            return
        print(msg, flush=True)

    def do_GET(self):
        path = self._path_only()
        t0 = time.monotonic()
        th = threading.current_thread().name
        if _ssi_diag_enabled():
            sp = path if len(path) <= 100 else path[:97] + '...'
            diag(f'→ GET {sp} [{th}]')
        try:
            self._do_get(path)
        finally:
            if _ssi_diag_enabled():
                dt_ms = (time.monotonic() - t0) * 1000
                sp = path if len(path) <= 80 else path[:77] + '...'
                diag(f'← GET {sp} [{th}] {dt_ms:.0f} ms')

    def _do_get(self, path: str) -> None:
        if path == '/api/stickers':
            theme = phase_remote_state.get_current_theme()
            files = list_files_themed('stickers', IMAGE_EXT, theme)
            urls = [f'/stickers/{urllib.parse.quote(f)}' for f in files]
            api(f'GET /api/stickers   → {len(files)} sticker(s) [{theme}]')
            self._send_json(urls)
            return
        if path == '/api/backgrounds':
            theme = phase_remote_state.get_current_theme()
            files = list_files_themed('backgrounds', VIDEO_EXT, theme)
            urls = [f'/backgrounds/{urllib.parse.quote(f)}' for f in files]
            api(f'GET /api/backgrounds → {len(files)} vidéo(s) [{theme}]')
            self._send_json(urls)
            return
        if path == '/api/phase-videos':
            theme = phase_remote_state.get_current_theme()
            files = list_files_themed('phase_videos', VIDEO_EXT, theme)
            urls = [f'/phase_videos/{urllib.parse.quote(f)}' for f in files]
            api(f'GET /api/phase-videos → {len(files)} vidéo(s) phase fenêtre [{theme}]')
            self._send_json(urls)
            return
        if path == '/api/health':
            payload = self._health_payload()
            api('GET /api/health    → snapshot compteurs')
            self._send_json(payload)
            return
        if path == '/api/phase-remote':
            pv_files = phase_remote_state.get_cached_phase_video_filenames()
            bg_files = phase_remote_state.get_cached_background_filenames()
            snap = phase_remote_state.get_snapshot()
            snap['phaseVideoCount'] = len(pv_files)
            snap['phaseVideoFiles'] = pv_files[:200]
            snap['backgroundVideoCount'] = len(bg_files)
            snap['backgroundVideoFiles'] = bg_files[:200]
            snap['validPhases'] = sorted(phase_remote_state.VALID_PHASES)
            snap['panelPhases'] = phase_remote_state.panel_phase_definitions()
            # Poll ~2×/s × plusieurs onglets : ne pas spammer [SSI·API] (voir SSI_PHASE_REMOTE_LOG=1)
            if os.environ.get('SSI_PHASE_REMOTE_LOG', '').lower() in ('1', 'true', 'yes', 'on'):
                api(f'GET /api/phase-remote → seq={snap.get("seq")} phase={snap.get("phase")}')
            self._send_json(snap)
            return

        # Évite le 404 « File not found » : Chrome / Firefox demandent /favicon.ico tout seuls
        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # Chrome DevTools : requête automatique (pas une ressource du projet) → évite 404 bruyants
        wk = urllib.parse.unquote(path.split('?', 1)[0])
        if wk == '/.well-known/appspecific/com.chrome.devtools.json':
            self.send_response(204)
            self.end_headers()
            return

        if _ssi_is_heavy_static_path(path) and _ssi_media_log_enabled():
            t0 = time.monotonic()
            short = path if len(path) <= 100 else path[:97] + '...'
            client = self.client_address[0] if self.client_address else '?'
            http_media(f'début GET {client} → {short}')
            try:
                super().do_GET()
            finally:
                dt_ms = (time.monotonic() - t0) * 1000
                http_media(f'fin GET ({dt_ms:.0f} ms) → {short}')
        else:
            super().do_GET()

    def do_POST(self):
        path = self._path_only()
        t0 = time.monotonic()
        th = threading.current_thread().name
        if _ssi_diag_enabled():
            diag(f'→ POST {path} [{th}]')
        try:
            self._do_post(path)
        finally:
            if _ssi_diag_enabled():
                dt_ms = (time.monotonic() - t0) * 1000
                diag(f'← POST {path} [{th}] {dt_ms:.0f} ms')

    def _do_post(self, path: str) -> None:
        if path == '/api/phase-remote':
            try:
                length = int(self.headers.get('Content-Length', 0))
            except ValueError:
                length = 0
            length = min(max(0, length), 4096)
            raw = self.rfile.read(length) if length else b'{}'
            try:
                data = json.loads(raw.decode('utf-8'))
            except (json.JSONDecodeError, UnicodeDecodeError):
                data = {}
            if not isinstance(data, dict):
                self._send_json({'ok': False, 'error': 'JSON objet attendu'}, 400)
                return
            try:
                snap = phase_remote_state.post_remote_payload(data)
            except (ValueError, TypeError) as e:
                self._send_json({'ok': False, 'error': str(e)}, 400)
                return
            pv_files = phase_remote_state.get_cached_phase_video_filenames()
            bg_files = phase_remote_state.get_cached_background_filenames()
            out = {
                **snap,
                'ok': True,
                'phaseVideoCount': len(pv_files),
                'phaseVideoFiles': pv_files[:200],
                'backgroundVideoCount': len(bg_files),
                'backgroundVideoFiles': bg_files[:200],
                'panelPhases': phase_remote_state.panel_phase_definitions(),
            }
            parts = []
            if data.get('phase') is not None and str(data.get('phase')).strip():
                parts.append(str(snap.get('phase') or ''))
            if 'bgGradientOpacity' in data:
                go = snap.get('bgGradientOpacity')
                parts.append('dégradé défaut' if go is None else f'dégradé α={go:.2f}')
            if 'backgroundAutoRotate' in data:
                parts.append('fond auto' if snap.get('backgroundAutoRotate') else 'fond manuel')
            if 'backgroundVideoIndex' in data:
                idx = snap.get('backgroundVideoIndex')
                parts.append('fond auto' if idx is None else f'fond #{idx}')
            if 'idleResumeMs' in data:
                parts.append(f'idle {snap.get("idleResumeMs")} ms')
            if 'theme' in data:
                parts.append(f'thème→{snap.get("theme")}')
            if 'pausePhases' in data:
                parts.append('⏸ pause' if snap.get('phasesPaused') else '▶ reprise')
            remote_cmd(f'{" · ".join(parts) or "maj"} · seq {snap.get("seq")}')
            self._send_json(out)
            return

        if path != '/api/live-log':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            length = 0
        length = min(max(0, length), 16384)
        raw = self.rfile.read(length) if length else b'{}'
        try:
            data = json.loads(raw.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            data = {}
        self._print_live_event(data if isinstance(data, dict) else {})
        self.send_response(204)
        self.end_headers()

    def _print_live_event(self, data: dict) -> None:
        ev = str(data.get('event', '') or '?')
        handler = _LIVE_EVENTS.get(ev)
        if handler:
            handler(data)
        else:
            live(f'(event={ev}) {data}')

    def _send_json(self, data, status: int = 200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _health_payload(self):
        return {
            'ok': True,
            'audioInput': get_audio_input_mode(),
            'stickers': len(list_files('stickers', IMAGE_EXT)),
            'backgrounds': len(list_files('backgrounds', VIDEO_EXT)),
            'phaseVideos': len(list_files('phase_videos', VIDEO_EXT)),
        }
