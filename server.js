const path = require('path');
const express = require('express');
const { CLIS, ask } = require('./lib/clis');

const HOST = '127.0.0.1';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/ask', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const cli = 'claude';
  if (!prompt) return res.status(400).json({ error: 'Le prompt est vide.' });
  res.json(await ask(cli, prompt));
});

app.listen(PORT, HOST, () => {
  console.log(`Hivemind : http://${HOST}:${PORT}`);
});
