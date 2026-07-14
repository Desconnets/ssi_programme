Archive : mode Playlist (juin 2026)
====================================
Ces fichiers contiennent le code complet du mode Playlist avant archivage.

Archivé le : juin 2026
Raison : passage en mode Micro exclusif + préparation des nouvelles features
         (vidéos avec audio, nouvelles phases, UI télécommande).

Fichiers archivés
-----------------
js/audio.js          — Playlist complète : crossfade, virgules, AudioContext,
                        beat detection, mini-contrôles. Tout est ici.
js/api.js            — loadFromServer() avec /api/tracks et /api/virgules.
js/main.js           — Point d'entrée avec branchement playlist au 1er clic,
                        mini-contrôles (prev/play/next/fullscreen).
js/playlist-order.js — Logique d'ordre de lecture (shuffle_once, api_order, custom).
runtime_config.py    — Prompt interactif [1] Playlist / [2] Micro au démarrage.
index.html           — Version complète avec mini-contrôles dans le DOM.

Constantes archivées (toujours dans js/config.js, section playlist)
--------------------------------------------------------------------
JINGLE_TO_MUSIC_OVERLAP_SEC, MUSIC_TO_MUSIC_OVERLAP_SEC, MUSIC_TO_JINGLE_OVERLAP_SEC,
TRACKS_PER_JINGLE, MUSIC_CROSSFADE_MS, MUSIC_FADE_IN_FIRST_MS, JINGLE_FADE_IN_MS,
JINGLE_FADE_OUT_MS, JINGLE_MUSIC_CROSSFADE_MS, MUSIC_DUCK_FOR_JINGLE_MS,
PLAYLIST_ORDER_MODE, PLAYLIST_CUSTOM_ORDER, BROWSER_PREWARM_VIRGULES,
BROWSER_PREWARM_MAX_TRACKS.

Pour réactiver le mode Playlist
---------------------------------
1. Copier js/audio.js → js/audio.js (racine)
2. Copier js/api.js, js/main.js, js/playlist-order.js → js/
3. Copier runtime_config.py → ssi_server/runtime_config.py
4. Restaurer les mini-contrôles dans index.html
5. Remettre les constantes playlist dans config.js si retirées
