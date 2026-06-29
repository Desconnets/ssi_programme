# Changelog

## [Juin 2026 — v2] — Système de contenu par mood et catégories

### Architecture `content/`
Refonte complète de l'organisation des médias. Tout le contenu est sous `content/` :

```
content/
  logos/classique/   ← SSI-logo1 à 4
  logos/dark/        ← SSI-logo_techno ×2
  classique/stickers/  boom/  jeux-video/  pop-culture/  doux/
  classique/videos/    boom/  jeux-video/  pop-culture/
  classique/backgrounds/  boom/  doux/  urban/  jeux-video/  pop-culture/
  dark/stickers/    (mêmes catégories, fichiers _techno glitchés)
  dark/videos/      (mêmes catégories, fichiers _techno)
  dark/backgrounds/ (mêmes catégories)
```

### Moods (remplacent ssi/diagonal)
- **classique** — charte SSI violet/turquoise/rose, effets normaux
- **dark** — version _techno glitchée, ambiance électrique

### 5 catégories de contenu
`boom` · `jeux-video` · `pop-culture` · `urban` · `doux`

### Nouvelles features
- Boutons mood + content set dynamiques sur la télécommande (auto-détectés depuis les sous-dossiers)
- Chargement 3 niveaux : `content/{mood}/{type}/{set}/` → pool mood → racine legacy
- Logos séparés dans `content/logos/`, toujours inclus avec les stickers
- Conversion automatique étendue à tout `content/*/videos/` et `content/*/backgrounds/`

