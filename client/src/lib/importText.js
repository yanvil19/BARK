// Turns the text the import AI returns into the HTML the question editor
// (RichTextEditor) works with, so imported questions match questions typed in
// the form:
//   - <b>, <i>, <u> (and <strong>, <em>) stay as formatting; any other "<" is text
//   - LaTeX between $…$, $$…$$, \(…\) or \[…\] becomes an equation block
//   - line breaks become paragraphs (answers stay on one line)
//   - the [IMAGE] marker is dropped; the question is flagged for an image instead

const FORMAT_TAG = /&lt;(\/?)(b|i|u|strong|em)&gt;/gi;
const TAG_NAMES = { strong: 'b', em: 'i' };

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatText(text) {
  return escapeHtml(text).replace(FORMAT_TAG, (_, slash, tag) => {
    const name = tag.toLowerCase();
    return `<${slash}${TAG_NAMES[name] || name}>`;
  });
}

// Same markup the editor's equation block saves (extensions/MathNode.js)
function mathFieldHtml(latex) {
  const value = escapeHtml(latex.trim());
  return `<math-field data-type="math-node" data-latex="${value}">${value}</math-field>`;
}

// Finds the $ that closes inline math opened just before `start`. Like Pandoc:
// the opening $ is not followed by a space, the closing $ is not preceded by a
// space or followed by a digit, so "$5 and $10" stays text.
function findClosingDollar(text, start) {
  if (start >= text.length || /\s|\$/.test(text[start])) return -1;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\\') {
      j += 1;
    } else if (ch === '\n' && text[j + 1] === '\n') {
      return -1;
    } else if (ch === '$' && !/\s/.test(text[j - 1]) && !/\d/.test(text[j + 1] || '')) {
      return j;
    }
  }
  return -1;
}

/**
 * Splits text into { type: 'text' | 'math', value } parts.
 */
export function splitMath(text) {
  const parts = [];
  let buffer = '';
  const pushText = () => {
    if (buffer) parts.push({ type: 'text', value: buffer });
    buffer = '';
  };
  const pushMath = (latex) => {
    pushText();
    parts.push({ type: 'math', value: latex });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '\\' && next === '$') {
      buffer += '$';
      i += 2;
      continue;
    }

    if (ch === '\\' && (next === '(' || next === '[')) {
      const end = text.indexOf(next === '(' ? '\\)' : '\\]', i + 2);
      const latex = end === -1 ? '' : text.slice(i + 2, end).trim();
      if (latex) {
        pushMath(latex);
        i = end + 2;
        continue;
      }
    }

    if (ch === '$' && next === '$') {
      const end = text.indexOf('$$', i + 2);
      const latex = end === -1 ? '' : text.slice(i + 2, end).trim();
      if (latex) {
        pushMath(latex);
        i = end + 2;
        continue;
      }
    } else if (ch === '$') {
      const end = findClosingDollar(text, i + 1);
      if (end !== -1) {
        pushMath(text.slice(i + 1, end));
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  pushText();
  return parts;
}

/**
 * Converts one imported text field to editor HTML. `singleLine` is for answer
 * choices, which keep everything on one line.
 */
export function importTextToHtml(value, { singleLine = false } = {}) {
  const text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s*\[IMAGE\]\s*/gi, ' ')
    .trim();
  if (!text) return '';

  const paragraphs = [[]];
  const current = () => paragraphs[paragraphs.length - 1];

  for (const part of splitMath(text)) {
    if (part.type === 'math') {
      current().push(mathFieldHtml(part.value));
      continue;
    }
    part.value.split('\n').forEach((line, idx) => {
      if (idx > 0) {
        if (singleLine) current().push(' ');
        else paragraphs.push([]);
      }
      if (line) current().push(formatText(line));
    });
  }

  return paragraphs
    .map((chunks) => chunks.join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((html) => `<p>${html}</p>`)
    .join('');
}

/**
 * Maps the questions the import API returns to the form's question shape.
 * Questions of a set are kept together at the place of the set's first
 * question, and share one subject.
 */
export function mapExtractedQuestions(questions = [], tags = []) {
  const tagIdFor = (name) => {
    const wanted = String(name || '').trim().toLowerCase();
    return (wanted && tags.find((t) => t.name.toLowerCase() === wanted)?._id) || '';
  };

  const mapped = questions.map((q) => {
    const setKey = q.set_id === null || q.set_id === undefined ? null : `set-${q.set_id}`;
    return {
      description: importTextToHtml(q.question_text),
      answers: Object.entries(q.options || {})
        .filter(([, text]) => text !== null && text !== undefined)
        .map(([key, text]) => ({
          text: importTextToHtml(text, { singleLine: true }),
          isCorrect: key === q.correct_answer,
        })),
      rationalization: importTextToHtml(q.rationalization),
      image_required: q.image_required || false,
      image_note: q.image_note || null,
      flags: q.flags || [],
      tagId: tagIdFor(q.suggested_tag),
      setKey,
      setPassage: setKey ? importTextToHtml(q.shared_passage) : '',
    };
  });

  const ordered = [];
  const placed = new Set();
  mapped.forEach((q, i) => {
    if (placed.has(i)) return;
    if (!q.setKey) {
      placed.add(i);
      ordered.push(q);
      return;
    }
    const members = mapped
      .map((m, j) => [m, j])
      .filter(([m]) => m.setKey === q.setKey);
    const tagId = members.map(([m]) => m.tagId).find(Boolean) || '';
    members.forEach(([m, j]) => {
      placed.add(j);
      ordered.push({ ...m, tagId });
    });
  });

  return ordered;
}
