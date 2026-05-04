# Playlist visuelle interactive — SSI & Diagonal Cinéma

> Scène **16:9** pilotée par le son pour événements live. Playlist audio + effets visuels réactifs (Web Audio API), stickers animés, fond vidéo, overlay CRT.  
> **Télécommande web** : phases, fond, thème identité (SSI ou Diagonal Cinéma), reprise auto configurable.

Développé pour les soirées **SSI** et **Diagonal Cinéma** (Les Valseurs) — deux identités visuelles distinctes switchables en un clic.

---

## Documentation

| Fichier | Contenu |
|---------|---------|
| **`README.md`** | Ce fichier : installation, dossiers, lancement, API. |
| **`CHANGELOG.md`** | Journal complet des évolutions, architecture `js/` et `ssi_server/`, charte couleurs. |
| **`ROADMAP.md`** | Étapes techniques réalisées + pistes optionnelles. |
| **`docs/remote-panel.md`** | Guide d’extension de la télécommande (nouvelles phases, champs POST, logs). |

---

## Installation

**Aucune dépendance pip** — uniquement la bibliothèque standard Python. Pas de `pip install` nécessaire.

### 1. Python ≥ 3.9

```bash
python3 --version   # doit afficher 3.9 ou supérieur
```

- macOS : Python est préinstallé. Sinon : https://python.org  
- Linux : `sudo apt install python3` ou `sudo dnf install python3`

### 2. ffmpeg (recommandé)

Nécessaire pour la **conversion automatique** des vidéos (`.mov`, `.gif` → MP4) et la **normalisation audio** au démarrage. Sans lui le serveur démarre quand même, les fichiers non convertis sont simplement ignorés.

```bash
# macOS
brew install ffmpeg

# Linux (Debian/Ubuntu)
sudo apt install ffmpeg
```

### 3. Cloner le projet

```bash
git clone https://github.com/VOTRE-COMPTE/NOM-DU-REPO.git
cd NOM-DU-REPO
```

Pas de `pip install -r requirements.txt` — il n'y a rien à installer côté Python. Le fichier `requirements.txt` documente uniquement les prérequis système.

---

## Lancement

**Option A — double-clic (macOS)**  
Ouvrir `Lancer.command` depuis le Finder. Un Terminal s'ouvre, le serveur démarre et les deux onglets (scène + télécommande) s'ouvrent automatiquement dans le navigateur.

**Option B — terminal**

```bash
python3 server.py
```

Équivalent :

```bash
python3 -m ssi_server
```

Puis ouvrir **http://localhost:3000** dans le navigateur.

> **Double-clic** : ouvrir **`Lancer.command`** depuis le Finder pour un lancement sans Terminal visible (macOS seulement). Le serveur ouvre automatiquement la scène et la télécommande.

> L’app charge **`js/main.js`** en **module ES** : il faut passer par le serveur (pas d’ouverture directe `file://` pour les imports).

### Vérification rapide du serveur

```bash
curl -s http://localhost:3000/api/health
```

Réponse JSON du type : `{ "ok": true, "tracks": N, "stickers": N, "backgrounds": N, "phaseVideos": N, "virgules": N, "audioInput": "playlist"|"micro" }`.

### Terminal en mode LIVE

**Important :** les lignes **`[SSI·BOOT]`** et **`[SSI·NORM]`** concernent uniquement le **démarrage du processus Python** (normalisation ffmpeg, conversion `phase_videos/`, ouverture du port HTTP). Elles ne reflètent **pas** en temps réel ce qui se passe dans le navigateur (chargement du HTML, lecture audio, etc.).

Ce qui vient du **navigateur** arrive plutôt sous **`[SSI·LIVE]`** (événements envoyés par la page via `POST /api/live-log` : musique, phases, etc.).

Au démarrage, le serveur affiche un **bloc inventaire** (musique / virgules / stickers / fonds) avec **alertes** si un dossier est vide.  
Ensuite, chaque appel aux routes **`/api/*`** est logué sur **une ligne horodatée** (`[SSI·API]`) avec le **nombre d’éléments** renvoyés.  
Les requêtes sur les **gros fichiers** (MP3, MP4, GIF, JS, CSS) en **200** sont **silenciées** pour ne pas noyer le terminal.

> **Broken pipe** : si le navigateur ferme la connexion avant la fin d’un média (seek, autre onglet, etc.), Python pouvait afficher une longue traceback — le serveur **ignore** désormais ce cas (comportement normal, pas une panne).

