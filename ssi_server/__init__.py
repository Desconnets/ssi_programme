"""
Package ssi_server — Serveur HTTP du programme de scène live SSI / Diagonal Cinéma.

Lancement
---------
    python3 server.py          (lanceur racine)
    python3 -m ssi_server      (équivalent via le package)
    Double-clic sur Lancer.command (macOS)

Fichiers du package
-------------------
main.py
    Point d'entrée principal. Orchestre le démarrage :
    conversion vidéos → inventaire → ouverture socket HTTP → ouverture navigateur.
    C'est ici qu'on ajouterait un nouveau bloc de démarrage.

handler.py
    Routeur HTTP. Traite toutes les requêtes GET/POST :
    - Fichiers statiques (HTML, JS, CSS, médias)
    - Routes API JSON (/api/stickers, /api/backgrounds, /api/phase-videos,
      /api/phase-remote, /api/health)
    - Route POST /api/live-log (events du navigateur → terminal)
    Pour ajouter une route : un bloc `if path == '/api/xxx':` dans _do_get() ou _do_post().
    Pour ajouter un event LIVE : une ligne dans le dict _LIVE_EVENTS.

phase_remote_state.py
    SOURCE DE VÉRITÉ du programme. Contient tout l'état partagé entre la scène et
    la télécommande : phase active, thème, fond, mute, pause, délai idle, etc.
    Thread-safe (verrous). GET → get_snapshot(), POST → post_remote_payload().
    Pour ajouter un réglage télécommande : commencer ici.

phase_video_convert.py
    Conversion des vidéos au démarrage : MP4 H.264 via ffmpeg.
    Traite phase_videos/, backgrounds/ et leurs sous-dossiers thème.
    L'original est déplacé dans _archive/. Si ffmpeg est absent, le serveur démarre quand même.

fsutil.py
    Utilitaires de listage de fichiers par extension.
    list_files()           → liste simple dans un dossier (legacy/fallback)
    list_content_files()   → liste depuis content/{mood}/{type}/{content_set}/ avec repli 3 niveaux
    get_available_content_sets() → découverte auto des content sets disponibles

normalize.py
    Utilitaires ffmpeg : find_ffmpeg(), try_install_ffmpeg().
    (Les fonctions de normalisation audio sont archivées dans archive/playlist-mode/)

live_report.py
    Inventaire des fichiers au démarrage : comptages + alertes si dossier vide.
    Affiché dans le terminal au lancement, entre [SSI·BOOT] et [SSI·API].

logutil.py
    Fonctions de log avec préfixes horodatés :
    info/warn         → [SSI] / [SSI !]      infos générales et alertes
    api               → [SSI·API]            requêtes API (GET /api/*)
    live              → [SSI·LIVE]           events navigateur (phases, vidéos)
    remote_cmd        → [SSI·TC]             commandes télécommande POST
    pulse             → [SSI·PULSE]          heartbeat (uptime)
    boot              → [SSI·BOOT]           étapes de démarrage avec chrono
    norm              → [SSI·NORM]           conversion ffmpeg
    http_error        → [SSI·HTTP] (stderr)  erreurs 404/500
    diag              → [SSI·DIAG]           debug verbose (SSI_DIAG=1)
    http_media        → [SSI·HTTP·MEDIA]     durées GET vidéos (SSI_HTTP_MEDIA_LOG=1)

config.py
    Constantes du serveur : PORT (3000), ROOT_DIR, extensions fichiers acceptées
    (AUDIO_EXT, IMAGE_EXT, VIDEO_EXT).

runtime_config.py
    Mode audio. Retourne toujours 'micro' — la playlist est archivée.

__main__.py
    Permet l'invocation `python3 -m ssi_server` (appelle main.py).
"""
