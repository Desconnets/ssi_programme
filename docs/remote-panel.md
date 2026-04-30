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
{ "theme": "diagonal" }
```

Entrée unique : `phase_remote_state.post_remote_payload(data)` — au moins un champ parmi `phase`, `bgGradientOpacity`, `backgroundAutoRotate`, `backgroundVideoIndex`, `idleResumeMs`, **`theme`**. Le champ `phase` n’est plus obligatoire si seuls d’autres réglages sont envoyés.

`theme` (`"ssi"` | `"diagonal"`) : invalide les caches de listes médias, incrémente `seq` + `lastCommandMs`. Côté scène, `phase-remote.js` détecte le changement, applique `data-app-theme` sur `<html>` et recharge stickers / phase-videos / backgrounds depuis les sous-dossiers du thème.

Pour d’autres extensions (ex. `preset`, `duration`) : étendre `post_remote_payload`, le handler, puis `js/phase-panel-app.js` et le module scène concerné (ex. `phases.js`).

## 4. Panneau web (`phase_panel.html` + `js/phase-panel-app.js`)

- Les boutons de **phase** viennent de `panelPhases` (pas de liste en dur dans le HTML).
- Section **Thème / Identité** : boutons **SSI** et **Diagonal Cinéma** — POST `{ "theme": "..." }` ; bascule couleurs + bibliothèques médias (sous-dossiers `stickers/{theme}/`, `phase_videos/{theme}/`, `backgrounds/{theme}/`).
- Section **Fond scène** (opacité dégradé, liste `backgrounds/`, rotation auto) : champs statiques dans le HTML + `postRemote()`.
- **Journal** : bloc `#panelLog` — ring buffer côté navigateur uniquement (pas de persistance). Pour un historique serveur, ajouter une route + stockage (fichier / mémoire) et un second panneau ou une section fetch.
- **Logs terminal** : POST → `[SSI·TC]` (`logutil.remote_cmd`). GET poll reste silencieux sauf `SSI_PHASE_REMOTE_LOG=1`.

## 5. Page scène (`js/phase-remote.js` + `js/background-playback.js`)

Sondage vers le même `GET` ; à chaque `seq` incrémenté, `applyRemoteBackgroundState` met à jour dégradé + vidéo de fond (crossfade, rotation) sans casser les commandes `phase` gérées par `phases.js`.

## 6. Tkinter (`tools/phase_remote_panel.py`)

Script autonome : pour l’aligner sur `panelPhases`, il faudrait un `urllib` GET puis création de boutons en boucle — possible en refactor séparé.

---

En résumé : **Python** (`phase_remote_state` + handler) pour le **contrat** et les **labels** ; **`phases.js`** pour les **phases** ; **`background-playback.js`** pour le **fond** ; **`phase-panel-app.js`** pour l’**UI** et le **journal local**.
