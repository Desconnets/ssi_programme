"""Handler HTTP : fichiers statiques + API JSON + logs API lisibles (sans spam média)."""
import json
import os
import re
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler

from .config import ROOT_DIR, AUDIO_EXT, IMAGE_EXT, VIDEO_EXT
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
        p.startswith('/musique/')
        or p.startswith('/backgrounds/')
        or p.startswith('/phase_videos/')
        or p.startswith('/virgules/')
    )


# Requêtes GET « lourdes » qu’on ne logue pas en succès (évite noyer le terminal en LIVE)
_QUIET_OK_PATTERNS = tuple(
    re.compile(p)
    for p in (
        r'^/musique/',
        r'^/virgules/',
        r'^/stickers/',
        r'^/backgrounds/',
        r'^/phase_videos/',
        r'^/js/',
        r'^/favicon\.ico$',
        r'^/style\.css$',
        r'^/index\.html$',
        r'^/phase_panel\.html$',
        r'^/api/settings$',
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
        # Ex. : "GET /api/tracks HTTP/1.1" 200 -
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
        if path == '/api/tracks':
            files = list_files('musique', AUDIO_EXT)
            urls = [f'/musique/{urllib.parse.quote(f)}' for f in files]
            api(f'GET /api/tracks     → {len(files)} piste(s)')
            self._send_json(urls)
            return
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
        if path == '/api/virgules':
            files = list_files('virgules', AUDIO_EXT)
            urls = [f'/virgules/{urllib.parse.quote(f)}' for f in files]
            api(f'GET /api/virgules   → {len(files)} virgule(s)')
            self._send_json(urls)
            return
        if path == '/api/health':
            payload = self._health_payload()
            api('GET /api/health    → snapshot compteurs')
            self._send_json(payload)
            return
        if path == '/api/settings':
            payload = {'audioInput': get_audio_input_mode()}
            api(f'GET /api/settings  → audioInput={payload["audioInput"]}')
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

        if ev == 'track':
            name = data.get('name') or '?'
            idx = data.get('index')
            total = data.get('total')
            live(f'Musique ▶ « {name} »  (piste {idx}/{total})')
            return
        if ev == 'track_load_start':
            name = data.get('name') or '?'
            idx = data.get('index')
            total = data.get('total')
            live(f'Musique chargement démarré → « {name} »  (piste {idx}/{total})')
            return
        if ev == 'track_buffer_ready':
            name = data.get('name') or '?'
            idx = data.get('index')
            live(f'Musique buffer prêt (canplay) → « {name} »  (piste {idx})')
            return
        if ev == 'track_fail':
            name = data.get('name') or '?'
            live(f'! Musique injouable (skip) → « {name} »')
            return
        if ev == 'track_buffer_starve':
            name = data.get('name') or '?'
            kind = data.get('kind') or '?'
            cnt = data.get('count')
            extra = f' n°{cnt}' if cnt is not None else ''
            live(
                f'! Musique — attente données ({kind}){extra} « {name} » '
                f'→ disque/CPU lent, réseau, ou pic de requêtes (voir SSI_HTTP_MEDIA_LOG=1)'
            )
            return
        if ev == 'track_overlap_fire':
            tag = data.get('tag') or '?'
            ov = data.get('overlapSec')
            ov_txt = f'{ov}s' if ov is not None else '?'
            live(f'Musique — timer fin de morceau (overlap {ov_txt}) → enchaînement depuis « {tag} »')
            return
        if ev == 'jingle_buffer_starve':
            name = data.get('name') or '?'
            kind = data.get('kind') or '?'
            live(
                f'! Virgule — attente données ({kind}) « {name} » '
                f'→ même cause possible (serveur occupé)'
            )
            return
        if ev == 'audio_context_blocked':
            st = data.get('state') or '?'
            ph = data.get('phase') or '?'
            live(f'! Audio Web — contexte « {st} » après {ph} — son possiblement muet (clic ou onglet actif)')
            return
        if ev == 'audio_context_stuck':
            ms = data.get('ms') or '?'
            st = data.get('state') or '?'
            live(f'! Audio Web — toujours « {st} » après {ms}ms — recliquez la page')
            return
        if ev == 'audio_context_state':
            st = data.get('state') or '?'
            hint = data.get('hint') or ''
            live(f'! Audio Web — {st} — {hint}')
            return
        if ev == 'tab_hidden_playing':
            name = data.get('name') or '?'
            live(
                f'! Onglet masqué pendant la lecture « {name} » '
                f'— Chrome peut suspendre son / vidéo (économie d’énergie)'
            )
            return
        if ev == 'audio_abort':
            live(f'! Arrêt enchaînement audio — {data.get("reason", "?")}')
            return
        if ev == 'audio_autoplay_blocked':
            live(
                '! Audio — navigateur refuse play() sans geste (recliquez la page ; vérifier virgules/ si échec virgule).'
            )
            return
        if ev == 'jingle':
            name = data.get('name') or '?'
            live(f'Virgule ▶ « {name} »')
            return
        if ev == 'jingle_load_start':
            name = data.get('name') or '?'
            live(f'Virgule chargement démarré → « {name} »')
            return
        if ev == 'jingle_buffer_ready':
            name = data.get('name') or '?'
            live(f'Virgule buffer prêt (canplay) → « {name} »')
            return
        if ev == 'jingle_fail':
            name = data.get('name') or '?'
            live(f'! Virgule injouable (skip) → « {name} »')
            return
        if ev == 'mic_input':
            live('Micro ▶ entrée ambiante branchée sur les effets')
            return
        if ev == 'audio_ended_fallback':
            name = data.get('name') or '?'
            live(f'! Audio — filet « ended » → enchaînement (était : « {name} »)')
            return
        if ev == 'snake':
            fichier = data.get('fichier') or '?'
            etape = data.get('etape_snake') or '?'
            dans_set = data.get('dans_set') or '?'
            live(f'Snake ▶ « {fichier} »  (sticker {etape} du cycle, n°{dans_set} dans le set)')
            return
        if ev == 'super_boom':
            n = data.get('nombre', '?')
            live(f'SUPER BOOM ▶ {n} sticker(s) affichés en même temps')
            return
        if ev == 'os_window':
            fichier = data.get('fichier') or '?'
            live(f'Fenêtre SSI ▶ « {fichier} »')
            return
        if ev == 'os_window_buffering':
            fichier = data.get('fichier') or '?'
            live(f'Fenêtre SSI — buffering + NO SIGNAL → « {fichier} »')
            return
        if ev == 'os_window_skip':
            r = data.get('reason', '?')
            fichier = data.get('fichier')
            if r == 'lecture_bloquée' and fichier:
                live(f'! Fenêtre SSI — fenêtre ouverte mais vidéo figée → fichier suivant (était : « {fichier} »)')
            elif fichier:
                live(f'! Fenêtre SSI — skip ({r}) → « {fichier} »')
            else:
                live(f'! Fenêtre SSI — skip phase → {r}')
            return
        if ev == 'os_window_fail':
            fichier = data.get('fichier') or '?'
            live(f'! Fenêtre SSI — échec lecture (play / décode) → « {fichier} » (retry ou logo)')
            return
        if ev == 'logo':
            fichier = data.get('fichier') or '?'
            live(f'Logo ▶ « {fichier} »')
            return
        if ev == 'webcam_phase':
            live('Webcam ▶ phase signal direct (VHS)')
            return
        if ev == 'webcam_phase_skip':
            r = data.get('reason', '?')
            live(f'! Webcam — skip phase → {r}')
            return
        if ev == 'sticker_fail':
            fichier = data.get('fichier') or '?'
            live(f'! Sticker non chargé → fallback SVG : « {fichier} »')
            return
        if ev == 'video_ready':
            role = str(data.get('role') or '?')
            fichier = str(data.get('file') or '?')
            via = str(data.get('via') or '?')
            tiso = str(data.get('tIso') or '')
            live(f'Vidéo PRÊTE [{role}] « {fichier} » ({via}) @ {tiso}')
            return
        if ev == 'video_playing':
            role = str(data.get('role') or '?')
            fichier = str(data.get('file') or '?')
            tiso = str(data.get('tIso') or '')
            tperf = data.get('tPerf')
            perf_txt = f' perf≈{tperf}ms' if tperf is not None else ''
            live(f'Vidéo LECTURE [{role}] « {fichier} » @ {tiso}{perf_txt}')
            return

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
            'tracks': len(list_files('musique', AUDIO_EXT)),
            'stickers': len(list_files('stickers', IMAGE_EXT)),
            'backgrounds': len(list_files('backgrounds', VIDEO_EXT)),
            'phaseVideos': len(list_files('phase_videos', VIDEO_EXT)),
            'virgules': len(list_files('virgules', AUDIO_EXT)),
        }
