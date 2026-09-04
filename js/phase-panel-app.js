/**
 * Panneau web télécommande (`/phase_panel.html`) — module autonome, extensible.
 *
 * - Boutons générés depuis `GET /api/phase-remote` → `panelPhases` (source de vérité serveur).
 * - Journal local (bloc dédié) + ligne d’état.
 * - Vidéos : `<select>` alimenté par `phaseVideoFiles`.
 *
 * Extensions : voir `docs/remote-panel.md` et `ssi_server/phase_remote_state.py`.
 */
const API = '/api/phase-remote';

/** Si le serveur est plus vieux que le panneau. */
const FALLBACK_PANEL_PHASES = [
  { id: 'snake', label: 'Snake', needsVideoIndex: false, hint: '' },
  { id: 'super_boom', label: 'Super boom', needsVideoIndex: false, hint: '' },
  { id: 'os_video', label: 'Fenêtre vidéo', needsVideoIndex: true, hint: '' },
  { id: 'logo', label: 'Logo', needsVideoIndex: false, hint: '' },
  { id: 'webcam', label: 'Webcam', needsVideoIndex: false, hint: '' },
];

function timeShort() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

class PanelLog {
  /**
   * @param {HTMLElement} el
   * @param {number} [maxLines]
   */
  constructor(el, maxLines = 150) {
    this.el = el;
    this.maxLines = maxLines;
    /** @type {string[]} */
    this.lines = [];
  }

  /**
   * @param {'info'|'cmd'|'ok'|'warn'|'err'} kind
   */
  append(kind, msg, extra = '') {
    const line = `${timeShort()} [${kind}] ${msg}${extra ? ` — ${extra}` : ''}`;
    this.lines.push(line);
    while (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
    this.el.textContent = this.lines.join('\n');
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear() {
    this.lines = [];
    this.el.textContent = '';
  }
}

async function fetchState() {
  const r = await fetch(API);
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
}

/**
 * @param {Record<string, unknown>} body
 */
async function postRemote(body) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* texte brut */
  }
  return { ok: r.ok, status: r.status, text, json };
}

/**
 * @param {string} phase
 * @param {number | null | undefined} videoIndex
 */
async function postPhase(phase, videoIndex) {
  const body = { phase };
  if (videoIndex != null && Number.isFinite(videoIndex)) {
    body.videoIndex = videoIndex;
  }
  return postRemote(body);
}

/**
 * @param {HTMLSelectElement} select
 * @param {string[]} files
 */
function fillVideoSelect(select, files) {
  const prev = select.value;
  select.replaceChildren();
  if (!files.length) {
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = '(aucune vidéo dans phase_videos/)';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  files.forEach((f, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i} — ${f}`;
    select.appendChild(opt);
  });
  const n = files.length;
  const want = parseInt(prev, 10);
  if (Number.isFinite(want) && want >= 0 && want < n) {
    select.value = String(want);
  }
}

/**
 * @param {HTMLSelectElement} select
 * @param {string[]} files
 */
function fillBackgroundSelect(select, files) {
  const prev = select.value;
  select.replaceChildren();
  if (!files.length) {
    const opt = document.createElement('option');
    opt.value = '0';
    opt.textContent = '(aucun fichier dans backgrounds/)';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  files.forEach((f, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i} — ${f}`;
    select.appendChild(opt);
  });
  const n = files.length;
  const want = parseInt(prev, 10);
  if (Number.isFinite(want) && want >= 0 && want < n) {
    select.value = String(want);
  }
}

/**
 * @param {HTMLElement} container
 * @param {Array<{ id: string, label: string, needsVideoIndex?: boolean, hint?: string }>} phases
 * @param {(meta: { id: string, label: string, needsVideoIndex?: boolean }) => void} onPhase
 */
function renderPhaseButtons(container, phases, onPhase) {
  container.replaceChildren();
  for (const p of phases) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'panel-action-btn';
    b.dataset.phaseId = p.id;
    b.textContent = p.label;
    if (p.hint) b.title = p.hint;
    b.addEventListener('click', () => onPhase(p));
    container.appendChild(b);
  }
}

function getSelectedVideoIndex(select) {
  if (!select || select.disabled) return 0;
  return Math.max(0, parseInt(select.value, 10) || 0);
}

