# Plan de découpage du code (étapes)

> Archive de référence avant la première grosse refonte : `archive/snapshot-2026-03-14-avant-decomposition/`  
> Journal complet des évolutions : **`CHANGELOG.md`**

## Étapes initiales (modules ES + entrée)

| # | Étape | Statut | Fichiers / notes |
|---|--------|--------|-------------------|
| 0 | Documenter le plan | ✅ | `ROADMAP.md` |
| 1 | Constantes centralisées | ✅ | `js/config.js` |
| 2 | Debug + utilitaires | ✅ | `js/debug.js`, `js/utils.js` |
| 3 | API serveur (fetch) | ✅ | `js/api.js` |
| 4 | Audio (playlist, virgules, analyseur) | ✅ | `js/audio.js` |
| 5 | Visuels — boucle RAF + fond | ✅ | `js/visuals.js` (tick, thème, beat) |
| 5b | Phases stickers (snake / boom / logo) | ✅ | `js/phases.js` + `initStickers` |
| 5d | Phase fenêtre OS (`phase_videos/`), webcam, préchargement | ✅ | `phases.js`, `visuals.js`, `main.js`, `style.css`, `handler.py` |
| 5f | Télécommande phases (`/api/phase-remote`, panneau web, reprise idle) | ✅ | `phase_remote_state.py` (`panelPhases`, `phaseCommandSeq`, fond `bg*`, **`idleResumeMs`**), `handler.py`, `phase_panel.html`, `phase-panel-app.js`, `phase-remote.js`, `background-playback.js`, `phases.js`, `main.py`, `docs/remote-panel.md`. **Reprise auto** : délai réglable (3 s–15 min) ; POST seul `idleResumeMs` sans reset `seq`/`lastCommandMs`. |
| 5e | 1er chargement audio synchrone + logs `[SSI·VIDEO]` + preload vidéo | ✅ | `main.js`, `audio.js`, `debug.js`, `video-load-log.js`, `index.html` |
| 5c | Comportements réactifs au son | ✅ | `js/behaviors.js` |
| 6 | Point d’entrée + UI | ✅ | `js/main.js`, `index.html` (`type="module"`) |
| 7 | Nettoyage racine | ✅ | `app.js` → rappel uniquement |

## Étapes serveur Python

| # | Étape | Statut | Notes |
|---|--------|--------|--------|
| P1 | Package `ssi_server/` | ✅ | `config`, `fsutil`, `normalize`, `handler`, `main` |
| P2 | Lanceur racine | ✅ | `server.py` → `ssi_server.main.main()` |
| P3 | `python -m ssi_server` | ✅ | `ssi_server/__main__.py` |
| P4 | `GET /api/health` | ✅ | Compteurs de fichiers |
| P5 | Normalisation encapsulée | ✅ | `safe_normalize_audio_in_directory` |

## Étapes avril 2026 — thèmes multi-salles

| # | Étape | Statut | Fichiers / notes |
|---|--------|--------|-------------------|
| T1 | Champ `theme` serveur + POST | ✅ | `phase_remote_state.py` (`VALID_THEMES`, invalidation caches), `handler.py` (log `[SSI·TC]`) |
| T2 | Médias par thème (sous-dossiers) | ✅ | `ssi_server/fsutil.py` (`list_files_themed`), caches `phase_remote_state` theme-aware, routes GET stickers/backgrounds/phase-videos |
| T3 | CSS thème Diagonal | ✅ | `style.css` — `[data-app-theme="diagonal"]` : gradients, fenêtre OS, beat, CRT, hint, bandeau. Palette : `#f040b0` · `#000` · `#fff` |
| T4 | Détection + rechargement côté scène | ✅ | `js/phase-remote.js` (detect `theme`, appliquer `data-app-theme`, re-fetch stickers/phase-videos/backgrounds), `js/background-playback.js` (export `reloadBackgrounds`) |
| T5 | Panneau télécommande | ✅ | `phase_panel.html` (section + boutons stylés), `js/phase-panel-app.js` (POST + sync actif) |
| T6 | Lanceur macOS double-clic | ✅ | `Lancer.command` (chmod +x, ouvre Terminal + serveur) |

## Prochaines étapes possibles (optionnel)

- [ ] Registre de comportements (map id → fonction) dans `behaviors.js`
- [ ] Phases : enum / transitions nommées explicites dans `phases.js`
- [ ] Durcissement path traversal sur fichiers statiques si exposition réseau
- [ ] Nouveau snapshot dans `archive/` après une grosse évolution
- [ ] Thème par défaut configurable via variable d'env (`SSI_DEFAULT_THEME=diagonal`)

## Lancement

```bash
python3 server.py
# ou
python3 -m ssi_server
```

Navigateur : **http://localhost:3000** — chargement de `js/main.js` (modules ES).

## Ancien monolithique

L’ancien `app.js` complet est dans **`archive/snapshot-2026-03-14-avant-decomposition/`**. Le fichier `app.js` à la racine ne sert qu’au message de rappel.
