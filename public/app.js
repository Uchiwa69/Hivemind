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

// HM-09 : lit une réponse NDJSON ligne par ligne ; onEvent reçoit attempt et delta, la promesse rend l'échange final.
async function apiStream(url, body, onEvent) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    throw new Error('Le serveur Hivemind ne répond pas : vérifiez que Hivemind tourne toujours.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'done') {
        if (event.usage) applyUsage(event.usage);
        return event.entry;
      }
      onEvent(event);
    }
    if (done) throw new Error('La connexion avec le serveur a été coupée avant la fin de la réponse. L\'échange est peut-être dans l\'historique : rechargez la page.');
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

const ICONS = {
  copy: 'M7 7h9v9H7zM4 13V4h9',
  remember: 'M6 3h8v14l-4-3-4 3z',
  send: 'M4 10h11M11 5l5 5-5 5',
  review: 'M2.5 10S5 5 10 5s7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5zM10 8a2 2 0 100 4 2 2 0 000-4z',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  up: 'M10 15V5M5.5 9.5L10 5l4.5 4.5',
  down: 'M10 5v10M5.5 10.5L10 15l4.5-4.5',
  close: 'M5 5l10 10M15 5L5 15',
  relay: 'M5 4v5a3 3 0 003 3h7M12 9l3 3-3 3',
};

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function setStatus(node, text, kind = '') {
  node.textContent = text;
  node.className = `status ${kind}`;
}

function formatDuree(ms) {
  if (!ms) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// « de Claude Code », « d'Antigravity CLI ».
function de(name) {
  return /^[aeiouyéèh]/i.test(name) ? `d'${name}` : `de ${name}`;
}

// --- IA : identité et couleur ---
let clis = [];
const KNOWN_CLIS = ['claude', 'codex', 'agy', 'gemini'];

function cliName(id) {
  return clis.find((cli) => cli.id === id)?.name || id;
}

function cliIdByName(name) {
  return clis.find((cli) => cli.name === name)?.id || '';
}

// Les échanges d'avant HM-23 n'ont que le nom de la CLI.
function entryCliId(entry) {
  return entry.cliId || cliIdByName(entry.cliUtilisee || entry.cli);
}

function paint(node, cliId) {
  node.style.setProperty('--cli-color', KNOWN_CLIS.includes(cliId) ? `var(--cli-${cliId})` : 'var(--cli-none)');
  return node;
}

function dot(cliId) {
  const node = paint(el('span', 'dot'), cliId);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

// --- Notifications ---
const toasts = $('#toasts');

function toast(text, kind = 'ok') {
  const node = el('div', `toast ${kind}`);
  node.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  const close = button('icon-btn', '', () => node.remove());
  close.setAttribute('aria-label', 'Fermer la notification');
  close.append(icon('close'));
  node.append(el('span', '', text), close);
  toasts.append(node);
  setTimeout(() => node.remove(), kind === 'err' ? 9000 : 5000);
}

// --- Menu contextuel (sessions, « Envoyer à… », « Faire relire par… ») ---
const menu = $('#menu');
let menuAnchor = null;

function closeMenu({ focus = false } = {}) {
  if (menu.hidden) return;
  menu.hidden = true;
  menuAnchor?.setAttribute('aria-expanded', 'false');
  if (focus) menuAnchor?.focus();
  menuAnchor = null;
}

// items : [{ label, cliId?, danger?, disabled?, onSelect }]
function toggleMenu(anchor, items, title) {
  if (menuAnchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu();
  menuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const nodes = title ? [el('div', 'menu-label', title)] : [];
  for (const item of items) {
    const node = button(`menu-item${item.danger ? ' danger' : ''}`, '', () => {
      closeMenu({ focus: true });
      item.onSelect();
    });
    node.setAttribute('role', 'menuitem');
    node.tabIndex = -1;
    node.disabled = Boolean(item.disabled);
    if (item.cliId) node.append(dot(item.cliId));
    node.append(item.label);
    nodes.push(node);
  }
  menu.replaceChildren(...nodes);
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  let top = rect.bottom + 4;
  if (top + menu.offsetHeight > window.innerHeight - 8) top = rect.top - menu.offsetHeight - 4;
  const left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8);
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.querySelector('.menu-item:not(:disabled)')?.focus();
}

menu.addEventListener('keydown', (e) => {
  const items = [...menu.querySelectorAll('.menu-item:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeMenu({ focus: true });
  } else if (e.key === 'Tab') {
    closeMenu();
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !menuAnchor?.contains(e.target)) closeMenu();
});
window.addEventListener('resize', () => closeMenu());

// --- Modales ---
document.querySelectorAll('dialog [data-close]').forEach((node) => {
  node.addEventListener('click', () => node.closest('dialog').close());
});

const confirmEl = $('#confirm-dialog');

// Remplace window.confirm : renvoie une promesse de booléen.
function confirmDialog({ title, message, okLabel, danger = false }) {
  return new Promise((resolve) => {
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const ok = $('#confirm-ok');
    ok.textContent = okLabel;
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    confirmEl.returnValue = '';
    confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), { once: true });
    confirmEl.showModal();
    (danger ? confirmEl.querySelector('[value="cancel"]') : ok).focus();
  });
}

const inputEl = $('#input-dialog');
const inputField = $('#input-field');
const inputStatus = $('#input-status');
let inputSubmit = null;

function inputDialog({ title, hint, label, value = '', placeholder = '', okLabel = 'Valider', onSubmit }) {
  $('#input-title').textContent = title;
  $('#input-hint').textContent = hint;
  $('#input-label').textContent = label;
  $('#input-ok').textContent = okLabel;
  inputField.value = value;
  inputField.placeholder = placeholder;
  setStatus(inputStatus, '');
  inputSubmit = onSubmit;
  inputEl.showModal();
  inputField.focus();
  inputField.select();
}

$('#input-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ok = $('#input-ok');
  ok.disabled = true;
  try {
    await inputSubmit(inputField.value);
    inputEl.close();
  } catch (err) {
    setStatus(inputStatus, err.message, 'err');
    inputField.focus();
  } finally {
    ok.disabled = false;
  }
});

// --- Barre latérale (repliable sur petit écran) ---
const sidebar = $('#sidebar');
const scrim = $('#scrim');
const narrow = window.matchMedia('(max-width: 900px)');

function openSidebar() {
  sidebar.classList.add('open');
  scrim.hidden = false;
  $('#new-session').focus();
}

function closeSidebar() {
  if (!sidebar.classList.contains('open')) return;
  sidebar.classList.remove('open');
  scrim.hidden = true;
  $('#sidebar-open').focus();
}

$('#sidebar-open').addEventListener('click', openSidebar);
$('#sidebar-close').addEventListener('click', closeSidebar);
scrim.addEventListener('click', closeSidebar);
sidebar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && narrow.matches) closeSidebar();
});

// --- Sessions (HM-22) ---
let historyEntries = []; // tous les échanges, du plus récent au plus ancien (comme data/history.json)
let sessionsList = [];
let currentSessionId = null; // null : nouvelle session, créée au premier envoi
const sessionList = $('#session-list');

