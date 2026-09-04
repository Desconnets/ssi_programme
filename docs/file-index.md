# Index des fichiers du projet

> Référence complète de tous les fichiers de code et de configuration.  
> Pour comprendre le fonctionnement global : lire `docs/architecture.md` en premier.  
> Dernière mise à jour : **septembre 2026**.

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
| `ssi_server/phase_remote_state.py` | **Source de vérité.** Phase, mood, catégorie, fond, mute, pause, idle, **luminosité webcam**, **overlay REC**. GET → `get_snapshot()`, POST → `post_remote_payload()`. | Ajouter un réglage télécommande |
| `ssi_server/fsutil.py` | `list_content_files()` : `content/{mood}/{catégorie}/{type}/`. `get_available_content_sets()` : boutons = noms de dossiers. Logos `content/logos/{mood}/`. | Changer le scan disque |
| `ssi_server/phase_video_convert.py` | Conversion ffmpeg au démarrage (MP4 H.264, audio conservé). Parcourt `content/{mood}/{cat}/videos|backgrounds/` + repli `phase_videos/` / `backgrounds/`. Originaux → `_archive/`. | Paramètres ffmpeg |
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
| `js/phases.js` | Moteur des phases + mute vidéo + **luminosité webcam** + **timecode REC**. | Ajouter ou modifier une phase |
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
| `js/phase-remote.js` | Poll ~450 ms. Applique mood, catégorie (recharge médias), mute, pause, fond, **webcamBrightness**, **webcamRecOverlay**. | Nouveau champ serveur |
| `js/phase-panel-app.js` | Panneau : phases, moods, catégories dynamiques, fond, mute, pause, idle, **luminosité webcam**, **REC**, journal. | Ajouter un contrôle |

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
| `index.html` | Scène 16:9 : fond, stickers, fenêtre OS, webcam (grain + overlay REC), CRT. | Nouveau calque DOM |
| `phase_panel.html` | Télécommande : Mood, Contenu, Actions, Reprise auto, Vidéo, **Webcam**, Fond, Journal. | Nouvelle section |

---

## CSS

| Fichier | Rôle | Modifier pour… |
|---------|------|----------------|
| `style.css` | Scène + overlay REC. Moods `[data-app-theme="classique"]` (défaut) et `[data-app-theme="dark"]`. | Style ou nouveau mood |

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
  classique/{catégorie}/  stickers/  videos/  backgrounds/
  dark/{catégorie}/       stickers/  videos/  backgrounds/
```

**Ajouter une catégorie** : créer `content/classique/ma-categorie/stickers/` (et `videos/`, `backgrounds/`). Le bouton s’appelle `ma-categorie`. Optionnel : le même dossier sous `content/dark/`.

**Ajouter un mood** : créer `content/nouveau-mood/`, ajouter `[data-app-theme="nouveau-mood"]` dans `style.css`, ajouter dans `VALID_MOODS` (`phase_remote_state.py`), bouton dans `phase_panel.html`.

## Archive

| Dossier | Contenu |
|---------|---------|
| `archive/playlist-mode/` | Code complet du mode Playlist archivé en juin 2026 (audio.js, main.js, etc.). Voir `archive/playlist-mode/README.txt` pour réactiver. |
| `archive/snapshot-2026-03-14-avant-decomposition/` | Ancien monolithe (`app.js`, `server.py`) avant la refonte en modules ES. |
