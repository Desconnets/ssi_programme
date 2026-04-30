#!/bin/bash
# ── Lanceur SSI / Diagonal – double-clic pour démarrer ──────────────────────
# Ce script ouvre un Terminal et lance le serveur Python.
# Le serveur ouvre automatiquement la scène et la télécommande dans le navigateur.
#
# Pour désactiver l'ouverture auto du navigateur :
#   SSI_OPEN_SCENE=0 SSI_PHASE_PANEL=0 python3 server.py
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   SSI · Playlist Visuelle            ║"
echo "  ║   http://localhost:3000              ║"
echo "  ║   Télécommande : /phase_panel.html   ║"
echo "  ║   Ctrl+C pour arrêter                ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

python3 server.py
