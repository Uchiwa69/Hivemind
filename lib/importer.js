// HM-25 : au premier lancement installé, propose d'importer un dossier data/ du mode développeur.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./paths');

const FILES = ['history.json', 'memory.md', 'settings.json', 'sessions.json'];
const MARK = '.import-done';

function looksLikeData(dir) {
  return ['history.json', 'memory.md'].some((name) => fs.existsSync(path.join(dir, name)));
}

// Emplacements habituels d'un projet Hivemind cloné.
function candidates() {
  const home = os.homedir();
  const dirs = [
    path.join(home, 'Documents', 'Hivemind', 'data'),
    path.join(home, 'Hivemind', 'data'),
    path.join(home, 'Desktop', 'Hivemind', 'data'),
    path.join(home, 'source', 'repos', 'Hivemind', 'data'),
    path.join(process.cwd(), 'data'),
  ].map((dir) => path.resolve(dir));
  return [...new Set(dirs)].filter((dir) => dir !== path.resolve(DATA_DIR) && looksLikeData(dir));
}

function markDone() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, MARK), new Date().toISOString());
}

// La question n'est posée qu'une fois, et jamais si Hivemind a déjà ses propres données.
function offer() {
  if (fs.existsSync(path.join(DATA_DIR, MARK))) return [];
  if (looksLikeData(DATA_DIR)) {
    markDone();
    return [];
  }
  return candidates();
}

function importFrom(dir) {
  const source = path.resolve(String(dir || ''));
  if (!candidates().includes(source)) throw new Error(`Aucune donnée Hivemind à importer dans ${source}.`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const copied = FILES.filter((name) => fs.existsSync(path.join(source, name)));
  for (const name of copied) fs.copyFileSync(path.join(source, name), path.join(DATA_DIR, name));
  markDone();
  return copied;
}

module.exports = { offer, importFrom, markDone };
