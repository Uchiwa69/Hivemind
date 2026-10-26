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
  box.append(head);
  if (entry.prompt) box.append(el('div', 'prompt-echo', `› ${entry.prompt}`));
  box.append(el('pre', '', entry.reponse));
  return box;
}

// --- Historique ---
const historyList = $('#history-list');
let historyEntries = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderHistory(activeId) {
  if (!historyEntries.length) {
    historyList.replaceChildren(el('li', 'history-empty', 'Aucun échange pour le moment.'));
    return;
  }
  historyList.replaceChildren(...historyEntries.map((entry) => {
    const li = el('li', entry.id === activeId ? 'active' : '');
    const meta = el('div', 'h-meta');
    meta.append(el('span', entry.ok === false ? 'bad' : '', entry.cli), el('span', '', formatDate(entry.date)));
    li.append(meta, el('div', 'h-prompt', entry.prompt));
    li.title = entry.prompt;
    li.addEventListener('click', () => {
      result.replaceChildren(renderAnswer(entry));
      renderHistory(entry.id);
    });
    return li;
  }));
}

async function loadHistory() {
  historyEntries = await api('/api/history');
  renderHistory();
}

function addToHistory(entries) {
  historyEntries = [...entries, ...historyEntries];
  renderHistory(entries.length === 1 ? entries[0].id : undefined);
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
    addToHistory([entry]);
  } catch (err) {
    result.replaceChildren(renderAnswer({ ok: false, cli: 'Hivemind', reponse: err.message, dureeMs: 0 }));
  } finally {
    send.disabled = false;
  }
});

loadClis();
loadHistory();
