#!/usr/bin/env python3
"""
Serveur local : sert l'app + les dossiers musique/, stickers/, virgules/, backgrounds/
API : GET /api/tracks, /api/stickers, /api/virgules, /api/backgrounds
Lancer avec : python3 server.py
"""
import json
import os
import subprocess
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 3000
AUDIO_EXT = {'.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'}
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
VIDEO_EXT = {'.mp4', '.webm', '.mov', '.m4v'}


def list_files(directory, exts):
    try:
        names = os.listdir(directory)
        return sorted(
            n for n in names
            if os.path.splitext(n)[1].lower() in exts
        )
    except OSError:
        return []


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_GET(self):
        if self.path == '/api/tracks':
            files = list_files('musique', AUDIO_EXT)
            urls = [f'/musique/{urllib.parse.quote(f)}' for f in files]
            self.send_json(urls)
            return
        if self.path == '/api/stickers':
            files = list_files('stickers', IMAGE_EXT)
            urls = [f'/stickers/{urllib.parse.quote(f)}' for f in files]
            self.send_json(urls)
            return
        if self.path == '/api/backgrounds':
            files = list_files('backgrounds', VIDEO_EXT)
            urls = [f'/backgrounds/{urllib.parse.quote(f)}' for f in files]
            self.send_json(urls)
            return
        if self.path == '/api/virgules':
            files = list_files('virgules', AUDIO_EXT)
            urls = [f'/virgules/{urllib.parse.quote(f)}' for f in files]
            self.send_json(urls)
            return
        super().do_GET()

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def find_ffmpeg():
    """
    Retourne le chemin vers ffmpeg s'il est disponible, sinon None.
    Cherche d'abord dans le PATH, puis dans les emplacements Homebrew connus.
    """
    candidates = [
        'ffmpeg',
        '/opt/homebrew/bin/ffmpeg',   # Homebrew Apple Silicon
        '/usr/local/bin/ffmpeg',       # Homebrew Intel
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


def try_install_ffmpeg():
    """Tente d'installer ffmpeg via Homebrew si disponible."""
    try:
        subprocess.run(
            ['/opt/homebrew/bin/brew', '--version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        print('[NORMALISATION] Installation de ffmpeg via Homebrew…')
        subprocess.run(['/opt/homebrew/bin/brew', 'install', 'ffmpeg'], check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    # Essayer aussi brew dans le PATH
    try:
        subprocess.run(
            ['brew', '--version'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        print('[NORMALISATION] Installation de ffmpeg via Homebrew…')
        subprocess.run(['brew', 'install', 'ffmpeg'], check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        pass
    return False


def normalize_audio_in_directory(directory: str) -> None:
    """
    Normalise les fichiers audio d'un dossier pour diffusion sur enceintes.
    - Utilise ffmpeg avec un filtre loudnorm (-14 LUFS).
    - Crée un nouveau fichier avec " normalisation ok" avant l'extension.
    - Ne renormalise pas les fichiers déjà marqués.
    """
    if not os.path.isdir(directory):
        return

    ffmpeg = find_ffmpeg()

    if not ffmpeg:
        print(f'[NORMALISATION] ffmpeg introuvable, tentative d\'installation automatique…')
        if try_install_ffmpeg():
            ffmpeg = find_ffmpeg()

    if not ffmpeg:
        print(
            f'[NORMALISATION] ffmpeg indisponible, normalisation ignorée pour « {directory} ».\n'
            f'                Installe ffmpeg manuellement : brew install ffmpeg'
        )
        return

    print(f'[NORMALISATION] Vérification des fichiers audio dans « {directory} »…')

    for name in list_files(directory, AUDIO_EXT):
        root, ext = os.path.splitext(name)

        if 'normalisation ok' in root.lower():
            continue

        normalized_name = f'{root} normalisation ok{ext}'
        normalized_path = os.path.join(directory, normalized_name)

        if os.path.exists(normalized_path):
            continue

        src_path = os.path.join(directory, name)
        print(f'[NORMALISATION] Normalisation de « {name} »…')

        cmd = [
            ffmpeg, '-y', '-i', src_path,
            '-af', 'loudnorm=I=-14:LRA=11:TP=-1.5',
            normalized_path,
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f'[NORMALISATION] OK → « {normalized_name} »')
        except subprocess.CalledProcessError:
            print(f'[NORMALISATION] Échec pour « {name} », fichier inchangé.')
            if os.path.exists(normalized_path):
                os.remove(normalized_path)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    normalize_audio_in_directory('musique')
    normalize_audio_in_directory('virgules')

    server = HTTPServer(('', PORT), Handler)
    print(
        f'\n  Playlist visuelle années 2000\n'
        f'  http://localhost:{PORT}\n'
        f'  musique/ · virgules/ · stickers/ · backgrounds/\n'
    )
    server.serve_forever()
