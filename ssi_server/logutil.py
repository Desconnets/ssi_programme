"""Logs terminal lisibles pour le mode LIVE (horodatage + préfixes courts)."""
from __future__ import annotations

import sys
import time
from datetime import datetime

# Horodatage perf pour les lignes [SSI·BOOT] (démarrage serveur)
_boot_t0: float | None = None


def _ts() -> str:
    return datetime.now().strftime('%H:%M:%S')


def _ts_ms() -> str:
    """Horodatage avec millisecondes — évite que plusieurs [SSI·LIVE] aient la même seconde."""
    return datetime.now().strftime('%H:%M:%S.%f')[:-3]


def info(msg: str) -> None:
    print(f'{_ts()}  [SSI]       {msg}', flush=True)


def warn(msg: str) -> None:
    print(f'{_ts()}  [SSI !]     {msg}', flush=True)


def api(msg: str) -> None:
    print(f'{_ts()}  [SSI·API]   {msg}', flush=True)


def live(msg: str) -> None:
    """Événements synchronisés depuis le navigateur (lecteur + phases stickers)."""
    print(f'{_ts_ms()}  [SSI·LIVE]  {msg}', flush=True)


def remote_cmd(msg: str) -> None:
    """POST télécommande phases — ligne courte, filtrable séparément de [SSI·LIVE]."""
    print(f'{_ts_ms()}  [SSI·TC]    {msg}', flush=True)


def pulse(msg: str) -> None:
    """Heartbeat serveur (uptime, mode) — voir SSI_SERVER_PULSE_SEC dans main."""
    print(f'{_ts_ms()}  [SSI·PULSE]  {msg}', flush=True)


def norm(msg: str) -> None:
    print(f'{_ts()}  [SSI·NORM]  {msg}', flush=True)


def http_error(msg: str) -> None:
    print(f'{_ts()}  [SSI·HTTP]  {msg}', file=sys.stderr, flush=True)


def http_media(msg: str) -> None:
    """Durée des GET musique / vidéos / virgules (voir SSI_HTTP_MEDIA_LOG=1)."""
    print(f'{_ts()}  [SSI·HTTP·MEDIA]  {msg}', flush=True)


def diag(msg: str) -> None:
    """Requêtes HTTP par thread + durée (voir SSI_DIAG=1)."""
    print(f'{_ts_ms()}  [SSI·DIAG]    {msg}', flush=True)


def sep(char: str = '─', width: int = 52) -> None:
    print(char * width, flush=True)


def boot_reset() -> None:
    """À appeler une fois au tout début de main() pour le chrono [SSI·BOOT]."""
    global _boot_t0
    _boot_t0 = time.perf_counter()


def boot(msg: str) -> None:
    """Étape de démarrage avec délai cumulé depuis boot_reset() (repère les goulots ffmpeg, etc.)."""
    global _boot_t0
    if _boot_t0 is None:
        boot_reset()
    dt = time.perf_counter() - _boot_t0
    print(f'{_ts()}  [SSI·BOOT] +{dt:7.2f}s  {msg}', flush=True)
