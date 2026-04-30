"""Normalisation loudness (ffmpeg) — ne doit pas empêcher le démarrage du serveur."""
import os
import subprocess
import time

from .fsutil import list_files
from .config import AUDIO_EXT
from .logutil import norm, warn


def find_ffmpeg():
    """Chemin vers ffmpeg ou None."""
    candidates = [
        'ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
    ]
    for candidate in candidates:
        try:
            subprocess.run(
                [candidate, '-version'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return candidate
        except (FileNotFoundError, subprocess.CalledProcessError):
            continue
    return None


def try_install_ffmpeg() -> bool:
    """Tente brew install ffmpeg si Homebrew est présent."""
    try:
        subprocess.run(
            ['/opt/homebrew/bin/brew', '--version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        norm('Installation de ffmpeg via Homebrew…')
        subprocess.run(['/opt/homebrew/bin/brew', 'install', 'ffmpeg'], check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    try:
        subprocess.run(
            ['brew', '--version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        norm('Installation de ffmpeg via Homebrew…')
        subprocess.run(['brew', 'install', 'ffmpeg'], check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    return False


def normalize_audio_in_directory(directory: str) -> None:
    """
    Normalise les fichiers audio (loudnorm -14 LUFS).
    Crée des fichiers « … normalisation ok.ext ».
    """
    try:
        if not os.path.isdir(directory):
            return
    except OSError as e:
        warn(f'Dossier « {directory} » inaccessible : {e}')
        return

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        norm('ffmpeg introuvable → tentative d\'installation automatique…')
        if try_install_ffmpeg():
            ffmpeg = find_ffmpeg()

    if not ffmpeg:
        warn(
            f'ffmpeg indisponible — normalisation ignorée pour « {directory} » '
            f'(installez : brew install ffmpeg)'
        )
        return

    t0 = time.perf_counter()
    names = list_files(directory, AUDIO_EXT)
    norm(f'Scan audio « {directory}/ » : {len(names)} fichier(s) listé(s)')

    n_skip_tag = 0
    n_skip_exists = 0
    n_encoded = 0

    for name in names:
        try:
            root, ext = os.path.splitext(name)

            if 'normalisation ok' in root.lower():
                n_skip_tag += 1
                continue

            normalized_name = f'{root} normalisation ok{ext}'
            normalized_path = os.path.join(directory, normalized_name)

            if os.path.exists(normalized_path):
                n_skip_exists += 1
                continue

            src_path = os.path.join(directory, name)
            norm(f'Normalise « {name} »…')
            t_one = time.perf_counter()

            cmd = [
                ffmpeg, '-y', '-i', src_path,
                '-af', 'loudnorm=I=-14:LRA=11:TP=-1.5',
                normalized_path,
            ]
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                n_encoded += 1
                norm(
                    f'OK → « {normalized_name} » (encodage loudnorm : {time.perf_counter() - t_one:.1f}s)'
                )
            except subprocess.CalledProcessError:
                warn(f'Échec « {name} » — fichier inchangé.')
                if os.path.exists(normalized_path):
                    try:
                        os.remove(normalized_path)
                    except OSError:
                        pass
        except OSError as e:
            warn(f'Erreur sur « {name} » : {e}')

    elapsed = time.perf_counter() - t0
    norm(
        f'Bilan « {directory}/ » : {n_skip_tag} déjà marqué(s) « normalisation ok », '
        f'{n_skip_exists} paire(s) déjà présente(s) (skip), {n_encoded} encodé(s) maintenant '
        f'— total dossier {elapsed:.1f}s'
    )


def safe_normalize_audio_in_directory(directory: str) -> None:
    """Une erreur inattendue sur tout le dossier ne fait pas planter le serveur."""
    try:
        normalize_audio_in_directory(directory)
    except Exception as e:
        warn(f'Erreur globale normalisation « {directory} » : {e}')
