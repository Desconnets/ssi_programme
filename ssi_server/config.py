"""Constantes et chemins racine du projet."""
from pathlib import Path

# Dossier du package (…/ssi_programme/ssi_server)
PACKAGE_DIR = Path(__file__).resolve().parent
# Racine du projet (…/ssi_programme)
ROOT_DIR = PACKAGE_DIR.parent

PORT = 3000

AUDIO_EXT = frozenset({'.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'})
IMAGE_EXT = frozenset({'.png', '.jpg', '.jpeg', '.gif', '.webp'})
VIDEO_EXT = frozenset({'.mp4', '.webm', '.mov', '.m4v', '.gif'})
