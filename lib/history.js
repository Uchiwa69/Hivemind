// Historique des échanges dans data/history.json, le plus récent en premier.
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'history.json';

function list() {
  const entries = readJson(FILE, []);
  return Array.isArray(entries) ? entries : [];
}

// compareId (optionnel) relie les réponses d'un même envoi en mode « Comparer ».
function add({ cli, prompt, reponse, dureeMs, ok, compareId }) {
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), cli, prompt, reponse, dureeMs, ok };
  if (compareId) entry.compareId = compareId;
  writeJson(FILE, [entry, ...list()]);
  return entry;
}

module.exports = { list, add };
