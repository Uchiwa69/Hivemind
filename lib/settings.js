// Réglages dans data/settings.json (pour l'instant : le dossier de travail).
const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./store');

const FILE = 'settings.json';

function get() {
  const settings = readJson(FILE, {});
  return { workdir: typeof settings.workdir === 'string' ? settings.workdir : '' };
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// Renvoie le dossier de travail s'il est défini et existe encore, sinon null.
function workdir() {
  const dir = get().workdir;
  return dir && isDirectory(dir) ? dir : null;
}

// Lève une erreur au message lisible si le chemin n'est pas un dossier existant.
function setWorkdir(input) {
  const raw = String(input || '').trim().replace(/^"(.*)"$/, '$1');
  if (!raw) throw new Error('Indiquez un chemin de dossier, ex. C:\\Users\\moi\\projets\\demo');
  if (!path.isAbsolute(raw)) throw new Error('Le chemin doit être complet, ex. C:\\Users\\moi\\projets\\demo');
  const dir = path.resolve(raw);
  if (!isDirectory(dir)) throw new Error(`Ce dossier n'existe pas : ${dir}`);
  const settings = { ...get(), workdir: dir };
  writeJson(FILE, settings);
  return settings;
}

module.exports = { get, workdir, setWorkdir };
