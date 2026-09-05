"""Résumé des fichiers exposés au démarrage (aperçu LIVE)."""
import os
from .config import AUDIO_EXT, IMAGE_EXT, VIDEO_EXT
from .fsutil import list_files
from .logutil import info, warn, sep


def _count_content_files(media_type: str, exts: frozenset) -> int:
    """Compte tous les fichiers d'un type dans content/{mood}/{catégorie}/{type}/."""
    total = 0
    content_dir = 'content'
    if not os.path.isdir(content_dir):
        return 0
    for mood in os.listdir(content_dir):
        mood_path = os.path.join(content_dir, mood)
        if not os.path.isdir(mood_path) or mood.startswith('_') or mood == 'logos':
            continue
        try:
            cats = os.listdir(mood_path)
        except OSError:
            continue
        for cat in cats:
            if cat.startswith('_'):
                continue
            type_path = os.path.join(mood_path, cat, media_type)
            if not os.path.isdir(type_path):
                continue
            try:
                for f in os.listdir(type_path):
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
        # Flat folder, no mood/content-set logic (unlike the other media above).
        'clips':        len(list_files('clips', VIDEO_EXT)),
    }

    sep()
    info('PRÊT LIVE — inventaire fichiers (dossier content/)')
    sep()
    info(f'  Stickers      → {counts["stickers"]:3d} fichier(s)   (content/*/stickers/ + content/logos/)')
    info(f'  Fonds vidéo   → {counts["backgrounds"]:3d} fichier(s)   (content/*/backgrounds/)')
    info(f'  Phase fenêtre → {counts["phase_videos"]:3d} fichier(s)   (content/*/videos/)')
    info(f'  Phase Clip    → {counts["clips"]:3d} fichier(s)   (clips/) — manuel, son actif')
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
    if counts['clips'] == 0:
        info('Aucun clip : le bouton « Clip » du panneau restera sans effet tant que clips/ est vide.')
    else:
        info(
            'clips/ : même logique de conversion, audio conservé — phase déclenchée manuellement '
            'uniquement (jamais dans le cycle auto).'
        )

    info('Les requêtes API sont loguées ci-dessous ; les gros fichiers (MP4) restent silencieux.')
    info('Pendant la page ouverte : évènements phases → préfixe [SSI·LIVE] (via POST /api/live-log).')
    sep()
    return counts