> **`.well-known/.../com.chrome.devtools.json`** : requête **automatique de Chrome** quand les DevTools sont ouverts — ce n’est **pas** un fichier manquant du projet ; le serveur répond **204** sans erreur dans les logs.

### Suivi LIVE dans le terminal Python

Tant que la page est ouverte dans le navigateur, le front envoie des **`POST /api/live-log`** (silencieux côté log Apache). Le serveur affiche des lignes **`[SSI·LIVE]`** :

- **Musique** : piste en cours (nom + n° / total) ; **`! Musique injouable`** si skip automatique.
- **Virgule** : nom du jingle ; **`! Virgule injouable`** si échec.
- **Snake** : fichier sticker du cycle + position dans le set.
- **SUPER BOOM** : **nombre** de stickers affichés.
- **Logo** : fichier du logo.
- **Fenêtre SSI** : lecture d’une vidéo `phase_videos/` ; lignes **`! Fenêtre SSI`** en cas de skip ou vidéo injouable.
- **Webcam** : phase signal direct (VHS) ; **`! Webcam`** si skip (permission, pas de caméra, etc.).
- **`! Sticker non chargé`** : image introuvable → remplacée par le SVG de secours (une ligne par fichier en erreur).

Les anciens logs **`[DEBUG]`** restent dans la **console du navigateur** (F12), pas dans le terminal Python.

### Debug front

- **`?debug=0`** : réduit les messages **`[DEBUG]`** dans la console.
- **`?videoLog=0`** : coupe les logs **`[SSI·VIDEO]`** (chargement des vidéos fond / phase / fenêtre OS).

Les **`[SSI·VIDEO]`** ne passent **pas** par le serveur Python : uniquement la **console du navigateur** (F12).

### 1er chargement vs rafraîchissements (navigateur)

C’est **normal** que la **première** ouverture paraisse un peu plus lente, puis que les **F5** suivants soient plus fluides :

- **1re visite** : le navigateur doit **télécharger** tous les modules ES (`js/*.js`), les **analyser** et les **compiler** (JIT) ; les appels `fetch` vers `/api/*` partent à froid.
- **Ensuite** : les `.js` / `.css` sont souvent servis depuis le **cache disque** (ou la mémoire), la connexion vers `localhost` est déjà **chaude**, et le moteur JS a déjà compilé une partie du code.

Dans `index.html`, des balises **`<link rel="modulepreload">`** sur les principaux modules réduisent la **cascade** de requêtes au premier chargement (téléchargements plus **parallèles**).

**Vidéos (fond + phase fenêtre)** : les **`<link rel="preload" as="video">`** ont été retirés (Chrome : `as` non supporté / `href` fragile avec chemins encodés). Le fond utilise **`preload="auto"`** + **`fetchpriority="high"`** sur le `<video>` ; la phase fenêtre utilise un **`<video>` caché** pour chauffer le cache, puis ce flux est **libéré** avant d’ouvrir la vraie fenêtre OS — **deux `<video>` sur la même URL** faisaient échouer `play()` sur Chrome.

**Suivi du chargement vidéo (console F12, pas le terminal Python)** : lignes **`[SSI·VIDEO]`** (`loadstart`, `loadedmetadata`, `progress`, `canplay`, erreurs…). Pour désactiver : **`?videoLog=0`** dans l’URL.

---

## Dossiers à alimenter

| Dossier | Rôle |
|---------|------|
| **`musique/`** | Pistes (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.webm`). |
| **`virgules/`** | Jingles courts entre morceaux (mêmes extensions). |
| **`stickers/`** | Images / GIF (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`). |
| **`backgrounds/`** | Vidéos de fond en boucle. Sous-dossiers optionnels par thème : `backgrounds/ssi/`, `backgrounds/diagonal/`. |
| **`stickers/ssi/`** `stickers/diagonal/` | Stickers par thème (**stratégie A**). Si le sous-dossier existe, seul son contenu est utilisé pour ce thème ; sinon repli sur `stickers/`. Idem pour `phase_videos/ssi/`, `phase_videos/diagonal/`, `backgrounds/ssi/`, `backgrounds/diagonal/`. |
| **`phase_videos/`** | Vidéos de la **fausse fenêtre OS** entre le Super boom et le logo (mêmes extensions vidéo). Export **`… ok_converti.mp4`**, archives dans **`phase_videos/_archive/`**. Pour un chargement plus fluide, privilégier du **MP4** ou des `.mov` avec **`moov` en tête** (ex. `ffmpeg -movflags +faststart`). |

