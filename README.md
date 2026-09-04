# Programme de scène live — SSI & Diagonal Cinéma

> Outil de performance visuelle **16:9** pour les soirées **Salut Salut Internet (SSI)** et **Diagonal Cinéma** (Les Valseurs).

La scène réagit au son ambiant capté par le micro et enchaîne automatiquement des phases visuelles (stickers, explosions, fenêtre vidéo, logo, webcam). L'opérateur pilote l'ensemble depuis une **télécommande web** sur un second onglet ou appareil.

---

## Comment ça marche

```
┌─────────────────────────────────────────────────────────┐
│           python3 server.py                             │
│  • Convertit les vidéos (MP4 H.264)                     │
│  • Sert index.html + JS + médias                        │
│  • Expose /api/phase-remote (état partagé)              │
└────────────────┬────────────────┬───────────────────────┘
                 │                │
        Scène (index.html)   Télécommande (phase_panel.html)
        • Micro → effets      • Mood Classique / Dark
        • Cycle visuel auto   • Catégories (dossiers content/)
        • Poll 450 ms         • Mute / Pause / Webcam REC + lumo
                 │                │
                 └── GET /api/phase-remote ──► état lu/écrit
```

**Cycle visuel automatique :**
```
SNAKE (~30 s × 3 tours) → SUPER BOOM (~10 s) → FENÊTRE VIDÉO → LOGO (~26 s) → WEBCAM (~22 s) → reboucle
```

**Deux moods visuels** (switchables depuis la télécommande) :
- **Classique (SSI)** — violet `#6b00dd`, turquoise `#02d1ae`, rose `#ff309c`, jaune `#ffde01`
- **Dark** — rose `#f040b0`, noir `#000`, blanc `#fff` (ambiance glitchée / électrique)

**Catégories de contenu** : un bouton par dossier sous `content/classique/` et `content/dark/` (aujourd’hui `boom`, `jeux-video`, `pop-culture`, `doux`, `urban`). Le bouton charge uniquement cette bibliothèque.

---

## Documentation

| Fichier | Contenu |
|---------|---------|
| **`README.md`** | Ce fichier : installation, dossiers, lancement, API. |
| **`docs/architecture.md`** | **Guide technique** : comment tout le système fonctionne — lire en premier si on reprend le code. |
| **`docs/file-index.md`** | **Index complet** de tous les fichiers (JS, Python, HTML, CSS) avec leur rôle et quand les modifier. |
| **`docs/remote-panel.md`** | Ajouter des phases / champs POST / logs serveur. |
| **`CHANGELOG.md`** | Journal complet des évolutions. |
| **`ROADMAP.md`** | Étapes techniques réalisées + pistes optionnelles. |


---

## État actuel — septembre 2026

### Architecture des fichiers média

```
content/
  logos/
    classique/     SSI-logo*.gif
    dark/          SSI-logo*_techno.gif
  classique/                    ← mood
    boom/                       ← catégorie = bouton télécommande
      stickers/
      videos/
      backgrounds/
    jeux-video/
      stickers/  videos/  backgrounds/
    pop-culture/
    doux/
    urban/
  dark/                         ← mêmes catégories, fichiers _techno
    boom/  jeux-video/  pop-culture/  doux/  urban/
```

Logos : `content/logos/{mood}/` — toujours injectés avec les stickers (phase logo).

### Moods et catégories
**2 moods** : ☀ Classique (SSI) / ⚡ Dark  
**Catégories** : tout sous-dossier de `content/{mood}/` (nom du bouton = nom du dossier).

### Télécommande (contrôles actuels)
- Mood visuel · Contenu (catégories dynamiques + Racine) · Phases · Pause
- Reprise auto (délai boucle snake) · Mute vidéo · Fond (opacité / fichier / rotation)
- Webcam : **luminosité** (20–300 %) · overlay **REC** (point + timecode)

### Comment étendre

**Ajouter une catégorie** : créer `content/classique/ma-categorie/` (et éventuellement `content/dark/ma-categorie/`) avec `stickers/`, `videos/`, `backgrounds/`. Relancer le serveur. Aucun code à toucher.

**Ajouter un mood** : créer `content/nouveau-mood/{catégorie}/stickers|videos|backgrounds/`, règles CSS `[data-app-theme="nouveau-mood"]`, id dans `VALID_MOODS` (`phase_remote_state.py`), bouton dans `phase_panel.html`.

**Ajouter du contenu** : déposer les fichiers dans le dossier de la catégorie, relancer. Les `.mov` / GIF vidéo sont convertis en `… ok_converti.mp4` (audio conservé).

### Ce qu’il reste à faire
- Design / animations du mood **dark** plus électriques (CSS encore trop proche du classique).
- Nouvelles phases et zone de texte live (télécommande) — prévu plus tard.

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

