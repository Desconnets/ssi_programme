/**
 * Playlist visuelle années 2000
 * - Lecture audio depuis le dossier musique/
 * - Stickers (images/GIF) flottants et réactifs au son
 * - Fond animé qui alterne entre thèmes clair/sombre
 *
 * NOTES D'EFFETS (qui réagit à quoi) :
 * - Détection de beat : basée sur l'énergie globale (overall) au‑dessus de BEAT_THRESHOLD
 * - Basses (bass) : zoom global du fond + rotation/zoom de certains stickers
 * - Médiums (mid) : zoom de certains stickers, petites rotations
 * - Aigus (high) : un type de sticker a un zoom plus fort sur les aigus
 * - Beat :
 *   - flash blanc (overlay)
 *   - petit punch de zoom sur tout l'écran
 *   - boost de zoom/rotation sur plusieurs comportements de stickers
 */

// --- État audio global ---
let audioContext = null;
let analyser = null;
let audioSource = null;
let currentAudio = null;
let jingleAudio = null;
let playlist = [];
let currentIndex = -1;
let jingleUrls = [];
let tracksSinceJingle = 0;
let dataArray = null;
let bufferLength = 0;
let lastBeatTime = 0;
let lastBassBeatTime = 0;

// Détection de beat global : plus bas = plus sensible
const BEAT_THRESHOLD = 0.48;
const BEAT_COOLDOWN_MS = 100;

// Détection de beat de basse (kick)
const BASS_BEAT_THRESHOLD = 0.58;
const BASS_BEAT_COOLDOWN_MS = 140;

// --- Raccourcis DOM principaux ---
const stickersLayer = document.getElementById('stickersLayer');
const background = document.getElementById('background');
const beatOverlay = document.getElementById('beatOverlay');
const bgGradient = document.getElementById('bgGradient');
const btnPrev = document.getElementById('btnPrev');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnNext = document.getElementById('btnNext');
const btnFullscreen = document.getElementById('btnFullscreen');

const startTime = performance.now();

// Thèmes de fond : clair / sombre / intermédiaire (alternés dans le temps)
const BG_THEMES = [
  'dark',   // sombre
  'light',  // clair
  'mid',    // entre-deux
];
let bgThemeIndex = 0;
let lastBgThemeChange = 0;
let smoothBgScale = 1;
// Intervalle long pour des cycles de couleur très progressifs
const BG_THEME_INTERVAL_MS = 52000;

// Plages configurables pour les stickers (taille, mouvement)
const STICKER_MIN_SIZE = 72;
const STICKER_MAX_SIZE = 200;
const STICKER_MIN_AMP = 5;
const STICKER_MAX_AMP = 14;
const STICKER_MIN_SPEED = 0.00035;
const STICKER_MAX_SPEED = 0.0016;
const STICKER_MIN_DELAY = 350;
const STICKER_MAX_DELAY = 3200;

// --- Gestion du cycle "snake" de stickers ---
const SNAKE_SEGMENTS = 15;
const SNAKE_SEGMENT_DELAY_MS = 320;   // délai entre chaque segment du snake
const SNAKE_STICKER_LIFETIME_MS = 16000; // durée approx. avant de passer au sticker suivant
const SUPER_BOOM_DURATION_MS = 60000;    // 1 minute de "boom" avec tous les stickers
const LOGO_PHASE_DURATION_MS = 26000;    // durée de la phase logo au centre

let allStickerUrls = [];
let snakeSet = [];
let currentSnakeSetIndex = 0;
let snakeCyclesDone = 0; // nombre de stickers joués dans le cycle de 3
let snakeTimer = null;
let superBoomTimer = null;
let inSuperBoom = false;
let logoTimer = null;
let logoUrl = null;

