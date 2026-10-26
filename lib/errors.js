// Traduit l'échec d'une CLI en message français + action conseillée.

const INSTALL = {
  claude: 'npm install -g @anthropic-ai/claude-code (ou winget install Anthropic.ClaudeCode)',
  codex: 'npm install -g @openai/codex',
  agy: 'installez Antigravity CLI et vérifiez que « agy --version » marche dans un terminal',
  gemini: 'npm install -g @google/gemini-cli',
};

const LOGIN = {
  claude: 'lancez « claude » une fois dans un terminal pour vous connecter',
  codex: 'lancez « codex login » une fois dans un terminal pour vous connecter',
  agy: 'lancez « agy » une fois dans un terminal pour vous connecter',
  gemini: 'lancez « gemini » une fois dans un terminal pour vous connecter',
};

const PATTERNS = {
  nested: /another claude code session|nested session|cannot be launched inside/i,
  quota: /quota|rate.?limit|usage limit|limit (?:reached|exceeded)|too many requests|\b429\b|resource.?exhausted|credit balance|out of credits/i,
  auth: /not logged in|please (?:run )?\/?log ?in|\blogin\b|authenticat|unauthori[sz]ed|\b401\b|\b403\b|api key|credentials?\b|oauth|token (?:has )?(?:expired|invalid)|sign in/i,
};

const DETAIL_MAX = 1500;

// Motif court d'un échec, pour les messages de bascule (HM-23).
const REASONS = {
  absente: 'non installée',
  timeout: 'pas de réponse à temps',
  lancement: 'plantage au lancement',
  'session-imbriquee': 'session imbriquée',
  quota: 'quota atteint',
  authentification: 'non connectée',
  inconnue: 'plantage',
};

function reason(erreur) {
  const motif = REASONS[erreur.type] || 'erreur';
  return erreur.simule ? `${motif}, panne simulée` : motif;
}

// result : sortie de runner.run(). Renvoie { type, message, action, detail }.
function explain(cliId, cliName, result, timeoutMs) {
  const output = `${result.stderr}\n${result.stdout}`.trim();
  const detail = output.length > DETAIL_MAX ? `${output.slice(0, DETAIL_MAX)}…` : output;

  if (result.error && result.error.code === 'ENOENT') {
    return { type: 'absente', message: `${cliName} n'est pas installée (ou pas dans le PATH).`, action: `Installez-la : ${INSTALL[cliId] || 'voir la documentation de la CLI'}, puis cliquez sur « Rafraîchir ».`, detail: '' };
  }
  if (result.timedOut) {
    return { type: 'timeout', message: `${cliName} n'a pas répondu en ${Math.round(timeoutMs / 1000)} s : la demande a été arrêtée.`, action: 'Réessayez avec un prompt plus court ou plus précis, ou vérifiez dans un terminal que la CLI répond.', detail };
  }
  if (result.error) {
    return { type: 'lancement', message: `Impossible de lancer ${cliName} : ${result.error.message}`, action: 'Vérifiez l\'installation de la CLI et le dossier de travail, puis réessayez.', detail };
  }
  if (PATTERNS.nested.test(output)) {
    return { type: 'session-imbriquee', message: `${cliName} refuse de démarrer : Hivemind a été lancé depuis une session Claude Code (sessions imbriquées).`, action: 'Arrêtez Hivemind et relancez « npm start » dans votre propre terminal.', detail };
  }
  if (PATTERNS.quota.test(output)) {
    return { type: 'quota', message: `${cliName} a atteint sa limite d'utilisation (quota).`, action: 'Attendez la réinitialisation du quota ou utilisez une autre CLI disponible.', detail };
  }
  if (PATTERNS.auth.test(output)) {
    return { type: 'authentification', message: `${cliName} n'est pas connectée à votre compte.`, action: `Pour vous connecter, ${LOGIN[cliId] || 'lancez la CLI une fois dans un terminal'}, puis réessayez.`, detail };
  }
  return { type: 'inconnue', message: `${cliName} a renvoyé une erreur (code ${result.code}).`, action: 'Lisez le détail ci-dessous, réessayez, ou testez la même commande dans un terminal.', detail };
}

module.exports = { explain, reason };
