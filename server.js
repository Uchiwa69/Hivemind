const crypto = require('crypto');
const os = require('os');
const path = require('path');
const express = require('express');
const { CLIS, listClis, detect, ask, askWithFallback } = require('./lib/clis');
const history = require('./lib/history');
const sessions = require('./lib/sessions');
const settings = require('./lib/settings');
const sync = require('./lib/sync');
const { addDecision } = require('./lib/decisions');
const { readText, writeText } = require('./lib/store');

const MEMORY_FILE = 'memory.md';

const HOST = '127.0.0.1';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Dossier où tournent les CLI : le dossier de travail choisi, sinon le dossier personnel.
function cliCwd() {
  if (!settings.get().workdir) return os.homedir();
  const dir = settings.workdir();
  if (!dir) throw new Error(`Le dossier de travail n'existe plus : ${settings.get().workdir}. Choisissez-en un autre.`);
  return dir;
}

// HM-22 : les échanges d'avant les sessions sont rangés une fois pour toutes dans « Historique importé ».
if (history.list().some((entry) => !entry.sessionId)) {
  history.migrate(sessions.ensureImported().id);
}

// La session demandée si elle existe, sinon une nouvelle.
function sessionFor(body) {
  const id = String(body?.sessionId || '');
  return sessions.get(id) ? id : sessions.create().id;
}

// Détection lancée au démarrage ; la page attend sa fin au premier chargement.
let detection = detect();

app.get('/api/clis', async (req, res) => {
  await detection;
  res.json(listClis());
});

app.post('/api/clis/refresh', async (req, res) => {
  detection = detect();
  res.json(await detection);
});

// HM-15 : l'échange d'origine d'un relais, s'il existe encore dans l'historique.
function relayOf(body) {
  const source = body?.relayFrom ? history.find(String(body.relayFrom)) : null;
  if (!source) return null;
  const relayFromCli = source.cliUtilisee || source.cli;
  return {
    relayFrom: source.id,
    relayKind: body.relayKind === 'relecture' ? 'relecture' : 'envoi',
    relayFromCli,
    sourceId: source.cliId || Object.keys(CLIS).find((id) => CLIS[id].name === relayFromCli),
  };
}

