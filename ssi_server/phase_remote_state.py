"""
État partagé de la télécommande — GET/POST /api/phase-remote.

Ce module est la SOURCE DE VÉRITÉ du programme : il contient tout l'état visible
par la scène (navigateur) et la télécommande (panneau web).

Pour étendre (nouvelle phase, nouveau réglage) :
  1. Ajouter la variable globale + sa valeur par défaut ici.
  2. L'inclure dans _snapshot_unlocked() → le GET la renvoie automatiquement.
  3. Gérer le POST dans post_remote_payload() avec le pattern has_X existant.
  4. Côté JS : lire data.nouveauChamp dans phase-remote.js au poll.

Phases reconnues : VALID_PHASES + PANEL_PHASE_ORDER + PANEL_PHASE_LABELS.
Moods reconnus   : VALID_MOODS (classique / dark).
Content sets     : n'importe quel sous-dossier détecté dans stickers/, phase_videos/, backgrounds/.

Thread-safety : toutes les lectures/écritures des variables _privées passent par _lock.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any

_lock = threading.Lock()
_seq = 0
_last_command_ms: int | None = None
_phase: str | None = None
_video_index: int | None = None
# Incrémenté seulement si le POST contient « phase » — pour que la page ne relance pas la phase à chaque POST fond.
_phase_command_seq = 0

# Fond scène (dégradé + vidéos backgrounds/)
_bg_gradient_opacity: float | None = None
_bg_auto_rotate: bool = True
_bg_forced_video_index: int | None = None

# Délai sans nouveau POST « actif » avant reprise boucle snake côté page scène (ms).
_IDLE_RESUME_MS_MIN = 3000
_IDLE_RESUME_MS_MAX = 900_000
_idle_resume_ms: int = 60000

# Mood identité visuelle (classique = SSI charte · dark = glitché/électrique)
_theme: str = 'classique'
VALID_MOODS = frozenset({'classique', 'dark'})

# Content set actif — sous-dossier de contenu (boom, jeux-video, etc.) ; vide = repli sur mood
_content_set: str = ''

# Pause du cycle visuel (phases) — fond + CRT continuent
_phases_paused: bool = False

# Son des vidéos phase_videos/ — muet par défaut, activable depuis la télécommande
_video_muted: bool = True

VALID_PHASES = frozenset({'snake', 'super_boom', 'os_video', 'logo', 'webcam'})

# Ordre des boutons dans phase_panel.html / futurs clients — ajouter une phase : VALID_PHASES + ce tuple + libellé.
PANEL_PHASE_ORDER: tuple[str, ...] = (
    'snake',
    'super_boom',
    'os_video',
    'logo',
    'webcam',
)

PANEL_PHASE_LABELS: dict[str, str] = {
    'snake': 'Snake',
    'super_boom': 'Super boom',
    'os_video': 'Fenêtre vidéo',
    'logo': 'Logo',
    'webcam': 'Webcam',
}

# Indice vidéo obligatoire pour cette phase (extensible si d’autres phases en ont besoin).
PANEL_PHASE_NEEDS_VIDEO: frozenset[str] = frozenset({'os_video'})


def panel_phase_definitions() -> list[dict[str, Any]]:
    """
    Métadonnées pour le panneau web (GET /api/phase-remote → panelPhases).
    Une seule source de vérité pour labels + ordre + options UI.
    """
    out: list[dict[str, Any]] = []
    for pid in PANEL_PHASE_ORDER:
        if pid not in VALID_PHASES:
            continue
        out.append(
            {
                'id': pid,
                'label': PANEL_PHASE_LABELS.get(pid, pid),
                'needsVideoIndex': pid in PANEL_PHASE_NEEDS_VIDEO,
                'hint': '',
            }
        )
    return out


# Liste phase_videos/ : cache TTL (poll navigateur très fréquent → évite list_dir à chaque GET)
_pv_list_lock = threading.Lock()
_pv_list_cache: tuple[str, float, list[str]] | None = None  # (theme, expiry, files)

# Liste backgrounds/ : même idée
_bg_list_lock = threading.Lock()
_bg_list_cache: tuple[str, float, list[str]] | None = None  # (theme, expiry, files)


def _phase_video_list_ttl_sec() -> float:
    try:
        v = float(os.environ.get('SSI_PHASE_REMOTE_CACHE_SEC', '2.5'))
    except ValueError:
        return 2.5
    return max(0.5, min(60.0, v))


def get_cached_phase_video_filenames() -> list[str]:
    """
    Chemins relatifs dans phase_videos/ selon le mood + content set actifs (TTL court, thread-safe).
    Priorité : phase_videos/{content_set}/ → phase_videos/{mood}/ → phase_videos/
    """
    from .config import VIDEO_EXT
    from .fsutil import list_content_files

    global _pv_list_cache
    current_mood = get_current_theme()
    current_cs = get_current_content_set()
    cache_key = (current_cs, current_mood)
    now = time.monotonic()
    ttl = _phase_video_list_ttl_sec()
    with _pv_list_lock:
        if _pv_list_cache is not None:
            cached_key, exp, files = _pv_list_cache
            if now < exp and cached_key == cache_key:
                return files
        files = list_content_files('videos', VIDEO_EXT, current_cs, current_mood, 'phase_videos')
        _pv_list_cache = (cache_key, now + ttl, files)
        return files


def get_cached_background_filenames() -> list[str]:
    """
    Chemins relatifs dans backgrounds/ selon le mood + content set actifs (TTL court, thread-safe).
    Priorité : backgrounds/{content_set}/ → backgrounds/{mood}/ → backgrounds/
    """
    from .config import VIDEO_EXT
    from .fsutil import list_content_files

    global _bg_list_cache
    current_mood = get_current_theme()
    current_cs = get_current_content_set()
    cache_key = (current_cs, current_mood)
    now = time.monotonic()
    ttl = _phase_video_list_ttl_sec()
    with _bg_list_lock:
        if _bg_list_cache is not None:
            cached_key, exp, files = _bg_list_cache
            if now < exp and cached_key == cache_key:
                return files
        files = list_content_files('backgrounds', VIDEO_EXT, current_cs, current_mood, 'backgrounds')
        _bg_list_cache = (cache_key, now + ttl, files)
        return files


def _snapshot_unlocked() -> dict[str, Any]:
    return {
        'seq': _seq,
        'phaseCommandSeq': _phase_command_seq,
        'lastCommandMs': _last_command_ms,
        'phase': _phase,
        'videoIndex': _video_index,
        'bgGradientOpacity': _bg_gradient_opacity,
        'backgroundAutoRotate': _bg_auto_rotate,
        'backgroundVideoIndex': _bg_forced_video_index,
        'idleResumeMs': _idle_resume_ms,
        'theme': _theme,
        'contentSet': _content_set,
        'phasesPaused': _phases_paused,
        'videoMuted': _video_muted,
    }


def get_current_theme() -> str:
    with _lock:
        return _theme


def get_current_content_set() -> str:
    with _lock:
        return _content_set


def get_snapshot() -> dict[str, Any]:
    with _lock:
        return _snapshot_unlocked().copy()


def post_remote_payload(data: dict[str, Any]) -> dict[str, Any]:
    """
    Met à jour l’état télécommande. Au moins un champ reconnu requis.
    « phase » est optionnel si seuls des réglages fond sont envoyés.
    """
    global _seq, _last_command_ms, _phase, _video_index, _phase_command_seq
    global _bg_gradient_opacity, _bg_auto_rotate, _bg_forced_video_index, _idle_resume_ms, _theme, _phases_paused, _video_muted, _content_set

    if not isinstance(data, dict):
        raise ValueError('corps JSON objet attendu')

    phase_raw = data.get('phase')
    has_phase = phase_raw is not None and str(phase_raw).strip() != ''
    has_bg_opacity = 'bgGradientOpacity' in data
    has_bg_auto = 'backgroundAutoRotate' in data
    has_bg_index = 'backgroundVideoIndex' in data
    has_idle_resume = 'idleResumeMs' in data
    has_theme = 'theme' in data
    has_pause = 'pausePhases' in data
    has_video_muted = 'videoMuted' in data
    has_content_set = 'contentSet' in data

    if not has_phase and not has_bg_opacity and not has_bg_auto and not has_bg_index \
            and not has_idle_resume and not has_theme and not has_pause \
            and not has_video_muted and not has_content_set:
        raise ValueError(
            'aucun champ reconnu : phase, bgGradientOpacity, backgroundAutoRotate, '
            'backgroundVideoIndex, idleResumeMs, theme, pausePhases, videoMuted, contentSet'
        )

    idle_only = has_idle_resume and not has_phase and not has_bg_opacity \
        and not has_bg_auto and not has_bg_index and not has_theme \
        and not has_pause and not has_video_muted and not has_content_set

    with _lock:
        if has_phase:
            p = str(phase_raw).strip().lower().replace('-', '_')
            if p not in VALID_PHASES:
                raise ValueError(f'phase invalide: {phase_raw!r} (attendu: {sorted(VALID_PHASES)})')
            _phase = p
            vi = data.get('videoIndex', data.get('video_index'))
            if vi is not None and vi != '':
                try:
                    _video_index = int(vi)
                except (TypeError, ValueError):
                    _video_index = None
            else:
                _video_index = None
            _phase_command_seq += 1

        if has_bg_opacity:
            v = data.get('bgGradientOpacity')
            if v is None or v == '':
                _bg_gradient_opacity = None
            else:
                try:
                    x = float(v)
                except (TypeError, ValueError) as e:
                    raise ValueError('bgGradientOpacity doit être un nombre entre 0 et 1 (ou null)') from e
                _bg_gradient_opacity = max(0.0, min(1.0, x))

        if has_bg_auto:
            _bg_auto_rotate = bool(data.get('backgroundAutoRotate'))
            if _bg_auto_rotate:
                _bg_forced_video_index = None

        if has_bg_index:
            raw_idx = data.get('backgroundVideoIndex')
            if raw_idx is None or raw_idx == '':
                _bg_forced_video_index = None
            else:
                try:
                    _bg_forced_video_index = int(raw_idx)
                except (TypeError, ValueError) as e:
                    raise ValueError('backgroundVideoIndex doit être un entier ou null') from e
                _bg_auto_rotate = False

        if has_idle_resume:
            raw_ir = data.get('idleResumeMs')
            try:
                ir = int(raw_ir)
            except (TypeError, ValueError) as e:
                raise ValueError('idleResumeMs doit être un entier (millisecondes, ex. 60000)') from e
            _idle_resume_ms = max(_IDLE_RESUME_MS_MIN, min(_IDLE_RESUME_MS_MAX, ir))

        if has_theme:
            t = str(data.get('theme', '')).strip().lower()
            if t not in VALID_MOODS:
                raise ValueError(f'mood invalide: {t!r} (valeurs: {sorted(VALID_MOODS)})')
            if t != _theme:
                _theme = t
                # Invalider les caches de listes médias pour forcer un re-scan
                _pv_list_cache = None
                _bg_list_cache = None

        if has_pause:
            _phases_paused = bool(data.get('pausePhases'))

        if has_video_muted:
            _video_muted = bool(data.get('videoMuted'))

        if has_content_set:
            cs = str(data.get('contentSet') or '')
            if cs != _content_set:
                _content_set = cs
                _pv_list_cache = None
                _bg_list_cache = None

        if not idle_only:
            _seq += 1
            _last_command_ms = int(time.time() * 1000)
        return _snapshot_unlocked().copy()


def post_command(phase: str, video_index: int | None = None) -> dict[str, Any]:
    """Compatibilité interne : équivalent à POST { phase, videoIndex? }."""
    payload: dict[str, Any] = {'phase': phase}
    if video_index is not None:
        payload['videoIndex'] = video_index
    return post_remote_payload(payload)