// --- Chargement fichiers serveur (musique/ + stickers/ + virgules/ + backgrounds vidéo) ---
async function loadFromServer() {
  try {
    const [trackUrls, stickerUrls, backgroundUrls, virguleUrls] = await Promise.all([
      fetch('/api/tracks').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/stickers').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/backgrounds').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/virgules').then((r) => (r.ok ? r.json() : [])),
    ]);
    console.log('[DEBUG] tracks chargés :', trackUrls.length, trackUrls);
    console.log('[DEBUG] virgules chargées :', virguleUrls.length, virguleUrls);
    return { trackUrls, stickerUrls, backgroundUrls, virguleUrls };
  } catch (e) {
    console.error('[DEBUG] Erreur loadFromServer :', e);
    return { trackUrls: [], stickerUrls: [], backgroundUrls: [], virguleUrls: [] };
  }
}

function initPlaylist(trackUrls) {
  playlist = trackUrls.map((url) => ({ url, name: decodeURIComponent((url.split('/').pop() || '').replace(/\.(mp3|wav|ogg|m4a|aac|webm)$/i, '')) }));
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function initStickers(stickerUrls) {
  allStickerUrls = stickerUrls.slice();
  // Tenter de trouver un logo SSI spécifique en priorité
  logoUrl =
    allStickerUrls.find((u) => /ssi-logo/i.test(u)) ||
    allStickerUrls.find((u) => /logo/i.test(u)) ||
    allStickerUrls[0] ||
    null;
  prepareSnakeSet();
  startVisualCycle();
}

function addStickerFromUrl(url) {
  const img = document.createElement('img');
  img.className = 'sticker';
  img.src = url;

  // Position et taille aléatoires (tailles variées pour un rendu plus vivant)
  const baseX = random(-5, 105);
  const baseY = random(-5, 105);
  const size = random(STICKER_MIN_SIZE, STICKER_MAX_SIZE);

  img.dataset.baseX = String(baseX);
  img.dataset.baseY = String(baseY);
  img.dataset.size = String(size);
  img.dataset.phaseX = String(random(0, Math.PI * 2));
  img.dataset.phaseY = String(random(0, Math.PI * 2));
  img.dataset.ampX = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP));
  img.dataset.ampY = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP));
  img.dataset.floatSpeed = String(random(STICKER_MIN_SPEED, STICKER_MAX_SPEED));
  img.dataset.behavior = String(Math.floor(random(0, 6))); // 0-5 : différents patterns

  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = baseX + '%';
  img.style.top = baseY + '%';
  img.style.transform = 'translate(-50%, -50%) scale(1)';
  img.style.opacity = '0';
  stickersLayer.appendChild(img);

  // Apparition décalée dans le temps pour éviter que tous les GIF arrivent d'un coup
  const delay = random(STICKER_MIN_DELAY, STICKER_MAX_DELAY);
  setTimeout(() => img.classList.add('sticker-visible', 'sticker-in-pop'), delay);
}

function clearStickers() {
  while (stickersLayer.firstChild) {
    stickersLayer.removeChild(stickersLayer.firstChild);
  }
}

function animateStickersOut(callback) {
  const stickers = Array.from(stickersLayer.children);
  if (!stickers.length) {
    if (callback) callback();
    return;
  }
  stickers.forEach((sticker) => {
    sticker.classList.add('sticker-out-plop');
  });
  setTimeout(() => {
    clearStickers();
    if (callback) callback();
  }, 380);
}

function prepareSnakeSet() {
  // Choisir jusqu'à 3 stickers à utiliser pour le cycle "snake"
  const pool = allStickerUrls.slice();
  if (!pool.length) {
    snakeSet = [];
    return;
  }
  // Mélange rapide
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  snakeSet = pool.slice(0, Math.min(3, pool.length));
  currentSnakeSetIndex = 0;
  snakeCyclesDone = 0;
}

function startVisualCycle() {
  if (inSuperBoom) return;
  if (!snakeSet.length && allStickerUrls.length) {
    prepareSnakeSet();
  }
  playNextSnakeSticker();
}

