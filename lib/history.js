// Historique des échanges dans data/history.json, le plus récent en premier.
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'history.json';

// compareId relie les réponses d'un même envoi en mode « Comparer » ;
// cliDemandee, cliUtilisee et bascule décrivent une bascule automatique (HM-23) ;
// relayFrom pointe vers l'échange relayé, relayKind vaut « relecture » ou « envoi » (HM-15).
const OPTIONAL = ['cliId', 'erreur', 'compareId', 'cliDemandee', 'cliUtilisee', 'bascule', 'relayFrom', 'relayKind', 'relayFromCli'];

function list() {
  const entries = readJson(FILE, []);
  return Array.isArray(entries) ? entries : [];
}

function find(id) {
  return list().find((entry) => entry.id === id) || null;
}

function add(fields) {
  const { cli, prompt, reponse, dureeMs, ok } = fields;
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), cli, prompt, reponse, dureeMs, ok };
  for (const key of OPTIONAL) if (fields[key] !== undefined) entry[key] = fields[key];
  writeJson(FILE, [entry, ...list()]);
  return entry;
}

module.exports = { list, find, add };
