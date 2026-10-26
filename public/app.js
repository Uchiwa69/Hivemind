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

// --- Choix de la CLI et détection ---
const cliSelect = $('#cli-select');
const cliStatusList = $('#cli-status-list');
const refreshButton = $('#refresh-clis');
let clis = [];

function renderClis() {
  const previous = cliSelect.value;
  cliSelect.replaceChildren(...clis.map((cli) => {
    const option = el('option', '', cli.available ? cli.name : `${cli.name} (absente)`);
    option.value = cli.id;
    option.disabled = !cli.available;
    return option;
  }));
  const keep = clis.find((cli) => cli.id === previous && cli.available);
  const first = clis.find((cli) => cli.available);
  cliSelect.value = (keep || first || clis[0] || {}).id || '';

  cliStatusList.replaceChildren(...clis.map((cli) => {
    const li = el('li', cli.available ? 'on' : 'off', cli.name);
    li.title = cli.available ? `Disponible : ${cli.version}` : `Absente : « ${cli.command} --version » ne répond pas`;
    return li;
  }));
}

async function loadClis(refresh = false) {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Vérification…';
  try {
    clis = await api(refresh ? '/api/clis/refresh' : '/api/clis', refresh ? { method: 'POST' } : {});
    renderClis();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Rafraîchir';
  }
}

refreshButton.addEventListener('click', () => loadClis(true));

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

// --- Onglets ---
document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((b) => b.classList.toggle('active', b === button));
    document.querySelectorAll('.tab').forEach((tab) => { tab.hidden = tab.id !== `tab-${button.dataset.tab}`; });
  });
});

function setStatus(node, text, kind = '') {
  node.textContent = text;
  node.className = `status ${kind}`;
}

// --- Mémoire ---
const memoryEditor = $('#memory-editor');
const memorySave = $('#memory-save');
const memoryStatus = $('#memory-status');
let savedMemory = '';

async function loadMemory() {
  const { content } = await api('/api/memory');
  savedMemory = content;
  memoryEditor.value = content;
}

memoryEditor.addEventListener('input', () => {
  setStatus(memoryStatus, memoryEditor.value === savedMemory ? '' : 'Modifications non enregistrées');
});

memorySave.addEventListener('click', async () => {
  memorySave.disabled = true;
  try {
    const { content } = await api('/api/memory', { method: 'PUT', body: { content: memoryEditor.value } });
    savedMemory = content;
    setStatus(memoryStatus, `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}`, 'ok');
  } catch (err) {
    setStatus(memoryStatus, err.message, 'err');
  } finally {
    memorySave.disabled = false;
  }
});

loadClis();
loadHistory();
loadMemory();
