#!/usr/bin/env python3
"""
Panneau minimal (tkinter) pour lancer les phases visuelles à la demande.

Par défaut, `python3 server.py` ouvre le panneau **dans le navigateur** (`/phase_panel.html`).
Ce script tkinter est pour `SSI_PHASE_PANEL=tk` ou un lancement séparé.

Prérequis : serveur actif ; page ouverte (sondage GET /api/phase-remote).

Usage :
  python3 tools/phase_remote_panel.py
  python3 tools/phase_remote_panel.py http://127.0.0.1:3000

Variables d’environnement : SSI_PHASE_REMOTE, ou SSI_PHASE_PANEL=0 sur le serveur.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def base_url() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1].rstrip('/')
    return os.environ.get('SSI_PHASE_REMOTE', 'http://127.0.0.1:3000').rstrip('/')


def http_post_json(path: str, payload: dict) -> tuple[int, str]:
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        base_url() + path,
        data=data,
        method='POST',
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            return resp.status, body
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace') if e.fp else ''
        return e.code, err_body
    except urllib.error.URLError as e:
        return -1, str(e.reason)


def http_get_json(path: str) -> tuple[int, str]:
    req = urllib.request.Request(base_url() + path, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', errors='replace') if e.fp else ''
    except urllib.error.URLError as e:
        return -1, str(e.reason)


def main() -> None:
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        print('tkinter requis (souvent inclus avec Python sur macOS / Windows).', file=sys.stderr)
        sys.exit(1)

    root = tk.Tk()
    root.title('SSI — Télécommande phases')
    root.minsize(320, 280)

    status = tk.StringVar(value=f'Base : {base_url()}')

    frm = ttk.Frame(root, padding=10)
    frm.pack(fill=tk.BOTH, expand=True)

    ttk.Label(frm, textvariable=status, wraplength=380).pack(anchor=tk.W)

    vid_frame = ttk.Frame(frm)
    vid_frame.pack(fill=tk.X, pady=6)
    ttk.Label(vid_frame, text='Vidéo phase (index) :').pack(side=tk.LEFT)
    vid_spin = tk.Spinbox(vid_frame, from_=0, to=0, width=6)
    vid_spin.pack(side=tk.LEFT, padx=6)
    vid_names = tk.StringVar(value='')
    ttk.Label(frm, textvariable=vid_names, wraplength=400, font=('TkFixedFont', 10)).pack(anchor=tk.W)

    def refresh_meta() -> None:
        code, body = http_get_json('/api/phase-remote')
        if code != 200:
            status.set(f'GET erreur {code} — {body[:120]}')
            return
        try:
            j = json.loads(body)
        except json.JSONDecodeError:
            status.set('Réponse JSON invalide')
            return
        n = int(j.get('phaseVideoCount') or 0)
        mx = max(0, n - 1)
        vid_spin.config(from_=0, to=mx)
        files = j.get('phaseVideoFiles') or []
        vid_names.set('\n'.join(f'  [{i}] {f}' for i, f in enumerate(files[:12])))
        seq = j.get('seq', '?')
        status.set(f'OK seq={seq} | {base_url()}')

    def send_phase(phase: str) -> None:
        try:
            idx = int(vid_spin.get())
        except ValueError:
            idx = 0
        payload: dict = {'phase': phase}
        if phase == 'os_video':
            payload['videoIndex'] = idx
        code, body = http_post_json('/api/phase-remote', payload)
        if code != 200:
            messagebox.showerror('Erreur', f'HTTP {code}\n{body[:400]}')
            return
        refresh_meta()

    btns = [
        ('Snake', 'snake'),
        ('Super boom', 'super_boom'),
        ('Fenêtre vidéo', 'os_video'),
        ('Logo', 'logo'),
        ('Webcam', 'webcam'),
    ]
    for label, ph in btns:
        ttk.Button(frm, text=label, command=lambda p=ph: send_phase(p)).pack(fill=tk.X, pady=2)

    ttk.Button(frm, text='Rafraîchir liste vidéos', command=refresh_meta).pack(fill=tk.X, pady=8)
    ttk.Label(
        frm,
        text='Sans nouveau clic ici : délai avant reprise boucle réglable via panneau web (idleResumeMs) ; défaut ~60 s.',
        wraplength=400,
    ).pack(anchor=tk.W, pady=6)

    refresh_meta()
    root.mainloop()


if __name__ == '__main__':
    main()