function currentSession() {
  return sessionsList.find((session) => session.id === currentSessionId) || null;
}

function renderSessionTitle() {
  const title = currentSession()?.title || 'Nouvelle session';
  $('#session-title').textContent = title;
  document.title = `${title} · Hivemind`;
}

function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(today) - start(date)) / 86_400_000);
  if (diff === 0) return 'Aujourd\'hui';
  if (diff === 1) return 'Hier';
  const label = date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderSessions() {
  if (!sessionsList.length) {
    sessionList.replaceChildren(el('p', 'session-empty', 'Aucune session pour le moment.'));
    return;
  }
  const groups = new Map();
  for (const session of sessionsList) {
    const label = dayLabel(session.lastDate);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(session);
  }
  sessionList.replaceChildren(...[...groups].map(([label, list]) => {
    const group = el('section', 'session-group');
    const ul = el('ul');
    ul.append(...list.map((session) => {
      const li = el('li', `session-item${session.id === currentSessionId ? ' active' : ''}`);
      const open = button('session-open', '', () => openSession(session.id));
      if (session.id === currentSessionId) open.setAttribute('aria-current', 'page');
      const dots = el('span', 'dots');
      dots.append(...session.clis.slice(0, 3).map(dot));
      open.append(dots, el('span', 'title', session.title));
      open.title = `${session.title} · ${session.count} échange${session.count > 1 ? 's' : ''}`;
      const more = button('icon-btn session-more');
      more.setAttribute('aria-label', `Actions de la session « ${session.title} »`);
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      more.append(icon('more'));
      more.addEventListener('click', () => toggleMenu(more, [
        { label: 'Renommer', onSelect: () => renameSession(session) },
        { label: 'Supprimer…', danger: true, onSelect: () => deleteSession(session) },
      ]));
      li.append(open, more);
      return li;
    }));
    group.append(el('h2', '', label), ul);
    return group;
  }));
}

async function loadSessions() {
  sessionsList = await api('/api/sessions');
  renderSessions();
  renderSessionTitle();
}

async function loadHistory() {
  historyEntries = await api('/api/history');
}

function openSession(id, { scroll = true } = {}) {
  currentSessionId = id;
  clearRelay();
  renderSessions();
  renderSessionTitle();
  renderThread({ scroll });
  if (narrow.matches) closeSidebar();
}

function newSession() {
  currentSessionId = null;
  clearRelay();
  renderSessions();
  renderSessionTitle();
  renderThread();
  if (narrow.matches) closeSidebar();
  promptInput.focus();
}

$('#new-session').addEventListener('click', newSession);

function renameSession(session) {
  inputDialog({
    title: 'Renommer la session',
    hint: 'Laissez vide pour reprendre le début du premier prompt.',
    label: 'Nom de la session',
    value: session.customTitle ? session.title : '',
    placeholder: session.title,
    okLabel: 'Renommer',
    onSubmit: async (value) => {
      await api(`/api/sessions/${encodeURIComponent(session.id)}`, { method: 'PATCH', body: { title: value } });
      await loadSessions();
      toast('Session renommée');
    },
  });
}

async function deleteSession(session) {
  const ok = await confirmDialog({
    title: 'Supprimer la session ?',
    message: `« ${session.title} » et ses ${session.count} échange${session.count > 1 ? 's' : ''} seront supprimés définitivement.\nLa mémoire commune n'est pas modifiée.`,
    okLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/api/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
    historyEntries = historyEntries.filter((entry) => entry.sessionId !== session.id);
    if (currentSessionId === session.id) currentSessionId = null;
    await loadSessions();
    renderThread();
    toast('Session supprimée');
  } catch (err) {
    toast(err.message, 'err');
  }
}

// --- Fil de la session ---
const thread = $('#thread');
let pendings = []; // envois en cours, affichés en fin de fil
let localErrors = []; // échecs sans échange enregistré (serveur injoignable, dossier invalide…)

const SUGGESTIONS = ['Résume ce projet', 'Liste les fichiers du dossier de travail', 'Quelles décisions sont dans la mémoire ?'];

function renderWelcome() {
  const box = el('section', 'welcome');
  box.append(
    el('h2', '', 'Que voulez-vous faire ?'),
    el('p', '', 'Envoyez un prompt à l\'une de vos IA, ou comparez-les côte à côte. Toutes partagent la même mémoire.'),
  );
  const list = el('div', 'suggestions');
  list.append(...SUGGESTIONS.map((text) => button('suggestion', text, () => {
    promptInput.value = text;
    autosize();
    promptInput.focus();
  })));
  box.append(list);
  return box;
}

function scrollToEnd() {
  requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
}

// Prompt de l'utilisateur, à droite ; les très longs (relais) sont repliés.
function renderPrompt(prompt) {
  const wrap = el('div');
  const row = el('div', 'msg-user');
  const bubble = el('div', 'bubble', prompt);
  row.append(bubble);
  wrap.append(row);
  if (prompt.length > 600 || prompt.split('\n').length > 8) {
    bubble.classList.add('clamped');
    const more = el('div', 'bubble-more');
    const toggle = button('btn-text', 'Afficher tout', () => {
      const open = bubble.classList.toggle('clamped');
      toggle.textContent = open ? 'Afficher tout' : 'Réduire';
      toggle.setAttribute('aria-expanded', String(!open));
    });
    toggle.setAttribute('aria-expanded', 'false');
    more.append(toggle);
    wrap.append(more);
  }
  return wrap;
}

// Markdown en ligne minimal (gras, italique, `code`, texte des liens), toujours via textContent.
function renderInline(text) {
  const p = el('p');
  const token = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\([^)\s]+\)|(?<![\w*])\*([^*\n]+)\*(?![\w*])/g;
  let last = 0;
  let match;
  while ((match = token.exec(text))) {
    p.append(text.slice(last, match.index));
    if (match[1]) p.append(el('strong', '', match[1]));
    else if (match[2]) p.append(el('code', '', match[2]));
    else if (match[3]) p.append(match[3]);
    else p.append(el('em', '', match[4]));
    last = token.lastIndex;
  }
  p.append(text.slice(last));
  return p;
}

// Texte de la réponse : paragraphes, et blocs ``` en police à chasse fixe.
function renderRich(text) {
  const body = el('div', 'ai-body');
  const addText = (chunk) => {
    for (const para of chunk.replace(/^\n+|\n+$/g, '').split(/\n{2,}/)) {
      if (para.trim()) body.append(renderInline(para));
    }
  };
  const fence = /```[^\n]*\n?([\s\S]*?)(?:\n?```|$)/g;
  let last = 0;
  let match;
  while ((match = fence.exec(text))) {
    addText(text.slice(last, match.index));
    const pre = el('pre');
    pre.append(el('code', '', match[1]));
    body.append(pre);
    last = fence.lastIndex;
  }
  addText(text.slice(last));
  return body;
}

