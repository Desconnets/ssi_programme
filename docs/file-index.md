# Index des fichiers du projet

> Référence complète de tous les fichiers de code et de configuration.  
> Pour comprendre le fonctionnement global : lire `docs/architecture.md` en premier.  
> Dernière mise à jour : juin 2026.

---

## Python — `ssi_server/`

### Cœur du serveur

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `server.py` *(racine)* | Lanceur minimal — appelle `ssi_server.main.main()`. Double-clic ou `python3 server.py`. | Rien — ne pas modifier |
| `ssi_server/__main__.py` | Permet `python3 -m ssi_server`. | Rien — ne pas modifier |
| `ssi_server/__init__.py` | Documentation du package : rôle de chaque fichier. | Mettre à jour quand on ajoute un fichier |
| `ssi_server/main.py` | Démarrage : conversion vidéos → inventaire → socket HTTP → ouverture navigateur. Contient le heartbeat `[SSI·PULSE]`. | Ajouter un bloc de démarrage (ex. autre conversion) |
| `ssi_server/handler.py` | Routeur HTTP : routes API GET/POST + filtre logs. Contient `_LIVE_EVENTS` (dict des events navigateur). | Ajouter une route API ou un event LIVE |
| `ssi_server/config.py` | Constantes serveur : `PORT` (3000), `ROOT_DIR`, `AUDIO_EXT`, `IMAGE_EXT`, `VIDEO_EXT`. | Changer le port ou ajouter une extension fichier |

### État + données

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `ssi_server/phase_remote_state.py` | **Source de vérité.** État partagé thread-safe : phase, thème, fond, mute, pause, idle, etc. GET → `get_snapshot()`, POST → `post_remote_payload()`. | Ajouter un réglage télécommande |
| `ssi_server/fsutil.py` | Liste les fichiers par extension. `list_files()` simple, `list_files_themed()` avec repli sur sous-dossier thème. Logue un warning sur erreur de permission. | Changer la logique de listage ou de thème |
| `ssi_server/phase_video_convert.py` | Conversion vidéos au démarrage via ffmpeg (MP4 H.264, audio conservé). Gère `phase_videos/`, `backgrounds/` et leurs sous-dossiers thème. Originaux → `_archive/`. | Changer les paramètres ffmpeg (qualité, résolution) |
| `ssi_server/normalize.py` | Utilitaires ffmpeg : `find_ffmpeg()`, `try_install_ffmpeg()`. (Les fonctions de normalisation audio sont dans `archive/playlist-mode/`) | Changer la détection de ffmpeg |

### Logs + rapport

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `ssi_server/logutil.py` | Toutes les fonctions de log avec préfixes horodatés. `info/warn` → `[SSI]`, `live` → `[SSI·LIVE]`, `remote_cmd` → `[SSI·TC]`, `boot` → `[SSI·BOOT]` avec chrono, etc. | Ajouter un nouveau préfixe de log |
| `ssi_server/live_report.py` | Inventaire au démarrage : comptages stickers/vidéos/fonds + alertes si dossier vide. Affiché entre `[SSI·BOOT]` et `[SSI·API]`. | Changer les messages d'inventaire |
| `ssi_server/runtime_config.py` | Mode audio. Retourne toujours `'micro'`. (La playlist est archivée dans `archive/playlist-mode/`) | Si on réactive la playlist |

---

## JavaScript — `js/`

### Point d'entrée

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `js/main.js` | Charge les médias, démarre le micro, lance le cycle visuel au 1er clic. Relie tous les modules. | Modifier l'initialisation au démarrage |
| `js/config.js` | Toutes les constantes JS : durées des phases, seuils beat, ratios fenêtre, intervalles. | Régler les durées (snake, boom, logo, webcam, etc.) |

### Moteur visuel

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `js/phases.js` | **Moteur des phases.** Snake → Super Boom → Fenêtre Vidéo → Logo → Webcam → (boucle). Télécommande + pause + boucle min Diagonal. | Ajouter ou modifier une phase |
| `js/visuals.js` | Boucle `requestAnimationFrame` : pulse fond au beat, shake fenêtre/webcam réactif au son, comportements stickers. | Modifier les réactions visuelles au son |
| `js/behaviors.js` | Comportements stickers réactifs au son (6 behaviors par `dataset.behavior`). | Ajouter un nouveau comportement sonore |
| `js/background-playback.js` | Fond vidéo : crossfade, rotation auto, pilotage par la télécommande. | Modifier le comportement du fond vidéo |

### Audio

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `js/audio.js` | Micro → AnalyserNode Web Audio. Fournit `getAudioLevels()` (bass, mid, high, overall, beat, bassBeat). | Modifier la sensibilité de l'analyse sonore |

