/**
 * Serveur local : sert l'app + les dossiers musique/ et stickers/
 * API : GET /api/tracks et GET /api/stickers pour lister les fichiers
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const MUSIQUE_DIR = path.join(__dirname, 'musique');
const STICKERS_DIR = path.join(__dirname, 'stickers');

const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function listFiles(dir, exts) {
  try {
    const names = fs.readdirSync(dir);
    return names
      .filter((name) => exts.includes(path.extname(name).toLowerCase()))
      .sort();
  } catch (e) {
    return [];
  }
}

app.use(express.static(__dirname));
app.use('/musique', express.static(MUSIQUE_DIR));
app.use('/stickers', express.static(STICKERS_DIR));

app.get('/api/tracks', (req, res) => {
  const files = listFiles(MUSIQUE_DIR, AUDIO_EXT);
  res.json(files.map((f) => `/musique/${encodeURIComponent(f)}`));
});

app.get('/api/stickers', (req, res) => {
  const files = listFiles(STICKERS_DIR, IMAGE_EXT);
  res.json(files.map((f) => `/stickers/${encodeURIComponent(f)}`));
});

app.listen(PORT, () => {
  console.log(`\n  Playlist visuelle années 2000\n  http://localhost:${PORT}\n  Mets tes musiques dans le dossier "musique/" et tes images/GIF dans "stickers/".\n`);
});
