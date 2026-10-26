// Historique des échanges dans data/history.json, le plus récent en premier.
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'history.json';

function list() {
  const entries = readJson(FILE, []);
  return Array.isArray(entries) ? entries : [];
}

function add({ cli, prompt, reponse, dureeMs, ok }) {
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), cli, prompt, reponse, dureeMs, ok };
  writeJson(FILE, [entry, ...list()]);
  return entry;
}

module.exports = { list, add };