**Pas de glisser-déposer dans la page** : tu places les fichiers dans ces dossiers, le serveur les expose et l’API les liste.

**Debug chargements** : le serveur HTTP est **threadé** (plusieurs GET/POST en parallèle) ; un disque lent ou un pic peut encore faire **attendre** le lecteur. Pour voir **combien de temps** prend chaque GET `musique/`, `backgrounds/`, `phase_videos/`, `virgules/` :

`SSI_HTTP_MEDIA_LOG=1 python3 server.py`

**Repérer ce qui se passe (musique qui gèle, lenteurs)** — combiner les deux :

1. **Terminal** : `SSI_DIAG=1 SSI_HTTP_MEDIA_LOG=1 python3 server.py`  
   - `[SSI·DIAG]` : début/fin de **chaque** GET/POST avec **nom du thread** et **durée** (tu vois si plusieurs requêtes se chevauchent et laquelle est longue).  
   - `[SSI·HTTP·MEDIA]` : durée des GET sur les gros dossiers (`musique/`, etc.).

2. **Navigateur** : ouvrir la page avec **`?diag=1`** (ex. `http://localhost:3000/?diag=1`).  
   - Active aussi les traces **vidéo** et **média** dans la console.  
   - Sur **waiting / stalled** musique ou virgule : lignes **`[SSI·DIAG·AUDIO]`** avec `readyState`, `networkState`, plages **buffered** (pour voir si le problème est « pas de données » vs autre).

Les événements importants restent dans **`[SSI·LIVE]`** (terminal) et **`[DEBUG]`** (console si `debug` non désactivé).

**Veille dans le terminal** : toutes les **30 s** par défaut, ligne courte `[SSI·PULSE]` (`OK | 5m12s | playlist | :3000`) ; rappel `SSI_HTTP_MEDIA_LOG=1` seulement 1× sur 8. Intervalle : `SSI_SERVER_PULSE_SEC=10` ; couper : `SSI_SERVER_PULSE_SEC=0`.

**Rafales `[SSI·LIVE]`** : si plein d’événements arrivent à la même seconde après un silence, c’était souvent la **file réseau** ou le **navigateur** ; avec l’ancien serveur mono-thread, les POST `/api/live-log` pouvaient aussi **patienter** derrière un gros GET.

**Cache navigateur** : au chargement de la page, une file séquentielle remplit le cache (réglages `BROWSER_PREWARM_*` dans `js/config.js`).

Après normalisation, les fichiers « prêts » peuvent porter le suffixe **` normalisation ok`** dans le nom ; des originaux peuvent être rangés dans **`musique/archives/`** et **`virgules/archives/`** (selon ton organisation).

---

## API HTTP (JSON)

| Route | Réponse |
|-------|---------|
| `GET /api/tracks` | Liste d’URLs `/musique/...` |
| `GET /api/virgules` | Liste d’URLs `/virgules/...` |
| `GET /api/stickers` | Liste d’URLs `/stickers/...` |
| `GET /api/backgrounds` | Liste d’URLs `/backgrounds/...` |
| `GET /api/phase-videos` | Liste d’URLs `/phase_videos/...` |
| `GET /api/settings` | JSON `{ "audioInput": "playlist" \| "micro" }` |
| `GET /api/health` | État + compteurs de fichiers (+ `phaseVideos`, `audioInput`) |
| `GET /api/phase-remote` | État télécommande : `seq`, **`phaseCommandSeq`**, **`theme`** (`"ssi"` \| `"diagonal"` — couleurs scène + bibliothèque médias), (incrémenté seulement si le POST contenait `phase` — la page ne relance pas la phase sur un POST fond seul), `lastCommandMs`, `phase`, `videoIndex`, `phaseVideoCount`, `phaseVideoFiles`, `backgroundVideoCount`, `backgroundVideoFiles`, **`bgGradientOpacity`**, **`backgroundAutoRotate`**, **`backgroundVideoIndex`**, **`idleResumeMs`** (ms avant reprise boucle si pas de POST actif), `validPhases`, **`panelPhases`** |
| `POST /api/phase-remote` | JSON : `phase` + `videoIndex?` **ou** réglages fond : `bgGradientOpacity`, `backgroundAutoRotate`, `backgroundVideoIndex` **ou** `idleResumeMs` (ms, 3 000–900 000 ; seul = pas de reset compteur) **ou** **`theme`** (`"ssi"` \| `"diagonal"` ; invalide les caches médias, recharge stickers/vidéos/fonds côté scène). Au moins un champ reconnu requis. Réponse enrichie comme un GET. |

