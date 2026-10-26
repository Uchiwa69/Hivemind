const os = require('os');
const path = require('path');
const express = require('express');
const { CLIS, listClis, detect, ask } = require('./lib/clis');
const history = require('./lib/history');
const settings = require('./lib/settings');
const sync = require('./lib/sync');
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
  const answer = await ask(cli, prompt, { cwd });
  res.json(history.add({ ...answer, prompt }));
});

app.get('/api/history', (req, res) => {
  res.json(history.list());
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

app.post('/api/sync', (req, res) => {
  const dir = settings.workdir();
  if (!dir) return res.status(400).json({ error: 'Choisissez d\'abord un dossier de travail (en haut de la page).' });
  const memory = readText(MEMORY_FILE);
  if (!memory.trim()) return res.status(400).json({ error: 'La mémoire est vide : écrivez-la et enregistrez-la avant de synchroniser.' });
  if (memory.includes(sync.START) || memory.includes(sync.END)) {
    return res.status(400).json({ error: 'La mémoire ne doit pas contenir les balises HIVEMIND elles-mêmes.' });
  }
  const confirm = Array.isArray(req.body?.confirm) ? req.body.confirm.map(String) : [];
  res.json({ dir, results: sync.syncAll(dir, memory, confirm) });
});

app.get('/api/settings', (req, res) => {
  res.json({ ...settings.get(), defaultCwd: os.homedir() });
});

app.put('/api/settings', (req, res) => {
  try {
    res.json({ ...settings.setWorkdir(req.body?.workdir), defaultCwd: os.homedir() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

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
