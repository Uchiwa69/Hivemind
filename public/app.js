const $ = (sel) => document.querySelector(sel);

async function api(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error('Le serveur Hivemind ne répond pas : vérifiez que « npm start » tourne toujours dans votre terminal.');
  }
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

// « de Claude Code », « d'Antigravity CLI ».
function de(name) {
  return /^[aeiouyéèh]/i.test(name) ? `d'${name}` : `de ${name}`;
}

// HM-23 : « Claude Code indisponible (quota atteint) → réponse d'Antigravity CLI ».
function fallbackNote(entry) {
  const failed = entry.bascule.map((b) => `${b.cli} indisponible (${b.motif})`).join(', ');
  return el('p', 'fallback-note', `${failed} → réponse ${de(entry.cliUtilisee || entry.cli)}`);
}

function renderAnswer(entry, { showPrompt = true } = {}) {
  const box = el('div', entry.ok === false ? 'answer error' : 'answer');
  const head = el('div', 'answer-head');
  head.append(el('strong', '', entry.cli), el('span', '', formatDuree(entry.dureeMs)));
  box.append(head);
  if (showPrompt && entry.prompt) box.append(el('div', 'prompt-echo', `› ${entry.prompt}`));
  if (entry.ok && entry.bascule?.length) box.append(fallbackNote(entry));
  if (entry.erreur) {
    box.append(el('p', 'err-message', entry.erreur.message), el('p', 'err-action', `→ ${entry.erreur.action}`));
    if (entry.bascule?.length) {
      const list = el('ul', 'fail-list');
      list.append(...entry.bascule.map((b) => el('li', '', `${b.cli} (${b.motif}) : ${b.message} → ${b.action}`)));
      box.append(list);
    }
    if (entry.erreur.detail) {
      const details = el('details', 'err-detail');
      details.append(el('summary', '', 'Détail technique'), el('pre', '', entry.erreur.detail));
      box.append(details);
    }
  } else {
    box.append(el('pre', '', entry.reponse));
  }
  return box;
}

// Réponses d'un même prompt, en colonnes.
function renderCompare(entries) {
  const wrap = el('div', 'compare');
  wrap.append(el('div', 'prompt-echo', `› ${entries[0].prompt}`));
  const grid = el('div', 'compare-grid');
  grid.append(...entries.map((entry) => renderAnswer(entry, { showPrompt: false })));
  wrap.append(grid);
  return wrap;
}

function showEntry(entry) {
  if (entry.compareId) {
    // L'historique est du plus récent au plus ancien : on remet l'ordre d'envoi.
    const group = historyEntries.filter((e) => e.compareId === entry.compareId).reverse();
    result.replaceChildren(renderCompare(group));
  } else {
    result.replaceChildren(renderAnswer(entry));
  }
}

// --- Historique ---
const historyList = $('#history-list');
let historyEntries = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// active : l'échange affiché ; tout son groupe « Comparer » est mis en évidence.
function renderHistory(active) {
  if (!historyEntries.length) {
    historyList.replaceChildren(el('li', 'history-empty', 'Aucun échange pour le moment.'));
    return;
  }
  const isActive = (entry) => Boolean(active)
    && (entry.id === active.id || (active.compareId && entry.compareId === active.compareId));
  historyList.replaceChildren(...historyEntries.map((entry) => {
    const li = el('li', isActive(entry) ? 'active' : '');
    const meta = el('div', 'h-meta');
    const cliLabel = el('span', entry.ok === false ? 'bad' : '', entry.cli);
    if (entry.compareId) cliLabel.prepend(el('span', 'h-tag', 'comparer'));
    if (entry.ok && entry.bascule?.length) {
      cliLabel.prepend(el('span', 'h-tag', 'bascule'));
      cliLabel.title = `Demandé à ${entry.cliDemandee}, répondu par ${entry.cliUtilisee}`;
    }
    meta.append(cliLabel, el('span', '', formatDate(entry.date)));
    li.append(meta, el('div', 'h-prompt', entry.prompt));
    li.title = entry.prompt;
    li.addEventListener('click', () => {
      showEntry(entry);
      renderHistory(entry);
    });
    return li;
  }));
}