// HM-23 : « Claude Code indisponible (quota atteint) → réponse d'Antigravity CLI ».
function renderFallback(entry) {
  const note = el('p', 'fallback-note');
  note.setAttribute('role', 'note');
  const failed = entry.bascule.map((b) => `${b.cli} indisponible (${b.motif})`).join(', ');
  note.append(`${failed} → réponse ${de(entry.cliUtilisee || entry.cli)}`);
  return note;
}

function renderError(box, entry) {
  const erreur = entry.erreur || { message: entry.reponse, action: 'Réessayez, ou testez la même commande dans un terminal.' };
  box.append(el('p', 'err-message', erreur.message));
  const action = el('p', 'err-action');
  action.append(el('strong', '', 'À faire : '), erreur.action);
  box.append(action);
  if (entry.bascule?.length) {
    const list = el('ul', 'fail-list');
    list.append(...entry.bascule.map((b) => el('li', '', `${b.cli} (${b.motif}) : ${b.message} → ${b.action}`)));
    box.append(list);
  }
  if (erreur.detail) {
    const details = el('details', 'err-detail');
    details.append(el('summary', '', 'Détail technique'), el('pre', '', erreur.detail));
    box.append(details);
  }
}

// HM-10 : état affiché sur chaque réponse, avec la durée.
const STATE_LABELS = { pending: 'en cours', done: 'terminé', fail: 'erreur', cancelled: 'annulé' };

function entryState(entry) {
  if (entry.annule) return 'cancelled';
  return entry.ok === false ? 'fail' : 'done';
}

function renderHead(name, cliId, meta, state, onCancel) {
  const head = el('div', 'ai-head');
  head.append(dot(cliId), el('strong', '', name));
  if (state) head.append(el('span', `state-tag ${state}`, STATE_LABELS[state]));
  head.append(meta);
  if (onCancel) {
    const cancel = button('btn btn-small cancel-btn', 'Annuler', onCancel);
    cancel.setAttribute('aria-label', `Annuler l'envoi à ${name} (Échap)`);
    head.append(cancel);
  }
  return head;
}

// Réponse d'une IA, à gauche, à la couleur de l'IA.
function renderAnswer(entry) {
  const cliId = entryCliId(entry);
  const state = entryState(entry);
  const box = paint(el('div', { fail: 'msg-ai error', cancelled: 'msg-ai cancelled' }[state] || 'msg-ai'), cliId);
  const meta = el('span', 'meta', [formatDuree(entry.dureeMs), entry.date && formatTime(entry.date)].filter(Boolean).join(' · '));
  box.append(renderHead(entry.cli, cliId, meta, state));
  if (state !== 'fail' && entry.bascule?.length) box.append(renderFallback(entry));
  if (state === 'cancelled') {
    box.append(el('p', 'cancel-note', entry.reponse
      ? 'Envoi annulé : voici le texte reçu avant l\'arrêt.'
      : 'Envoi annulé avant que l\'IA ait commencé à répondre.'));
    if (entry.reponse) box.append(renderRich(entry.reponse));
  } else if (state === 'fail') {
    renderError(box, entry);
  } else {
    box.append(renderRich(entry.reponse));
  }
  if (entry.id && (entry.ok || (entry.annule && entry.reponse))) box.append(renderActions(entry, box));
  return box;
}

function pulse() {
  const node = el('span', 'pulse');
  node.setAttribute('aria-hidden', 'true');
  node.append(el('i'), el('i'), el('i'));
  return node;
}

// Corps d'une carte « en cours » : « réfléchit… » puis le texte reçu au fil de l'eau (HM-09).
function fillPending(target) {
  const body = target.view;
  if (!target.text) {
    body.className = 'pending-body';
    body.replaceChildren(pulse(), target.hint || `${cliName(target.cliId)} réfléchit…`);
  } else {
    body.className = 'pending-live';
    body.replaceChildren(renderRich(target.text), pulse());
  }
}

// target = { cliId, start, text, bascule, hint } : un envoi simple ou une colonne de Comparer.
function renderPendingAnswer(target, { state } = {}) {
  const box = paint(el('div', 'msg-ai'), target.cliId);
  box.setAttribute('aria-busy', 'true');
  const meta = el('span', 'meta elapsed', '0 s');
  meta.dataset.start = String(target.start);
  box.append(renderHead(cliName(target.cliId), target.cliId, meta, state || 'pending', () => cancelTarget(target)));
  if (target.cancelling) {
    const cancel = box.querySelector('.cancel-btn');
    cancel.disabled = true;
    cancel.textContent = 'Annulation…';
  }
  if (target.bascule?.length) box.append(renderFallback({ bascule: target.bascule, cli: cliName(target.cliId) }));
  target.view = el('div');
  box.append(target.view);
  fillPending(target);
  return box;
}

// Mise à jour du texte en direct, au plus une fois par image ; le fil reste collé en bas si on y était.
const liveDirty = new Set();
let liveFrame = 0;

function nearBottom() {
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
}

function flushLive() {
  liveFrame = 0;
  const stick = nearBottom();
  for (const target of liveDirty) if (target.view?.isConnected) fillPending(target);
  liveDirty.clear();
  if (stick) thread.scrollTop = thread.scrollHeight;
}

function onLiveDelta(target, text) {
  target.text = (target.text || '') + text;
  liveDirty.add(target);
  if (!liveFrame) liveFrame = requestAnimationFrame(flushLive);
}

// Compteur de secondes des cartes « en cours ».
setInterval(() => {
  document.querySelectorAll('.elapsed').forEach((node) => {
    node.textContent = `${Math.floor((Date.now() - Number(node.dataset.start)) / 1000)} s`;
  });
}, 1000);

// --- Relais entre IA (HM-15) ---
const REVIEW_PROMPT = 'Relis cette réponse d\'une autre IA. Liste les erreurs, les oublis et les améliorations, puis donne une version corrigée si nécessaire :';

function relayLabel(entry) {
  return `${entry.relayKind === 'relecture' ? 'Relecture' : 'Relais'} de la réponse ${de(entry.relayFromCli)}`;
}

function renderRelayLabel(entry) {
  const label = el('p', 'relay-label');
  label.append(icon('relay'), dot(cliIdByName(entry.relayFromCli)), relayLabel(entry));
  const source = historyEntries.find((e) => e.id === entry.relayFrom);
  if (source) {
    label.append(' · ', button('btn-text', 'voir l\'original', () => goToEntry(source)));
  } else {
    label.append(' · (original supprimé)');
  }
  return label;
}

// Affiche un échange (dans sa session) et le met en évidence.
function goToEntry(entry) {
  if (entry.sessionId !== currentSessionId) openSession(entry.sessionId, { scroll: false });
  const node = document.getElementById(`x-${entry.id}`);
  if (!node) return;
  node.scrollIntoView({ block: 'center' });
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
  node.querySelector('button')?.focus({ preventScroll: true });
}

