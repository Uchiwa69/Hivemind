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

// Résout toujours (jamais de rejet) : { code, stdout, stderr, timedOut, error, dureeMs }.
function run(command, args, { cwd, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, error: null, ...result, stdout, stderr, timedOut, dureeMs: Date.now() - start });
    };

    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish({ error });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      finish({});
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ error }));
    child.on('close', (code) => finish({ code }));
  });
}

module.exports = { run, TIMEOUT_MS };
