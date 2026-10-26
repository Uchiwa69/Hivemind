// Stockage local en fichiers : data/ du projet (ignoré par Git) ou %APPDATA%\Hivemind en mode installé (HM-25).
// Lectures/écritures synchrones : pas d'entrelacement entre deux requêtes simultanées.
const fs = require('fs');
const path = require('path');

const { DATA_DIR } = require('./paths');

function file(name) {
  return path.join(DATA_DIR, name);
}

function readText(name, fallback = '') {
  try {
    return fs.readFileSync(file(name), 'utf8');
  } catch {
    return fallback;
  }
}

// Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser un fichier à moitié écrit.
function writeText(name, content) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file(`${name}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file(name));
}

function readJson(name, fallback) {
  try {
    return JSON.parse(readText(name));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  writeText(name, JSON.stringify(value, null, 2));
}

module.exports = { DATA_DIR, readText, writeText, readJson, writeJson };