function playNextSnakeSticker() {
  if (snakeTimer) {
    clearTimeout(snakeTimer);
    snakeTimer = null;
  }

  if (!snakeSet.length) return;

  // Après 3 stickers du snake, lancer un SUPER BOOM
  if (snakeCyclesDone >= 3) {
    animateStickersOut(() => startSuperBoom());
    return;
  }

  const url = snakeSet[currentSnakeSetIndex];

  animateStickersOut(() => {
    spawnSnakeForSticker(url);
    currentSnakeSetIndex = (currentSnakeSetIndex + 1) % snakeSet.length;
    snakeCyclesDone += 1;

    snakeTimer = setTimeout(() => {
      playNextSnakeSticker();
    }, SNAKE_STICKER_LIFETIME_MS);
  });
}

function spawnSnakeForSticker(url) {
  // Tête + segments : même sticker, apparition progressive façon serpent
  for (let i = 0; i < SNAKE_SEGMENTS; i++) {
    addSnakeSticker(url, i);
  }
}

function addSnakeSticker(url, index) {
  const img = document.createElement('img');
  img.className = 'sticker';
  img.src = url;

  // On fixe une position de base pour toute la famille de ce snake
  const baseX = random(15, 85);
  const baseY = random(20, 80);
  const size = random(STICKER_MIN_SIZE, STICKER_MAX_SIZE);

  img.dataset.baseX = String(baseX);
  img.dataset.baseY = String(baseY);
  img.dataset.size = String(size);

  // Phases décalées pour créer un effet de suivi
  const basePhase = random(0, Math.PI * 2);
  img.dataset.phaseX = String(basePhase + index * 0.35);
  img.dataset.phaseY = String(basePhase + index * 0.27);

  // Amplitudes et vitesses légèrement différentes suivant l'index
  const ampFactor = 1 + index / SNAKE_SEGMENTS * 0.4;
  img.dataset.ampX = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP) * ampFactor);
  img.dataset.ampY = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP) * ampFactor);
  img.dataset.floatSpeed = String(random(STICKER_MIN_SPEED, STICKER_MAX_SPEED));

  // Tous les segments partagent un comportement mais le décalage de phase crée l'effet de traînée
  img.dataset.behavior = String(Math.floor(random(0, 6)));

  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = baseX + '%';
  img.style.top = baseY + '%';
  img.style.transform = 'translate(-50%, -50%) scale(1)';
  img.style.opacity = '0';
  stickersLayer.appendChild(img);

  const delay = index * SNAKE_SEGMENT_DELAY_MS;
  setTimeout(() => img.classList.add('sticker-visible', 'sticker-in-pop'), delay);
}

function startSuperBoom() {
  inSuperBoom = true;

  // Afficher tous les stickers disponibles en même temps, en mode "boom" pendant 1 minute
  allStickerUrls.forEach((url, idx) => {
    const img = document.createElement('img');
    img.className = 'sticker sticker-visible sticker-in-pop';
    img.src = url;

    const baseX = random(5, 95);
    const baseY = random(10, 90);
    const size = random(STICKER_MIN_SIZE * 0.9, STICKER_MAX_SIZE * 1.1);

    img.dataset.baseX = String(baseX);
    img.dataset.baseY = String(baseY);
    img.dataset.size = String(size);
    img.dataset.phaseX = String(random(0, Math.PI * 2));
    img.dataset.phaseY = String(random(0, Math.PI * 2));
    img.dataset.ampX = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP * 1.3));
    img.dataset.ampY = String(random(STICKER_MIN_AMP, STICKER_MAX_AMP * 1.3));
    img.dataset.floatSpeed = String(random(STICKER_MIN_SPEED, STICKER_MAX_SPEED * 1.2));
    // privilégier les comportements avec punch (0,3,4,5)
    const boomBehaviors = [0, 3, 4, 5];
    img.dataset.behavior = String(boomBehaviors[idx % boomBehaviors.length]);

    img.style.width = size + 'px';
    img.style.height = 'auto';
    img.style.left = baseX + '%';
    img.style.top = baseY + '%';
    img.style.transform = 'translate(-50%, -50%) scale(1)';
    img.style.opacity = '1';
    stickersLayer.appendChild(img);
  });

  if (superBoomTimer) {
    clearTimeout(superBoomTimer);
    superBoomTimer = null;
  }

  superBoomTimer = setTimeout(() => {
    inSuperBoom = false;
    clearStickers();
    startLogoPhase();
  }, SUPER_BOOM_DURATION_MS);
}

