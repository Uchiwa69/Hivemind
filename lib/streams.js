// HM-09 : transforme la sortie d'une CLI en texte affichable au fil de l'eau.
// Chaque analyseur a push(chunk) → texte nouveau à afficher, et finish(stdout) → { text, isError }.

// Sortie texte simple (Antigravity, Codex, Gemini) : stdout est déjà la réponse.
function plain() {
  return {
    push: (chunk) => chunk,
    finish: (stdout) => ({ text: stdout.trim(), isError: false }),
  };
}

function textOf(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content.filter((block) => block.type === 'text').map((block) => block.text).join('');
}

// Claude Code avec --output-format stream-json --verbose --include-partial-messages :
// une ligne JSON par événement. On n'affiche que le texte ; la réponse finale est le champ « result ».
function claudeJson() {
  let buffer = '';
  let result = null;
  let isError = false;
  let sawDelta = false;
  let streamed = '';
  let assistant = '';
  let sawJson = false;

  const handle = (event) => {
    if (event.type === 'stream_event') {
      const inner = event.event || {};
      // Nouveau message de l'IA après du texte (ex. après un outil) : on sépare les paragraphes.
      if (inner.type === 'message_start' && streamed) return '\n\n';
      if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
        sawDelta = true;
        return inner.delta.text || '';
      }
      return '';
    }
    if (event.type === 'assistant') {
      const text = textOf(event.message);
      assistant = assistant && text ? `${assistant}\n\n${text}` : assistant || text;
      // Sans messages partiels (ancienne version de Claude Code), le texte arrive message par message.
      return sawDelta ? '' : text;
    }
    if (event.type === 'result') {
      result = typeof event.result === 'string' ? event.result : null;
      isError = Boolean(event.is_error);
    }
    return '';
  };

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      let out = '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          sawJson = true;
          out += handle(event);
        } catch {
          // Ligne non JSON (message d'erreur brut) : ignorée ici, elle reste dans stdout pour HM-12.
        }
      }
      streamed += out;
      return out;
    },
    finish(stdout) {
      if (buffer.trim()) this.push('\n');
      // Aucun événement JSON (erreur au démarrage) : on rend la sortie brute, utile pour HM-12.
      const text = sawJson ? result ?? (assistant || streamed) : stdout;
      return { text: text.trim(), isError };
    },
  };
}

module.exports = { plain, claudeJson };