### Télécommande

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `js/phase-remote.js` | Poll `GET /api/phase-remote` toutes les ~450 ms. Applique le thème, les phases, le mute, la pause, le fond. | Ajouter la lecture d'un nouveau champ serveur |
| `js/phase-panel-app.js` | Logique du panneau télécommande : boutons phases, thème SSI/Diagonal, fond, mute, pause, idle, journal. | Ajouter un contrôle dans le panneau |

### Utilitaires

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `js/api.js` | Charge les listes de médias au démarrage (`/api/stickers`, `/api/backgrounds`, `/api/phase-videos`). | Ajouter un fetch d'une nouvelle liste |
| `js/utils.js` | Fonctions mathématiques : `random()`, `lerp()`, `palier()`. | Ajouter une fonction utilitaire |
| `js/debug.js` | Niveaux de log console ajustables par URL (`?debug=1`, `?videoLog=1`, `?diag=1`). | Ajouter un flag debug |
| `js/live-telemetry.js` | Envoie `POST /api/live-log` au serveur Python → lignes `[SSI·LIVE]` dans le terminal. | Ajouter un event LIVE (+ entrée dans `_LIVE_EVENTS` de `handler.py`) |
| `js/browser-cache-warm.js` | Pré-remplit le cache HTTP navigateur (backgrounds + phase_videos) au démarrage. | Modifier le comportement de préchauffage |
| `js/sticker-fallback.js` | SVG de secours si le dossier stickers/ est vide ou qu'une image ne charge pas. Jamais de requête réseau. | Modifier le visuel de secours |
| `js/video-load-log.js` | Écoute les événements de chargement des `<video>` (loadstart, stalled, canplay) → console `[SSI·VIDEO]` si `?videoLog=1`. | Modifier le suivi de chargement vidéo |
| `js/video-lifecycle.js` | Envoie `video_ready` / `video_playing` vers le terminal Python dès que la vidéo est prête/lancée. | Modifier les marqueurs de cycle de vie vidéo |
| `js/webcam-grain.js` | Grain canvas (pixels aléatoires) au-dessus de la webcam — effet VHS/caméscope. | Régler l'intensité ou le style du grain |

---

## HTML

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `index.html` | Page scène (16:9). Contient les calques DOM : fond, stickers, fenêtres OS/webcam, overlay CRT, hint démarrage. | Ajouter un nouveau calque DOM (nouvelle phase) |
| `phase_panel.html` | Télécommande web. Sections : Thème, Actions (phases), Reprise auto, Vidéo, Fond, Journal. | Ajouter une section de contrôle |

---

## CSS

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `style.css` | Tout le style de la scène + télécommande. Thème SSI (défaut) + `[data-app-theme="diagonal"]` pour Diagonal Cinéma. Contient : `.scene` 16:9, dégradés, fenêtre OS, VHS overlay, CRT, beat overlay. | Modifier un style visuel ou ajouter un thème |

---

## Documentation

| Fichier | Contenu |
|---------|---------|
| `README.md` | Installation, lancement, comment ça marche, API, dossiers médias. |
| `docs/architecture.md` | Fonctionnement global du système (schémas, poll, thèmes, guides d'extension). |
| `docs/file-index.md` | Ce fichier — index de tous les fichiers. |
| `docs/remote-panel.md` | Guide détaillé pour étendre la télécommande (phases, champs POST, logs). |
| `CHANGELOG.md` | Journal chronologique de toutes les évolutions. |
| `ROADMAP.md` | Étapes techniques réalisées + pistes futures. |

---

## Dossiers médias — structure `content/`

```
content/
  logos/classique/        ← logos SSI (toujours inclus dans les stickers classique)
  logos/dark/             ← logos dark/techno
  classique/stickers/     boom/  jeux-video/  pop-culture/  doux/  [urban/]
  classique/videos/       boom/  jeux-video/  pop-culture/
  classique/backgrounds/  boom/  doux/  urban/  jeux-video/  pop-culture/
  dark/                   (mêmes sous-dossiers, fichiers _techno glitchés)
```

**Ajouter une catégorie** : créer le sous-dossier dans `content/classique/{type}/ma-categorie/` et `content/dark/{type}/ma-categorie/`. Bouton auto dans la télécommande.

**Ajouter un mood** : créer `content/nouveau-mood/`, ajouter `[data-app-theme="nouveau-mood"]` dans `style.css`, ajouter dans `VALID_MOODS` (`phase_remote_state.py`), bouton dans `phase_panel.html`.

## Archive

| Dossier | Contenu |
|---------|---------|
| `archive/playlist-mode/` | Code complet du mode Playlist archivé en juin 2026 (audio.js, main.js, etc.). Voir `archive/playlist-mode/README.txt` pour réactiver. |
| `archive/snapshot-2026-03-14-avant-decomposition/` | Ancien monolithe (`app.js`, `server.py`) avant la refonte en modules ES. |
