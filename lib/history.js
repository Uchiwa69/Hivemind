// Historique des échanges dans data/history.json, le plus récent en premier.
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'history.json';

// sessionId range l'échange dans une session (HM-22) ;
// compareId relie les réponses d'un même envoi en mode « Comparer » ;
// cliDemandee, cliUtilisee et bascule décrivent une bascule automatique (HM-23) ;
// relayFrom pointe vers l'échange relayé, relayKind vaut « relecture » ou « envoi » (HM-15).
// annule marque un envoi arrêté par l'utilisateur, avec le texte partiel dans reponse (HM-10).
const OPTIONAL = ['annule', 'sessionId', 'cliId', 'erreur', 'compareId', 'cliDemandee', 'cliUtilisee', 'bascule', 'relayFrom', 'relayKind', 'relayFromCli'];

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

// HM-22 : range les échanges sans sessionId dans sessionId ; les autres champs restent intacts.
function migrate(sessionId) {
  const entries = list();
  let moved = 0;
  for (const entry of entries) {
    if (!entry.sessionId) {
      entry.sessionId = sessionId;
      moved += 1;
    }
  }
  if (moved) writeJson(FILE, entries);
  return moved;
}

function removeSession(sessionId) {
  const entries = list();
  const next = entries.filter((entry) => entry.sessionId !== sessionId);
  writeJson(FILE, next);
  return entries.length - next.length;
}

module.exports = { list, find, add, migrate, removeSession };