function relayItems(entry, kind) {
  const source = entry.cliUtilisee || entry.cli;
  const targets = clis.filter((cli) => cli.available && cli.name !== source);
  if (!targets.length) return [{ label: 'Aucune autre IA disponible', disabled: true, onSelect() {} }];
  return targets.map((cli) => ({ label: cli.name, cliId: cli.id, onSelect: () => startRelay(entry, kind, cli.id) }));
}

function actionButton(iconName, label, onClick) {
  const node = button('action', '', onClick);
  node.append(icon(iconName), el('span', '', label));
  return node;
}

// Copier, Retenir (HM-24), Envoyer à… et Faire relire par… (HM-15).
function renderActions(entry, box) {
  const bar = el('div', 'actions');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', `Actions sur la réponse ${de(entry.cli)}`);

  const copy = actionButton('copy', 'Copier', async () => {
    try {
      await navigator.clipboard.writeText(entry.reponse);
      copy.lastChild.textContent = 'Copié';
      setTimeout(() => { copy.lastChild.textContent = 'Copier'; }, 1500);
    } catch {
      toast('Copie impossible : sélectionnez le texte à la main.', 'err');
    }
  });

  // La sélection est lue avant que le clic ne puisse l'effacer.
  let selected = '';
  const remember = actionButton('remember', 'Retenir', () => {
    openRemember(entry, selected || selectionIn(box));
    selected = '';
  });
  remember.title = 'Ajouter cette réponse (ou le texte sélectionné) aux décisions de la mémoire commune';
  remember.addEventListener('mousedown', () => { selected = selectionIn(box); });

  const sendTo = actionButton('send', 'Envoyer à…', () => toggleMenu(sendTo, relayItems(entry, 'envoi'), 'Envoyer à'));
  const review = actionButton('review', 'Faire relire par…', () => toggleMenu(review, relayItems(entry, 'relecture'), 'Faire relire par'));
  for (const node of [sendTo, review]) {
    node.setAttribute('aria-haspopup', 'menu');
    node.setAttribute('aria-expanded', 'false');
  }
  bar.append(copy, remember, sendTo, review);
  return bar;
}

function renderExchange(entry) {
  const art = el('article', 'exchange');
  art.id = `x-${entry.id}`;
  if (entry.relayFrom) art.append(renderRelayLabel(entry));
  art.append(renderPrompt(entry.prompt), renderAnswer(entry));
  return art;
}

// HM-13 : colonnes côte à côte, avec l'état de chaque IA.
function renderCompare(prompt, cols) {
  const art = el('article', 'exchange compare');
  art.append(renderPrompt(prompt));
  const running = cols.filter((col) => col.state === 'pending');
  if (running.length > 1) {
    const bar = el('div', 'compare-bar');
    bar.append(button('btn btn-small', 'Tout annuler', () => running.forEach(cancelTarget)));
    art.append(bar);
  }
  const grid = el('div', 'compare-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Comparaison des réponses');
  grid.append(...cols.map((col) => {
    if (col.state === 'pending') return renderPendingAnswer(col);
    const box = renderAnswer(col.entry);
    if (col.entry.id) box.id = `x-${col.entry.id}`;
    return box;
  }));
  art.append(grid);
  return art;
}

function renderPending(p) {
  if (p.kind === 'compare') return renderCompare(p.prompt, p.cols);
  const art = el('article', 'exchange');
  if (p.relay) {
    const label = el('p', 'relay-label');
    label.append(icon('relay'), dot(cliIdByName(p.relay.relayFromCli)), relayLabel(p.relay));
    art.append(label);
  }
  p.hint = `${cliName(p.cliId)} réfléchit…${settingsState?.fallback ? ' (bascule automatique si elle échoue)' : ''}`;
  art.append(renderPrompt(p.prompt), renderPendingAnswer(p));
  return art;
}

function renderLocalError(failure) {
  const art = el('article', 'exchange');
  art.append(renderPrompt(failure.prompt), renderAnswer({
    ok: false,
    cli: 'Hivemind',
    erreur: { message: failure.message, action: 'Corrigez le problème puis renvoyez : votre prompt a été remis dans le champ.' },
  }));
  return art;
}

function clisOrder(id) {
  const index = clis.findIndex((cli) => cli.id === id);
  return index === -1 ? 99 : index;
}

// Fil du plus ancien au plus récent ; relais rattachés sous leur échange d'origine.
function renderThread({ scroll = true } = {}) {
  closeMenu();
  const own = currentSessionId ? historyEntries.filter((e) => e.sessionId === currentSessionId).reverse() : [];
  const ownPending = pendings.filter((p) => p.sessionId === currentSessionId);
  const ownErrors = localErrors.filter((f) => f.sessionId === currentSessionId);
  if (!own.length && !ownPending.length && !ownErrors.length) {
    thread.replaceChildren(renderWelcome());
    return;
  }

  const ids = new Set(own.map((e) => e.id));
  const children = new Map();
  const roots = [];
  for (const entry of own) {
    if (entry.relayFrom && ids.has(entry.relayFrom)) {
      if (!children.has(entry.relayFrom)) children.set(entry.relayFrom, []);
      children.get(entry.relayFrom).push(entry);
    } else {
      roots.push(entry);
    }
  }
  const withRelays = (node, list) => {
    if (!list.length) return node;
    const box = el('div', 'relays');
    box.append(...list.map((child) => withRelays(renderExchange(child), children.get(child.id) || [])));
    node.append(box);
    return node;
  };

  const nodes = [];
  const seen = new Set();
  for (const entry of roots) {
    if (!entry.compareId) {
      nodes.push(withRelays(renderExchange(entry), children.get(entry.id) || []));
      continue;
    }
    if (seen.has(entry.compareId)) continue;
    seen.add(entry.compareId);
    const group = roots.filter((e) => e.compareId === entry.compareId)
      .sort((a, b) => clisOrder(entryCliId(a)) - clisOrder(entryCliId(b)));
    const cols = group.map((e) => ({ cliId: entryCliId(e), state: entryState(e), entry: e }));
    nodes.push(withRelays(renderCompare(group[0].prompt, cols), group.flatMap((e) => children.get(e.id) || [])));
  }
  nodes.push(...ownErrors.map(renderLocalError), ...ownPending.map(renderPending));
  thread.replaceChildren(...nodes);
  if (scroll) scrollToEnd();
}

thread.addEventListener('scroll', () => closeMenu(), { passive: true });

// --- Zone de saisie ---
const form = $('#composer');
const promptInput = $('#prompt');
const sendButton = $('#send');
const compareToggle = $('#compare-toggle');
const picker = $('#cli-picker');
let compareMode = false;
let compareSelection = new Set();
let selectedCli = null;
let sending = false;

try {
  selectedCli = localStorage.getItem('hivemind.cli');
} catch { /* stockage indisponible : on garde la première IA disponible */ }

