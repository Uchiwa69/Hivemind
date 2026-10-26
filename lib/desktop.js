// HM-25 : comportements de l'application installée (navigateur, messages, PATH, fichiers embarqués).
const path = require('path');
const { spawn, execFile } = require('child_process');
const { isPackaged } = require('./paths');

// Ouvre l'adresse dans le navigateur par défaut (arguments en tableau, sans shell).
function openBrowser(url) {
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
}

// En mode installé, la fenêtre console est réduite : une erreur bloquante s'affiche aussi dans une boîte de dialogue.
function showError(message) {
  console.error(message);
  if (!isPackaged || process.platform !== 'win32') return Promise.resolve();
  const script = 'Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:HIVEMIND_MESSAGE, "Hivemind") | Out-Null';
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, HIVEMIND_MESSAGE: message },
      windowsHide: true,
    }, () => resolve());
  });
}

// Une CLI installée après le lancement de Hivemind n'est pas dans son PATH : on relit celui de Windows.
function refreshPath() {
  if (process.platform !== 'win32') return Promise.resolve();
  const script = "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      if (!err && stdout.trim()) {
        const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') || 'Path';
        const parts = [...String(process.env[key] || '').split(';'), ...stdout.trim().split(';')].filter(Boolean);
        process.env[key] = [...new Set(parts)].join(';');
      }
      resolve();
    });
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Sert public/ depuis les fichiers embarqués dans l'exécutable (sea.getAsset), comme express.static.
function embeddedStatic() {
  const sea = require('node:sea');
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let name;
    try {
      name = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    if (name.endsWith('/')) name += 'index.html';
    const key = path.posix.join('public', path.posix.normalize(name));
    if (!key.startsWith('public/')) return next();
    let data;
    try {
      data = sea.getAsset(key);
    } catch {
      return next();
    }
    res.type(TYPES[path.extname(key)] || 'application/octet-stream');
    res.send(Buffer.from(data));
  };
}

module.exports = { openBrowser, showError, refreshPath, embeddedStatic };
