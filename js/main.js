/**
 * Point d’entrée — charge les modules, branche l’UI et l’init serveur.
 */
import { BG_THEMES } from "./config.js";
import { loadFromServer } from "./api.js";
import { debugLog, debugWarn } from "./debug.js";
import * as audio from "./audio.js";
import {
  initStickers,
  initPhaseVideos,
  getStickerLiveInfo,
  requestWebcamPermissionEarly,
  startVisualCycleOnFirstClick,
} from "./phases.js";
import { startRenderingLoop } from "./visuals.js";
import {
  warmBrowserMediaCache,
  getBrowserWarmPromise,
} from "./browser-cache-warm.js";
import { startPhaseRemotePolling } from "./phase-remote.js";
import { initBackgroundPlayback } from "./background-playback.js";

const btnPrev = document.getElementById("btnPrev");
const btnPlayPause = document.getElementById("btnPlayPause");
const btnNext = document.getElementById("btnNext");
const btnFullscreen = document.getElementById("btnFullscreen");
const bgGradient = document.getElementById("bgGradient");

audio.setUiControls({ btnPlayPause });

/** Lecteur bas-droite : visible au survol de la zone, masqué 2 s après la sortie du curseur (mode dev / prod discrète) */
const MINI_CONTROLS_HIDE_MS = 2000;
const miniControlsHud = document.getElementById("miniControlsHud");
let miniControlsHideTimer = null;
if (miniControlsHud) {
  const showMiniControls = () => {
    miniControlsHud.classList.add("is-visible");
    if (miniControlsHideTimer) {
      clearTimeout(miniControlsHideTimer);
      miniControlsHideTimer = null;
    }
  };
  const scheduleHideMiniControls = () => {
    if (miniControlsHideTimer) clearTimeout(miniControlsHideTimer);
    miniControlsHideTimer = setTimeout(() => {
      miniControlsHud.classList.remove("is-visible");
      miniControlsHideTimer = null;
    }, MINI_CONTROLS_HIDE_MS);
  };
  miniControlsHud.addEventListener("mouseenter", showMiniControls);
  miniControlsHud.addEventListener("mouseleave", scheduleHideMiniControls);
}

/**
 * @param {{ noBackground?: boolean }} [opts]
 */
function refreshLiveStatusBanner(opts = {}) {
  const el = document.getElementById("liveStatus");
  if (!el) return;
  const parts = [];
  const nTracks = audio.getPlaylistLength();
  const stickers = getStickerLiveInfo();
  if (!audio.isMicrophoneMode() && nTracks === 0) {
    parts.push("PAS DE MUSIQUE (ajoutez des fichiers dans musique/)");
  }
  if (stickers.usingFallback) {
    parts.push(
      "Stickers SECOURS (dossier stickers/ vide ou image introuvable → SVG)",
    );
  }
  if (opts.noBackground) {
    parts.push("Fond : pas de vidéo (dossier backgrounds/ vide)");
  }
  el.textContent = parts.join(" · ");
  el.hidden = parts.length === 0;
  el.classList.toggle("live-status--warn", parts.length > 0);
}

/**
 * Reprise AudioContext + action dans la même « pile » synchrone que le clic.
 * Si on fait ctx.resume().then(() => play()), le geste utilisateur est souvent perdu :
 * le 1er play() peut être refusé (autoplay policy), surtout au premier chargement.
 */
function resumeContextThenSync(fn) {
  const ctx = audio.getAudioContext();
  if (ctx?.state === "suspended") {
    void ctx.resume();
  }
  fn();
}

// Reprise AudioContext au clic (politique navigateur)
document.body.addEventListener("click", () => {
  const ctx = audio.getAudioContext();
  if (ctx?.state === "suspended") void ctx.resume();
});

if (btnPlayPause) {
  btnPlayPause.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeContextThenSync(() => audio.togglePlay());
  });
}

if (btnNext) {
  btnNext.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeContextThenSync(() => audio.nextTrack());
  });
}

if (btnPrev) {
  btnPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeContextThenSync(() => audio.prevTrack());
  });
}

