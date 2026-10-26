// Les CLI pilotées, en mode non interactif.
const { run, TIMEOUT_MS } = require('./runner');
const { explain } = require('./errors');

const CLIS = {
  claude: {
    name: 'Claude Code',
    command: 'claude',
    args: (prompt) => ['-p', prompt],
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

// cmd.exe coupe la ligne de commande au premier saut de ligne (cas des .cmd) : on aplatit.
function cleanPrompt(prompt) {
  return process.platform === 'win32' ? prompt.replace(/\r?\n/g, ' ') : prompt;
}

// Ne rejette jamais : un échec devient { ok: false, erreur, reponse } avec un message lisible.
async function ask(cliId, prompt, { cwd } = {}) {
  const cli = CLIS[cliId];
  const result = await run(cli.command, cli.args(cleanPrompt(prompt)), { cwd, timeoutMs: TIMEOUT_MS });
  const ok = result.code === 0 && !result.timedOut && !result.error;
  if (ok) {
    return { ok, cli: cli.name, reponse: result.stdout.trim() || '(réponse vide)', dureeMs: result.dureeMs };
  }
  const erreur = explain(cliId, cli.name, result, TIMEOUT_MS);
  if (erreur.type === 'absente') status[cliId] = { available: false, version: '', checkedAt: new Date().toISOString() };
  const reponse = [erreur.message, `→ ${erreur.action}`, erreur.detail && `\nDétail :\n${erreur.detail}`].filter(Boolean).join('\n');
  return { ok, cli: cli.name, reponse, erreur, dureeMs: result.dureeMs };
}

module.exports = { CLIS, listClis, detect, isAvailable, ask };
