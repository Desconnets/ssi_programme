"""Résumé des fichiers exposés au démarrage (aperçu LIVE)."""
from .config import AUDIO_EXT, IMAGE_EXT, VIDEO_EXT
from .fsutil import list_files
from .logutil import info, warn, sep
from .runtime_config import get_audio_input_mode


def print_startup_inventory() -> dict:
    """
    Affiche un bloc lisible : comptages + alertes si dossier vide.
    Retourne un dict pour usage éventuel (tests).
    """
    counts = {
        'tracks': len(list_files('musique', AUDIO_EXT)),
        'virgules': len(list_files('virgules', AUDIO_EXT)),
        'stickers': len(list_files('stickers', IMAGE_EXT)),
        'backgrounds': len(list_files('backgrounds', VIDEO_EXT)),
        'phase_videos': len(list_files('phase_videos', VIDEO_EXT)),
    }

    sep()
    info('PRÊT LIVE — inventaire fichiers')
    sep()
    info(f'  Musique       → {counts["tracks"]:3d} fichier(s)   (dossier musique/)')
    info(f'  Virgules      → {counts["virgules"]:3d} fichier(s)   (dossier virgules/)')
    info(f'  Stickers      → {counts["stickers"]:3d} fichier(s)   (dossier stickers/)')
    info(f'  Fonds vidéo   → {counts["backgrounds"]:3d} fichier(s)   (dossier backgrounds/)')
    info(f'  Phase fenêtre → {counts["phase_videos"]:3d} fichier(s)   (dossier phase_videos/)')
    sep()

    if get_audio_input_mode() == 'micro':
        info(
            'Mode micro : musique/ et virgules/ ne sont pas normalisés au démarrage et ne sont pas '
            'lus dans la page ; les comptages ci-dessus = fichiers présents sur le disque (API inchangée).'
        )
        sep()

    if counts['tracks'] == 0 and get_audio_input_mode() != 'micro':
        warn('Aucune piste : la page ne pourra pas lancer de playlist.')
    if counts['stickers'] == 0:
        warn('Aucun sticker : le navigateur affichera un visuel SVG de SECOURS (pas d’écran vide).')
    if counts['virgules'] == 0 and get_audio_input_mode() != 'micro':
        info('Aucune virgule : enchaînement direct morceau → morceau (normal).')
    if counts['backgrounds'] == 0:
        warn('Aucune vidéo de fond : seul le dégradé + CRT seront visibles.')
    if counts['phase_videos'] == 0:
        info('Aucune vidéo phase fenêtre : après SUPER BOOM passage direct à la phase logo.')
    else:
        info(
            'phase_videos/ : au démarrage, les sources sont converties en « … ok_converti.mp4 » '
            '(léger, sans audio) ; l’original part dans phase_videos/_archive/.'
        )
    if counts['backgrounds'] > 0:
        info(
            'backgrounds/ : même logique (MP4 ok_converti, originaux dans backgrounds/_archive/). '
            'La page lit le fond en muted ; la piste audio est retirée à l’export pour alléger les fichiers.'
        )

    info('Les requêtes API sont loguées ci-dessous ; les gros fichiers (MP4/MP3) restent silencieux.')
    info('Pendant la page ouverte : évènements lecteur + phases → préfixe [SSI·LIVE] (via POST /api/live-log).')
    sep()
    return counts
