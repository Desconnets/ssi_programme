"""Configuration fixée au lancement du serveur (choix interactif ou env)."""
import os

from .logutil import info, sep

# Valeurs exposées au client : GET /api/settings
VALID_MODES = frozenset({'playlist', 'micro'})

_AUDIO_INPUT_MODE: str = 'playlist'


def get_audio_input_mode() -> str:
    return _AUDIO_INPUT_MODE


def set_audio_input_mode(mode: str) -> None:
    global _AUDIO_INPUT_MODE
    _AUDIO_INPUT_MODE = mode if mode in VALID_MODES else 'playlist'


def prompt_audio_input_choice() -> str:
    """
    Demande dans le terminal quelle source alimente les effets dans le navigateur.
    Peut être court-circuité par SSI_AUDIO_INPUT=playlist|micro (CI / scripts).
    """
    env = os.environ.get('SSI_AUDIO_INPUT', '').strip().lower()
    if env in ('micro', 'mic', '2', 'ambient'):
        set_audio_input_mode('micro')
        info('Source effets audio : microphone (SSI_AUDIO_INPUT dans l’environnement).')
        return 'micro'
    if env in ('playlist', 'files', '1', 'musique', 'music'):
        set_audio_input_mode('playlist')
        info('Source effets audio : playlist (SSI_AUDIO_INPUT dans l’environnement).')
        return 'playlist'

    sep()
    info('Source audio pour les effets visuels (cette session) :')
    info('  [1] Playlist  — lecture des MP3 (musique/ + virgules) + analyse pour les effets')
    info(
        '  [2] Micro     — pas de lecture playlist : seul le micro pilote les effets '
        '(accès micro dans le navigateur au clic ; le serveur peut ignorer la prep. musique/)'
    )
    sep()
    try:
        raw = input('Tapez 1 ou 2 puis Entrée [défaut : 1] : ').strip()
    except EOFError:
        raw = ''
    sep()
    if raw == '2':
        set_audio_input_mode('micro')
        info('→ Mode micro enregistré pour la page web.')
        return 'micro'
    set_audio_input_mode('playlist')
    info('→ Mode playlist enregistré pour la page web.')
    return 'playlist'
