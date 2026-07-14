"""Utilitaires ffmpeg — détection et installation.
Les fonctions de normalisation audio (loudnorm) sont archivées dans archive/playlist-mode/.
"""
import subprocess

from .logutil import norm


def find_ffmpeg():
    """Chemin vers ffmpeg ou None."""
    candidates = [
        'ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/usr/bin/ffmpeg',
    ]
    for c in candidates:
        try:
            r = subprocess.run([c, '-version'], capture_output=True, timeout=4)
            if r.returncode == 0:
                return c
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass
    return None


def try_install_ffmpeg() -> bool:
    """Tente d'installer ffmpeg via brew (macOS). Retourne True si disponible ensuite."""
    norm('Tentative d\'installation ffmpeg via brew…')
    try:
        subprocess.run(['brew', 'install', 'ffmpeg'], check=True, timeout=300)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        pass
    return False