async function loadHistory() {
  historyEntries = await api('/api/history');
  renderHistory();
}

// entries arrivent dans l'ordre d'envoi ; l'historique affiche le plus récent en haut.
function addToHistory(entries) {
  historyEntries = [...[...entries].reverse(), ...historyEntries];
  renderHistory(entries[0]);
}

// --- Choix de la CLI et détection ---
const cliSelect = $('#cli-select');
const compareBox = $('#compare-clis');
const compareToggle = $('#compare-toggle');

function selectedCompareClis() {
  return [...compareBox.querySelectorAll('input:checked')].map((box) => box.value);
}

compareToggle.addEventListener('change', () => {
  const on = compareToggle.checked;
  $('#single-cli').hidden = on;
  compareBox.hidden = !on;
});
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

  const checked = new Set(selectedCompareClis());
  compareBox.replaceChildren(...clis.map((cli) => {
    const label = el('label', cli.available ? '' : 'disabled');
    const box = el('input');
    box.type = 'checkbox';
    box.value = cli.id;
    box.disabled = !cli.available;
    box.checked = cli.available && (checked.size ? checked.has(cli.id) : true);
    label.append(box, ` ${cli.name}${cli.available ? '' : ' (absente)'}`);
    return label;
  }));

  renderOrder();

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
  const compare = compareToggle.checked;
  const targets = selectedCompareClis();
  if (compare && targets.length < 2) {
    result.replaceChildren(renderAnswer({ ok: false, cli: 'Hivemind', reponse: 'Cochez au moins 2 CLI disponibles pour comparer.', dureeMs: 0 }));
    return;
  }
  const send = $('#send');
  send.disabled = true;
  result.replaceChildren(el('p', 'pending', compare
    ? `${targets.length} CLI réfléchissent en parallèle… (jusqu'à 3 min)`
    : 'La CLI réfléchit… (jusqu\'à 3 min)'));
  try {
    if (compare) {
      const entries = await api('/api/compare', { method: 'POST', body: { prompt, clis: targets } });
      result.replaceChildren(renderCompare(entries));
      addToHistory(entries);
    } else {
      const entry = await api('/api/ask', { method: 'POST', body: { prompt, cli: cliSelect.value } });
      result.replaceChildren(renderAnswer(entry));
      addToHistory([entry]);
    }
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

async function saveMemory() {
  const { content } = await api('/api/memory', { method: 'PUT', body: { content: memoryEditor.value } });
  savedMemory = content;
  setStatus(memoryStatus, `Enregistré à ${new Date().toLocaleTimeString('fr-FR')}`, 'ok');
}

memorySave.addEventListener('click', async () => {
  memorySave.disabled = true;
  try {
    await saveMemory();
  } catch (err) {
    setStatus(memoryStatus, err.message, 'err');
  } finally {
    memorySave.disabled = false;
  }
});

// --- Synchronisation vers CLAUDE.md, AGENTS.md, GEMINI.md ---
const memorySync = $('#memory-sync');
const syncResults = $('#sync-results');

const SYNC_LABELS = {
  created: ['ok', 'fichier créé avec le bloc Hivemind'],
  updated: ['ok', 'bloc Hivemind mis à jour (le reste du fichier est intact)'],
  unchanged: ['ok', 'déjà à jour'],
  appended: ['ok', 'bloc Hivemind ajouté à la fin (le contenu existant est intact)'],
  'needs-confirm': ['skip', 'non modifié (ajout refusé)'],
  error: ['err', 'erreur'],
};

function renderSync(dir, results) {
  syncResults.replaceChildren(...results.map((r) => {
    const [kind, label] = SYNC_LABELS[r.status] || ['err', r.status];
    const li = el('li', kind);
    li.append(el('code', '', r.file), ` : ${label}${r.message ? ` : ${r.message}` : ''}`);
    return li;
  }), el('li', 'skip', `Dossier : ${dir}`));
}

memorySync.addEventListener('click', async () => {
  memorySync.disabled = true;
  syncResults.replaceChildren();
  try {
    if (memoryEditor.value !== savedMemory) await saveMemory();
    let { dir, results } = await api('/api/sync', { method: 'POST', body: {} });
    const pending = results.filter((r) => r.status === 'needs-confirm').map((r) => r.file);
    if (pending.length) {
      const ok = window.confirm(
        `${pending.join(', ')} existe déjà dans ${dir} sans bloc Hivemind.\n\n`
        + 'Ajouter la mémoire à la fin du fichier ? Le contenu existant ne sera pas modifié.',
      );
      if (ok) ({ dir, results } = await api('/api/sync', { method: 'POST', body: { confirm: pending } }));
    }
    renderSync(dir, results);
    setStatus(memoryStatus, `Synchronisé à ${new Date().toLocaleTimeString('fr-FR')}`, 'ok');
  } catch (err) {
    setStatus(memoryStatus, err.message, 'err');
  } finally {
    memorySync.disabled = false;
  }
});

// --- Dossier de travail ---
const workdirForm = $('#workdir-form');
const workdirInput = $('#workdir');
const workdirStatus = $('#workdir-status');
let workdir = '';

function showWorkdir(settings) {
  workdir = settings.workdir;
  workdirInput.value = settings.workdir;
  if (settings.workdir) setStatus(workdirStatus, `Les CLI travaillent dans ${settings.workdir}`, 'ok');
  else setStatus(workdirStatus, `Aucun dossier choisi : les CLI travaillent dans ${settings.defaultCwd}`);
}

function applySettings(settings) {
  showWorkdir(settings);
  showOptions(settings);
}

async function loadSettings() {
  applySettings(await api('/api/settings'));
}

workdirForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    applySettings(await api('/api/settings', { method: 'PUT', body: { workdir: workdirInput.value } }));
  } catch (err) {
    setStatus(workdirStatus, err.message, 'err');
  }
});

