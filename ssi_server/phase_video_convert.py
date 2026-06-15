"""
phase_videos/ et backgrounds/ : export MP4 léger (H.264, avec audio si présent), même résolution.
L’original est déplacé dans <dossier>/_archive/ ; la sortie est « … ok_converti.mp4 ».
Ne bloque pas le démarrage du serveur si ffmpeg manque ou si un fichier échoue.
"""
import os
import subprocess
import time
import uuid

from .config import VIDEO_EXT
from .fsutil import list_files
from .logutil import norm, warn
from .normalize import find_ffmpeg, try_install_ffmpeg

PHASE_DIR = 'phase_videos'
BACKGROUNDS_DIR = 'backgrounds'
ARCHIVE_SUBDIR = '_archive'
OK_TAG = 'ok_converti'


def _unique_archive_path(archive_dir: str, filename: str) -> str:
    dest = os.path.join(archive_dir, filename)
    if not os.path.exists(dest):
        return dest
    root, ext = os.path.splitext(filename)
    return os.path.join(archive_dir, f'{root}_{uuid.uuid4().hex[:10]}{ext}')


def _stderr_tail(stderr: str, lines: int = 16) -> str:
    if not stderr or not stderr.strip():
        return '(ffmpeg n’a rien écrit sur stderr)'
    ls = stderr.strip().splitlines()
    return '\n'.join(ls[-lines:])


def _remove_if_exists(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def _encode_video_lite(ffmpeg: str, src_path: str, part_path: str, name: str) -> bool:
    """
    Plusieurs passes : certains .mov (QuickTime / écran) échouent avec le filtre scale.
    En cas d’échec, le stderr complet de la dernière tentative est logué.
    """
    src_abs = os.path.abspath(src_path)
    part_abs = os.path.abspath(part_path)

    attempts: list[tuple[str, list[str]]] = [
        (
            'H.264 + dimensions paires (yuv420p) — audio conservé si présent',
            [
                ffmpeg,
                '-hide_banner',
                '-y',
                '-i',
                src_abs,
                '-c:v',
                'libx264',
                '-crf',
                '26',
                '-preset',
                'medium',
                '-vf',
                'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
                '-movflags',
                '+faststart',
                # .mp4.part n’a pas l’extension reconnue par ffmpeg → forcer le muxer
                '-f',
                'mp4',
                part_abs,
            ],
        ),
        (
            'H.264 sans filtre scale (secours QuickTime / écran)',
            [
                ffmpeg,
                '-hide_banner',
                '-y',
                '-i',
                src_abs,
                '-c:v',
                'libx264',
                '-crf',
                '26',
                '-preset',
                'medium',
                '-pix_fmt',
                'yuv420p',
                '-movflags',
                '+faststart',
                '-f',
                'mp4',
                part_abs,
            ],
        ),
        (
            'piste vidéo 0 seule, preset fast',
            [
                ffmpeg,
                '-hide_banner',
                '-y',
                '-i',
                src_abs,
                '-map',
                '0:v:0',
                '-c:v',
                'libx264',
                '-crf',
                '28',
                '-preset',
                'fast',
                '-pix_fmt',
                'yuv420p',
                '-movflags',
                '+faststart',
                '-f',
                'mp4',
                part_abs,
            ],
        ),
    ]

    last_stderr = ''

    for label, cmd in attempts:
        _remove_if_exists(part_abs)
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
            )
        except OSError as e:
            warn(f'Impossible de lancer ffmpeg pour « {name} » : {e}')
            return False

        last_stderr = proc.stderr or ''
        if proc.returncode == 0 and os.path.exists(part_abs) and os.path.getsize(part_abs) > 0:
            if label != attempts[0][0]:
                norm(f'  → « {name} » : OK avec stratégie « {label} »')
            return True

    warn(
        f'Échec ffmpeg « {name} » — fichier laissé en place.\n'
        f'─── fin du message ffmpeg ───\n{_stderr_tail(last_stderr)}\n───'
    )
    _remove_if_exists(part_abs)
    return False


