"""Point d’entrée du serveur : chdir racine, normalisation, HTTP."""
import os
import subprocess
import sys
import threading
import time
from http.server import ThreadingHTTPServer

from .config import ROOT_DIR, PORT
from .normalize import safe_normalize_audio_in_directory
from .phase_video_convert import safe_convert_backgrounds_lite, safe_convert_phase_videos_lite
from .handler import AppRequestHandler
from .live_report import print_startup_inventory
from .logutil import boot, boot_reset, info, pulse, sep, warn
from .runtime_config import get_audio_input_mode, prompt_audio_input_choice


class QuietHTTPServer(ThreadingHTTPServer):
    """
    Threading : plusieurs requêtes en parallèle (MP3/MP4 + POST /api/live-log).
    Sans ça, un gros GET bloque tout le serveur → buffer audio « waiting/stalled »
    et les lignes [SSI·LIVE] arrivent en retard ou pas du tout.

    N’affiche pas une traceback complète quand le client coupe la connexion au milieu
    d’un gros fichier : BrokenPipe / reset normaux.
    """

    daemon_threads = True

    def handle_error(self, request, client_address):
        _exc_type, exc_val, _exc_tb = sys.exc_info()
        if isinstance(exc_val, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
            return
        # Erreurs réelles : comportement par défaut (traceback sur stderr)
        super().handle_error(request, client_address)


def _phase_panel_mode() -> str:
    """
    - défaut / vide / browser / web : ouvre un onglet vers phase_panel.html (évite tkinter, souvent cassé sur macOS).
    - tk : ancien panneau tkinter (tools/phase_remote_panel.py).
    - 0 / off : rien.
    """
    v = os.environ.get('SSI_PHASE_PANEL', '').strip().lower()
    if not v or v in ('1', 'true', 'yes', 'on', 'browser', 'web'):
        return 'browser'
    if v in ('0', 'false', 'no', 'off'):
        return 'off'
    if v == 'tk':
        return 'tk'
    return 'browser'


def _maybe_launch_phase_panel_tk() -> None:
    panel = ROOT_DIR / 'tools' / 'phase_remote_panel.py'
    if not panel.is_file():
        return
    try:
        import tkinter  # noqa: F401
    except ImportError:
        info(
            'Panneau tkinter indisponible (import tkinter). '
            'Utilisez le panneau web par défaut ou : python3 tools/phase_remote_panel.py'
        )
        return
    base = f'http://127.0.0.1:{PORT}'
    try:
        popen_kw: dict = {'cwd': str(ROOT_DIR)}
        if sys.platform == 'win32':
            popen_kw['creationflags'] = subprocess.CREATE_NEW_CONSOLE  # type: ignore[attr-defined]
        else:
            popen_kw['start_new_session'] = True
        subprocess.Popen([sys.executable, str(panel), base], **popen_kw)
        info(f'Panneau télécommande (tkinter) — {base} — revenir au navigateur : ne pas mettre SSI_PHASE_PANEL=tk')
    except OSError as e:
        warn(f'Lancement panneau tkinter impossible : {e}')


def _maybe_open_scene_browser() -> None:
    """Ouvre la page d’animation (/) comme l’onglet télécommande — désactiver : SSI_OPEN_SCENE=0."""
    v = os.environ.get('SSI_OPEN_SCENE', '').strip().lower()
    if v in ('0', 'false', 'no', 'off'):
        info('Page animation : ouverture auto désactivée (SSI_OPEN_SCENE=0).')
        return
    import webbrowser

    url = f'http://127.0.0.1:{PORT}/'

    def _open() -> None:
        try:
            webbrowser.open(url)
        except OSError as e:
            warn(f'Ouverture page animation : {e}')

    threading.Timer(0.45, _open).start()
    info(f'Page animation : ouverture navigateur → {url} (couper : SSI_OPEN_SCENE=0)')


def _maybe_open_phase_panel_browser() -> None:
    import webbrowser

    url = f'http://127.0.0.1:{PORT}/phase_panel.html'

    def _open() -> None:
        try:
            webbrowser.open(url)
        except OSError as e:
            warn(f'Ouverture navigateur télécommande : {e}')

    # Légèrement après la scène pour que les deux onglets s’ouvrent dans un ordre lisible.
    threading.Timer(0.7, _open).start()
    info(
        f'Télécommande phases : ouverture navigateur → {url} '
        f'(tkinter explicite : SSI_PHASE_PANEL=tk — désactiver : SSI_PHASE_PANEL=0)'
    )


def _maybe_open_phase_panel_ui() -> None:
    mode = _phase_panel_mode()
    if mode == 'off':
        info('Panneau télécommande phases : désactivé (SSI_PHASE_PANEL=0).')
        return
    if mode == 'tk':
        _maybe_launch_phase_panel_tk()
        return
    _maybe_open_phase_panel_browser()


def main() -> None:
    boot_reset()
    boot('Début main() — chronomètre démarrage serveur')

    os.chdir(ROOT_DIR)
    boot(f'Répertoire racine : {ROOT_DIR}')

    prompt_audio_input_choice()
    boot('Choix source audio terminé (ou variable SSI_AUDIO_INPUT)')

    mode = get_audio_input_mode()
    if mode == 'micro':
        info(
            'Mode micro : normalisation musique/ et virgules/ ignorée '
            '(rien n’est lu depuis ces dossiers cette session). '
            'Relancez en [1] pour préparer ou jouer les MP3.'
        )
        boot('Blocs musique/ + virgules/ sautés (mode micro)')
    else:
        info('Démarrage — normalisation audio (si ffmpeg dispo)…')
        t0 = time.perf_counter()
        safe_normalize_audio_in_directory('musique')
        boot(f'Bloc musique/ terminé (durée de ce bloc : {time.perf_counter() - t0:.1f}s)')

        t1 = time.perf_counter()
        safe_normalize_audio_in_directory('virgules')
        boot(f'Bloc virgules/ terminé (durée de ce bloc : {time.perf_counter() - t1:.1f}s)')

    info('Conversion phase_videos/ → MP4 léger sans audio (archive _archive/)…')
    t2 = time.perf_counter()
    safe_convert_phase_videos_lite()
    boot(f'Bloc phase_videos/ terminé (durée de ce bloc : {time.perf_counter() - t2:.1f}s)')

    info('Conversion backgrounds/ → MP4 léger sans audio (archive _archive/)…')
    t3 = time.perf_counter()
    safe_convert_backgrounds_lite()
    boot(f'Bloc backgrounds/ terminé (durée de ce bloc : {time.perf_counter() - t3:.1f}s)')

    boot('Inventaire fichiers (scan rapide des dossiers)…')
    print_startup_inventory()
    boot('Inventaire affiché — ouverture du socket HTTP')

    server = QuietHTTPServer(('', PORT), AppRequestHandler)
    boot(f'Socket prêt sur le port {PORT} — prêt à accepter des connexions')
    mode = get_audio_input_mode()
    mode_txt = 'microphone (ambiant)' if mode == 'micro' else 'playlist (fichiers)'
    info(f'Serveur HTTP actif  →  http://localhost:{PORT}  ·  effets audio : {mode_txt}')
    info('Astuce : curl http://localhost:%s/api/health' % PORT)
    info(
        'Debug durée des gros fichiers (logs par transfert) : '
        'SSI_HTTP_MEDIA_LOG=1 python3 server.py'
    )
    if os.environ.get('SSI_DIAG', '').lower() in ('1', 'true', 'yes', 'on'):
        info(
            'SSI_DIAG actif → chaque requête : lignes [SSI·DIAG] (thread + durée). '
            'Page : ajouter ?diag=1 pour la console (vidéo + états <audio>).'
        )
    try:
        # Défaut 30 s : moins de bruit dans le terminal ; LIVE reste le fil utile.
        pulse_sec = float(os.environ.get('SSI_SERVER_PULSE_SEC', '30'))
    except ValueError:
        pulse_sec = 30.0
    if pulse_sec > 0:
        info(
            f'Veille [SSI·PULSE] toutes les {pulse_sec:g} s — couper : SSI_SERVER_PULSE_SEC=0'
        )
    sep()

    pulse_stop = threading.Event()
    pulse_t0 = time.monotonic()

    pulse_count = 0

    def _pulse_worker() -> None:
        nonlocal pulse_count
        if pulse_sec <= 0:
            return
        while not pulse_stop.wait(pulse_sec):
            pulse_count += 1
            up = int(time.monotonic() - pulse_t0)
            mode = get_audio_input_mode()
            mode_court = 'micro' if mode == 'micro' else 'playlist'
            m, s = divmod(up, 60)
            duree = f'{m}m{s}s' if m else f'{s}s'
            # Ligne courte ; rappel média seulement 1× sur 8 (évite répétition)
            msg = f'OK | {duree} | {mode_court} | :{PORT}'
            if pulse_count % 8 == 0:
                msg += ' | lents? SSI_HTTP_MEDIA_LOG=1'
            pulse(msg)

    pulse_thread = threading.Thread(target=_pulse_worker, name='ssi-pulse', daemon=True)
    if pulse_sec > 0:
        pulse_thread.start()

    _maybe_open_scene_browser()
    _maybe_open_phase_panel_ui()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pulse_stop.set()
        sep()
        info('Arrêt demandé (Ctrl+C) — fermeture du serveur.')
        server.shutdown()
        sep()