function autosize() {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, window.innerHeight * 0.4)}px`;
}

promptInput.addEventListener('input', autosize);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});

function availableClis() {
  return clis.filter((cli) => cli.available);
}

function selectCli(id) {
  selectedCli = id;
  try {
    localStorage.setItem('hivemind.cli', id);
  } catch { /* sans importance */ }
}

function renderPicker() {
  if (!availableClis().some((cli) => cli.id === selectedCli)) selectedCli = availableClis()[0]?.id || null;
  picker.setAttribute('role', compareMode ? 'group' : 'radiogroup');
  picker.setAttribute('aria-label', compareMode ? 'IA à comparer' : 'IA cible');
  picker.replaceChildren(...clis.map((cli) => {
    const pill = paint(button('pill'), cli.id);
    pill.setAttribute('role', compareMode ? 'checkbox' : 'radio');
    const on = cli.available && (compareMode ? compareSelection.has(cli.id) : selectedCli === cli.id);
    pill.setAttribute('aria-checked', String(Boolean(on)));
    pill.append(compareMode ? el('span', 'check') : dot(cli.id), cli.name.replace(/ CLI$/, ''));
    if (cli.id === 'claude' && settingsState?.simulateClaudeDown) pill.append(el('span', 'tag tag-danger', 'panne simulée'));
    if (usageLevel(cli.id).level === 'over') pill.append(el('span', 'tag tag-danger', 'limite atteinte'));
    if (!cli.available) {
      pill.setAttribute('aria-disabled', 'true');
      pill.setAttribute('aria-label', `${cli.name} (non installée)`);
      pill.title = `${cli.name} : non installée`;
    } else {
      pill.title = cli.version ? `${cli.name} · ${cli.version}` : cli.name;
    }
    pill.addEventListener('click', () => {
      if (!cli.available) return;
      if (compareMode) {
        if (compareSelection.has(cli.id)) compareSelection.delete(cli.id);
        else compareSelection.add(cli.id);
      } else {
        selectCli(cli.id);
        renderRelayBar();
      }
      renderPicker();
      picker.querySelector(`[data-cli="${cli.id}"]`)?.focus();
    });
    pill.dataset.cli = cli.id;
    return pill;
  }));
}

function setCompare(on) {
  compareMode = on;
  compareToggle.checked = on;
  if (on) {
    clearRelay();
    if (!compareSelection.size) compareSelection = new Set(availableClis().map((cli) => cli.id));
  }
  renderPicker();
}

compareToggle.addEventListener('change', () => setCompare(compareToggle.checked));

// --- Annulation (HM-10) ---
// La requête peut ne pas être encore enregistrée côté serveur : on réessaie un court instant.
async function cancelTarget(target) {
  if (target.cancelling || target.state === 'done' || target.state === 'fail') return;
  target.cancelling = true;
  renderThread({ scroll: false });
  for (let i = 0; i < 6; i++) {
    try {
      await api('/api/cancel', { method: 'POST', body: { requestId: target.requestId } });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

function cancelPendings(list) {
  for (const p of list) {
    if (p.kind === 'compare') p.cols.filter((col) => col.state === 'pending').forEach(cancelTarget);
    else cancelTarget(p);
  }
}

// Échap annule les envois en cours de la session affichée, si rien d'autre n'est ouvert.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.querySelector('dialog[open]') || !menu.hidden) return;
  if (!memoryPanel.hidden && memoryPanel.contains(document.activeElement)) return;
  if (narrow.matches && sidebar.classList.contains('open')) return;
  const mine = pendings.filter((p) => p.sessionId === currentSessionId);
  if (!mine.length) return;
  e.preventDefault();
  cancelPendings(mine);
});

function setSending(on) {
  sending = on;
  sendButton.disabled = on;
  sendButton.setAttribute('aria-busy', String(on));
}

// La session n'existe côté serveur qu'au premier envoi.
async function ensureSession() {
  if (currentSessionId) return currentSessionId;
  const session = await api('/api/sessions', { method: 'POST' });
  currentSessionId = session.id;
  return session.id;
}

function restorePrompt(prompt) {
  if (!promptInput.value.trim()) {
    promptInput.value = prompt;
    autosize();
  }
}

async function afterSend() {
  renderThread();
  try {
    await loadSessions();
  } catch { /* la liste sera rafraîchie au prochain envoi */ }
}

async function sendSingle(prompt, sessionId, relayNow) {
  const pending = { kind: 'single', sessionId, prompt, cliId: selectedCli, start: Date.now(), relay: relayNow, requestId: uid() };
  pendings.push(pending);
  renderThread();
  try {
    const body = { prompt, cli: pending.cliId, sessionId, requestId: pending.requestId };
    if (relayNow) Object.assign(body, { relayFrom: relayNow.relayFrom, relayKind: relayNow.relayKind });
    historyEntries.unshift(await apiStream('/api/ask', body, (event) => {
      if (event.type === 'delta') onLiveDelta(pending, event.text);
      if (event.type === 'attempt' && event.cliId !== pending.cliId) {
        // Bascule (HM-23) : la carte passe à la couleur de l'IA suivante et repart de zéro.
        Object.assign(pending, { cliId: event.cliId, bascule: event.bascule, text: '' });
        renderThread({ scroll: nearBottom() });
      }
    }));
  } catch (err) {
    localErrors.push({ sessionId, prompt, message: err.message });
    restorePrompt(prompt);
  } finally {
    pendings = pendings.filter((p) => p !== pending);
    await afterSend();
  }
}

// Une requête par colonne, avec un compareId commun : chaque IA affiche son état dès qu'elle a fini.
async function sendCompare(prompt, targets, sessionId) {
  const start = Date.now();
  const compareId = uid();
  const pending = { kind: 'compare', sessionId, prompt, cols: targets.map((cliId) => ({ cliId, state: 'pending', start, requestId: uid() })) };
  pendings.push(pending);
  renderThread();
  const failures = [];
  await Promise.all(pending.cols.map(async (col) => {
    try {
      const entry = await apiStream('/api/compare', { prompt, clis: targets, only: col.cliId, compareId, sessionId, requestId: col.requestId }, (event) => {
        if (event.type === 'delta') onLiveDelta(col, event.text);
      });
      historyEntries.unshift(entry);
      col.entry = entry;
      col.state = entryState(entry);
    } catch (err) {
      col.entry = { ok: false, cli: cliName(col.cliId), cliId: col.cliId, erreur: { message: err.message, action: 'Réessayez la comparaison.' } };
      col.state = 'fail';
      failures.push(`${cliName(col.cliId)} : ${err.message}`);
    }
    if (pendings.includes(pending)) renderThread({ scroll: false });
  }));
  pendings = pendings.filter((p) => p !== pending);
  if (failures.length) localErrors.push({ sessionId, prompt, message: failures.join(' · ') });
  await afterSend();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sending) return;
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }
  const targets = clis.filter((cli) => cli.available && compareSelection.has(cli.id)).map((cli) => cli.id);
  if (compareMode && targets.length < 2) {
    toast('Choisissez au moins 2 IA disponibles pour comparer.', 'err');
    return;
  }
  if (!compareMode && !selectedCli) {
    toast('Aucune IA disponible : installez-en une, puis cliquez sur « Rafraîchir ».', 'err');
    return;
  }
  setSending(true);
  try {
    const sessionId = await ensureSession();
    const relayNow = relay;
    clearRelay();
    promptInput.value = '';
    autosize();
    if (compareMode) await sendCompare(prompt, targets, sessionId);
    else await sendSingle(prompt, sessionId, relayNow);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    setSending(false);
  }
});

// Relais en cours de rédaction : le prochain envoi sera lié à l'échange d'origine.
const relayBar = $('#relay-bar');
let relay = null;

function renderRelayBar() {
  if (!relay) {
    relayBar.hidden = true;
    return;
  }
  paint(relayBar, cliIdByName(relay.relayFromCli));
  $('#relay-text').textContent = `${relayLabel(relay)} → ${cliName(selectedCli)}. Modifiez le texte si besoin, puis envoyez.`;
  relayBar.hidden = false;
}

function clearRelay() {
  relay = null;
  renderRelayBar();
}

function startRelay(entry, kind, targetId) {
  if (compareMode) setCompare(false);
  selectCli(targetId);
  renderPicker();
  const source = entry.cliUtilisee || entry.cli;
  relay = { relayFrom: entry.id, relayKind: kind, relayFromCli: source };
  renderRelayBar();
  if (kind === 'relecture') {
    promptInput.value = `${REVIEW_PROMPT}\n\n${entry.reponse}`;
    autosize();
    promptInput.focus();
    promptInput.setSelectionRange(promptInput.value.length, promptInput.value.length);
  } else {
    // Le curseur reste en tête pour taper la consigne avant la réponse relayée.
    promptInput.value = `\n\n---\nRéponse ${de(source)} :\n${entry.reponse}`;
    autosize();
    promptInput.focus();
    promptInput.setSelectionRange(0, 0);
  }
  promptInput.scrollTop = 0;
}

$('#relay-cancel').addEventListener('click', () => {
  clearRelay();
  promptInput.focus();
});

// --- État des IA (HM-05) ---
const cliStatusList = $('#cli-status-list');
const refreshButton = $('#refresh-clis');

// --- Usage du jour (HM-16) ---
let usageState = { day: '', clis: {} };

function usageOf(cliId) {
  return usageState.clis[cliId] || { envois: 0, echecs: 0, annules: 0, dureeMs: 0 };
}

// Niveau par rapport à la limite indicative : ok, warn (80 %), over (100 %).
function usageLevel(cliId) {
  const limit = settingsState?.limits?.[cliId];
  const count = usageOf(cliId).envois;
  if (!limit) return { limit: 0, count, ratio: 0, level: 'ok' };
  const ratio = count / limit;
  return { limit, count, ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}

function formatCumul(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

function plural(n, word) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

function renderClis() {
  cliStatusList.replaceChildren(...clis.map((cli) => {
    const u = usageOf(cli.id);
    const { limit, count, ratio, level } = usageLevel(cli.id);
    const li = el('li', `${cli.available ? 'on' : 'off'} usage-${level}`);
    const row = el('div', 'cli-row');
    const state = el('span', 'state');
    state.setAttribute('aria-hidden', 'true');
    row.append(state, el('span', 'name', cli.name.replace(/ CLI$/, '')), el('span', 'usage-count', limit ? `${count} / ${limit}` : String(count)));
    li.append(row);
    if (limit) {
      const bar = el('div', 'usage-bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(limit));
      bar.setAttribute('aria-valuenow', String(count));
      bar.setAttribute('aria-label', `Usage du jour de ${cli.name}`);
      const fill = el('span');
      fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
      bar.append(fill);
      li.append(bar);
      if (level !== 'ok') li.append(el('p', 'usage-alert', level === 'over' ? 'Limite indicative atteinte' : `${Math.round(ratio * 100)} % de la limite`));
    }
    const status = cli.available ? `disponible (${cli.version})` : 'non installée';
    const today = `Aujourd'hui : ${plural(u.envois, 'envoi')} · ${plural(u.echecs, 'échec')} · ${plural(u.annules, 'annulé')} · ${formatCumul(u.dureeMs)} cumulées`;
    li.title = `${cli.name} ${status}\n${today}`;
    li.setAttribute('aria-label', `${cli.name} : ${status}. ${today}${limit ? `, limite ${limit}` : ''}`);
    return li;
  }));
  renderPicker();
  renderOrder();
  renderLimits();
}