def _convert_directory_lite(directory: str) -> None:
    """
    Pour chaque vidéo à la racine du dossier (pas _archive/) :
    - ignore les fichiers déjà marqués ok_converti ;
    - si « nom ok_converti.mp4 » existe déjà, ignore ;
    - sinon encode en MP4 (H.264, audio conservé si présent), déplace l’original dans _archive/.
    """
    try:
        if not os.path.isdir(directory):
            return
    except OSError as e:
        warn(f'Dossier « {directory} » inaccessible : {e}')
        return

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        norm("ffmpeg introuvable → tentative d'installation…")
        if try_install_ffmpeg():
            ffmpeg = find_ffmpeg()

    if not ffmpeg:
        warn(
            f'ffmpeg indisponible — conversion « {directory}/ » ignorée '
            '(installez : brew install ffmpeg)'
        )
        return

    archive_dir = os.path.join(directory, ARCHIVE_SUBDIR)
    try:
        os.makedirs(archive_dir, exist_ok=True)
    except OSError as e:
        warn(f'Impossible de créer « {archive_dir} » : {e}')
        return

    t_dir = time.perf_counter()
    all_names = list_files(directory, VIDEO_EXT)
    norm(
        f'Scan « {directory}/ » : {len(all_names)} vidéo(s) listée(s) '
        f'— export MP4 (H.264, audio conservé), archives → {directory}/{ARCHIVE_SUBDIR}/'
    )

    n_skip_tag = 0
    n_skip_done = 0
    n_converted = 0

    for name in all_names:
        root, ext = os.path.splitext(name)
        if OK_TAG in root.lower():
            n_skip_tag += 1
            continue

        out_name = f'{root} {OK_TAG}.mp4'
        out_path = os.path.join(directory, out_name)
        if os.path.exists(out_path):
            n_skip_done += 1
            continue

        src_path = os.path.join(directory, name)
        part_path = out_path + '.part'

        norm(f'Conversion « {directory}/{name} » → « {out_name} »…')
        t_one = time.perf_counter()

        if not _encode_video_lite(ffmpeg, src_path, part_path, name):
            continue

        if not os.path.exists(part_path) or os.path.getsize(part_path) == 0:
            warn(f'Sortie vide pour « {name} » — annulation.')
            _remove_if_exists(part_path)
            continue

        arch_path = _unique_archive_path(archive_dir, name)
        try:
            os.rename(src_path, arch_path)
        except OSError as e:
            warn(f'Archivage impossible « {name} » : {e}')
            _remove_if_exists(part_path)
            continue

        try:
            os.rename(part_path, out_path)
            n_converted += 1
            norm(
                f'OK « {out_name} » (original → {ARCHIVE_SUBDIR}/{os.path.basename(arch_path)}) '
                f'— encodage + déplacement : {time.perf_counter() - t_one:.1f}s'
            )
        except OSError as e:
            warn(f'Renommage sortie impossible : {e}')
            try:
                os.rename(arch_path, src_path)
            except OSError:
                pass
            _remove_if_exists(part_path)

    norm(
        f'Bilan « {directory}/ » : {n_skip_tag} fichier(s) déjà tagué(s) ok_converti, '
        f'{n_skip_done} déjà converti(s) (skip), {n_converted} converti(s) cette fois '
        f'— total dossier {time.perf_counter() - t_dir:.1f}s'
    )


def _convert_theme_subdirs(directory: str) -> None:
    """Convertit aussi les sous-dossiers thème (ssi/, diagonal/, …) sauf _archive/."""
    try:
        entries = os.listdir(directory)
    except OSError:
        return
    for entry in sorted(entries):
        if entry.startswith('_'):
            continue
        subdir = os.path.join(directory, entry)
        if os.path.isdir(subdir):
            _convert_directory_lite(subdir)


def convert_phase_videos_lite() -> None:
    _convert_directory_lite(PHASE_DIR)
    _convert_theme_subdirs(PHASE_DIR)


def convert_backgrounds_lite() -> None:
    _convert_directory_lite(BACKGROUNDS_DIR)
    _convert_theme_subdirs(BACKGROUNDS_DIR)


def safe_convert_phase_videos_lite() -> None:
    try:
        convert_phase_videos_lite()
    except Exception as e:
        warn(f'Erreur globale conversion phase_videos : {e}')


def safe_convert_backgrounds_lite() -> None:
    try:
        convert_backgrounds_lite()
    except Exception as e:
        warn(f'Erreur globale conversion backgrounds : {e}')
