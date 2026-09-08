# Étendre la télécommande phases

Ce document décrit les points d’extension pour ajouter **phases**, **boutons**, **logs côté serveur** ou **nouveaux champs** sans tout disperser dans le projet.

## 1. Source de vérité serveur (`ssi_server/phase_remote_state.py`)

| Élément | Rôle |
|---------|------|
| `VALID_PHASES` | Ensemble des identifiants acceptés par `POST /api/phase-remote` (`phase`). **Obligatoire** pour toute nouvelle phase. |
| `PANEL_PHASE_ORDER` | Ordre d’affichage des boutons dans `phase_panel.html`. |
| `PANEL_PHASE_LABELS` | Libellés UI. |
| `PANEL_PHASE_NEEDS_VIDEO` | Phases qui envoient `videoIndex` (aujourd’hui seulement `os_video`). Ajouter d’autres ids si besoin. |
| `panel_phase_definitions()` | Construit le JSON `panelPhases[]` pour le GET (id, label, needsVideoIndex, hint). |

**Nouvelle phase « simple »** (comme les actuelles) :

1. Ajouter l’id dans `VALID_PHASES`.
2. L’insérer dans `PANEL_PHASE_ORDER` au bon rang.
3. Ajouter le libellé dans `PANEL_PHASE_LABELS`.
4. Brancher le comportement dans `js/phases.js` → `applyRemotePhaseCommand` (et éventuellement le cycle normal si la phase doit aussi exister hors télécommande).

## 2. Réponse `GET /api/phase-remote`

Champs utiles pour le panneau / futurs clients :

- `availableContentSets` — noms de dossiers de catégorie (boutons Contenu).
- `contentSet` — catégorie active (`""` = Racine).
- `theme` — `classique` \| `dark`.
- `videoMuted`, `webcamBrightness`, `webcamRecOverlay`, `phasesPaused`.
- `panelPhases` — boutons dynamiques (voir ci‑dessus).
- `phaseVideoFiles` / `phaseVideoCount` — liste déroulante vidéos phase.
- `backgroundVideoFiles` / `backgroundVideoCount` — vidéos `backgrounds/` (cache TTL).
- `seq`, `phaseCommandSeq` (n’augmente que lors d’un POST avec `phase` — évite de rejouer la phase à chaque réglage fond), `lastCommandMs`, `phase`, `videoIndex` — état courant phases.
- `bgGradientOpacity`, `backgroundAutoRotate`, `backgroundVideoIndex` — état fond scène.
- `idleResumeMs` — délai (ms) sans POST phase/fond avant reprise boucle côté scène ; POST seul → pas d’incrément `seq` / pas de mise à jour `lastCommandMs`.
- `validPhases` — liste brute des ids (compat).

Cache disque : `get_cached_phase_video_filenames()`, `get_cached_background_filenames()` — TTL `SSI_PHASE_REMOTE_CACHE_SEC`.

## 3. `POST /api/phase-remote`

Exemples de corps JSON :

```json
{ "phase": "snake", "videoIndex": 0 }
```

```json
{ "bgGradientOpacity": 0.45 }
```

```json
{ "backgroundVideoIndex": 1, "backgroundAutoRotate": false }
```

```json
{ "backgroundAutoRotate": true }
```

```json
{ "idleResumeMs": 120000 }
```

```json
{ "theme": "dark" }
```

```json
{ "contentSet": "jeux-video" }
```

```json
{ "webcamBrightness": 1.4, "webcamRecOverlay": true }
```

Entrée unique : `phase_remote_state.post_remote_payload(data)` — au moins un champ reconnu (`phase`, fond, `idleResumeMs`, `theme`, `contentSet`, `pausePhases`, `videoMuted`, `webcamBrightness`, `webcamRecOverlay`). Le champ `phase` n’est plus obligatoire si seuls d’autres réglages sont envoyés.

`theme` (`"classique"` | `"dark"`) et `contentSet` invalident les caches de listes médias. Côté scène, `phase-remote.js` applique `data-app-theme` et recharge stickers / vidéos / fonds depuis `content/{mood}/{catégorie}/`.

Pour d’autres extensions (ex. `preset`, `duration`) : étendre `post_remote_payload`, le handler, puis `js/phase-panel-app.js` et le module scène concerné (ex. `phases.js`).

## 4. Panneau web (`phase_panel.html` + `js/phase-panel-app.js`)

- Les boutons de **phase** viennent de `panelPhases` (pas de liste en dur dans le HTML).
- **Mood** : Classique / Dark — POST `{ "theme": "classique"|"dark" }`.
- **Contenu** : boutons générés depuis `availableContentSets` (noms de dossiers) + Racine.
- **Webcam** : slider luminosité + case overlay REC.
- Section **Fond scène** : opacité, liste fonds, rotation auto.
- **Journal** : bloc `#panelLog`.
- **Logs terminal** : POST → `[SSI·TC]` (`logutil.remote_cmd`). GET poll reste silencieux sauf `SSI_PHASE_REMOTE_LOG=1`.

## 5. Page scène (`js/phase-remote.js` + `js/background-playback.js`)

Sondage vers le même `GET` ; à chaque `seq` incrémenté, `applyRemoteBackgroundState` met à jour dégradé + vidéo de fond (crossfade, rotation) sans casser les commandes `phase` gérées par `phases.js`.

## 6. Tkinter (`tools/phase_remote_panel.py`)

Script autonome : pour l’aligner sur `panelPhases`, il faudrait un `urllib` GET puis création de boutons en boucle — possible en refactor séparé.

---

En résumé : **Python** (`phase_remote_state` + handler) pour le **contrat** et les **labels** ; **`phases.js`** pour les **phases** ; **`background-playback.js`** pour le **fond** ; **`phase-panel-app.js`** pour l’**UI** et le **journal local**.
