# Architecture du programme — Guide technique

> Ce document explique comment le programme fonctionne de bout en bout.
> Lecture recommandée avant de modifier ou d'ajouter des fonctionnalités.

---

## Vue d'ensemble

Le programme est composé de **deux parties** qui communiquent via HTTP :

```
[Serveur Python]  ←──────────────────────────────────────────────────────────────────
      │           HTTP (localhost:3000)
      │           • Fichiers statiques (HTML, JS, CSS, médias)
      │           • API JSON (/api/*)
      │
      ├── [Scène]          index.html      → réagit au micro, affiche les phases
      └── [Télécommande]   phase_panel.html → contrôle à la main les phases/thèmes
```

---

## Serveur Python (`ssi_server/`)

| Fichier | Rôle |
|---------|------|
| `main.py` | Démarrage : conversion vidéos → inventaire → ouverture du socket HTTP + navigateur |
| `handler.py` | Routes HTTP : statiques + `/api/*` + logs `[SSI·LIVE]` |
| `phase_remote_state.py` | **État partagé** (thread-safe) : phases, fond, thème, mute, pause. Source de vérité du programme. |
| `phase_video_convert.py` | Conversion vidéos → MP4 H.264 au démarrage (ffmpeg) |
| `fsutil.py` | Liste les fichiers par extension, avec support des sous-dossiers de thème |
| `normalize.py` | Utilitaires ffmpeg (find_ffmpeg, try_install_ffmpeg) |
| `live_report.py` | Inventaire au démarrage + alertes dossiers vides |
| `logutil.py` | Préfixes de log `[SSI]`, `[SSI·LIVE]`, `[SSI·TC]`, etc. |
| `runtime_config.py` | Mode audio (toujours `micro` — playlist archivée) |
| `config.py` | Constantes Python : PORT, extensions fichiers |

---

## Scène (`index.html` + `js/`)

| Fichier | Rôle |
|---------|------|
| `js/main.js` | Point d'entrée : charge les médias, démarre le micro, lance le cycle visuel au 1er clic |
| `js/audio.js` | Micro → AnalyserNode Web Audio → beat/basse/overall (niveaux 0–1) |
| `js/visuals.js` | Boucle `requestAnimationFrame` : pulse fond, shake fenêtre, comportements stickers |
| `js/phases.js` | **Moteur des phases** : snake, boom, fenêtre vidéo, logo, webcam + commandes télécommande |
| `js/phase-remote.js` | Poll `GET /api/phase-remote` toutes les 450 ms → applique l'état serveur sur la scène |
| `js/background-playback.js` | Fond vidéo (crossfade, rotation auto) |
| `js/api.js` | Charge les listes de médias au démarrage |
| `js/config.js` | Constantes JS : durées, seuils, ratios |
| `js/behaviors.js` | Comportements stickers réactifs au son (6 behaviors) |
| `js/browser-cache-warm.js` | Pré-remplit le cache HTTP navigateur (vidéos) |

---

## Télécommande (`phase_panel.html` + `js/phase-panel-app.js`)

Page distincte (`:3000/phase_panel.html`) utilisée par l'opérateur.

Toutes les actions sont des `POST /api/phase-remote` avec un corps JSON :
- `{ "phase": "snake" }` — déclenche une phase
- `{ "theme": "diagonal" }` — change le thème identité
- `{ "pausePhases": true }` — suspend le cycle visuel
- `{ "videoMuted": false }` — active le son des vidéos
- `{ "bgGradientOpacity": 0.5 }` — opacité du dégradé
- `{ "idleResumeMs": 30000 }` — délai avant reprise automatique

---

## Le poll de synchronisation

La scène lit l'état serveur **toutes les 450 ms** via `GET /api/phase-remote`.
C'est ce mécanisme qui synchronise la télécommande et la scène sans rechargement.

```
Télécommande          Serveur                    Scène
    │                    │                          │
    ├─ POST { theme }──► │  _theme = 'diagonal'     │
    │                    │                          │
    │                    │ ◄── GET /api/phase-remote─┤  (poll 450ms)
    │                    │─── { theme: 'diagonal' }─►│
    │                    │                          ├─ appliquer CSS
    │                    │                          ├─ recharger stickers
    │                    │                          └─ recharger vidéos
```

Champ `seq` : incrémenté à chaque commande active. La scène détecte `seq > appliedSeq` pour rejouer la commande.

---

## Système de thèmes (SSI / Diagonal)

1. **`phase_remote_state.py`** stocke `_theme` (`'ssi'` | `'diagonal'`).
2. Le GET renvoie `theme` dans le snapshot → la scène lit `data.theme` au poll.
3. `phase-remote.js` pose `document.documentElement.dataset.appTheme = theme`.
4. **`style.css`** contient les règles `[data-app-theme="diagonal"]` qui surchargent les couleurs.
5. Les médias (stickers, vidéos, fonds) sont dans des sous-dossiers par thème :
   `stickers/ssi/`, `stickers/diagonal/`, `phase_videos/ssi/`, etc.
6. Si le sous-dossier est vide, repli automatique sur le dossier racine.

---

## Ajouter une fonctionnalité

### Nouvelle phase
Voir la section TÉLÉCOMMANDE dans `js/phases.js` et `docs/remote-panel.md`.

### Nouveau réglage télécommande
1. Variable + défaut dans `phase_remote_state.py`
2. L'inclure dans `_snapshot_unlocked()`
3. Gérer dans `post_remote_payload()` (pattern `has_X`)
4. Lire dans `js/phase-remote.js` (poll)
5. Contrôle dans `phase_panel.html` + `js/phase-panel-app.js`

### Nouveau thème visuel
1. Ajouter l'id dans `VALID_THEMES` (`phase_remote_state.py`)
2. Ajouter un bloc `[data-app-theme="nouveau"]` dans `style.css`
3. Créer les sous-dossiers `stickers/nouveau/`, `phase_videos/nouveau/`, `backgrounds/nouveau/`
4. Ajouter un bouton dans `phase_panel.html`

---

## Dossiers médias

Tout le contenu organisé est sous `content/`. Les dossiers racine `stickers/`, `phase_videos/`, `backgrounds/` restent comme repli final si `content/` est vide.

```
content/
  logos/
    classique/   ← SSI-logo1.gif … SSI-logo4.gif
    dark/        ← SSI-logo1_techno.gif … (versions glitchées)
  classique/     ← mood SSI (couleurs violet/turquoise/rose)
    stickers/
      boom/         4 fichiers
      jeux-video/  14 fichiers  (Nintendo, Pokémon, Sims, Tony Hawk…)
      pop-culture/ 22 fichiers  (Harry Potter, Disney, Britney, Matrix…)
      doux/         2 fichiers  (Ghibli, coeurs)
    videos/
      boom/         4 vidéos   (Daft Punk ×2, Mr Oizo, Rollercoaster)
      jeux-video/  11 vidéos   (Nintendo, Sims, Pokémon, Scrubs, Rugrats…)
      pop-culture/ 13 vidéos   (Matrix, Fight Club, Tarantino, zapping…)
    backgrounds/
      boom/ doux/ urban/ jeux-video/ pop-culture/
  dark/          ← mood glitché/électrique (fichiers _techno)
    stickers/    (mêmes catégories, versions _techno)
    videos/      (mêmes catégories, versions _techno)
    backgrounds/ (mêmes catégories)

stickers/        → repli final (vide — tout est dans content/)
phase_videos/    → repli final (vide)
backgrounds/     → repli final (vide)
archive/         → code archivé (playlist-mode/)
docs/            → documentation technique
```

---

*Dernière mise à jour : juin 2026*
