"""Liste de fichiers et sous-dossiers — accès à la structure content/."""
import errno
import os

# Dossiers qui ne sont jamais des catégories (types médias, archives, logos)
_RESERVED_DIR_NAMES = frozenset({
    '_archive', '_pool', 'classique', 'dark', 'logos',
    'stickers', 'videos', 'backgrounds',
})

def list_files(directory: str, exts: frozenset) -> list:
    """Liste simple dans un dossier (chemins relatifs à ce dossier)."""
    try:
        names = os.listdir(directory)
        return sorted(n for n in names if os.path.splitext(n)[1].lower() in exts)
    except OSError as e:
        if e.errno not in (errno.ENOENT, errno.ENOTDIR):
            from .logutil import warn
            warn(f'Impossible de lire « {directory}/ » ({e}) — liste retournée vide.')
        return []


def _list_dir(path: str, exts: frozenset) -> list[str]:
    """Liste les fichiers dans un dossier (pas les sous-dossiers)."""
    try:
        names = os.listdir(path)
        return sorted(n for n in names if os.path.splitext(n)[1].lower() in exts)
    except OSError:
        return []


def _is_category_dir(name: str) -> bool:
    return not name.startswith('_') and name not in _RESERVED_DIR_NAMES


def list_content_files(media_type: str, exts: frozenset,
                       content_set: str = '', mood: str = 'classique',
                       legacy_dir: str = '') -> list[str]:
    """
    Retourne des chemins complets relatifs à ROOT_DIR pour les fichiers médias.

    Structure : content/{mood}/{catégorie}/{media_type}/

    Si une catégorie est choisie : uniquement ce dossier (plus les logos pour les stickers).
    Si « Racine » (content_set vide) : toutes les catégories du mood mélangées.
    Repli final : {legacy_dir}/ (stickers/, phase_videos/, backgrounds/).

    Exemple : ['content/classique/boom/videos/daft_punk ok_converti.mp4']
    → URL : /content/classique/boom/videos/daft_punk ok_converti.mp4
    """
    # Catégorie précise — on ne mélange pas avec le reste du mood
    if content_set:
        p = os.path.join('content', mood, content_set, media_type)
        files = _list_dir(p, exts)
        result = [f'content/{mood}/{content_set}/{media_type}/{f}' for f in files]
        if media_type == 'stickers':
            result += _list_logos(mood, exts)
        if result:
            return result
        # Dossier catégorie vide : logos seuls (stickers) ou liste vide
        return result

    # Racine — pool de toutes les catégories du mood
    mood_path = os.path.join('content', mood)
    all_files: list[str] = []
    try:
        for cat in sorted(os.listdir(mood_path)):
            if not _is_category_dir(cat):
                continue
            cat_type = os.path.join(mood_path, cat, media_type)
            for f in _list_dir(cat_type, exts):
                all_files.append(f'content/{mood}/{cat}/{media_type}/{f}')
    except OSError:
        pass
    if all_files:
        if media_type == 'stickers':
            all_files += _list_logos(mood, exts)
        return all_files

    # Repli racine legacy
    if legacy_dir:
        files = _list_dir(legacy_dir, exts)
        return [f'{legacy_dir}/{f}' for f in files]

    return []


def _list_logos(mood: str, exts: frozenset) -> list[str]:
    """Retourne les logos depuis content/logos/{mood}/ (toujours inclus avec les stickers)."""
    logo_dir = os.path.join('content', 'logos', mood)
    files = _list_dir(logo_dir, exts)
    return [f'content/logos/{mood}/{f}' for f in files]


def get_available_content_sets(*moods: str) -> list[str]:
    """
    Découvre les catégories : sous-dossiers de content/{mood}/.
    Le nom du bouton = le nom du dossier (boom, jeux-video, …).
    """
    found: set[str] = set()
    for mood in moods:
        mood_dir = os.path.join('content', mood)
        if not os.path.isdir(mood_dir):
            continue
        try:
            for entry in os.scandir(mood_dir):
                if entry.is_dir() and _is_category_dir(entry.name):
                    found.add(entry.name)
        except OSError:
            pass
    return sorted(found)