function applyUsage(usage) {
  usageState = usage;
  if (clis.length) renderClis();
}

async function loadUsage() {
  applyUsage(await api('/api/usage'));
}

// Remise à zéro automatique : on relit les compteurs juste après minuit.
function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(() => {
    loadUsage().catch(() => {});
    scheduleMidnight();
  }, next - now);
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

refreshButton.addEventListener('click', () => loadClis(true).catch((err) => toast(err.message, 'err')));

// --- Mémoire (HM-06, HM-07, HM-24) ---
const memoryPanel = $('#memory-panel');
const memoryEditor = $('#memory-editor');
const memorySave = $('#memory-save');
const memorySync = $('#memory-sync');
const memoryStatus = $('#memory-status');
const memoryDirty = $('#memory-dirty');
const syncResults = $('#sync-results');
const openMemoryButton = $('#open-memory');
let savedMemory = '';
let memoryOpener = null;

function openMemory(opener) {
  memoryOpener = opener;
  memoryPanel.hidden = false;
  openMemoryButton.setAttribute('aria-expanded', 'true');
  if (narrow.matches) closeSidebar();
  memoryEditor.focus();
}

function closeMemory() {
  memoryPanel.hidden = true;
  openMemoryButton.setAttribute('aria-expanded', 'false');
  (memoryOpener || openMemoryButton).focus();
}

openMemoryButton.addEventListener('click', () => (memoryPanel.hidden ? openMemory(openMemoryButton) : closeMemory()));
$('#open-memory-side').addEventListener('click', (e) => openMemory(e.currentTarget));
$('#memory-close').addEventListener('click', closeMemory);
memoryPanel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMemory();
});

// Entrées « - [date] (source : IA) texte » de la section « ## Décisions ».
function parseDecisions(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^##\s+Décisions\s*$/i.test(line));
  if (start === -1) return [];
  const decisions = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const match = line.match(/^- \[([^\]]+)\] \(source : ([^)]+)\) ?(.*)$/);
    if (match) decisions.push({ date: match[1], source: match[2], text: match[3] });
    else if (decisions.length && /^\s+\S/.test(line)) decisions[decisions.length - 1].text += `\n${line.trim()}`;
  }
  return decisions;
}

function renderDecisions() {
  const decisions = parseDecisions(savedMemory);
  const count = $('#decision-count');
  count.textContent = String(decisions.length);
  count.setAttribute('aria-label', `${decisions.length} décision${decisions.length > 1 ? 's' : ''} retenue${decisions.length > 1 ? 's' : ''}`);
  const list = $('#decision-list');
  if (!decisions.length) {
    list.replaceChildren(el('li', 'empty', 'Aucune décision pour l\'instant : cliquez sur « Retenir » sous une réponse.'));
    return;
  }
  list.replaceChildren(...decisions.reverse().map((d) => {
    const li = paint(el('li'), cliIdByName(d.source));
    const meta = el('div', 'd-meta');
    const source = el('span');
    source.append(dot(cliIdByName(d.source)), ` ${d.source}`);
    meta.append(el('span', '', d.date), source);
    li.append(meta, el('div', 'd-text', d.text));
    return li;
  }));
}