function startLogoPhase() {
  clearStickers();
  if (!logoUrl) {
    // Si pas de logo défini, on repart directement sur un cycle snake
    prepareSnakeSet();
    startVisualCycle();
    return;
  }

  const img = document.createElement('img');
  img.className = 'sticker sticker-visible';
  img.src = logoUrl;

  const baseX = 50;
  const baseY = 50;
  const size = 340;

  img.dataset.baseX = String(baseX);
  img.dataset.baseY = String(baseY);
  img.dataset.size = String(size);
  img.dataset.phaseX = '0';
  img.dataset.phaseY = '0';
  img.dataset.ampX = String(STICKER_MIN_AMP * 0.8);
  img.dataset.ampY = String(STICKER_MIN_AMP * 0.8);
  img.dataset.floatSpeed = String(STICKER_MIN_SPEED * 0.6);
  // Comportement "enceinte de kick"
  img.dataset.behavior = '4';

  img.style.width = size + 'px';
  img.style.height = 'auto';
  img.style.left = baseX + '%';
  img.style.top = baseY + '%';
  img.style.transform = 'translate(-50%, -50%) scale(1)';
  img.style.opacity = '1';
  stickersLayer.appendChild(img);

  if (logoTimer) {
    clearTimeout(logoTimer);
    logoTimer = null;
  }

  logoTimer = setTimeout(() => {
    clearStickers();
    prepareSnakeSet();
    startVisualCycle();
  }, LOGO_PHASE_DURATION_MS);
}
// --- Timings de transition (en secondes) ---
// Virgule joue en entier : la musique démarre 0.7s avant la fin de la virgule
const JINGLE_TO_MUSIC_OVERLAP_SEC = 0.7;
// Entre deux musiques : la suivante démarre 0.5s avant la fin de l'actuelle
const MUSIC_TO_MUSIC_OVERLAP_SEC = 0.5;
// Dernière musique du cycle (avant virgule) : la virgule démarre 0.2s avant la fin
const MUSIC_TO_JINGLE_OVERLAP_SEC = 0.2;
// Nombre de morceaux entre deux virgules
const TRACKS_PER_JINGLE = 3;

let transitionTimer = null;

function clearTransitionTimer() {
  if (transitionTimer) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
}

/**
 * Programme un callback `overlapSec` secondes avant la fin de `audio`.
 * Attend les métadonnées si la durée n'est pas encore connue.
 */
function scheduleNearEnd(audio, overlapSec, callback) {
  const doSchedule = () => {
    if (!isFinite(audio.duration) || audio.duration <= 0) {
      console.warn('[DEBUG] scheduleNearEnd — durée invalide pour', audio.src);
      // Fallback : écoute la fin du fichier
      audio.addEventListener('ended', callback, { once: true });
      return;
    }
    const delayMs = Math.max(0, (audio.duration - overlapSec - audio.currentTime) * 1000);
    console.log('[DEBUG] scheduleNearEnd — durée:', audio.duration.toFixed(2) + 's',
      '| overlap:', overlapSec + 's', '| déclenchement dans:', (delayMs / 1000).toFixed(2) + 's');
    transitionTimer = setTimeout(callback, delayMs);
  };

  if (isFinite(audio.duration) && audio.duration > 0) {
    doSchedule();
  } else {
    audio.addEventListener('loadedmetadata', doSchedule, { once: true });
  }
}

