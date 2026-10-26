const path = require('path');
const express = require('express');
const { CLIS, listClis, detect, ask } = require('./lib/clis');
const history = require('./lib/history');

const HOST = '127.0.0.1';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

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
  const answer = await ask(cli, prompt);
  res.json(history.add({ ...answer, prompt }));
});

app.get('/api/history', (req, res) => {
  res.json(history.list());
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
