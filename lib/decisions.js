// HM-24 : ajoute une décision à la fin de la section « ## Décisions » de la mémoire (créée si absente).
// Le reste de la mémoire est conservé tel quel.

const HEADING = '## Décisions';
const HEADING_RE = /^##\s+Décisions\s*$/i;
// La section s'arrête au prochain titre de niveau 1 ou 2.
const NEXT_SECTION_RE = /^#{1,2}\s/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function stamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// « - [2026-10-26 14:05] (source : Claude Code) texte » ; les lignes suivantes sont indentées
// pour rester dans la même entrée de liste.
function formatEntry({ date, source, text }) {
  const [first, ...rest] = text.replace(/\r\n/g, '\n').trim().split('\n');
  return [`- [${stamp(date)}] (source : ${source}) ${first}`, ...rest.map((line) => (line.trim() ? `  ${line}` : ''))];
}

function addDecision(memory, decision) {
  const eol = memory.includes('\r\n') ? '\r\n' : '\n';
  const lines = memory.replace(/\r\n/g, '\n').split('\n');
  const entry = formatEntry(decision);
  const start = lines.findIndex((line) => HEADING_RE.test(line));

  let next;
  if (start === -1) {
    const body = lines.join('\n').trimEnd();
    next = [...(body ? [body, ''] : []), HEADING, '', ...entry, ''];
  } else {
    let end = lines.findIndex((line, i) => i > start && NEXT_SECTION_RE.test(line));
    if (end === -1) end = lines.length;
    // Insertion juste après la dernière ligne non vide de la section.
    let at = end;
    while (at > start + 1 && !lines[at - 1].trim()) at -= 1;
    const before = lines.slice(0, at);
    const after = lines.slice(at);
    if (at === start + 1) before.push('');
    if (after.length && after[0].trim()) after.unshift('');
    if (!after.length) after.push('');
    next = [...before, ...entry, ...after];
  }
  return next.join('\n').replace(/\n/g, eol);
}

module.exports = { addDecision };
