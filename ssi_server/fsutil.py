"""Liste de fichiers par extension (chemins relatifs à la cwd du processus)."""
import errno
import os


def list_files(directory: str, exts: frozenset) -> list:
    try:
        names = os.listdir(directory)
        return sorted(
            n for n in names
            if os.path.splitext(n)[1].lower() in exts
        )
    except OSError as e:
        # Dossier inexistant : normal (peut ne pas encore exister) — silencieux.
        # Dossier illisible (permissions) : avertir pour ne pas partir en débogage aveugle.
        if e.errno not in (errno.ENOENT, errno.ENOTDIR):
            from .logutil import warn
            warn(f'Impossible de lire « {directory}/ » ({e}) — liste retournée vide.')
        return []


def list_files_themed(directory: str, exts: frozenset, theme: str = '') -> list:
    """
    Retourne les fichiers depuis `directory/{theme}/` si ce sous-dossier existe et contient
    des fichiers reconnus. Sinon, replie sur `directory/`.

    Les chemins retournés sont relatifs à `directory` (ex. `'ssi/video.mp4'` ou `'video.mp4'`).
    """
    if theme:
        themed_dir = os.path.join(directory, theme)
        if os.path.isdir(themed_dir):
            try:
                names = os.listdir(themed_dir)
                files = sorted(n for n in names if os.path.splitext(n)[1].lower() in exts)
                if files:
                    return [os.path.join(theme, f).replace(os.sep, '/') for f in files]
            except OSError as e:
                if e.errno not in (errno.ENOENT, errno.ENOTDIR):
                    from .logutil import warn
                    warn(f'Impossible de lire « {themed_dir}/ » ({e}) — repli sur racine.')
    return list_files(directory, exts)