// --- Bascule automatique et panne simulée (HM-23) ---
const fallbackToggle = $('#fallback-toggle');
const fallbackOrderList = $('#fallback-order');
const simulateToggle = $('#simulate-toggle');
const simBanner = $('#sim-banner');
const optionsStatus = $('#options-status');
let fallbackOrder = [];

function showOptions(settings) {
  fallbackToggle.checked = settings.fallback;
  simulateToggle.checked = settings.simulateClaudeDown;
  simBanner.hidden = !settings.simulateClaudeDown;
  fallbackOrder = settings.fallbackOrder;
  renderOrder();
}

function renderOrder() {
  fallbackOrderList.classList.toggle('disabled', !fallbackToggle.checked);
  fallbackOrderList.replaceChildren(...fallbackOrder.map((id, index) => {
    const cli = clis.find((c) => c.id === id);
    const li = el('li', cli && cli.available === false ? 'off' : '', cli ? cli.name : id);
    if (cli && cli.available === false) li.title = 'Absente : sautée lors de la bascule';
    if (index > 0) {
      const up = el('button', '', '◀');
      up.type = 'button';
      up.title = 'Essayer plus tôt';
      up.addEventListener('click', () => {
        const next = [...fallbackOrder];
        [next[index - 1], next[index]] = [next[index], next[index - 1]];
        saveOptions({ fallbackOrder: next });
      });
      li.append(up);
    }
    return li;
  }));
}

async function saveOptions(patch) {
  try {
    showOptions(await api('/api/settings', { method: 'PUT', body: patch }));
    setStatus(optionsStatus, '');
  } catch (err) {
    setStatus(optionsStatus, err.message, 'err');
  }
}

fallbackToggle.addEventListener('change', () => saveOptions({ fallback: fallbackToggle.checked }));
simulateToggle.addEventListener('change', () => saveOptions({ simulateClaudeDown: simulateToggle.checked }));
$('#sim-off').addEventListener('click', () => saveOptions({ simulateClaudeDown: false }));

loadClis();
loadHistory();
loadMemory();
loadSettings();
