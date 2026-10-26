// Lance une commande sans shell (cross-spawn gère les .cmd de Windows) et attend la fin.
const spawn = require('cross-spawn');
const { execFile } = require('child_process');

const TIMEOUT_MS = 180_000;

// Sous Windows, un .cmd lance cmd.exe qui lance node : il faut tuer tout l'arbre.
function killTree(child) {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  } else {
    child.kill('SIGKILL');
  }
}

// Résout toujours (jamais de rejet) : { code, stdout, stderr, timedOut, cancelled, error, dureeMs }.
// onStdout(chunk) reçoit la sortie au fil de l'eau (HM-09) ; signal permet d'annuler (HM-10).
function run(command, args, { cwd, timeoutMs = TIMEOUT_MS, onStdout, signal } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ code: null, error: null, ...result, stdout, stderr, timedOut, cancelled, dureeMs: Date.now() - start });
    };

    // Annulation : on tue tout l'arbre, puis on attend la fermeture du processus (5 s au plus).
    function onAbort() {
      if (settled || !child) return;
      cancelled = true;
      killTree(child);
      setTimeout(() => finish({}), 5000);
    }

    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish({ error });
      return;
    }

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      finish({});
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (onStdout) onStdout(chunk);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ error }));
    child.on('close', (code) => finish({ code }));
  });
}

module.exports = { run, TIMEOUT_MS };
