// Les CLI pilotées, en mode non interactif.
const spawn = require('cross-spawn');
const { run, TIMEOUT_MS } = require('./runner');
const { explain, reason } = require('./errors');
const streams = require('./streams');

const CLIS = {
  claude: {
    name: 'Claude Code',
    command: 'claude',
    // stream-json + messages partiels : le texte arrive mot à mot (HM-09).
    args: (prompt) => ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', prompt],
    parser: streams.claudeJson,
  },
  codex: {
    name: 'Codex CLI',
    command: 'codex',
    args: (prompt) => ['exec', '--skip-git-repo-check', prompt],
  },
  agy: {
    name: 'Antigravity CLI',
    command: 'agy',
    args: (prompt) => ['-p', prompt],
  },
  gemini: {
    name: 'Gemini CLI',
    command: 'gemini',
    args: (prompt) => ['-p', prompt],
  },
};

const VERSION_TIMEOUT_MS = 20_000;

// Résultat de la dernière détection : { [id]: { available, version, checkedAt } }.
let status = {};

async function detect() {
  const checks = Object.entries(CLIS).map(async ([id, cli]) => {
    const result = await run(cli.command, ['--version'], { timeoutMs: VERSION_TIMEOUT_MS });
    const available = !result.error && !result.timedOut && result.code === 0;
    const version = available ? (result.stdout.trim().split(/\r?\n/)[0] || '') : '';
    return [id, { available, version, checkedAt: new Date().toISOString() }];
  });
  status = Object.fromEntries(await Promise.all(checks));
  return listClis();
}

function isAvailable(cliId) {
  return Boolean(status[cliId]?.available);
}

function listClis() {
  return Object.entries(CLIS).map(([id, cli]) => ({
    id,
    name: cli.name,
    command: cli.command,
    available: status[id]?.available ?? null,
    version: status[id]?.version ?? '',
  }));
}

// cmd.exe coupe la ligne de commande au premier saut de ligne : on aplatit seulement quand
// cross-spawn passe par cmd.exe (cas des .cmd). Un .exe garde la mise en forme (code relayé, HM-15).
function cleanPrompt(command, prompt) {
  if (process.platform !== 'win32') return prompt;
  const viaCmd = /cmd\.exe$/i.test(spawn._parse(command, [], {}).command);
  return viaCmd ? prompt.replace(/\r?\n/g, ' ') : prompt;
}

function cancelledAnswer(cliId, text, dureeMs) {
  const erreur = {
    type: 'annule',
    message: `Envoi annulé : ${CLIS[cliId].name} a été arrêtée.`,
    action: text ? 'Le texte reçu avant l\'arrêt est conservé.' : 'Aucun texte n\'avait encore été reçu.',
    detail: '',
  };
  return { ok: false, annule: true, cli: CLIS[cliId].name, cliId, reponse: text, erreur, dureeMs };
}

function failure(cliId, erreur, dureeMs) {
  const reponse = [erreur.message, `→ ${erreur.action}`, erreur.detail && `\nDétail :\n${erreur.detail}`].filter(Boolean).join('\n');
  return { ok: false, cli: CLIS[cliId].name, cliId, reponse, erreur, dureeMs };
}

// Réglage de démo (HM-23) : Claude Code échoue comme s'il avait épuisé son quota, sans être lancé.
function simulatedFailure(cliId) {
  return failure(cliId, {
    type: 'quota',
    simule: true,
    message: `${CLIS[cliId].name} a atteint sa limite d'utilisation (quota) : panne simulée pour la démo.`,
    action: 'Décochez « Simuler une panne de Claude Code » pour revenir à la normale.',
    detail: '',
  }, 0);
}