Nécessaire pour la **conversion automatique** des vidéos (`.mov`, `.gif` → MP4 H.264, audio conservé). Sans lui le serveur démarre quand même.

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

Réponse JSON du type : `{ "ok": true, "audioInput": "micro", "stickers": N, "backgrounds": N, "phaseVideos": N }`.

### Terminal en mode LIVE

**Important :** les lignes **`[SSI·BOOT]`** et **`[SSI·NORM]`** concernent uniquement le **démarrage du processus Python** (conversion `content/` + `phase_videos/` + `backgrounds/`, ouverture du port HTTP). Elles ne reflètent **pas** en temps réel ce qui se passe dans le navigateur.

Ce qui vient du **navigateur** arrive plutôt sous **`[SSI·LIVE]`** (événements envoyés par la page via `POST /api/live-log` : phases, webcam, vidéos).

Au démarrage, le serveur affiche un **bloc inventaire** (stickers / fonds / vidéos phase dans `content/`) avec **alertes** si un type est vide.  
Ensuite, chaque appel aux routes **`/api/*`** (hors poll télécommande) est logué (`[SSI·API]`).  
Les requêtes sur les **gros fichiers** (MP4, GIF, JS, CSS, `/content/`) en **200** sont **silenciées**.

> **Broken pipe** : si le navigateur ferme la connexion avant la fin d’un média (seek, autre onglet, etc.), Python pouvait afficher une longue traceback — le serveur **ignore** désormais ce cas (comportement normal, pas une panne).

> **`.well-known/.../com.chrome.devtools.json`** : requête **automatique de Chrome** quand les DevTools sont ouverts — ce n’est **pas** un fichier manquant du projet ; le serveur répond **204** sans erreur dans les logs.

### Suivi LIVE dans le terminal Python

Tant que la page est ouverte dans le navigateur, le front envoie des **`POST /api/live-log`** (silencieux côté log Apache). Le serveur affiche des lignes **`[SSI·LIVE]`** :

- **Snake** : fichier sticker du cycle + position dans le set.
- **SUPER BOOM** : **nombre** de stickers affichés.
- **Logo** : fichier du logo.
- **Fenêtre SSI** : lecture d’une vidéo de catégorie (`content/…/videos/`) ; lignes **`! Fenêtre SSI`** en cas de skip ou vidéo injouable.
- **Webcam** : phase signal direct (VHS + overlay REC) ; **`! Webcam`** si skip (permission, pas de caméra, etc.).
- **`! Sticker non chargé`** : image introuvable → remplacée par le SVG de secours.

Les événements playlist (musique / virgules) sont **archivés** (`archive/playlist-mode/`) — le mode audio est **micro uniquement**.

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
| **`content/{mood}/{catégorie}/stickers/`** | Images / GIF du snake, boom, etc. Moods : `classique`, `dark`. |
| **`content/{mood}/{catégorie}/videos/`** | Vidéos de la fausse fenêtre OS. Export **`… ok_converti.mp4`**, originaux dans **`_archive/`**. Audio conservé. |
| **`content/{mood}/{catégorie}/backgrounds/`** | Vidéos de fond (même conversion). |
| **`content/logos/{mood}/`** | Logos de la phase logo (toujours inclus avec les stickers). |
| **`stickers/`** `phase_videos/` `backgrounds/` | Repli final si `content/` est vide (aujourd’hui inutilisés). |
| **`archive/playlist-mode/`** | Ancien mode playlist (`musique/`, `virgules/`) — code archivé, pas utilisé au runtime. |

**Pas de glisser-déposer dans la page** : tu places les fichiers dans ces dossiers, le serveur les expose et l’API les liste.

**Debug chargements** : le serveur HTTP est **threadé**. Pour voir **combien de temps** prend chaque GET médias :

`SSI_HTTP_MEDIA_LOG=1 python3 server.py`

**Repérer ce qui se passe (lenteurs)** — combiner les deux :

1. **Terminal** : `SSI_DIAG=1 SSI_HTTP_MEDIA_LOG=1 python3 server.py`  
   - `[SSI·DIAG]` : début/fin de **chaque** GET/POST avec **nom du thread** et **durée**.  
   - `[SSI·HTTP·MEDIA]` : durée des GET sur les gros fichiers.

2. **Navigateur** : **`?diag=1`**. Traces vidéo / média dans la console.

Les événements importants restent dans **`[SSI·LIVE]`** (terminal) et **`[DEBUG]`** (console si `debug` non désactivé).

**Veille dans le terminal** : toutes les **30 s** par défaut, ligne courte `[SSI·PULSE]` (`OK | 5m12s | micro | :3000`). Intervalle : `SSI_SERVER_PULSE_SEC=10` ; couper : `SSI_SERVER_PULSE_SEC=0`.

