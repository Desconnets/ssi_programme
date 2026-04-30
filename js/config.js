/**
 * Constantes centralisées — ajuster ici sans parcourir tout le code.
 */

// Détection de beat global : plus bas = plus sensible
export const BEAT_THRESHOLD = 0.48;
export const BEAT_COOLDOWN_MS = 100;

// Détection de beat de basse (kick)
export const BASS_BEAT_THRESHOLD = 0.58;
export const BASS_BEAT_COOLDOWN_MS = 140;

// Thèmes de fond : clair / sombre / intermédiaire
export const BG_THEMES = ['dark', 'light', 'mid'];
export const BG_THEME_INTERVAL_MS = 52000;

/** Fond vidéo : rotation automatique si plusieurs fichiers dans backgrounds/ (ms). */
export const BG_VIDEO_ROTATE_MS = 180000;
/** Crossfade au changement de fond (ms) — télécommande et rotation auto. */
export const BG_VIDEO_CROSSFADE_MS = 520;

// Stickers (taille, mouvement)
export const STICKER_MIN_SIZE = 72;
export const STICKER_MAX_SIZE = 200;
export const STICKER_MIN_AMP = 5;
export const STICKER_MAX_AMP = 14;
export const STICKER_MIN_SPEED = 0.00035;
export const STICKER_MAX_SPEED = 0.0016;
export const STICKER_MIN_DELAY = 350;
export const STICKER_MAX_DELAY = 3200;

// Cycle snake / super boom / fenêtre OS + vidéo / logo
export const SNAKE_SEGMENTS = 15;
export const SNAKE_SEGMENT_DELAY_MS = 320;
export const SNAKE_STICKER_LIFETIME_MS = 10000;
/**
 * Super boom — stickers explosent. C’est aussi la fenêtre où la 1ʳᵉ vidéo `phase_videos/`
 * est préchargée dans un `<video>` caché avant la fenêtre OS. Augmenter = plus de marge réseau/décode.
 */
export const SUPER_BOOM_DURATION_MS = 10000;

/** Télécommande phases (`/api/phase-remote`) : intervalle de lecture (ms). */
export const PHASE_REMOTE_POLL_MS = 450;
/** Même chose quand l’onglet est en arrière-plan (moins de charge CPU / réseau). */
export const PHASE_REMOTE_POLL_MS_HIDDEN = 2200;
/**
 * Reprise auto boucle si le GET ne fournit pas `idleResumeMs` (serveur ancien) ou valeur invalide.
 * Sinon la durée vient de `POST /api/phase-remote` → `idleResumeMs` (réglable dans le panneau web).
 */
export const PHASE_REMOTE_IDLE_RESUME_MS = 60000;

/**
 * Au chargement de la page : remplir le cache HTTP du navigateur (fetch + blob), **en file d’attente**
 * pour ne pas saturer disque/réseau tout en remplissant le cache (serveur HTTP threadé).
 * Voir aussi côté serveur : `SSI_HTTP_MEDIA_LOG=1` pour voir la durée de chaque GET média.
 */
export const BROWSER_PREWARM_ENABLED = true;
/** Pause entre chaque URL (ms). */
export const BROWSER_PREWARM_GAP_MS = 150;
export const BROWSER_PREWARM_BACKGROUNDS = true;
/**
 * Préchauffe les phase_videos au démarrage (fetch séquentiel).
 * Utile si vous avez plusieurs vidéos en boucle : chaque vidéo ne sera téléchargée qu'une seule fois
 * (les cycles suivants lisent depuis le cache navigateur, sans toucher le serveur).
 * À désactiver si les vidéos font > 30 Mo ou si le warm bloque trop longtemps au démarrage.
 */
export const BROWSER_PREWARM_PHASE_VIDEOS = true;
export const BROWSER_PREWARM_VIRGULES = true;
/** Nombre max de pistes `musique/` à précharger (0 = aucune — les MP3 sont lourds). */
export const BROWSER_PREWARM_MAX_TRACKS = 0;

/**
 * Si play() échoue avec « paused to save power » (Chrome, onglet arrière-plan / vidéo seule) : nouvelles tentatives.
 */