// --- Lecture d'une virgule puis enchaînement sur un morceau ---
function playJingle(jingleUrl, thenPlayIndex) {
  clearTransitionTimer();
  if (jingleAudio) {
    jingleAudio.pause();
    jingleAudio.src = '';
  }
  jingleAudio = new Audio(jingleUrl);
  jingleAudio.volume = 1.0;
  console.log('[DEBUG] Lancement virgule :', jingleUrl);

  jingleAudio.play()
    .then(() => {
      console.log('[DEBUG] Virgule OK — durée:', jingleAudio.duration);
      // Musique démarre 0.7s avant la fin de la virgule
      scheduleNearEnd(jingleAudio, JINGLE_TO_MUSIC_OVERLAP_SEC, () => {
        console.log('[DEBUG] Fin virgule approchée → démarrage musique index:', thenPlayIndex);
        playTrack(thenPlayIndex);
      });
    })
    .catch((err) => {
      console.error('[DEBUG] Virgule ERREUR :', err);
      // Si la virgule échoue, on lance quand même la musique
      playTrack(thenPlayIndex);
    });
}

// --- Contrôles de lecture ---
function playTrack(index) {
  clearTransitionTimer();
  if (index < 0 || index >= playlist.length) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
  }

  currentIndex = index;
  tracksSinceJingle += 1;
  const item = playlist[index];
  const capturedCount = tracksSinceJingle; // capture pour la closure
  const nextIndex = (index + 1) % playlist.length;

  console.log('[DEBUG] playTrack index:', index, '| tracksSinceJingle:', capturedCount, '| url:', item.url);

  const audio = new Audio(item.url);
  currentAudio = audio;

  audio.addEventListener('error', (e) => {
    console.error('[DEBUG] Erreur chargement piste :', item.url, e);
  });

  connectAudioToAnalyser(audio);

  audio.play()
    .then(() => {
      console.log('[DEBUG] Lecture musique OK :', item.name, '| durée:', audio.duration);

      const needsJingle = capturedCount >= TRACKS_PER_JINGLE && jingleUrls.length > 0;
      const overlapSec = needsJingle ? MUSIC_TO_JINGLE_OVERLAP_SEC : MUSIC_TO_MUSIC_OVERLAP_SEC;

      console.log('[DEBUG] Prochain enchaînement — needsJingle:', needsJingle, '| overlapSec:', overlapSec);

      scheduleNearEnd(audio, overlapSec, () => {
        // Vérifier que c'est toujours bien ce morceau qui tourne (pas de skip manuel)
        if (currentAudio !== audio) {
          console.log('[DEBUG] Transition annulée (skip manuel détecté)');
          return;
        }
        if (needsJingle) {
          tracksSinceJingle = 0;
          const jingleUrl = jingleUrls[Math.floor(Math.random() * jingleUrls.length)];
          console.log('[DEBUG] Cycle de', TRACKS_PER_JINGLE, 'morceaux atteint → virgule :', jingleUrl);
          playJingle(jingleUrl, nextIndex);
        } else {
          console.log('[DEBUG] Enchaînement musique → musique, index suivant:', nextIndex);
          playTrack(nextIndex);
        }
      });
    })
    .catch((err) => {
      console.error('[DEBUG] Lecture musique ERREUR :', err);
      // Fallback : passer au morceau suivant après 1s
      transitionTimer = setTimeout(() => playTrack(nextIndex), 1000);
    });

  updatePlayButton();
}

function nextTrack() {
  if (!playlist.length) return;
  const nextIndex = (currentIndex + 1 + playlist.length) % playlist.length;
  playTrack(nextIndex);
}

function prevTrack() {
  if (!playlist.length) return;
  const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
  playTrack(prevIndex);
}

function updatePlayButton() {
  if (!btnPlayPause) return;
  const isPlaying = currentAudio && !currentAudio.paused;
  btnPlayPause.textContent = isPlaying ? '⏸' : '▶';
}

function togglePlay() {
  if (!playlist.length) return;
  if (!currentAudio) {
    playTrack(0);
    return;
  }
  if (currentAudio.paused) {
    currentAudio.play().catch(() => {});
  } else {
    currentAudio.pause();
  }
  updatePlayButton();
}

function connectAudioToAnalyser(audio) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
  }
  // Résumer explicitement au cas où le contexte est suspendu (politique autoplay)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  if (audioSource) audioSource.disconnect();
  audioSource = audioContext.createMediaElementSource(audio);
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);
}