**Cache navigateur** : au chargement de la page, une file séquentielle remplit le cache (réglages `BROWSER_PREWARM_*` dans `js/config.js`).

---

## API HTTP (JSON)

| Route | Réponse |
|-------|---------|
| `GET /api/stickers` | URLs selon mood + catégorie actifs (`content/{mood}/{cat}/stickers/` + logos) |
| `GET /api/backgrounds` | URLs `content/{mood}/{cat}/backgrounds/` |
| `GET /api/phase-videos` | URLs `content/{mood}/{cat}/videos/` |
| `GET /api/health` | `{ ok, audioInput: "micro", stickers, backgrounds, phaseVideos }` |
| `GET /api/phase-remote` | État : `seq`, `phaseCommandSeq`, `theme` (`classique` \| `dark`), `contentSet`, `videoMuted`, `webcamBrightness`, `webcamRecOverlay`, `phasesPaused`, `idleResumeMs`, fond (`bg*`), `availableContentSets`, `panelPhases`, listes vidéos |
| `POST /api/phase-remote` | Au moins un champ : `phase`, `theme`, `contentSet`, `pausePhases`, `videoMuted`, `webcamBrightness`, `webcamRecOverlay`, `bgGradientOpacity`, `backgroundAutoRotate`, `backgroundVideoIndex`, `idleResumeMs` |

**Télécommande** : poll `GET` ~**450 ms** (`PHASE_REMOTE_POLL_MS`) ; ~**2,2 s** si onglet masqué. GET silencieux sauf `SSI_PHASE_REMOTE_LOG=1`. Chaque **POST** → `[SSI·TC]`. Sans POST actif pendant `idleResumeMs` (défaut 60 s), reprise de la boucle snake (sauf si pause).

- Au démarrage : ouverture scène `/` puis télécommande `/phase_panel.html`. Couper : `SSI_OPEN_SCENE=0` / `SSI_PHASE_PANEL=0`. Ancien panneau tkinter : `SSI_PHASE_PANEL=tk`.
- Guide d’extension : **`docs/remote-panel.md`**.
- Couper le sondage côté page : `?phaseRemote=0`.

---

## Structure du code (résumé)

- **`js/`** — Scène : `main`, `config`, `audio` (micro), `visuals`, `phases`, `phase-remote`, `background-playback`, `webcam-grain`, `phase-panel-app`.
- **`ssi_server/`** — Serveur : `handler`, `phase_remote_state`, `fsutil` (`list_content_files`), `phase_video_convert`, `live_report`.
- **`content/`** — Médias live (mood → catégorie → type).
- **`index.html`** + **`phase_panel.html`** + **`style.css`** — Scène 16:9 + télécommande.
- **`docs/`** — `architecture.md`, `file-index.md`, `remote-panel.md`.
- **`archive/playlist-mode/`** — Ancien mode musique (non chargé).

Détail fichier par fichier : **`docs/file-index.md`**. Historique : **`CHANGELOG.md`**.

---

## Vidéos : comment ça charge

- L’audio de scène vient du **micro** (`audio.js`). Les vidéos sont des **`<video>`** (fond, fenêtre OS, webcam). La case **Muet** de la télécommande coupe le son des vidéos de phase.
- **Fond** (`#bgVideo`) : `play()` dès `canplay` ; rotation ~3 min si activée.
- **Phase fenêtre OS** : prefetch pendant le Super boom, puis `#ssiOsWindowVideo`. Overlay « no signal » jusqu’au premier `playing`.
- **Webcam** : flux caméra + grain VHS + overlay REC (si coché) + luminosité CSS.
- **Cache** : `browser-cache-warm.js` (fond + vidéos de phase).

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

1. Lance le serveur (`Lancer.command` ou `python3 server.py`), ouvre **http://localhost:3000**.
2. **Premier clic** sur la scène : le navigateur demande le **micro** (effets visuels) et éventuellement la **webcam**.
3. Les **phases** : snake → super boom → **fenêtre vidéo** (`content/…/videos/`) → logo → **webcam** → snake.
4. Depuis la **télécommande** : mood, catégorie, phase manuelle, mute, pause, fond, luminosité webcam, overlay REC.
5. **Robustesse LIVE** : stickers vides → SVG de secours. Bandeau bas-gauche seulement s’il manque des médias.

---

## Ancien projet Node (optionnel)

Un fichier **`server.js`** / **`package.json`** peut subsister pour d’anciennes habitudes ; le flux **recommandé** est **`python3 server.py`**.

---

## Fond & style

- Vidéo de fond + dégradé selon le **mood** (classique SSI ou dark).
- Overlay **CRT** (scanlines, bruit, vignette).
- Phase webcam : grain VHS + overlay **REC** (optionnel) + luminosité réglable.

Pour l’historique détaillé : **`CHANGELOG.md`**.