**Télécommande phases** : la page interroge `GET /api/phase-remote` toutes les **~450 ms** (`PHASE_REMOTE_POLL_MS`) ; **~2,2 s** si l’onglet est masqué (`PHASE_REMOTE_POLL_MS_HIDDEN`). Les **GET** ne génèrent **pas** de lignes `[SSI·API]` ; pour les voir : `SSI_PHASE_REMOTE_LOG=1 python3 server.py`. Chaque **POST** est une ligne courte **`[SSI·TC]`** (ex. `webcam · seq 8`) — à part de `[SSI·LIVE]` pour filtrer au `grep`. Côté serveur, la liste `phase_videos/` est **mise en cache** quelques secondes (`SSI_PHASE_REMOTE_CACHE_SEC`, défaut 2,5) pour limiter les scans disque à chaque poll. Chaque **POST** actif (phase ou fond) incrémente `seq` et met à jour `lastCommandMs`. Un POST **uniquement** `idleResumeMs` met à jour le délai **sans** réinitialiser le compte à rebours. **Sans nouveau POST actif** pendant `idleResumeMs` (défaut serveur 60 s ; repli client `PHASE_REMOTE_IDLE_RESUME_MS` si absent), la page **reprend la boucle** au départ du snake. Le **fond** peut être piloté depuis le panneau (**opacité dégradé**, **vidéo** avec crossfade, **rotation auto** ~3 min) via les champs ci‑dessus (`js/background-playback.js`).

- **Au démarrage du serveur**, le navigateur ouvre d’abord la **page d’animation** (`/`), puis la **télécommande** (`/phase_panel.html`) — délais ~0,45 s et ~0,7 s pour éviter la course au démarrage. Pour **ne pas** ouvrir la scène : `SSI_OPEN_SCENE=0 python3 server.py`. Pour **ne pas** ouvrir le panneau web : `SSI_PHASE_PANEL=0 python3 server.py`. Pour **forcer l’ancien panneau tkinter** (la scène s’ouvre quand même dans le navigateur sauf `SSI_OPEN_SCENE=0`) : `SSI_PHASE_PANEL=tk python3 server.py`.
- Panneau web : `http://localhost:3000/phase_panel.html` — boutons depuis **`panelPhases`**, vidéos phase + **fond** (`backgrounds/`), section **Reprise auto** (délai avant retour boucle snake, `idleResumeMs`), **journal** dans la page ; guide **`docs/remote-panel.md`** pour ajouter phases / champs POST / logs serveur.
- Alternative tkinter seule : `python3 tools/phase_remote_panel.py` ou `python3 tools/phase_remote_panel.py http://127.0.0.1:3000`.
- Couper le sondage côté page : `?phaseRemote=0` dans l’URL.

---

## Structure du code (résumé)

- **`js/`** — Application modulaire (`main`, `config`, `browser-cache-warm`, `playlist-order`, `audio`, `visuals`, `phases`, **`phase-remote`**, **`background-playback`**, …).
- **`ssi_server/`** — Serveur Python (`handler`, `normalize`, `config`, `phase_remote_state`, etc.).
- **`tools/phase_remote_panel.py`** — Fenêtre tkinter pour envoyer les phases (voir API `phase-remote`).
- **`server.py`** — Lanceur qui appelle le package.
- **`index.html`** + **`phase_panel.html`** + **`js/phase-panel-app.js`** + **`docs/remote-panel.md`** + **`style.css`** — Scène, panneau télécommande modulaire, guide d’extension ; CRT, mini-contrôles.
- **`app.js`** (racine) — Rappel : le code actif est sous `js/` (voir `CHANGELOG.md`).

Détail : **`CHANGELOG.md`** → sections *Architecture front* et *Architecture Python*.

---

## Vidéos : comment ça charge, sans couper musique ni script