### Bugs corrigés
- Rechargement stickers au changement de mood (flag calculé avant mise à jour d'état)
- Boom et fenêtre vidéo simultanés (animateStickersOut callback)
- Boutons mood envoyaient encore 'ssi'/'diagonal'

### À faire
- 🎨 Revoir le design CSS du mood dark (plus intense, plus électrique)
- 🎬 Nouvelles animations dédiées dark (ultérieur)

---

## [Juin 2026] — Audit + documentation + identité du programme

| Sujet | Détail |
|--------|--------|
| **Identité du programme** | Renommé « Programme de scène live SSI & Diagonal Cinéma ». `index.html` : titre « SSI — Scène Live ». `phase_panel.html` : « SSI / Diagonal — Télécommande live ». `README.md` : intro complète avec schéma d'architecture et description des deux thèmes. |
| **Nouveau guide architecture** | `docs/architecture.md` — décrit tout le système (serveur, scène, télécommande, poll, thèmes, dossiers médias) pour toute personne reprenant le code. |
| **En-têtes fichiers** | `phases.js`, `phase_remote_state.py`, `handler.py`, `audio.js` : docstrings mis à jour avec le rôle précis, le guide d'extension, et les sections du fichier. |
| **Audit nettoyage** | Références mortes supprimées : routes `/api/tracks` `/api/virgules` `/api/settings`, 13 handlers d'events playlist, compteurs tracks/virgules dans health, `AUDIO_EXT` dans handler, pattern `/api/settings` dans QUIET_OK, `playlist-order.js`, fonctions audio mortes dans `normalize.py`. |
| **Améliorations lisibilité** | `handler.py` `_print_live_event` : 70 lignes → dict `_LIVE_EVENTS` (1 ligne par event, extensible). `phases.js` : 9 sections `═══` pour naviguer dans le fichier de 1 430 lignes. |

---

## [Juin 2026] — Archivage playlist + vidéos avec audio

| Sujet | Détail |
|--------|--------|
| **Playlist archivée** | Mode Playlist (musique/, virgules/, mini-contrôles) mis en veille. Code complet dans `archive/playlist-mode/` (audio.js, api.js, main.js, playlist-order.js, runtime_config.py, index.html). Réactivable : voir `archive/playlist-mode/README.txt`. |
| **Mode micro exclusif** | Le serveur démarre toujours en mode micro — plus de prompt `[1] Playlist / [2] Micro`. `ssi_server/runtime_config.py` simplifié (retourne toujours `'micro'`). Normalisation `musique/` + `virgules/` supprimée du démarrage. |
| **Mini-contrôles retirés** | Boutons prev/play/next/fullscreen supprimés de `index.html` et `style.css`. Code archivé. |
| **Vidéos avec audio** | `phase_video_convert.py` conserve désormais la piste audio lors de la conversion (flag `-an` retiré). Les nouvelles vidéos déposées dans `phase_videos/` gardent leur son. |
| **Bouton Muet télécommande** | Case à cocher **🔇 Muet** dans la section Vidéo de `phase_panel.html`. POST `{ videoMuted: true/false }` → appliqué en temps réel via `phase-remote.js` → `setOsWindowVideoMuted()` dans `phases.js`. Muet par défaut (`videoMuted: true`). |
| **Nettoyage config.js** | Constantes playlist (JINGLE_*, MUSIC_*, TRACKS_PER_JINGLE, PLAYLIST_*) archivées. `browser-cache-warm.js` simplifié (plus de warm virgules/tracks). |
| **Audit** | Suppression des imports morts (`normalize.py`, `prompt_audio_input_choice`, constantes playlist), unification du warm cache. |

---

> **Dernière mise à jour : avril 2026** — voir aussi `ROADMAP.md` pour les étapes techniques et `README.md` pour l'usage.

---

## [Avril 2026] — Design Diagonal Cinéma + finitions

| Sujet | Détail |
|--------|--------|
| **Fenêtre OS — thème Diagonal** | Bordure noire `2px solid #000`, fond quasi-blanc, barre titre rose pâle `#ffc8e8`, dots uniformes rose `#ffb0d8` + contour noir. Ombre plate graphique (`4px 4px 0 #000`). Typographie **Comic Sans MS** gras, texte `★ La Boum du Diago ★` via pseudo-élément CSS. |
| **Layer TV au-dessus de la vidéo (Diagonal)** | Overlay scanlines + vignette sur `#ssiOsWindowLayer .ssi-os-video-shell::after` (z-index local 6). Animation `diagonalTvPulse` fluide (3,6 s, pas de `steps()`). |
| **Webcam style dessin animé (Diagonal)** | Filtre `grayscale(1) contrast(3.2) brightness(1.18)` sur la vidéo webcam — rendu aplats noir/blanc façon série *Samuel* (Émilie Tronche / Les Valseurs). Overlay VHS neutralisé (scanlines noires, pas de teinte). |
| **Beat overlay plus fluide (Diagonal)** | Fondu retour `0.55 s ease-in-out` (flash cinéma) au lieu de `0.16 s`. |
| **Boucle vidéo phase OS (Diagonal)** | Constante `OS_WINDOW_DIAGONAL_MIN_LOOP_MS = 30 000 ms` — la vidéo reboucle automatiquement jusqu'à ce seuil. Setter `setOsWindowMinLoopMs()` dans `phases.js`, appelé par `phase-remote.js` au changement de thème. |
| **Support GIF dans phase_videos/ et backgrounds/** | Ajout de `.gif` à `VIDEO_EXT` dans `ssi_server/config.py`. ffmpeg convertit automatiquement les GIFs en MP4 H.264 au démarrage. |
| **Conversion automatique dans les sous-dossiers thèmes** | `phase_video_convert.py` : `_convert_theme_subdirs()` parcourt `phase_videos/ssi/`, `phase_videos/diagonal/`, etc. au démarrage. |
| **Logo de la phase logo** | Vient du dossier stickers actif (fichier avec `ssi-logo` ou `logo` dans le nom). Pour Diagonal : déposer `logo-diagonal.gif` dans `stickers/diagonal/`. |
| **Documentation renommée** | `HISTORIQUE.md` → `CHANGELOG.md` · `PLAN.md` → `ROADMAP.md` · `docs/TELECOMMANDE-EXTENSION.md` → `docs/remote-panel.md`. Toutes les références internes mises à jour. |
| **GitHub public** | Ajout `.gitignore` (médias, cache Python, macOS, Node). |

---

## [Avril 2026] — Thèmes multi-salles (SSI / Diagonal Cinéma)

| Sujet | Détail |
|--------|--------|
| **Thèmes identité** | Champ **`theme`** (`"ssi"` \| `"diagonal"`) dans `phase_remote_state.py`. POST `{ "theme": "diagonal" }` bascule couleurs + médias instantanément. Côté scène : `document.documentElement.dataset.appTheme` → règles CSS `[data-app-theme="diagonal"]` dans `style.css` (gradients, fenêtre OS, beat, CRT, hint, bandeau). |
| **Bibliothèques de médias par thème** | Sous-dossiers `stickers/ssi/`, `stickers/diagonal/`, `phase_videos/ssi/`, `phase_videos/diagonal/`, `backgrounds/ssi/`, `backgrounds/diagonal/`. Si le sous-dossier n'existe pas → replie sur le dossier racine. Fonction **`list_files_themed()`** dans `ssi_server/fsutil.py`. Caches `phase_remote_state` invalides au changement de thème. |
| **Rechargement automatique** | À chaque changement de thème détecté dans `js/phase-remote.js` : re-fetch `/api/stickers`, `/api/phase-videos`, `/api/backgrounds` → `initStickers()`, `initPhaseVideos()`, **`reloadBackgrounds()`** (nouveau export `background-playback.js`). |
| **Panneau télécommande** | Section **« Thème / Identité »** dans `phase_panel.html` : bouton **SSI** (violet/turquoise) + bouton **Diagonal Cinéma** (rose `#f040b0`). Bouton actif mis en évidence. Sync à l'ouverture du panneau. |
| **Palette Diagonal Cinéma** | Rose magenta **`#f040b0`** · noir **`#000000`** · blanc **`#ffffff`** (d'après affiche « La Boum de Samuel », Les Valseurs). |
| **Lanceur macOS** | **`Lancer.command`** à la racine du projet — double-clic dans le Finder → Terminal + serveur Python + ouverture auto navigateur (scène + télécommande). Exécutable (`chmod +x`). |

---

## [Mars–Avril 2026] — Télécommande, vidéos, audio

| Sujet | Détail |
|--------|--------|
| **Cycle visuel** | Enchaînement : **Snake** → **Super boom** → **Fenêtre OS + vidéo** (`phase_videos/`) → **Logo** → **Webcam** (VHS) → Snake. |
| **Vidéos de phase** | File **figée au Super boom** + `<video>` caché. Warm **`browser-cache-warm.js`**. **LIVE** : `video_ready` / `video_playing` (horodatage ISO + perf ms). **`video-lifecycle.js`** + **`video-load-log.js`** (AbortController si changement de `src`). Console : défaut calme ; `?debug=1` / `?videoLog=1` / `?mediaTrace=1`. |
| **Webcam** | Permission demandée **tôt** (`queueMicrotask` au chargement du module + **premier `pointerdown`** en capture) ; flux mis de côté pour la phase ; re-`getUserMedia` silencieux sur les tours suivants si besoin. |
| **LIVE Python** | Événements `os_window`, `os_window_skip`, `os_window_fail`, `webcam_phase`, `webcam_phase_skip`. |
| **API** | `GET /api/phase-videos`, `GET /api/settings` ; `GET /api/health` inclut `phaseVideos`. Détail télécommande → ligne suivante. |
| **Télécommande phases** | **`GET`/`POST /api/phase-remote`** ; `panelPhases` + `PANEL_PHASE_*` dans **`phase_remote_state.py`**. **`phaseCommandSeq`** : n’augmente que si le POST contient **`phase`** — la scène ne rejoue pas la phase sur un POST « fond » seul. Fond scène via API : **`bgGradientOpacity`**, **`backgroundAutoRotate`**, **`backgroundVideoIndex`** + **`js/background-playback.js`** (crossfade, rotation auto). **`idleResumeMs`** (défaut 60 s côté serveur) : délai avant **reprise auto** de la boucle snake ; réglable dans **`phase_panel.html`** (section « Reprise auto ») ; POST **uniquement** `idleResumeMs` ne réinitialise pas `seq` / `lastCommandMs`. Repli client : **`PHASE_REMOTE_IDLE_RESUME_MS`** dans **`js/config.js`** si champ absent. Panneau **`phase_panel.html`** + **`js/phase-panel-app.js`** ; scène **`js/phase-remote.js`** (poll, idle, onglet masqué). Extension : **`docs/remote-panel.md`**. **`SSI_PHASE_PANEL`**, **`[SSI·TC]`**, cache listes `phase_videos/` / `backgrounds/`. |
| **Historique Git** | Le dossier projet peut être **sans dépôt Git** : la trace documentaire est ce fichier + `README.md` / `ROADMAP.md`. |
| **1er chargement page** | **Audio** : pas de `resume().then(play)` — `play` dans la même pile synchrone que le clic ; **`ssi-app-init-pending`** le temps du `loadFromServer()` (mini-contrôles grisés). **Fond** : `canplay` + `preload` / `fetchpriority` + `<link rel=preload as=video>`. |
| **Vidéos (navigateur)** | Console **`[SSI·VIDEO]`** ; **pas** de `<link rel=preload as=video>` (Chrome). **Prefetch phase** : libération du `<video>` caché **avant** la fenêtre OS pour éviter conflit **2× même URL** + `play()` refusé ; échec `play()` → **fichier suivant** dans la file avant logo. |
| **Playlist / tour audio** | Chaque MP3 **une fois** par tour puis nouveau tour ; **pas** lié au cycle visuel. Stratégie configurable : **`js/config.js`** (`PLAYLIST_ORDER_MODE` : `shuffle_once` \| `api_order` \| `custom` + `PLAYLIST_CUSTOM_ORDER`) ; implémentation **`js/playlist-order.js`**. LIVE : `playlist_tour_complete` (+ `mode`). |
| **Audio Web / silence** | Enchaînement **auto** (fin morceau → crossfade) sans geste : si **AudioContext** suspendu (onglet arrière-plan, économie d’énergie), `play()` peut réussir mais les **rampes de gain** ne bougent pas → silence jusqu’à un clic. Corrigé par **`resume()`** après chaque `play()` réussi + hooks **visibility / focus / pageshow** ; LIVE `audio_context_blocked` si toujours bloqué. |

---

## Journal des mises à jour

Les entrées regroupent les évolutions majeures du projet (fonctionnelles et refonte code).

### Fonctionnel & contenu

| Thème | Description |
|--------|-------------|
| **Playlist** | Fichiers dans `musique/` ; tour complet puis suivant (mélange / ordre API / ordre perso via `config.js` + `playlist-order.js`) ; indépendant du cycle visuel ; mini-contrôles. |
| **Virgules** | Dossier `virgules/` ; lecture entre les morceaux selon un cycle (intro possible au premier clic) ; **chevauchements** calés sur la durée réelle des fichiers : virgule → musique (**0,7 s** avant fin virgule), musique → musique (**0,5 s** avant fin), musique → virgule (**0,2 s** avant fin du 3ᵉ morceau du cycle). |
| **Normalisation audio** | Au démarrage du serveur, `ffmpeg` + filtre `loudnorm` (≈ -14 LUFS) ; fichiers normalisés suffixés **` normalisation ok`** ; originaux souvent rangés dans `musique/archives/` et `virgules/archives/`. |
| **Stickers** | Images / GIF dans `stickers/` ; **non déplaçables** à la souris (affichage scénarisé). |
| **Phases visuelles** | **Snake** (3 stickers en file, 15 segments) → **Super boom** → **Fenêtre OS + vidéo** (`phase_videos/`) → **Logo** → **Webcam** (effet VHS) → retour snake. |
| **Fond** | Vidéo en boucle dans `backgrounds/` sous un dégradé **charte SSI** ; overlay **CRT** (scanlines, grain, vignette). |
| **Audio réactif** | Web Audio API : analyse sur la **piste principale** ; comportements stickers 0–5 (dont « kick » sur `bassBeat`). |
| **Démarrage** | Politique navigateur : premier **clic** sur la page pour lancer (indicateur « cliquez pour démarrer ») ; reprise **`AudioContext`** sur interaction. |

### Technique — front (JavaScript)

| Thème | Description |
|--------|-------------|
| **Modules ES** | `index.html` charge **`js/main.js`** (`type="module"`). Plus de monolithe actif : code découpé sous `js/`. |
| **Fichiers `js/`** | Voir tableau [Architecture front](#architecture-front-js) ci-dessous. |
| **`app.js` (racine)** | Fichier **rappel uniquement** ; l’ancien code monolithique est dans l’**archive**. |
| **Debug** | `js/debug.js` : **`?debug=0`** coupe `[DEBUG]` ; **`?videoLog=0`** coupe `[SSI·VIDEO]` (chargement des `<video>`). |

### Technique — back (Python)

| Thème | Description |
|--------|-------------|
| **Package `ssi_server/`** | Logique serveur découpée : `config`, `fsutil`, `normalize`, `handler`, `main`, `__main__`. |
| **Logs LIVE** | `logutil.py` : préfixes horodatés `[SSI]`, `[SSI·API]`, `[SSI·NORM]`. `live_report.py` : **inventaire** au démarrage + alertes dossiers vides. |
| **Filtrage HTTP** | Les succès **200** sur médias / JS / CSS ne sont pas logués ; les **`/api/*`** le sont avec compteurs ; erreurs **404/500** sur stderr. |
| **Lancement** | `python3 server.py` ou **`python3 -m ssi_server`** (racine du projet). |
| **API JSON** | `GET /api/tracks`, `/api/stickers`, `/api/backgrounds`, `/api/virgules`, `/api/phase-videos`, `/api/settings`. |
| **Santé** | `GET /api/health` → JSON avec compteurs (`tracks`, `stickers`, `backgrounds`, `phaseVideos`, `virgules`, `audioInput`) et `"ok": true`. |
| **Robustesse** | `safe_normalize_audio_in_directory` : une erreur sur la normalisation d’un dossier **ne bloque pas** le démarrage du serveur ; erreurs par fichier loguées. |

### Robustesse LIVE (front)

| Thème | Description |
|--------|-------------|
| **Stickers** | `sticker-fallback.js` : SVG data-URL **secours** si `stickers/` vide ou `onerror` sur une image ; phases snake / boom / logo restent peuplées. |
| **Audio** | Compteur **virgules** basé sur les morceaux **réellement démarrés** ; en cas de piste injouable, enchaînement sur la suivante (limite `MAX_AUDIO_RECOVERY_DEPTH`). |
| **Bandeau** | `#liveStatus` : visible seulement si pas de musique, stickers secours, ou pas de vidéo de fond. |

### Archive & sauvegardes

| Emplacement | Contenu |
|-------------|---------|
| `archive/snapshot-2026-03-14-avant-decomposition/` | Copie de **référence** : ancien `app.js` monolithique, `index.html`, `style.css`, **ancien** `server.py` monolithique (avant package `ssi_server/`). |

**Usage** : comparaison ou rollback **manuel** (copier un fichier depuis l’archive vers la racine en sauvegardant l’actuel si besoin). Ce dossier n’est pas un second projet autonome.

---

## Architecture front (`js/`)

| Fichier | Rôle |
|---------|------|
| `js/main.js` | Point d’entrée : UI, premier clic, fond vidéo, branchement des modules. |
| `js/config.js` | Constantes (beat, stickers, durées phases, overlaps audio, lissage). |
| `js/debug.js` | Flag debug URL + helpers log + **`videoLog` / `[SSI·VIDEO]`**. |
| `js/video-load-log.js` | Écouteurs `loadstart` / `progress` / `canplay` / erreurs sur les vidéos (fond, phase, OS). |
| `js/utils.js` | `random`, `lerp`, `palier`. |
| `js/api.js` | `loadFromServer()` (settings + tracks, stickers, backgrounds, virgules, phase-videos). |
| `js/audio.js` | Playlist, virgules, `AudioContext`, analyseur, transitions planifiées, boutons play. |
| `js/visuals.js` | Boucle `requestAnimationFrame` : fond (thème, beat punch), comportements stickers, tremblement **fenêtre OS** / **webcam**. |
| `js/phases.js` | Cycle **snake → boom → fenêtre OS (vidéos) → logo → webcam** ; `initStickers()`, `initPhaseVideos()`, préchargement phase vidéo, webcam ; commandes télécommande (`applyRemotePhaseCommand`, reprise idle). |
| `js/phase-remote.js` | Sondage **`/api/phase-remote`** : phases, fond, **`idleResumeMs`**, **`theme`** ; rechargement médias + CSS sur changement de thème. |
| `js/background-playback.js` | Fond vidéo + dégradé pilotés par l’état API (crossfade, rotation) ; **`reloadBackgrounds(urls)`** pour le changement de thème. |
| `js/phase-panel-app.js` | Logique du panneau web **`phase_panel.html`** (POST, journal, sync listes, **boutons thème SSI / Diagonal**). |
| `js/behaviors.js` | `applyStickerBehavior` (réaction au son par `dataset.behavior` 0–5). |

---

## Architecture Python (`ssi_server/`)

| Fichier | Rôle |
|---------|------|
| `ssi_server/config.py` | `PORT`, `ROOT_DIR`, extensions fichiers. |
| `ssi_server/fsutil.py` | `list_files(dossier, extensions)`. |
| `ssi_server/normalize.py` | `find_ffmpeg`, installation brew optionnelle, normalisation + `safe_normalize_*`. |
| `ssi_server/handler.py` | `AppRequestHandler` : statiques + routes `/api/*` dont `/api/health`, **`/api/phase-remote`**. |
| `ssi_server/phase_remote_state.py` | État thread-safe télécommande (phases, fond, **`idleResumeMs`**, snapshots GET/POST). |
| `ssi_server/main.py` | `chdir` racine projet, normalisation, `HTTPServer`, arrêt propre sur `KeyboardInterrupt`. |
| `ssi_server/__main__.py` | Permet `python3 -m ssi_server`. |
| `server.py` (racine) | Lanceur minimal qui appelle `ssi_server.main.main()`. |

---

## Charte couleurs SSI (référence projet)

| Nom | Hex |
|-----|-----|
| Rose flashy | `#ff309c` |
| Turquoise | `#02d1ae` |
| Ultra-violet | `#6b00dd` |
| Jaune | `#ffde01` |

Utilisées notamment dans le dégradé de fond et l’overlay CRT (`style.css`).

---

## Feuille de route (suites possibles)

1. **Registre** de comportements (id → fonction) dans `behaviors.js`.
2. **Phases** encore plus explicites (enum / transitions nommées) dans `phases.js`.
3. **Serveur** : durcissement contre path traversal si exposition sur un réseau non local.
4. **Nouveau snapshot** dans `archive/` après une évolution majeure.

Le détail des étapes déjà réalisées côté découpage est dans **`ROADMAP.md`**.

---

## Note sur la « lourdeur » du découpage

Objectif : **peu de fichiers**, pas de build obligatoire, pas de framework. Le découpage actuel reste dans cette logique (un dossier `js/` + un package Python court).

---

*Pour la liste des tâches cochées étape par étape : voir **`ROADMAP.md`**. Pour l’usage quotidien : **`README.md`**.*
