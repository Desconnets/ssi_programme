"""Liste de fichiers et sous-dossiers — accès à la structure content/."""
import errno
import os

# Noms réservés exclus des listes de content sets
_EXCLUDED_SUBDIRS = frozenset({'_archive', 'classique', 'dark'})


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


def list_content_files(media_type: str, exts: frozenset,
                       content_set: str = '', mood: str = 'classique',
                       legacy_dir: str = '') -> list[str]:
    """
    Retourne des chemins complets relatifs à ROOT_DIR pour les fichiers médias.

    Priorité (3 niveaux) :
      1. content/{mood}/{media_type}/{content_set}/  — set précis
      2. content/{mood}/{media_type}/               — pool général (tous sous-dossiers mélangés)
      3. {legacy_dir}/                              — repli racine (fichiers non-organisés)

    Pour les stickers uniquement, les logos de content/logos/{mood}/ sont toujours inclus
    (la phase logo les retrouve via le mot-clé "logo" dans le nom de fichier).

    Exemple de retour : ['content/classique/videos/boom/daft_punk ok_converti.mp4']
    → URL : /content/classique/videos/boom/daft_punk ok_converti.mp4
    """
    # Niveau 1 — content set précis
    if content_set:
        p = os.path.join('content', mood, media_type, content_set)
        files = _list_dir(p, exts)
        if files:
            result = [f'content/{mood}/{media_type}/{content_set}/{f}' for f in files]
            # Toujours ajouter les logos si on charge des stickers
            if media_type == 'stickers':
                result += _list_logos(mood, exts)
            return result

    # Niveau 2 — pool du mood : fichiers directs + tous les sous-dossiers mélangés
    base = os.path.join('content', mood, media_type)
    all_files: list[str] = []
    for f in _list_dir(base, exts):
        all_files.append(f'content/{mood}/{media_type}/{f}')
    try:
        for sub in sorted(os.listdir(base)):
            sub_path = os.path.join(base, sub)
            if os.path.isdir(sub_path) and not sub.startswith('_'):
                for f in _list_dir(sub_path, exts):
                    all_files.append(f'content/{mood}/{media_type}/{sub}/{f}')
    except OSError:
        pass
    if all_files:
        if media_type == 'stickers':
            all_files += _list_logos(mood, exts)
        return all_files

    # Niveau 3 — repli racine legacy
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
    Découvre automatiquement les content sets disponibles en scannant
    content/{mood}/{media_type}/ pour chaque mood donné.
    Retourne la liste triée et dédupliquée (ex. ['boom', 'doux', 'jeux-video', ...]).
    """
    found: set[str] = set()
    for mood in moods:
        mood_dir = os.path.join('content', mood)
        if not os.path.isdir(mood_dir):
            continue
        for media_type in ('stickers', 'videos', 'backgrounds'):
            mt_dir = os.path.join(mood_dir, media_type)
            try:
                for entry in os.scandir(mt_dir):
                    if entry.is_dir() and not entry.name.startswith('_') \
                            and entry.name not in _EXCLUDED_SUBDIRS:
                        found.add(entry.name)
            except OSError:
                pass
    return sorted(found)