app.post('/api/ask', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const cli = String(req.body?.cli || '');
  if (!prompt) return res.status(400).json({ error: 'Le prompt est vide.' });
  if (!Object.hasOwn(CLIS, cli)) return res.status(400).json({ error: 'CLI inconnue.' });
  let cwd;
  try {
    cwd = cliCwd();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  await detection;
  const { fallback, fallbackOrder, simulateClaudeDown } = settings.get();
  const relay = relayOf(req.body);
  // Une relecture ne doit pas basculer vers l'IA qui a écrit la réponse relue.
  const exclude = relay?.relayKind === 'relecture' && relay.sourceId ? [relay.sourceId] : [];
  const answer = await askWithFallback(cli, prompt, { cwd, simulateClaudeDown, exclude, order: fallback ? fallbackOrder : [] });
  const link = relay ? { relayFrom: relay.relayFrom, relayKind: relay.relayKind, relayFromCli: relay.relayFromCli } : {};
  res.json(history.add({ ...answer, ...link, prompt, sessionId: sessionFor(req.body) }));
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.post('/api/compare', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const ids = [...new Set(Array.isArray(req.body?.clis) ? req.body.clis.map(String) : [])];
  if (!prompt) return res.status(400).json({ error: 'Le prompt est vide.' });
  if (ids.some((id) => !Object.hasOwn(CLIS, id))) return res.status(400).json({ error: 'CLI inconnue.' });
  if (ids.length < 2) return res.status(400).json({ error: 'Cochez au moins 2 CLI pour comparer.' });
  let cwd;
  try {
    cwd = cliCwd();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  // La page peut lancer une requête par colonne (only) avec un compareId commun, pour afficher
  // l'état de chaque IA dès qu'elle a fini (HM-21). Sans only, toutes les CLI partent ensemble.
  const compareId = UUID_RE.test(String(req.body?.compareId || '')) ? String(req.body.compareId) : crypto.randomUUID();
  const only = String(req.body?.only || '');
  if (only && !ids.includes(only)) return res.status(400).json({ error: 'CLI inconnue.' });
  const sessionId = sessionFor(req.body);
  const { simulateClaudeDown } = settings.get();
  const answers = await Promise.all((only ? [only] : ids).map((id) => ask(id, prompt, { cwd, simulateClaudeDown })));
  res.json(answers.map((answer) => history.add({ ...answer, prompt, compareId, sessionId })));
});

app.get('/api/history', (req, res) => {
  res.json(history.list());
});

// --- Sessions (HM-22) ---
// Résumé par session : titre (personnalisé ou début du premier prompt), dernière activité, IA utilisées.
function sessionSummaries() {
  const entries = history.list();
  return sessions.list().map((session) => {
    const own = entries.filter((entry) => entry.sessionId === session.id);
    if (!own.length) return null;
    const first = own[own.length - 1];
    const autoTitle = session.id === sessions.IMPORTED.id ? sessions.IMPORTED.title : first.prompt.replace(/\s+/g, ' ').slice(0, 60);
    // Les échanges d'avant HM-23 n'ont que le nom de la CLI.
    const cliIdOf = (entry) => entry.cliId || Object.keys(CLIS).find((id) => CLIS[id].name === (entry.cliUtilisee || entry.cli));
    const clis = [...new Set(own.filter((entry) => entry.ok !== false).map(cliIdOf).filter(Boolean))];
    return {
      id: session.id,
      title: session.title || autoTitle,
      customTitle: Boolean(session.title),
      createdAt: session.createdAt,
      lastDate: own[0].date,
      count: own.length,
      clis,
    };
  }).filter(Boolean).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

app.get('/api/sessions', (req, res) => {
  res.json(sessionSummaries());
});

app.post('/api/sessions', (req, res) => {
  res.json(sessions.create());
});

app.patch('/api/sessions/:id', (req, res) => {
  const session = sessions.rename(req.params.id, req.body?.title);
  if (!session) return res.status(404).json({ error: 'Session introuvable.' });
  res.json(session);
});

// Supprime la session et ses échanges ; la mémoire n'est pas touchée.
app.delete('/api/sessions/:id', (req, res) => {
  if (!sessions.remove(req.params.id)) return res.status(404).json({ error: 'Session introuvable.' });
  res.json({ removed: history.removeSession(req.params.id) });
});

app.get('/api/memory', (req, res) => {
  res.json({ content: readText(MEMORY_FILE) });
});

app.put('/api/memory', (req, res) => {
  const content = req.body?.content;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Contenu de mémoire invalide.' });
  writeText(MEMORY_FILE, content);
  res.json({ content });
});

// Synchronisation HM-07 (aussi utilisée par HM-24) ; lève une erreur au message lisible si elle est impossible.
// Une mémoire vide n'est recopiée que sur demande explicite (allowEmpty) : elle vide le bloc HIVEMIND des 3 fichiers.
function syncMemory(confirm = [], { allowEmpty = false } = {}) {
  const dir = settings.workdir();
  if (!dir) throw new Error('Choisissez d\'abord un dossier de travail (en haut de la page).');
  const memory = readText(MEMORY_FILE);
  if (!memory.trim() && !allowEmpty) throw new Error('La mémoire est vide : écrivez-la et enregistrez-la avant de synchroniser.');
  if (memory.includes(sync.START) || memory.includes(sync.END)) {
    throw new Error('La mémoire ne doit pas contenir les balises HIVEMIND elles-mêmes.');
  }
  return { dir, results: sync.syncAll(dir, memory, confirm) };
}

app.post('/api/sync', (req, res) => {
  const confirm = Array.isArray(req.body?.confirm) ? req.body.confirm.map(String) : [];
  try {
    res.json(syncMemory(confirm, { allowEmpty: req.body?.allowEmpty === true }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// HM-24 : résumé d'une réponse en une phrase, par la CLI qui l'a écrite (sans bascule ni historique).
app.post('/api/memory/summarize', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  const cli = String(req.body?.cli || '');
  if (!text) return res.status(400).json({ error: 'Rien à résumer : le texte est vide.' });
  if (!Object.hasOwn(CLIS, cli)) return res.status(400).json({ error: 'CLI inconnue.' });
  let cwd;
  try {
    cwd = cliCwd();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  // La question d'origine donne le contexte d'une réponse courte (ex. un seul mot).
  const question = String(req.body?.question || '').trim();
  const prompt = question
    ? `Résume cette décision en une seule phrase factuelle :\n\nQuestion posée : ${question}\n\nRéponse retenue : ${text}`
    : `Résume cette décision en une seule phrase factuelle :\n\n${text}`;
  const { simulateClaudeDown } = settings.get();
  const answer = await ask(cli, prompt, { cwd, simulateClaudeDown });
  if (!answer.ok) return res.status(502).json({ error: `Résumé impossible : ${answer.erreur.message} ${answer.erreur.action}` });
  res.json({ resume: answer.reponse });
});

// HM-24 : ajoute la décision à la mémoire puis la partage aux 3 CLI, avec les protections de HM-07.
app.post('/api/memory/decisions', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'La décision est vide.' });
  if (text.includes(sync.START) || text.includes(sync.END)) {
    return res.status(400).json({ error: 'La décision ne doit pas contenir les balises HIVEMIND.' });
  }
  const entry = history.find(String(req.body?.entryId || ''));
  if (!entry) return res.status(400).json({ error: 'Échange introuvable dans l\'historique.' });
  const content = addDecision(readText(MEMORY_FILE), { date: new Date(), source: entry.cliUtilisee || entry.cli, text });
  writeText(MEMORY_FILE, content);
  let shared;
  try {
    shared = syncMemory();
  } catch (err) {
    shared = { syncError: err.message };
  }
  res.json({ content, ...shared });
});

app.get('/api/settings', (req, res) => {
  res.json({ ...settings.get(), defaultCwd: os.homedir() });
});

// Corps partiel : seuls les réglages envoyés sont modifiés.
app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  try {
    if (Object.hasOwn(body, 'workdir')) settings.setWorkdir(body.workdir);
    res.json({ ...settings.setOptions(body), defaultCwd: os.homedir() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Action inconnue.' });
});

// Filet de sécurité : toute erreur inattendue devient une réponse JSON, le serveur continue.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête illisible (JSON invalide).' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Texte trop long (1 Mo maximum).' });
  console.error(err);
  res.status(500).json({ error: `Erreur interne de Hivemind : ${err.message}. Vous pouvez réessayer.` });
});

process.on('uncaughtException', (err) => console.error('Erreur inattendue (Hivemind continue) :', err));
process.on('unhandledRejection', (err) => console.error('Erreur inattendue (Hivemind continue) :', err));

// Express 5 appelle ce callback aussi en cas d'erreur d'écoute.
app.listen(PORT, HOST, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Le port ${PORT} est déjà utilisé : Hivemind tourne peut-être déjà dans un autre terminal (http://${HOST}:${PORT}).`);
    } else {
      console.error(`Impossible de démarrer Hivemind : ${err.message}`);
    }
    process.exit(1);
  }
  console.log(`Hivemind démarré : ouvrez http://${HOST}:${PORT} dans votre navigateur (Ctrl+C pour arrêter).`);
});
