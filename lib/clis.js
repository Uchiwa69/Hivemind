// Les CLI pilotées, en mode non interactif.
const { run } = require('./runner');

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

function listClis() {
  return Object.entries(CLIS).map(([id, cli]) => ({ id, name: cli.name }));
}

// cmd.exe coupe la ligne de commande au premier saut de ligne (cas des .cmd) : on aplatit.
function cleanPrompt(prompt) {
  return process.platform === 'win32' ? prompt.replace(/\r?\n/g, ' ') : prompt;
}

async function ask(cliId, prompt, { cwd } = {}) {
  const cli = CLIS[cliId];
  const result = await run(cli.command, cli.args(cleanPrompt(prompt)), { cwd });
  const ok = result.code === 0 && !result.timedOut && !result.error;
  const reponse = ok
    ? result.stdout.trim()
    : (result.stderr || result.stdout || (result.error && result.error.message) || 'Erreur inconnue').trim();
  return { ok, cli: cli.name, reponse, dureeMs: result.dureeMs };
}

module.exports = { CLIS, listClis, ask };