// Ne rejette jamais : un échec devient { ok: false, erreur, reponse } avec un message lisible.
// onDelta(texte) reçoit la réponse au fil de l'eau (HM-09).
// signal annule l'envoi (HM-10) : le texte déjà reçu est gardé.
async function ask(cliId, prompt, { cwd, simulateClaudeDown = false, onDelta, signal } = {}) {
  if (simulateClaudeDown && cliId === 'claude') return simulatedFailure(cliId);
  const cli = CLIS[cliId];
  const parser = (cli.parser || streams.plain)();
  const onStdout = (chunk) => {
    const text = parser.push(chunk);
    if (text && onDelta) onDelta(text);
  };
  const result = await run(cli.command, cli.args(cleanPrompt(cli.command, prompt)), { cwd, timeoutMs: TIMEOUT_MS, onStdout, signal });
  const out = parser.finish(result.stdout);
  if (result.cancelled) return cancelledAnswer(cliId, out.text, result.dureeMs);
  const ok = result.code === 0 && !result.timedOut && !result.error && !out.isError;
  if (ok) {
    return { ok, cli: cli.name, cliId, reponse: out.text || '(réponse vide)', dureeMs: result.dureeMs };
  }
  // HM-12 lit le texte de la réponse (ex. message de quota dans le JSON de Claude Code).
  const erreur = explain(cliId, cli.name, { ...result, stdout: out.text || result.stdout }, TIMEOUT_MS);
  if (erreur.type === 'absente') status[cliId] = { available: false, version: '', checkedAt: new Date().toISOString() };
  return failure(cliId, erreur, result.dureeMs);
}

// HM-23 : si la CLI demandée échoue (n'importe quel type d'erreur de HM-12), le même prompt part
// vers les CLI suivantes de `order`, en sautant les absentes et celles de `exclude`.
// onAttempt({ cliId, cli, bascule }) est appelé avant chaque essai, pour l'affichage en direct.
async function askWithFallback(cliId, prompt, { cwd, order = [], exclude = [], simulateClaudeDown = false, onDelta, onAttempt, signal } = {}) {
  const cliDemandee = CLIS[cliId].name;
  const candidates = [cliId, ...order.filter((id) => id !== cliId && Object.hasOwn(CLIS, id) && !exclude.includes(id))];
  const bascule = [];
  let last = null;
  let dureeMs = 0;

  for (const id of candidates) {
    if (id !== cliId && !isAvailable(id)) continue;
    if (signal?.aborted) return { ...cancelledAnswer(id, '', 0), dureeMs, cliDemandee, cliUtilisee: null, bascule: bascule.length ? bascule : undefined };
    if (onAttempt) onAttempt({ cliId: id, cli: CLIS[id].name, bascule: [...bascule] });
    const answer = await ask(id, prompt, { cwd, simulateClaudeDown, onDelta, signal });
    dureeMs += answer.dureeMs;
    // Annulé par l'utilisateur : pas de bascule.
    if (answer.annule) {
      return { ...answer, dureeMs, cliDemandee, cliUtilisee: answer.cli, bascule: bascule.length ? bascule : undefined };
    }
    if (answer.ok) {
      return { ...answer, dureeMs, cliDemandee, cliUtilisee: answer.cli, bascule: bascule.length ? bascule : undefined };
    }
    bascule.push({ cli: answer.cli, motif: reason(answer.erreur), message: answer.erreur.message, action: answer.erreur.action });
    last = answer;
  }

  // Aucune autre CLI à essayer : le message de HM-12 suffit.
  if (bascule.length === 1) return { ...last, cliDemandee, cliUtilisee: null };

  const erreur = {
    type: 'toutes-echouees',
    message: `Aucune IA n'a pu répondre : les ${bascule.length} CLI essayées ont échoué.`,
    action: 'Corrigez l\'un des problèmes ci-dessous (ou attendez la fin d\'un quota), puis réessayez.',
    detail: '',
  };
  const reponse = [erreur.message, ...bascule.map((b) => `- ${b.cli} (${b.motif}) : ${b.message} → ${b.action}`)].join('\n');
  return { ok: false, cli: cliDemandee, cliId, reponse, erreur, dureeMs, cliDemandee, cliUtilisee: null, bascule };
}

module.exports = { CLIS, listClis, detect, isAvailable, ask, askWithFallback };
