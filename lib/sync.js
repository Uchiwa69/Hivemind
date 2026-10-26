// Recopie la mémoire dans les fichiers lus par chaque CLI, entre deux balises.
// Tout ce qui est hors balises est conservé tel quel.
const fs = require('fs');
const path = require('path');

const FILES = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];
const START = '<!-- HIVEMIND:START -->';
const END = '<!-- HIVEMIND:END -->';

function buildBlock(memory, eol) {
  const body = memory.replace(/\r\n/g, '\n').trim();
  return [START, body, END].join('\n').replace(/\n/g, eol);
}

function writeAtomic(file, content) {
  const tmp = `${file}.hivemind.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

// Traite un fichier. Statuts : created, updated, unchanged, appended, needs-confirm, error.
function syncFile(dir, name, memory, confirmed) {
  const file = path.join(dir, name);

  if (!fs.existsSync(file)) {
    writeAtomic(file, `${buildBlock(memory, '\n')}\n`);
    return { file: name, status: 'created' };
  }

  const current = fs.readFileSync(file, 'utf8');
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const block = buildBlock(memory, eol);
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  const hasStart = start !== -1;
  const hasEnd = end !== -1;

  if (hasStart && hasEnd && start < end && current.indexOf(START, start + 1) === -1) {
    const next = current.slice(0, start) + block + current.slice(end + END.length);
    if (next === current) return { file: name, status: 'unchanged' };
    writeAtomic(file, next);
    return { file: name, status: 'updated' };
  }

  if (hasStart || hasEnd) {
    return { file: name, status: 'error', message: 'Balises HIVEMIND incomplètes ou en double : corrigez le fichier à la main avant de synchroniser.' };
  }

  if (!confirmed.includes(name)) return { file: name, status: 'needs-confirm' };

  const separator = current.length === 0 ? '' : current.endsWith(eol) ? eol : eol + eol;
  writeAtomic(file, `${current}${separator}${block}${eol}`);
  return { file: name, status: 'appended' };
}

function syncAll(dir, memory, confirmed = []) {
  return FILES.map((name) => {
    try {
      return syncFile(dir, name, memory, confirmed);
    } catch (err) {
      return { file: name, status: 'error', message: err.message };
    }
  });
}

module.exports = { FILES, START, END, syncAll };