- **Musique et phases** tournent dans le **même onglet** mais sur des **chemins séparés** : l’audio passe par **Web Audio** (`audio.js`) ; les vidéos sont des **`<video>`** (fond, prefetch caché, fenêtre OS, webcam). Changer la `src` d’une vidéo **n’arrête pas** la playlist.
- **Fond** (`#bgVideo`) : `main.js` pose `src` + `play()` dès `canplay` ; rotation éventuelle toutes les 3 min. **Prêt / lecture** : événements `video_ready` / `video_playing` (voir ci‑dessous).
- **Phase fenêtre OS** : pendant le **Super boom**, une file d’URLs est tirée + **prefetch** sur un `<video>` caché ; à l’ouverture, prefetch **relâché** (Chrome), puis **`#ssiOsWindowVideo`** + `play()` (reprises « save power »). Tant que la fenêtre est visible sans lecture réelle : **overlay glitch + vieille TV** (`ssi-os-window-layer--video-signal-wait`) ; retiré au **1er `playing`**.
- **Cache navigateur** : au chargement, **`browser-cache-warm.js`** télécharge en **file** fond + `phase_videos/` + virgules pour soulager les pics réseau (réglages `BROWSER_PREWARM_*`).

### Horodatages « prêt » et « lancé » (terminal Python)

Dans le terminal du serveur, lignes **`[SSI·LIVE]`** :

- **`Vidéo PRÊTE [rôle] « fichier » (canplay|canplaythrough) @ ISO-8601`** — assez de buffer pour tenter `play()`.
- **`Vidéo LECTURE [rôle] « fichier » @ ISO-8601 perf≈…ms`** — événement navigateur **`playing`** (image qui avance vraiment).

Rôles typiques : `fond`, `fenêtre OS`, `prefetch phase`, `webcam`.

### Console navigateur (optionnel, plus calme par défaut)

| URL | Effet |
|-----|--------|
| `?debug=1` | Logs techniques `[DEBUG]` (playlist, phases, audio…). |
| `?videoLog=1` | Détail chargement `[SSI·VIDEO]` (loadstart, stalled, progress…). |
| `?mediaTrace=1` | Doublon console des lignes PRÊT / LECTURE `[SSI·MEDIA]`. |

Sans paramètre : console **peu bavarde** ; le suivi « propre » pour la régie reste le **terminal Python** (`[SSI·LIVE]`).

---

## Utilisation (comportement)

1. Lance le serveur, ouvre **http://localhost:3000**.
2. **Premier clic** sur la page (hors mini-contrôles) : en mode **playlist** ([1] ou défaut), souvent une **virgule** puis la **musique** ; en mode **micro** ([2] ou `SSI_AUDIO_INPUT=micro`), le navigateur demande le **micro** et **aucun** MP3 de `musique/` / `virgules/` n’est lu (normalisation de ces dossiers **ignorée** au démarrage serveur, pas de préchargement des pistes).
3. Les **stickers** et calques suivent les **phases** : snake → super boom → **vidéo fenêtre OS** (`phase_videos/`) → logo → **webcam** (permission souvent demandée au chargement ou au 1er geste) → snake. Réaction au **son** de la piste principale (ou micro si configuré).
4. **Playlist** : un **tour** joue chaque fichier de `musique/` **une fois**, puis un nouveau tour ; **sans lien** avec le cycle visuel. L’ordre se règle dans **`js/config.js`** (`PLAYLIST_ORDER_MODE` : mélange aléatoire, ordre API, ou ordre perso par indices + `PLAYLIST_CUSTOM_ORDER`). La logique est dans **`js/playlist-order.js`** pour pouvoir l’étendre (ex. futur réglage serveur).
5. **Mini-contrôles** en bas à droite : piste précédente / lecture-pause / suivante / plein écran.
6. **Robustesse LIVE** : si `stickers/` est vide ou qu’une image ne charge pas, un **SVG de secours** (charte SSI) s’affiche — pas d’écran vide sur les phases snake / boom / logo.  
   Si une **piste audio** est illisible, le lecteur **enchaîne** sur la suivante (avec limite de sécurité).  
   Un **bandeau discret** en bas à gauche n’apparaît qu’en cas de problème (pas de musique, stickers de secours, pas de vidéo de fond).

---

## Ancien projet Node (optionnel)

Un fichier **`server.js`** / **`package.json`** peut subsister pour d’anciennes habitudes ; le flux **recommandé** est **`python3 server.py`**.

---

## Fond & style

- Vidéo en boucle + dégradé animé aux couleurs **SSI** (détail des hex dans **`CHANGELOG.md`**).
- Overlay **CRT** (scanlines, bruit, vignette).

Pour l’historique détaillé de toutes les mises à jour : **`CHANGELOG.md`**.