// --- Analyse audio & outils de lissage ---
// Palier pour changements doux (évite le saccadé)
function palier(v, steps) {
  return Math.floor(Math.max(0, Math.min(1, v)) * steps) / steps;
}
function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function getAudioLevels() {
  if (!analyser || !dataArray) {
    return {
      bass: 0,
      mid: 0,
      high: 0,
      overall: 0,
      beat: false,
      bassBeat: false,
    };
  }
  analyser.getByteFrequencyData(dataArray);
  const len = bufferLength;
  const bass = dataArray.slice(0, Math.floor(len * 0.1)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(len * 0.1));
  const mid = dataArray.slice(Math.floor(len * 0.1), Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(len * 0.4));
  const high = dataArray.slice(Math.floor(len * 0.5)).reduce((a, b) => a + b, 0) / Math.max(1, Math.floor(len * 0.5));
  const overall = (bass + mid + high) / 3;
  const now = Date.now();
  const beat = overall / 255 > BEAT_THRESHOLD && now - lastBeatTime > BEAT_COOLDOWN_MS;
  if (beat) lastBeatTime = now;
  const bassBeat = bass / 255 > BASS_BEAT_THRESHOLD && now - lastBassBeatTime > BASS_BEAT_COOLDOWN_MS;
  if (bassBeat) lastBassBeatTime = now;
  return {
    bass: bass / 255,
    mid: mid / 255,
    high: high / 255,
    overall: overall / 255,
    beat,
    bassBeat,
  };
}

const SMOOTH_POS = 0.055;   // douceur position (flottement)
const SMOOTH_SCALE = 0.16;  // douceur zoom (plus réactif, tout en restant smooth)
const SMOOTH_ROTATE = 0.09;
const PALIER_STEPS = 5;    // nombre de paliers pour zoom/effets