function showMemory(content) {
  savedMemory = content;
  memoryEditor.value = content;
  memoryDirty.hidden = true;
  renderDecisions();
}

async function loadMemory() {
  const { content } = await api('/api/memory');
  showMemory(content);
}

memoryEditor.addEventListener('input', () => {
  memoryDirty.hidden = memoryEditor.value === savedMemory;
});

async function saveMemory() {
  const { content } = await api('/api/memory', { method: 'PUT', body: { content: memoryEditor.value } });
  showMemory(content);
}

memorySave.addEventListener('click', async () => {
  memorySave.disabled = true;
  try {
    await saveMemory();
    setStatus(memoryStatus, `Enregistré à ${formatTime(new Date().toISOString())}`, 'ok');
    toast('Mémoire enregistrée');
  } catch (err) {
    setStatus(memoryStatus, err.message, 'err');
  } finally {
    memorySave.disabled = false;
  }
});

const SYNC_LABELS = {
  created: ['ok', 'fichier créé avec le bloc Hivemind'],
  updated: ['ok', 'bloc Hivemind mis à jour (le reste du fichier est intact)'],
  unchanged: ['ok', 'déjà à jour'],
  appended: ['ok', 'bloc Hivemind ajouté à la fin (le contenu existant est intact)'],
  'needs-confirm': ['skip', 'non modifié (ajout refusé)'],
  error: ['err', 'erreur'],
};
const SYNC_OK = ['created', 'updated', 'unchanged', 'appended'];

function renderSync(dir, results) {
  syncResults.replaceChildren(...results.map((r) => {
    const [kind, label] = SYNC_LABELS[r.status] || ['err', r.status];
    const li = el('li', kind);
    li.append(el('code', '', r.file), ` : ${label}${r.message ? ` : ${r.message}` : ''}`);
    return li;
  }), el('li', 'skip', `Dossier : ${dir}`));
}

// Un fichier existant sans bloc Hivemind n'est complété qu'après confirmation (HM-07).
async function confirmPending({ dir, results }, extra = {}) {
  const pendingFiles = results.filter((r) => r.status === 'needs-confirm').map((r) => r.file);
  if (!pendingFiles.length) return { dir, results };
  const ok = await confirmDialog({
    title: 'Ajouter la mémoire à un fichier existant ?',
    message: `${pendingFiles.join(', ')} existe déjà dans ${dir} sans bloc Hivemind.\n\nLa mémoire sera ajoutée à la fin, entre deux balises. Le contenu existant ne sera pas modifié.`,
    okLabel: 'Ajouter à la fin',
  });
  return ok ? api('/api/sync', { method: 'POST', body: { ...extra, confirm: pendingFiles } }) : { dir, results };
}

memorySync.addEventListener('click', async () => {
  memorySync.disabled = true;
  syncResults.replaceChildren();
  try {
    if (memoryEditor.value !== savedMemory) await saveMemory();
    // Une mémoire vide efface ce que les IA savaient : on le fait confirmer.
    const extra = {};
    if (!savedMemory.trim()) {
      const ok = await confirmDialog({
        title: 'Vider la mémoire des IA ?',
        message: 'La mémoire est vide : le bloc Hivemind de CLAUDE.md, AGENTS.md et GEMINI.md sera vidé et les IA oublieront tout ce qu\'il contenait.\n\nLe contenu hors balises n\'est pas modifié.',
        okLabel: 'Vider la mémoire',
        danger: true,
      });
      if (!ok) return;
      extra.allowEmpty = true;
    }
    const { dir, results } = await confirmPending(await api('/api/sync', { method: 'POST', body: extra }), extra);
    renderSync(dir, results);
    const failed = results.filter((r) => !SYNC_OK.includes(r.status));
    if (failed.length) {
      setStatus(memoryStatus, `Non synchronisé : ${failed.map((r) => r.file).join(', ')}`, 'err');
    } else {
      setStatus(memoryStatus, `Synchronisé à ${formatTime(new Date().toISOString())}`, 'ok');
      toast('Synchronisation faite : CLAUDE.md, AGENTS.md et GEMINI.md sont à jour');
    }
  } catch (err) {
    setStatus(memoryStatus, err.message, 'err');
  } finally {
    memorySync.disabled = false;
  }
});

// --- Retenir une décision (HM-24) ---
const rememberDialog = $('#remember-dialog');
const rememberText = $('#remember-text');
const rememberStatus = $('#remember-status');
const rememberSummarize = $('#remember-summarize');
const rememberSave = $('#remember-save');
let rememberEntry = null;

// Texte sélectionné à l'intérieur de la réponse, sinon chaîne vide.
function selectionIn(box) {
  const selection = window.getSelection();
  const body = box.querySelector('.ai-body');
  if (!selection || selection.isCollapsed || !body) return '';
  return body.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.toString().trim() : '';
}

function openRemember(entry, selected) {
  rememberEntry = entry;
  rememberText.value = selected || entry.reponse;
  $('#remember-source').textContent = `Source : ${entry.cliUtilisee || entry.cli}. Le texte sera ajouté aux décisions de la mémoire, puis partagé avec les 3 IA.`;
  setStatus(rememberStatus, '');
  rememberSummarize.disabled = !entryCliId(entry);
  rememberDialog.showModal();
  rememberText.focus();
}

rememberSummarize.addEventListener('click', async () => {
  rememberSummarize.disabled = true;
  rememberSave.disabled = true;
  setStatus(rememberStatus, `${rememberEntry.cliUtilisee || rememberEntry.cli} résume…`);
  try {
    const { resume } = await api('/api/memory/summarize', {
      method: 'POST',
      body: { text: rememberText.value, question: rememberEntry.prompt, cli: entryCliId(rememberEntry) },
    });
    rememberText.value = resume;
    setStatus(rememberStatus, 'Résumé prêt : modifiez-le si besoin.', 'ok');
  } catch (err) {
    setStatus(rememberStatus, err.message, 'err');
  } finally {
    rememberSummarize.disabled = false;
    rememberSave.disabled = false;
    loadUsage().catch(() => {});
  }
});

