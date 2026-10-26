// Sessions (HM-22) dans data/sessions.json : [{ id, title, createdAt }].
// Un titre vide veut dire « début du premier prompt » ; les échanges sont dans history.json (sessionId).
const crypto = require('crypto');
const { readJson, writeJson } = require('./store');

const FILE = 'sessions.json';
const IMPORTED = { id: 'historique-importe', title: 'Historique importé' };
const TITLE_MAX = 80;

function list() {
  const sessions = readJson(FILE, []);
  return Array.isArray(sessions) ? sessions : [];
}

function get(id) {
  return list().find((session) => session.id === id) || null;
}

function create({ id = crypto.randomUUID(), title = '' } = {}) {
  const session = { id, title, createdAt: new Date().toISOString() };
  writeJson(FILE, [session, ...list()]);
  return session;
}

// Session des échanges d'avant HM-22, créée une seule fois.
function ensureImported() {
  return get(IMPORTED.id) || create(IMPORTED);
}

function rename(id, input) {
  const title = String(input || '').trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX);
  const sessions = list();
  const session = sessions.find((s) => s.id === id);
  if (!session) return null;
  session.title = title;
  writeJson(FILE, sessions);
  return session;
}

function remove(id) {
  const sessions = list();
  const next = sessions.filter((s) => s.id !== id);
  if (next.length === sessions.length) return false;
  writeJson(FILE, next);
  return true;
}

module.exports = { IMPORTED, list, get, create, ensureImported, rename, remove };