function applyStickerBehavior(sticker, levels, t) {
  const baseX = parseFloat(sticker.dataset.baseX ?? 50);
  const baseY = parseFloat(sticker.dataset.baseY ?? 50);
  const phaseX = parseFloat(sticker.dataset.phaseX ?? 0);
  const phaseY = parseFloat(sticker.dataset.phaseY ?? 0);
  const ampX = parseFloat(sticker.dataset.ampX ?? 10);
  const ampY = parseFloat(sticker.dataset.ampY ?? 10);
  const floatSpeed = parseFloat(sticker.dataset.floatSpeed ?? 0.00025);
  const behavior = parseInt(sticker.dataset.behavior ?? 0, 10);

  let smoothFloatX = parseFloat(sticker.dataset.smoothFloatX ?? 0);
  let smoothFloatY = parseFloat(sticker.dataset.smoothFloatY ?? 0);
  let smoothScale = parseFloat(sticker.dataset.smoothScale ?? 1);
  let smoothRotate = parseFloat(sticker.dataset.smoothRotate ?? 0);
  let kickEnv = parseFloat(sticker.dataset.kickEnv ?? 0); // enveloppe de kick pour behavior 4

  const { bass, mid, high, overall, beat, bassBeat } = levels;
  const o = palier(overall, PALIER_STEPS);
  const b = palier(bass, PALIER_STEPS);
  const m = palier(mid, PALIER_STEPS);
  const h = palier(high, PALIER_STEPS);

  // Flottement de base : amplitude réduite, vitesse lente, puis lissage
  let targetFloatX = Math.sin(t * floatSpeed + phaseX) * ampX * (0.85 + 0.2 * overall);
  let targetFloatY = Math.cos(t * floatSpeed * 0.8 + phaseY) * ampY * (0.85 + 0.2 * overall);

  // Variantes de trajectoire selon le comportement
  // 1 : plus sensible aux basses sur Y (il « rebondit » avec la basse)
  if (behavior === 1) {
    targetFloatY *= 1.4 + 0.8 * b;
  }
  // 2 : léger effet « vibration » sur X avec les aigus
  if (behavior === 2) {
    targetFloatX += Math.sin(t * floatSpeed * 2 + phaseX * 1.5) * ampX * 0.35 * h;
  }
  // 5 : effet « orbite » plus marqué
  if (behavior === 5) {
    const orbit = Math.sin(t * floatSpeed * 1.6 + phaseX + phaseY) * (ampX + ampY) * (0.6 + 0.4 * m);
    targetFloatX += orbit * 0.5;
    targetFloatY += orbit * 0.3;
  }

  smoothFloatX = lerp(smoothFloatX, targetFloatX, SMOOTH_POS);
  smoothFloatY = lerp(smoothFloatY, targetFloatY, SMOOTH_POS);
  const x = baseX + smoothFloatX;
  const y = baseY + smoothFloatY;

  const isVisible = sticker.classList.contains('sticker-visible');

  let targetScale = 1;
  let targetRotate = 0;

  // Chaque comportement correspond à une façon différente de réagir au son :
  // 0 : zoom global sur l'intensité (overall) + très gros boost au beat global (effet "respiration" + gros boom)
  // 1 : rotation liée aux basses (b) + zoom plus fort sur l'intensité (stickers qui "se balancent" avec une grande course)
  // 2 : zoom fort sur les aigus (h) avec coups marqués au beat, idéal pour des GIF lumineux/détaillés
  // 3 : zoom accentué sur les médiums (m) + boost important au beat (effet "pumping" très visible)
  // 4 : zoom quasi uniquement sur le beat de basse (bassBeat) pour simuler un vrai subwoofer / kick
  // 5 : rotation + zoom sur les médiums (m), plus nerveux, avec boost marqué au beat
  switch (behavior) {
    case 0:
      targetScale = 1 + o * 0.85 + (beat ? 0.6 : 0);
      break;
    case 1:
      targetRotate = b * 22 + (beat ? 12 : 0);
      targetScale = 1 + o * 0.7 + (beat ? 0.45 : 0);
      break;
    case 2:
      targetScale = 1 + h * 0.9 + (beat ? 0.55 : 0);
      break;
    case 3:
      targetScale = 1 + m * 0.8 + (beat ? 0.6 : 0);
      break;
    case 4:
      // comportement "enceinte de kick" : zoom piloté par une enveloppe courte
      // - quand un kick est détecté (bassBeat), on remplit l'enveloppe
      // - ensuite elle décroît progressivement vers 0
      if (bassBeat) {
        kickEnv = 1;
      } else {
        kickEnv = lerp(kickEnv, 0, 0.18);
      }
      // on stocke l'enveloppe sur le sticker pour les frames suivantes
      sticker.dataset.kickEnv = String(kickEnv);
      // à 1, on veut ~3x la taille d'origine (1 + 2.0)
      targetScale = 1 + kickEnv * 2.0;
      break;
    case 5:
      targetRotate = m * 12 + (beat ? 28 : 0);
      targetScale = 1 + m * 0.7 + (beat ? 0.5 : 0);
      break;
    default:
      targetScale = 1 + o * 0.65;
  }

  smoothScale = lerp(smoothScale, targetScale, SMOOTH_SCALE);
  smoothRotate = lerp(smoothRotate, targetRotate, SMOOTH_ROTATE);

  sticker.style.opacity = isVisible ? '1' : '0';

  sticker.dataset.smoothFloatX = String(smoothFloatX);
  sticker.dataset.smoothFloatY = String(smoothFloatY);
  sticker.dataset.smoothScale = String(smoothScale);
  sticker.dataset.smoothRotate = String(smoothRotate);

  sticker.style.left = x + '%';
  sticker.style.top = y + '%';
  sticker.style.transform = `translate(-50%, -50%) scale(${smoothScale}) rotate(${smoothRotate}deg)`;
}

