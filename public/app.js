const $ = (sel) => document.querySelector(sel);

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur serveur (${res.status})`);
  return data;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDuree(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function renderAnswer(entry) {
  const box = el('div', entry.ok === false ? 'answer error' : 'answer');
  const head = el('div', 'answer-head');
  head.append(el('strong', '', entry.cli), el('span', '', formatDuree(entry.dureeMs)));
  box.append(head, el('pre', '', entry.reponse));
  return box;
}

// --- Choix de la CLI ---
const cliSelect = $('#cli-select');

async function loadClis() {
  const clis = await api('/api/clis');
  cliSelect.replaceChildren(...clis.map((cli) => {
    const option = el('option', '', cli.name);
    option.value = cli.id;
    return option;
  }));
}

// --- Envoi d'un prompt ---
const form = $('#ask-form');
const promptInput = $('#prompt');
const result = $('#result');

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  const send = $('#send');
  send.disabled = true;
  result.replaceChildren(el('p', 'pending', 'La CLI réfléchit… (jusqu\'à 3 min)'));
  try {
    const entry = await api('/api/ask', { method: 'POST', body: { prompt, cli: cliSelect.value } });
    result.replaceChildren(renderAnswer(entry));
  } catch (err) {
    result.replaceChildren(renderAnswer({ ok: false, cli: 'Hivemind', reponse: err.message, dureeMs: 0 }));
  } finally {
    send.disabled = false;
  }
});

loadClis();