export const OS_WINDOW_PLAY_MAX_RETRIES = 14;
export const OS_WINDOW_PLAY_RETRY_BASE_MS = 220;
/** Si l’onglet n’est pas visible, attente max avant une nouvelle tentative (ms). */
export const OS_WINDOW_PLAY_WAIT_VISIBLE_MS = 12000;
/** Après `play()` OK : si la vidéo reste en pause (fenêtre visible mais image figée), nouvel essai puis fichier suivant. */
export const OS_WINDOW_PLAYING_WATCHDOG_MS = 10000;
export const OS_WINDOW_PLAYING_RETRY_WATCHDOG_MS = 6500;
export const LOGO_PHASE_DURATION_MS = 26000;
/** Phase webcam (après logo) — durée puis retour snake ; pas de réglage serveur */
export const WEBCAM_PHASE_DURATION_MS = 22000;
/** Phase « fausse fenêtre » : garde-fou si jamais `ended` ne part pas */
export const OS_WINDOW_PHASE_MAX_MS = 600000;
/**
 * Durée minimale (ms) de la phase fenêtre OS en thème Diagonal :
 * la vidéo reboucle automatiquement jusqu'à atteindre ce seuil.
 * Mettre à 0 pour désactiver la boucle (comportement SSI par défaut).
 */
export const OS_WINDOW_DIAGONAL_MIN_LOOP_MS = 30000;
/** Durée CSS / timeout fermeture animée (ouvrir / fermer comme une fenêtre) */
export const OS_WINDOW_OPEN_CLOSE_MS = 520;
/** Attente max par fichier (gros .mov / disque lent) avant autre vidéo ou logo */
export const OS_WINDOW_LOAD_WAIT_MS = 90000;
/** Nombre max de fichiers essayés si échecs à la suite */
export const OS_WINDOW_MAX_LOAD_ATTEMPTS = 4;
/** Proportion max de la scène 16:9 occupée par la vidéo (hors chrome fenêtre) */
export const OS_WINDOW_MAX_WIDTH_RATIO = 0.88;
export const OS_WINDOW_MAX_HEIGHT_RATIO = 0.8;
/** Barre de titre + bordures (px) — utilisé pour le calcul de place verticale */
export const OS_WINDOW_CHROME_VERTICAL_PX = 52;
export const OS_WINDOW_CHROME_HORIZONTAL_PX = 8;

/**
 * Phase webcam — fenêtre plus grande que la fenêtre OS (même logique de layout).
 * Le flux caméra garde son ratio ; ce sont des plafonds sur la scène 16:9.
 * maxUpscale : autorise un zoom au-delà du 1:1 pixels (utile si la caméra est en basse résolution).
 */
export const WEBCAM_WINDOW_MAX_WIDTH_RATIO = 0.96;
export const WEBCAM_WINDOW_MAX_HEIGHT_RATIO = 0.9;
export const WEBCAM_WINDOW_MAX_UPSCALE = 1.65;

// Transitions audio — déclenchement du morceau suivant X s avant la fin (chevauchement temporel)
export const JINGLE_TO_MUSIC_OVERLAP_SEC = 0.85;
export const MUSIC_TO_MUSIC_OVERLAP_SEC = 0.7;
export const MUSIC_TO_JINGLE_OVERLAP_SEC = 0.35;
export const TRACKS_PER_JINGLE = 3;

// Fondus (ms) — musique : crossfade entre deux morceaux ; virgule : à peine perceptible
export const MUSIC_CROSSFADE_MS = 1100;
export const MUSIC_FADE_IN_FIRST_MS = 900;
export const JINGLE_FADE_IN_MS = 220;
export const JINGLE_FADE_OUT_MS = 260;
export const JINGLE_MUSIC_CROSSFADE_MS = 580;
export const MUSIC_DUCK_FOR_JINGLE_MS = 380;

/**
 * Ordre de lecture des fichiers `musique/` (un tour = chaque piste une fois, puis nouveau tour).
 *
 * - `'shuffle_once'` — mélange aléatoire à chaque fin de tour (défaut).
 * - `'api_order'` — même ordre que renvoie le serveur (`GET /api/tracks`), en boucle.
 * - `'custom'` — ordre défini par `PLAYLIST_CUSTOM_ORDER` (indices 0 = 1ʳᵉ URL API, etc.).
 *
 * Pour changer plus tard : modifier ici, ou étendre le serveur pour renvoyer ce réglage dans `/api/settings`.
 */
export const PLAYLIST_ORDER_MODE = /** @type {'shuffle_once' | 'api_order' | 'custom'} */ ('shuffle_once');

/**
 * Mode `'custom'` uniquement : indices des pistes dans l’ordre souhaité.
 * Exemple avec 3 morceaux : `[2, 0, 1]` joue d’abord la 3ᵉ URL API, puis la 1ʳᵉ, puis la 2ᵉ.
 * Les indices invalides ou en double sont ignorés ; les pistes oubliées sont ajoutées à la fin (ordre API).
 */
export const PLAYLIST_CUSTOM_ORDER = /** @type {number[]} */ ([]);

// Lissage visuel stickers
export const SMOOTH_POS = 0.055;
export const SMOOTH_SCALE = 0.16;
export const SMOOTH_ROTATE = 0.09;
export const PALIER_STEPS = 5;