function tick(now = 0) {
  const t = now - startTime;
  const levels = getAudioLevels();
  const { bass, beat } = levels;

  let beatPunch = parseFloat(background.dataset.beatPunch ?? 1);
  if (beat) {
    beatOverlay.classList.add('flash');
    setTimeout(() => beatOverlay.classList.remove('flash'), 130);
    beatPunch = 1.055;
  }
  beatPunch = lerp(beatPunch, 1, 0.18);
  background.dataset.beatPunch = String(beatPunch);

  // Fond : alternance clair / sombre dans le temps
  if (now - lastBgThemeChange > BG_THEME_INTERVAL_MS) {
    lastBgThemeChange = now;
    bgThemeIndex = (bgThemeIndex + 1) % BG_THEMES.length;
    bgGradient.setAttribute('data-theme', BG_THEMES[bgThemeIndex]);
  }

  smoothBgScale = lerp(smoothBgScale, 1 + bass * 0.032, 0.08);
  background.style.transform = `scale(${smoothBgScale * beatPunch})`;

  stickersLayer.querySelectorAll('.sticker').forEach((sticker) => {
    applyStickerBehavior(sticker, levels, t);
  });

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

document.body.addEventListener('click', () => {
  if (audioContext?.state === 'suspended') audioContext.resume();
}, { once: false });

if (btnPlayPause) {
  btnPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioContext?.state === 'suspended') {
      audioContext.resume().then(() => togglePlay());
    } else {
      togglePlay();
    }
  });
}

if (btnNext) {
  btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioContext?.state === 'suspended') {
      audioContext.resume().then(() => nextTrack());
    } else {
      nextTrack();
    }
  });
}

if (btnPrev) {
  btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    if (audioContext?.state === 'suspended') {
      audioContext.resume().then(() => prevTrack());
    } else {
      prevTrack();
    }
  });
}

if (btnFullscreen) {
  btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    const elem = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const request = elem.requestFullscreen || elem.webkitRequestFullscreen;
      if (request) request.call(elem);
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  });
}

(async () => {
  const { trackUrls, stickerUrls, backgroundUrls, virguleUrls } = await loadFromServer();
  initPlaylist(trackUrls);
  initStickers(stickerUrls);
  jingleUrls = virguleUrls || [];

  // Fonds vidéo en boucle : choisir au hasard dans le dossier backgrounds/
  const bgVideoEl = document.getElementById('bgVideo');
  if (bgVideoEl && backgroundUrls && backgroundUrls.length) {
    let bgIndex = Math.floor(Math.random() * backgroundUrls.length);
    const setBg = () => {
      if (!backgroundUrls.length) return;
      bgVideoEl.src = backgroundUrls[bgIndex];
      bgVideoEl.play().catch(() => {});
    };
    setBg();
    if (backgroundUrls.length > 1) {
      setInterval(() => {
        bgIndex = (bgIndex + 1) % backgroundUrls.length;
        setBg();
      }, 180000);
    }
  }

  bgGradient.setAttribute('data-theme', BG_THEMES[0]);
  updatePlayButton();

  console.log('[DEBUG] Init terminée — playlist:', playlist.length, '| jingleUrls:', jingleUrls.length);

  // Démarrage au premier clic sur la page (contournement politique autoplay)
  if (playlist.length) {
    const startOnFirstClick = (e) => {
      // Ne pas déclencher si c'est un bouton de contrôle (ils gèrent eux-mêmes)
      if (e.target.closest && e.target.closest('.mini-controls')) return;
      document.body.removeEventListener('click', startOnFirstClick);
      console.log('[DEBUG] Premier clic détecté — currentAudio:', currentAudio, '| jingleUrls:', jingleUrls.length);
      const hint = document.getElementById('startHint');
      if (hint) hint.style.opacity = '0';
      setTimeout(() => { if (hint) hint.remove(); }, 600);
      if (!currentAudio) {
        tracksSinceJingle = 0; // reset au démarrage
        if (jingleUrls.length) {
          const jingleUrl = jingleUrls[Math.floor(Math.random() * jingleUrls.length)];
          console.log('[DEBUG] Démarrage — virgule intro puis musique index 0');
          playJingle(jingleUrl, 0);
        } else {
          console.warn('[DEBUG] Aucune virgule disponible, musique directe');
          playTrack(0);
        }
      } else {
        console.warn('[DEBUG] currentAudio déjà défini, clic ignoré');
      }
    };
    document.body.addEventListener('click', startOnFirstClick);
  } else {
    console.warn('[DEBUG] Playlist vide, listener de démarrage non enregistré');
  }
})();
