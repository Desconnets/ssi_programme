"""Résumé des fichiers exposés au démarrage (aperçu LIVE)."""
from .config import AUDIO_EXT, IMAGE_EXT, VIDEO_EXT
from .fsutil import list_files
from .logutil import info, warn, sep


def print_startup_inventory() -> dict:
    """
    Affiche un bloc lisible : comptages + alertes si dossier vide.
    Retourne un dict pour usage éventuel (tests).
    """
    counts = {
        'stickers': len(list_files('stickers', IMAGE_EXT)),
        'backgrounds': len(list_files('backgrounds', VIDEO_EXT)),
        'phase_videos': len(list_files('phase_videos', VIDEO_EXT)),
    }

    sep()
    info('PRÊT LIVE — inventaire fichiers')
    sep()
    info(f'  Stickers      → {counts["stickers"]:3d} fichier(s)   (dossier stickers/)')
    info(f'  Fonds vidéo   → {counts["backgrounds"]:3d} fichier(s)   (dossier backgrounds/)')
    info(f'  Phase fenêtre → {counts["phase_videos"]:3d} fichier(s)   (dossier phase_videos/)')
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
            "phase_videos/ : au démarrage, les fichiers sont convertis en \u00ab \u2026 ok_converti.mp4 \u00bb "
            "(H.264, audio conserv\u00e9) ; l'original part dans phase_videos/_archive/."
        )
    if counts['backgrounds'] > 0:
        info(
            'backgrounds/ : même logique de conversion (MP4 ok_converti, originaux dans backgrounds/_archive/).'
        )

    info('Les requêtes API sont loguées ci-dessous ; les gros fichiers (MP4) restent silencieux.')
    info('Pendant la page ouverte : évènements phases → préfixe [SSI·LIVE] (via POST /api/live-log).')
    sep()
    return counts