if (btnFullscreen) {
  btnFullscreen.addEventListener("click", (e) => {
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

// Boucle visuelle immédiate (comme l’ancien app.js)
startRenderingLoop();

/**
 * Caméra : ne pas attendre loadFromServer() — sinon la demande arrive trop tard ou jamais (1er clic déjà passé).
 */
function kickWebcamPermissionAsap() {
  queueMicrotask(() => {
    requestWebcamPermissionEarly(false).catch(() => {});
  });
}
kickWebcamPermissionAsap();

/**
 * 1er pointerdown (souris / touch) = geste pour la caméra si le navigateur l’exige.
 * Évite les appels redondants dans les handlers « premier clic » audio.
 */
function wireWebcamPermissionOnFirstGesture() {
  const run = () => {
    requestWebcamPermissionEarly(true).catch(() => {});
  };
  document.addEventListener("pointerdown", run, { once: true, capture: true });
}
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    wireWebcamPermissionOnFirstGesture,
  );
} else {
  wireWebcamPermissionOnFirstGesture();
}

(async () => {
  const rootEl = document.documentElement;
  rootEl.classList.add("ssi-app-init-pending");
  try {
    const {
      audioInput,
      trackUrls,
      stickerUrls,
      backgroundUrls,
      virguleUrls,
      phaseVideoUrls,
    } = await loadFromServer();
    audio.setAudioInputMode(audioInput);
    if (audio.isMicrophoneMode()) {
      document.body.classList.add("ssi-micro-audio");
      window.addEventListener("beforeunload", () =>
        audio.stopMicrophoneAnalysis(),
      );
    }
    audio.initPlaylist(trackUrls);
    if (trackUrls.length) {
      debugLog(
        "[SSI] Fichiers musique/ (ordre API) — le passage réel est un tour mélangé : chaque MP3 une fois, puis nouveau mélange ; indépendant du cycle visuel.",
        trackUrls
          .map(
            (u, i) =>
              `[${i}] ${decodeURIComponent((u.split("/").pop() || u).replace(/\+/g, " "))}`,
          )
          .join(" · "),
      );
    }
    audio.setJingleUrls(virguleUrls || []);
    initPhaseVideos(phaseVideoUrls || []);
    initStickers(stickerUrls);

    /* Mode micro : ne pas précharger MP3 / virgules (playlist non lue) */
    warmBrowserMediaCache({
      backgroundUrls: backgroundUrls || [],
      phaseVideoUrls: phaseVideoUrls || [],
      virguleUrls: audio.isMicrophoneMode() ? [] : virguleUrls || [],
      trackUrls: audio.isMicrophoneMode() ? [] : trackUrls || [],
    });

    /* Feedback warm dans le startHint (si encore visible) */
    const warmHintSpan = document.querySelector("#startHint span");
    if (warmHintSpan) {
      warmHintSpan.textContent = "⏳ Préchauffage en cours…";
    }
    getBrowserWarmPromise().then(() => {
      const s = document.querySelector("#startHint span");
      if (s && s.parentElement && !s.parentElement.hidden) {
        s.textContent =
          "▶ cliquez pour démarrer — la caméra peut être demandée ici aussi";
      }
      debugLog("[SSI] Warm terminé — démarrage autorisé");
    });

    const hasBg = Boolean(backgroundUrls && backgroundUrls.length);
    initBackgroundPlayback({ backgroundUrls: backgroundUrls || [] });

    refreshLiveStatusBanner({ noBackground: !hasBg });

    if (bgGradient) {
      bgGradient.setAttribute("data-theme", BG_THEMES[0]);
    }
    audio.updatePlayButton();

    debugLog(
      "Init terminée — playlist:",
      audio.getPlaylistLength(),
      "| jingleUrls:",
      audio.getJingleUrls().length,
    );

    if (audio.isMicrophoneMode()) {
      const startMicOnFirstClick = async (e) => {
        const hint = document.getElementById("startHint");
        const ctx = audio.getAudioContext();
        if (ctx?.state === "suspended") {
          await ctx.resume().catch(() => {});
        }
        const result = await audio.startMicrophoneAnalysis();
        if (!result.ok) {
          debugWarn("Micro indisponible ou refusé :", result.reason);
          if (hint) {
            const span = hint.querySelector("span");
            if (span) {
              span.textContent = "⚠ recliquez ou vérifiez les permissions";
            }
          }
          return;
        }
        document.body.removeEventListener("click", startMicOnFirstClick);
        debugLog("Micro connecté — analyse pour les effets");
        /* Même en mode micro : lancer le cycle visuel (sans lecture MP3). */
        startVisualCycleOnFirstClick();
        if (hint) hint.style.opacity = "0";
        setTimeout(() => {
          if (hint) hint.remove();
        }, 600);
      };
      document.body.addEventListener("click", startMicOnFirstClick);
    } else if (audio.getPlaylistLength()) {
      let warmReady = false;
      getBrowserWarmPromise().then(() => {
        warmReady = true;
      });

      const startOnFirstClick = (e) => {
        if (
          e.target.closest &&
          e.target.closest(".mini-controls-hud .mini-controls")
        )
          return;

        /* Clic trop tôt : le warm n'est pas encore terminé */
        if (!warmReady) {
          const s = document.querySelector("#startHint span");
          if (s) s.textContent = "⏳ Encore quelques secondes…";
          getBrowserWarmPromise().then(() => {
            const span = document.querySelector("#startHint span");
            if (span && span.parentElement && !span.parentElement.hidden) {
              span.textContent =
                "▶ cliquez pour démarrer — la caméra peut être demandée ici aussi";
            }
          });
          return;
        }

        document.body.removeEventListener("click", startOnFirstClick);
        debugLog(
          "Premier clic détecté — currentAudio:",
          audio.getCurrentAudio(),
          "| jingleUrls:",
          audio.getJingleUrls().length,
        );
        const hint = document.getElementById("startHint");
        if (hint) hint.style.opacity = "0";
        setTimeout(() => {
          if (hint) hint.remove();
        }, 600);
        /* Lance le cycle visuel (Snake → Boom → Vidéo → Logo → Webcam) */
        startVisualCycleOnFirstClick();

        if (!audio.getCurrentAudio()) {
          audio.setTracksSinceJingle(0);
          const ju = audio.getJingleUrls();
          if (ju.length) {
            const jingleUrl = ju[Math.floor(Math.random() * ju.length)];
            const firstIdx = audio.getFirstTourPlaylistIndex();
            debugLog(
              "Démarrage — virgule intro puis 1ᵉʳ morceau du tour (index playlist",
              firstIdx,
              ")",
            );
            audio.playJingle(jingleUrl, firstIdx);
          } else {
            debugWarn("Aucune virgule disponible, musique directe");
            audio.playTrack(audio.getFirstTourPlaylistIndex());
          }
        } else {
          debugWarn("currentAudio déjà défini, clic ignoré");
        }
      };
      document.body.addEventListener("click", startOnFirstClick);
    } else {
      debugWarn("Playlist vide, listener de démarrage non enregistré");
      document.body.addEventListener(
        "click",
        () => {
          requestWebcamPermissionEarly(true).catch(() => {});
        },
        { once: true },
      );
    }

    rootEl.classList.remove("ssi-app-init-pending");
    startPhaseRemotePolling();
  } catch (err) {
    rootEl.classList.remove("ssi-app-init-pending");
    console.error("[SSI] Erreur au démarrage :", err);
  }
})();
