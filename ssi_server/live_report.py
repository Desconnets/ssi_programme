"""Résumé des fichiers exposés au démarrage (aperçu LIVE)."""
import os
from .config import AUDIO_EXT, IMAGE_EXT, VIDEO_EXT
from .logutil import info, warn, sep


def _count_content_files(media_type: str, exts: frozenset) -> int:
    """Compte tous les fichiers d'un type dans content/ (tous moods + logos)."""
    total = 0
    content_dir = 'content'
    if not os.path.isdir(content_dir):
        return 0
    for mood in os.listdir(content_dir):
        mood_path = os.path.join(content_dir, mood)
        if not os.path.isdir(mood_path):
            continue
        type_path = os.path.join(mood_path, media_type)
        if not os.path.isdir(type_path):
            continue
        # Fichiers directs
        try:
            for f in os.listdir(type_path):
                if os.path.splitext(f)[1].lower() in exts:
                    total += 1
        except OSError:
            pass
        # Fichiers dans les sous-dossiers content set
        try:
            for sub in os.listdir(type_path):
                sub_path = os.path.join(type_path, sub)
                if os.path.isdir(sub_path) and not sub.startswith('_'):
                    for f in os.listdir(sub_path):
                        if os.path.splitext(f)[1].lower() in exts:
                            total += 1
        except OSError:
            pass
    # Logos comptés séparément pour les stickers
    if media_type == 'stickers':
        logos_dir = os.path.join('content', 'logos')
        if os.path.isdir(logos_dir):
            for mood_logos in os.listdir(logos_dir):
                logo_path = os.path.join(logos_dir, mood_logos)
                if os.path.isdir(logo_path):
                    try:
                        for f in os.listdir(logo_path):
                            if os.path.splitext(f)[1].lower() in exts:
                                total += 1
                    except OSError:
                        pass
    return total


def print_startup_inventory() -> dict:
    """
    Affiche un bloc lisible : comptages + alertes si dossier vide.
    Retourne un dict pour usage éventuel (tests).
    """
    counts = {
        'stickers':     _count_content_files('stickers', IMAGE_EXT),
        'backgrounds':  _count_content_files('backgrounds', VIDEO_EXT),
        'phase_videos': _count_content_files('videos', VIDEO_EXT),
    }

    sep()
    info('PRÊT LIVE — inventaire fichiers (dossier content/)')
    sep()
    info(f'  Stickers      → {counts["stickers"]:3d} fichier(s)   (content/*/stickers/ + content/logos/)')
    info(f'  Fonds vidéo   → {counts["backgrounds"]:3d} fichier(s)   (content/*/backgrounds/)')
    info(f'  Phase fenêtre → {counts["phase_videos"]:3d} fichier(s)   (content/*/videos/)')
    sep()

    info('Mode audio : micro — le micro du navigateur pilote les effets visuels.')
    sep()

    if counts['stickers'] == 0:
        warn("Aucun sticker : le navigateur affichera un visuel SVG de SECOURS (pas d'écran vide).")
    if counts['backgrounds'] == 0:
        warn('Aucune vidéo de fond : seul le dégradé + CRT seront visibles.')
    if counts['phase_videos'] == 0:
        info('Aucune vidéo phase fenêtre : après SUPER BOOM passage direct à la phase logo.')
    else:
        info(
            "phase_videos/ : au démarrage, les fichiers sont convertis en « … ok_converti.mp4 » "
            "(H.264, audio conservé si présent) ; l'original part dans _archive/."
        )
    if counts['backgrounds'] > 0:
        info(
            'backgrounds/ : même logique de conversion (MP4 ok_converti, originaux dans _archive/).'
        )

    info('Les requêtes API sont loguées ci-dessous ; les gros fichiers (MP4) restent silencieux.')
    info('Pendant la page ouverte : évènements phases → préfixe [SSI·LIVE] (via POST /api/live-log).')
    sep()
    return counts
