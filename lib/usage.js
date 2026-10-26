// HM-16 : compteur d'usage du jour par CLI dans data/usage.json.
// { day: 'AAAA-MM-JJ', clis: { [id]: { envois, echecs, annules, dureeMs } } } ; remis à zéro au changement de jour.
const { readJson, writeJson } = require('./store');

const FILE = 'usage.json';

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function get() {
  const usage = readJson(FILE, null);
  if (!usage || usage.day !== today() || typeof usage.clis !== 'object') return { day: today(), clis: {} };
  return usage;
}

// Un lancement réel de la CLI : réussi, en échec ou annulé, avec sa durée.
function record(cliId, { ok, annule, dureeMs }) {
  const usage = get();
  const counts = usage.clis[cliId] || { envois: 0, echecs: 0, annules: 0, dureeMs: 0 };
  counts.envois += 1;
  if (annule) counts.annules += 1;
  else if (!ok) counts.echecs += 1;
  counts.dureeMs += dureeMs || 0;
  usage.clis[cliId] = counts;
  writeJson(FILE, usage);
}

function reset() {
  const usage = { day: today(), clis: {} };
  writeJson(FILE, usage);
  return usage;
}

function count(cliId) {
  return get().clis[cliId]?.envois || 0;
}

module.exports = { get, record, reset, count };
