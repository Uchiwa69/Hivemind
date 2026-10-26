const path = require('path');
const express = require('express');
const { CLIS, listClis, ask } = require('./lib/clis');

const HOST = '127.0.0.1';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/clis', (req, res) => {
  res.json(listClis());
});

app.post('/api/ask', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const cli = String(req.body?.cli || '');
  if (!prompt) return res.status(400).json({ error: 'Le prompt est vide.' });
  if (!Object.hasOwn(CLIS, cli)) return res.status(400).json({ error: 'CLI inconnue.' });
  res.json(await ask(cli, prompt));
});

app.listen(PORT, HOST, () => {
  console.log(`Hivemind : http://${HOST}:${PORT}`);
});
