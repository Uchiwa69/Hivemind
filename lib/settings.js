// Réglages dans data/settings.json : dossier de travail et bascule automatique (HM-23).
const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./store');
const { CLIS } = require('./clis');

const FILE = 'settings.json';
const DEFAULT_ORDER = ['claude', 'agy', 'codex', 'gemini'];

// Ordre de bascule : ids connus, sans doublon, complété par les CLI oubliées.
function normalizeOrder(order) {
  const ids = Array.isArray(order) ? order.map(String).filter((id) => Object.hasOwn(CLIS, id)) : [];
  return [...new Set([...ids, ...DEFAULT_ORDER, ...Object.keys(CLIS)])];
}

function get() {
  const settings = readJson(FILE, {}) || {};
  return {
    workdir: typeof settings.workdir === 'string' ? settings.workdir : '',
    fallback: typeof settings.fallback === 'boolean' ? settings.fallback : true,
    fallbackOrder: normalizeOrder(settings.fallbackOrder),
    simulateClaudeDown: settings.simulateClaudeDown === true,
  };
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

// Ne modifie que les réglages présents et bien typés dans input.
function setOptions(input = {}) {
  const settings = get();
  if (typeof input.fallback === 'boolean') settings.fallback = input.fallback;
  if (typeof input.simulateClaudeDown === 'boolean') settings.simulateClaudeDown = input.simulateClaudeDown;
  if (Array.isArray(input.fallbackOrder)) settings.fallbackOrder = normalizeOrder(input.fallbackOrder);
  writeJson(FILE, settings);
  return settings;
}

module.exports = { get, workdir, setWorkdir, setOptions };
