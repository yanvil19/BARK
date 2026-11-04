// Reads a Word (.docx) question file into the text the import AI works on,
// keeping what the question form can hold:
//   - bold, italic and underline as <b>, <i> and <u> tags
//   - Word equations (Insert > Equation) as LaTeX between $ signs
//   - pictures as an [IMAGE] marker, so the question is flagged for an upload
// Everything else (fonts, colours, styles) is dropped.

const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const mammoth = require('mammoth');
const { ommlToLatex, MATH_NS } = require('./ommlToLatex');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const quietParser = () => new DOMParser({
  errorHandler: { warning() {}, error() {}, fatalError(message) { throw new Error(message); } },
});

// Equations sit outside the topmost <m:oMathPara>/<m:oMath>; nested ones are part of their parent
function findTopLevelEquations(doc) {
  const found = [];
  const walk = (node) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (c.namespaceURI === MATH_NS && (c.localName === 'oMathPara' || c.localName === 'oMath')) {
        found.push(c);
      } else {
        walk(c);
      }
    }
  };
  walk(doc);
  return found;
}

/**
 * Replaces every Word equation in the document with a text run holding its
 * LaTeX between $ signs. The Word reader (mammoth) skips equations, so without
 * this they would vanish from the import.
 */
async function replaceWordEquations(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file('word/document.xml');
  if (!file) return buffer;

  const xml = await file.async('string');
  if (!xml.includes('oMath')) return buffer;

  const doc = quietParser().parseFromString(xml, 'text/xml');
  const equations = findTopLevelEquations(doc);
  if (equations.length === 0) return buffer;

  for (const equation of equations) {
    const latex = ommlToLatex(equation);
    const run = doc.createElementNS(WORD_NS, 'w:r');
    const text = doc.createElementNS(WORD_NS, 'w:t');
    text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    text.appendChild(doc.createTextNode(latex ? `$${latex}$` : ''));
    run.appendChild(text);
    equation.parentNode.replaceChild(run, equation);
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const SUPERSCRIPTS = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const SUBSCRIPTS = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
};

// Superscript/subscript typed as formatting (m², H₂O): use the Unicode characters
// when every character has one, else a ^(...) / _(...) fallback
function toScript(text, map, marker) {
  const plain = text.replace(/<\/?[biu]>/g, '');
  if (!plain.trim()) return text;
  const chars = [...plain];
  if (chars.every((c) => map[c])) return chars.map((c) => map[c]).join('');
  return `${marker}(${plain})`;
}

function wrapTag(tag, inner) {
  if (!inner.trim()) return inner;
  // Keep surrounding spaces outside the tag: " <b>word</b> "
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  return `${lead}<${tag}>${inner.trim()}</${tag}>${trail}`;
}

function walkHtml(node) {
  if (node.nodeType === 3) return node.data;
  if (node.nodeType !== 1) return '';

  const tag = node.nodeName.toLowerCase();
  const inner = () => {
    let out = '';
    for (let c = node.firstChild; c; c = c.nextSibling) out += walkHtml(c);
    return out;
  };

  switch (tag) {
    case 'p': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
    case 'div': case 'blockquote':
      return `${inner()}\n`;
    case 'br':
      return '\n';
    case 'strong': case 'b':
      return wrapTag('b', inner());
    case 'em': case 'i':
      return wrapTag('i', inner());
    case 'u':
      return wrapTag('u', inner());
    case 'sup':
      return toScript(inner(), SUPERSCRIPTS, '^');
    case 'sub':
      return toScript(inner(), SUBSCRIPTS, '_');
    case 'img':
      return ' [IMAGE] ';
    case 'ol': case 'ul': {
      let n = 0;
      let out = '\n';
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        n += 1;
        const marker = tag === 'ol' ? `${n}. ` : '- ';
        out += `${marker}${walkHtml(c).trim()}\n`;
      }
      return out;
    }
    case 'li':
      return inner();
    case 'tr': {
      const cells = [];
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) cells.push(walkHtml(c).trim());
      }
      // A one-cell row is a box of text: keep its lines. Wider rows read as "a | b | c".
      if (cells.length === 1) return `${cells[0]}\n`;
      return `${cells.map((cell) => cell.replace(/\n+/g, ' ')).join(' | ')}\n`;
    }
    case 'table':
      return `\n${inner()}\n`;
    default:
      return inner();
  }
}

function tidyText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/[ \t ]{2,}/g, ' ')
    // Empty formatting left behind by blank runs
    .replace(/<([biu])>\s*<\/\1>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turns the HTML the Word reader produces into the import text (see top of file).
 */
function htmlToImportText(html) {
  try {
    const doc = quietParser().parseFromString(`<root>${html}</root>`, 'text/xml');
    return tidyText(walkHtml(doc.documentElement));
  } catch {
    // Unparseable HTML: fall back to plain text with paragraph breaks
    return tidyText(
      String(html)
        .replace(/<(br|\/p|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, '\n')
        .replace(/<img\b[^>]*>/gi, ' [IMAGE] ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    );
  }
}

/**
 * Reads a .docx buffer into import text. Equations are converted first; if that
 * fails the document is still read, just without them.
 */
async function extractDocxImportText(buffer) {
  let prepared = buffer;
  try {
    prepared = await replaceWordEquations(buffer);
  } catch (error) {
    console.error('Word equation conversion failed; importing without equations:', error.message);
  }

  const result = await mammoth.convertToHtml(
    { buffer: prepared },
    {
      // Underline is dropped by default; keep it like bold and italic
      styleMap: ['u => u'],
      // Blank lines help the AI tell one question from the next
      ignoreEmptyParagraphs: false,
      // Pictures become an [IMAGE] marker; their data is never needed
      convertImage: mammoth.images.imgElement(() => ({ src: '' })),
    },
  );

  return htmlToImportText(result.value || '');
}

module.exports = {
  extractDocxImportText,
  replaceWordEquations,
  htmlToImportText,
};