async function bootstrap() {
  const logEl = document.getElementById('panelLog');
  const actionsEl = document.getElementById('panelActions');
  const videoSelect = /** @type {HTMLSelectElement} */ (document.getElementById('panelVideoSelect'));
  const bgSelect = /** @type {HTMLSelectElement} */ (document.getElementById('panelBgSelect'));
  const bgOpacity = /** @type {HTMLInputElement} */ (document.getElementById('panelBgOpacity'));
  const bgOpacityVal = document.getElementById('panelBgOpacityVal');
  const bgAuto = /** @type {HTMLInputElement} */ (document.getElementById('panelBgAutoRotate'));
  const statusLine = document.getElementById('panelStatusLine');
  const btnRefresh = document.getElementById('btnPanelRefresh');
  const btnClearLog = document.getElementById('btnPanelLogClear');
  const btnBgOpacityApply = document.getElementById('btnPanelBgOpacityApply');
  const btnBgOpacityReset = document.getElementById('btnPanelBgOpacityReset');
  const btnBgApply = document.getElementById('btnPanelBgApply');
  const idleResumeSec = /** @type {HTMLInputElement} */ (document.getElementById('panelIdleResumeSec'));
  const btnIdleResumeApply = document.getElementById('btnPanelIdleResumeApply');
  const videoMutedCheck = /** @type {HTMLInputElement} */ (document.getElementById('panelVideoMuted'));
  const btnThemeSsi = document.getElementById('btnThemeSsi');
  const btnThemeDiagonal = document.getElementById('btnThemeDiagonal');
  const panelContentSets = document.getElementById('panelContentSets');
  const btnContentSetNone = document.getElementById('btnContentSetNone');
  const btnPausePhases = document.getElementById('btnPausePhases');

  if (
    !logEl ||
    !actionsEl ||
    !videoSelect ||
    !bgSelect ||
    !bgOpacity ||
    !bgOpacityVal ||
    !bgAuto ||
    !statusLine ||
    !btnRefresh ||
    !btnClearLog ||
    !btnBgOpacityApply ||
    !btnBgOpacityReset ||
    !btnBgApply ||
    !idleResumeSec ||
    !btnIdleResumeApply ||
    !btnThemeSsi ||
    !btnThemeDiagonal ||
    !btnPausePhases ||
    !videoMutedCheck ||
    !panelContentSets ||
    !btnContentSetNone
  ) {
    console.error('[phase-panel] DOM incomplet');
    return;
  }

  const log = new PanelLog(logEl);

  const syncOpacityLabel = () => {
    bgOpacityVal.textContent = `${bgOpacity.value}%`;
  };
  bgOpacity.addEventListener('input', syncOpacityLabel);
  syncOpacityLabel();

  const runPhase = async (p) => {
    const vi = p.needsVideoIndex ? getSelectedVideoIndex(videoSelect) : null;
    log.append('cmd', `${p.label} (${p.id})`, vi != null ? `vidéo #${vi}` : '');
    try {
      const res = await postPhase(p.id, vi);
      if (res.ok && res.json) {
        log.append('ok', `serveur seq=${res.json.seq}`, String(res.json.phase || ''));
        statusLine.textContent = `seq=${res.json.seq} · phase=${res.json.phase ?? '?'}`;
      } else {
        log.append('err', `HTTP ${res.status}`, res.text.slice(0, 500));
        statusLine.textContent = `Erreur HTTP ${res.status}`;
      }
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  };

  const refresh = async () => {
    try {
      const j = await fetchState();
      const phases =
        Array.isArray(j.panelPhases) && j.panelPhases.length > 0 ? j.panelPhases : FALLBACK_PANEL_PHASES;

      renderPhaseButtons(actionsEl, phases, runPhase);

      fillVideoSelect(videoSelect, j.phaseVideoFiles || []);
      const bgFiles = j.backgroundVideoFiles || [];
      fillBackgroundSelect(bgSelect, bgFiles);

      if (j.bgGradientOpacity == null || j.bgGradientOpacity === '') {
        bgOpacity.value = '65';
      } else {
        const pct = Math.round(Math.max(0, Math.min(1, Number(j.bgGradientOpacity))) * 100);
        bgOpacity.value = String(Number.isFinite(pct) ? pct : 65);
      }
      syncOpacityLabel();

      const ir = Number(j.idleResumeMs);
      if (Number.isFinite(ir) && ir > 0) {
        const sec = Math.round(ir / 1000);
        idleResumeSec.value = String(Math.max(3, Math.min(900, sec)));
      }

      /* Sync case muet vidéo */
      videoMutedCheck.checked = j.videoMuted !== false;

      /* Sync boutons mood */
      const activeTheme = typeof j.theme === 'string' ? j.theme : 'classique';
      btnThemeSsi.classList.toggle('active', activeTheme === 'classique');
      btnThemeDiagonal.classList.toggle('active', activeTheme === 'dark');

      /* Sync content sets — génère les boutons dynamiquement */
      const activeCSet = typeof j.contentSet === 'string' ? j.contentSet : '';
      const available = Array.isArray(j.availableContentSets) ? j.availableContentSets : [];
      syncContentSetButtons(available, activeCSet);

      /* Sync bouton pause */
      const isPaused = Boolean(j.phasesPaused);
      btnPausePhases.textContent = isPaused ? '▶ Reprendre les phases' : '⏸ Pause phases (fond uniquement)';
      btnPausePhases.style.background = isPaused ? '#2a6e2a' : '';

      bgAuto.checked = Boolean(j.backgroundAutoRotate);
      const nBg = bgFiles.length;
      if (!j.backgroundAutoRotate && j.backgroundVideoIndex != null && nBg > 0) {
        const want = Math.max(0, Math.min(nBg - 1, Math.floor(Number(j.backgroundVideoIndex))));
        if (Number.isFinite(want)) {
          bgSelect.value = String(want);
        }
      }

      statusLine.textContent = `seq=${j.seq ?? '?'} · ${j.phase ?? '—'} · sync`;
      log.append(
        'info',
        'Synchronisation API',
        `${phases.length} action(s), phase_videos ${j.phaseVideoCount ?? 0}, backgrounds ${j.backgroundVideoCount ?? 0}`,
      );
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'GET /api/phase-remote', m);
      statusLine.textContent = m;
      renderPhaseButtons(actionsEl, FALLBACK_PANEL_PHASES, runPhase);
    }
  };

  const logRemoteResult = (label, res) => {
    if (res.ok && res.json) {
      log.append('ok', `${label} seq=${res.json.seq}`, String(res.json.phase ?? ''));
      statusLine.textContent = `seq=${res.json.seq} · phase=${res.json.phase ?? '?'}`;
    } else {
      log.append('err', `${label} HTTP ${res.status}`, res.text.slice(0, 500));
      statusLine.textContent = `Erreur HTTP ${res.status}`;
    }
  };

  btnBgOpacityApply.addEventListener('click', async () => {
    const v = Math.max(0, Math.min(100, parseInt(bgOpacity.value, 10) || 0)) / 100;
    log.append('cmd', 'Opacité dégradé', String(v));
    try {
      const res = await postRemote({ bgGradientOpacity: v });
      logRemoteResult('POST fond', res);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  });

  btnBgOpacityReset.addEventListener('click', async () => {
    log.append('cmd', 'Opacité dégradé', 'défaut CSS (null)');
    try {
      const res = await postRemote({ bgGradientOpacity: null });
      logRemoteResult('POST fond', res);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  });

  /** Génère (ou met à jour) les boutons de content sets depuis la liste API. */
  let _lastContentSetList = '';
  const syncContentSetButtons = (available, activeCSet) => {
    const key = available.join(',');
    if (key !== _lastContentSetList) {
      _lastContentSetList = key;
      // Vider sauf le bouton "Racine"
      [...panelContentSets.querySelectorAll('.content-set-btn:not(#btnContentSetNone)')].forEach(b => b.remove());
      for (const cs of available) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'content-set-btn';
        btn.dataset.cs = cs;
        btn.textContent = cs;
        btn.addEventListener('click', () => sendContentSet(cs));
        panelContentSets.appendChild(btn);
      }
    }
    // Mettre à jour l'état actif
    btnContentSetNone.classList.toggle('active', activeCSet === '');
    panelContentSets.querySelectorAll('.content-set-btn[data-cs]').forEach(b => {
      b.classList.toggle('active', b.dataset.cs === activeCSet);
    });
  };

  const sendContentSet = async (cs) => {
    log.append('cmd', 'Content set', cs || '(racine)');
    try {
      const res = await postRemote({ contentSet: cs });
      if (res.ok && res.json) {
        const active = res.json.contentSet || '';
        btnContentSetNone.classList.toggle('active', active === '');
        panelContentSets.querySelectorAll('.content-set-btn[data-cs]').forEach(b => {
          b.classList.toggle('active', b.dataset.cs === active);
        });
        log.append('ok', `contenu→${active || 'racine'} seq=${res.json.seq}`);
        statusLine.textContent = `seq=${res.json.seq} · contenu=${active || 'racine'}`;
        void refresh();
      } else {
        log.append('err', `HTTP ${res.status}`, res.text.slice(0, 500));
      }
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST contentSet', m);
    }
  };

  btnContentSetNone.addEventListener('click', () => sendContentSet(''));

  const sendTheme = async (theme) => {
    log.append('cmd', 'Thème identité', theme);
    try {
      const res = await postRemote({ theme });
      if (res.ok && res.json) {
        const t = res.json.theme || theme;
        btnThemeSsi.classList.toggle('active', t === 'classique');
        btnThemeDiagonal.classList.toggle('active', t === 'dark');
        log.append('ok', `thème→${t} seq=${res.json.seq}`);
        statusLine.textContent = `seq=${res.json.seq} · thème=${t}`;
        /* Rafraîchir les listes de fichiers (vidéos phase + fonds) du nouveau thème */
        void refresh();
      } else {
        log.append('err', `HTTP ${res.status}`, res.text.slice(0, 500));
        statusLine.textContent = `Erreur HTTP ${res.status}`;
      }
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST thème', m);
      statusLine.textContent = m;
    }
  };

  videoMutedCheck.addEventListener('change', async () => {
    const muted = videoMutedCheck.checked;
    log.append('cmd', muted ? '🔇 Vidéo muette' : '🔊 Son vidéo activé');
    try {
      const res = await postRemote({ videoMuted: muted });
      logRemoteResult('POST mute vidéo', res);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  });

  btnThemeSsi.addEventListener('click', () => sendTheme('classique'));
  btnThemeDiagonal.addEventListener('click', () => sendTheme('dark'));

  btnPausePhases.addEventListener('click', async () => {
    const nowPaused = btnPausePhases.textContent.includes('Pause');
    const next = nowPaused;
    log.append('cmd', next ? 'Pause phases' : 'Reprise phases');
    try {
      const res = await postRemote({ pausePhases: next });
      if (res.ok && res.json) {
        const p = Boolean(res.json.phasesPaused);
        btnPausePhases.textContent = p ? '▶ Reprendre les phases' : '⏸ Pause phases (fond uniquement)';
        btnPausePhases.style.background = p ? '#2a6e2a' : '';
        log.append('ok', p ? 'Phases en pause — fond actif' : 'Phases reprises');
        statusLine.textContent = `seq=${res.json.seq} · ${p ? 'pause' : 'actif'}`;
      } else {
        log.append('err', `HTTP ${res.status}`, res.text.slice(0, 500));
      }
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST pause', m);
    }
  });

  btnIdleResumeApply.addEventListener('click', async () => {
    let sec = parseInt(idleResumeSec.value, 10);
    if (!Number.isFinite(sec)) sec = 60;
    sec = Math.max(3, Math.min(900, sec));
    idleResumeSec.value = String(sec);
    const ms = sec * 1000;
    log.append('cmd', 'Reprise auto boucle', `${sec} s (${ms} ms)`);
    try {
      const res = await postRemote({ idleResumeMs: ms });
      logRemoteResult('POST idle', res);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  });

  btnBgApply.addEventListener('click', async () => {
    if (bgAuto.checked) {
      log.append('cmd', 'Fond vidéo', 'rotation auto');
      try {
        const res = await postRemote({ backgroundAutoRotate: true });
        logRemoteResult('POST fond', res);
      } catch (e) {
        const m = e && e.message ? e.message : String(e);
        log.append('err', 'POST', m);
        statusLine.textContent = m;
      }
      return;
    }
    if (bgSelect.disabled) {
      log.append('warn', 'Fond', 'aucun fichier backgrounds/');
      return;
    }
    const idx = getSelectedVideoIndex(bgSelect);
    log.append('cmd', 'Fond vidéo', `manuel #${idx}`);
    try {
      const res = await postRemote({
        backgroundVideoIndex: idx,
        backgroundAutoRotate: false,
      });
      logRemoteResult('POST fond', res);
    } catch (e) {
      const m = e && e.message ? e.message : String(e);
      log.append('err', 'POST', m);
      statusLine.textContent = m;
    }
  });

  btnRefresh.addEventListener('click', () => {
    log.append('info', 'Rafraîchissement manuel');
    void refresh();
  });
  btnClearLog.addEventListener('click', () => {
    log.clear();
    log.append('info', 'Journal effacé');
  });

  await refresh();
}

void bootstrap();
