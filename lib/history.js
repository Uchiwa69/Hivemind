// Historique des échanges dans data/history.json, le plus récent en premier.
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'history.json';

// compareId relie les réponses d'un même envoi en mode « Comparer » ;
// cliDemandee, cliUtilisee et bascule décrivent une bascule automatique (HM-23).
const OPTIONAL = ['cliId', 'erreur', 'compareId', 'cliDemandee', 'cliUtilisee', 'bascule'];

function list() {
  const entries = readJson(FILE, []);
  return Array.isArray(entries) ? entries : [];
}

function add(fields) {
  const { cli, prompt, reponse, dureeMs, ok } = fields;
  const entry = { id: crypto.randomUUID(), date: new Date().toISOString(), cli, prompt, reponse, dureeMs, ok };
  for (const key of OPTIONAL) if (fields[key] !== undefined) entry[key] = fields[key];
  writeJson(FILE, [entry, ...list()]);
  return entry;
}

module.exports = { list, add };