$('#remember-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  rememberSave.disabled = true;
  try {
    // Comme « Synchroniser » : les modifications en cours de la mémoire sont d'abord enregistrées.
    if (memoryEditor.value !== savedMemory) await saveMemory();
    const saved = await api('/api/memory/decisions', { method: 'POST', body: { text: rememberText.value, entryId: rememberEntry.id } });
    showMemory(saved.content);
    rememberDialog.close();
    if (saved.syncError) {
      toast(`Décision retenue dans la mémoire, mais pas partagée : ${saved.syncError}`, 'err');
      return;
    }
    const { dir, results } = await confirmPending(saved);
    renderSync(dir, results);
    const failed = results.filter((r) => !SYNC_OK.includes(r.status));
    if (failed.length) toast(`Décision retenue, mais non partagée dans ${failed.map((r) => r.file).join(', ')} (voir la Mémoire).`, 'err');
    else toast('Décision retenue et partagée avec les 3 IA');
  } catch (err) {
    if (rememberDialog.open) setStatus(rememberStatus, err.message, 'err');
    else toast(err.message, 'err');
  } finally {
    rememberSave.disabled = false;
  }
});

// --- Réglages : dossier de travail (HM-08), bascule et panne simulée (HM-23) ---
const workdirChip = $('#workdir-chip');
const fallbackToggle = $('#fallback-toggle');
const fallbackOrderList = $('#fallback-order');
const simulateToggle = $('#simulate-toggle');
const optionsStatus = $('#options-status');
let settingsState = null;

function showWorkdir(settings) {
  const label = $('#workdir-label');
  if (settings.workdir) {
    const name = settings.workdir.split(/[\\/]/).filter(Boolean).pop() || settings.workdir;
    label.textContent = `Dossier de travail : ${name}`;
    workdirChip.title = settings.workdir;
    workdirChip.classList.remove('warn');
  } else {
    label.textContent = 'Dossier de travail : non choisi';
    workdirChip.title = `Aucun dossier choisi : les CLI travaillent dans ${settings.defaultCwd}`;
    workdirChip.classList.add('warn');
  }
}

workdirChip.addEventListener('click', () => {
  const s = settingsState || {};
  inputDialog({
    title: 'Dossier de travail',
    hint: s.workdir
      ? 'Les IA travaillent dans ce dossier et y lisent CLAUDE.md, AGENTS.md et GEMINI.md.'
      : `Aucun dossier choisi : les IA travaillent dans ${s.defaultCwd || 'votre dossier personnel'}.`,
    label: 'Chemin complet du dossier',
    value: s.workdir || '',
    placeholder: 'C:\\Users\\moi\\projets\\mon-projet',
    okLabel: 'Valider',
    onSubmit: async (value) => {
      applySettings(await api('/api/settings', { method: 'PUT', body: { workdir: value } }));
      toast('Dossier de travail validé');
    },
  });
});

function renderLimits() {
  const list = $('#limit-list');
  if (list.contains(document.activeElement)) return; // ne pas perdre la saisie en cours
  list.replaceChildren(...clis.map((cli) => {
    const row = el('label', 'limit-row');
    const input = el('input', 'field limit-input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '—';
    input.value = settingsState?.limits?.[cli.id] ?? '';
    input.setAttribute('aria-label', `Limite quotidienne de ${cli.name}`);
    input.addEventListener('change', () => {
      const limits = { ...(settingsState?.limits || {}) };
      if (input.value.trim()) limits[cli.id] = input.value.trim();
      else delete limits[cli.id];
      saveOptions({ limits });
    });
    row.append(dot(cli.id), el('span', 'name', cli.name.replace(/ CLI$/, '')), input);
    return row;
  }));
  $('#skip-row').hidden = !settingsState?.fallback;
  $('#skip-toggle').checked = Boolean(settingsState?.skipAtLimit);
}

function showOptions(settings) {
  fallbackToggle.checked = settings.fallback;
  simulateToggle.checked = settings.simulateClaudeDown;
  simulateToggle.closest('.switch-row').classList.toggle('on', settings.simulateClaudeDown);
  $('#sim-banner').hidden = !settings.simulateClaudeDown;
  $('#settings-alert').hidden = !settings.simulateClaudeDown;
  renderOrder();
  renderPicker();
  if (clis.length) renderClis();
}

function applySettings(settings) {
  settingsState = settings;
  showWorkdir(settings);
  showOptions(settings);
}

async function loadSettings() {
  applySettings(await api('/api/settings'));
}

function renderOrder() {
  const order = settingsState?.fallbackOrder || [];
  fallbackOrderList.classList.toggle('disabled', !fallbackToggle.checked);
  fallbackOrderList.replaceChildren(...order.map((id, index) => {
    const cli = clis.find((c) => c.id === id);
    const name = cli ? cli.name : id;
    const li = el('li', cli && cli.available === false ? 'off' : '');
    li.append(el('span', 'rank', String(index + 1)), dot(id), el('span', 'name', cli && cli.available === false ? `${name} · absente` : name));
    for (const [dir, label] of [[-1, 'Monter'], [1, 'Descendre']]) {
      const move = button('icon-btn', '', () => moveInOrder(index, dir));
      move.append(icon(dir < 0 ? 'up' : 'down'));
      move.setAttribute('aria-label', `${label} ${name}`);
      move.dataset.move = `${id}:${dir}`;
      move.disabled = index + dir < 0 || index + dir >= order.length;
      li.append(move);
    }
    return li;
  }));
}

async function moveInOrder(index, dir) {
  const order = [...settingsState.fallbackOrder];
  const id = order[index];
  [order[index], order[index + dir]] = [order[index + dir], order[index]];
  await saveOptions({ fallbackOrder: order });
  // Le focus suit l'IA déplacée.
  const same = fallbackOrderList.querySelector(`[data-move="${id}:${dir}"]`);
  (same && !same.disabled ? same : fallbackOrderList.querySelector(`[data-move="${id}:${-dir}"]`))?.focus();
}

async function saveOptions(patch) {
  try {
    applySettings(await api('/api/settings', { method: 'PUT', body: patch }));
    setStatus(optionsStatus, '');
  } catch (err) {
    setStatus(optionsStatus, err.message, 'err');
  }
}

fallbackToggle.addEventListener('change', () => saveOptions({ fallback: fallbackToggle.checked }));
$('#skip-toggle').addEventListener('change', (e) => saveOptions({ skipAtLimit: e.target.checked }));
$('#usage-reset').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'Remettre les compteurs à zéro ?',
    message: 'Les compteurs d\'usage du jour (envois, échecs, annulés, durées) repartent de zéro pour toutes les IA.',
    okLabel: 'Remettre à zéro',
  });
  if (!ok) return;
  try {
    applyUsage(await api('/api/usage/reset', { method: 'POST' }));
    toast('Compteurs remis à zéro');
  } catch (err) {
    toast(err.message, 'err');
  }
});
simulateToggle.addEventListener('change', () => saveOptions({ simulateClaudeDown: simulateToggle.checked }));
$('#sim-off').addEventListener('click', () => saveOptions({ simulateClaudeDown: false }));

// --- Démarrage ---
(async () => {
  const steps = [loadClis(), loadSettings(), loadMemory(), loadUsage(), loadHistory().then(loadSessions)];
  scheduleMidnight();
  const results = await Promise.allSettled(steps);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) toast(failed.reason.message, 'err');
  renderDecisions();
  renderThread();
  autosize();
  promptInput.focus();
})();
