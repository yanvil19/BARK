// Converts Word equations (Office Math Markup Language, the <m:oMath> elements
// that Word's Insert > Equation tool writes) to LaTeX, so imported questions can
// show them as equation blocks. Covers the structures Word's equation tool
// produces: fractions, scripts, roots, sums/integrals, brackets, functions,
// limits, accents, bars, braces, boxes, matrices and equation arrays.

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

const SYMBOLS = {
  // Greek
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ϵ': '\\epsilon',
  'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ϑ': '\\vartheta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ϖ': '\\varpi', 'ρ': '\\rho',
  'ϱ': '\\varrho', 'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\varphi',
  'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
  'Σ': '\\Sigma', 'Υ': '\\Upsilon', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  // Operators and relations
  '−': '-', '×': '\\times', '÷': '\\div', '·': '\\cdot', '⋅': '\\cdot', '∙': '\\cdot', '±': '\\pm', '∓': '\\mp',
  '≤': '\\le', '≥': '\\ge', '≠': '\\neq', '≈': '\\approx', '≅': '\\cong', '≡': '\\equiv', '∼': '\\sim',
  '∝': '\\propto', '≪': '\\ll', '≫': '\\gg', '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow', '↑': '\\uparrow', '↓': '\\downarrow', '↦': '\\mapsto',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq',
  '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∀': '\\forall', '∃': '\\exists',
  '¬': '\\neg', '∧': '\\land', '∨': '\\lor', '⊕': '\\oplus', '⊗': '\\otimes', '∘': '\\circ', '∗': '\\ast',
  '∠': '\\angle', '⊥': '\\perp', '∥': '\\parallel', '△': '\\triangle', '∴': '\\therefore', '∵': '\\because',
  '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots', 'ℏ': '\\hbar', 'ℓ': '\\ell',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  '√': '\\surd', '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '°': '^{\\circ}', '′': "'", '″': "''",
  // Characters with a meaning in LaTeX
  '{': '\\{', '}': '\\}', '#': '\\#', '%': '\\%', '$': '\\$', '_': '\\_', '\\': '\\backslash',
  '^': '\\hat{}', '~': '\\sim',
  // Invisible operators and spacing
  '⁡': '', '⁢': '', '⁣': ',', '⁤': '+', '​': '', ' ': ' ',
  ' ': '\\,', ' ': '\\;', ' ': '\\quad',
};

const NARY = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
  '∮': '\\oint', '∯': '\\oiint', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge',
  '⨁': '\\bigoplus', '⨂': '\\bigotimes',
};

const ACCENTS = {
  '̂': '\\hat', '̃': '\\tilde', '̄': '\\bar', '̅': '\\bar', '̇': '\\dot',
  '̈': '\\ddot', '⃗': '\\vec', '́': '\\acute', '̀': '\\grave', '̆': '\\breve',
  '̌': '\\check', '⃖': '\\overleftarrow', '⃡': '\\overleftrightarrow',
};

const DELIMITERS = {
  '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|',
  '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor',
  '⌈': '\\lceil', '⌉': '\\rceil', '': '.',
};

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det',
  'dim', 'deg', 'gcd', 'arg', 'ker', 'hom', 'Pr',
]);

const LIMIT_OPERATORS = new Set(['lim', 'max', 'min', 'sup', 'inf', 'liminf', 'limsup']);

function isElement(node) {
  return node && node.nodeType === 1;
}

function childElements(node, localName) {
  const out = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (isElement(c) && (!localName || c.localName === localName)) out.push(c);
  }
  return out;
}

function childElement(node, localName) {
  return childElements(node, localName)[0] || null;
}

// Reads <m:xPr><m:prop m:val="..."/></m:xPr>; returns null when absent
function propValue(node, propsName, propName) {
  const props = node && childElement(node, propsName);
  const prop = props && childElement(props, propName);
  if (!prop) return null;
  const val = prop.getAttributeNS(MATH_NS, 'val') || prop.getAttribute('m:val');
  return val === null || val === undefined ? '' : val;
}

// On/off properties are on when present without a value (<m:degHide/>) or set to 1/on/true
function flagOn(node, propsName, propName) {
  const value = propValue(node, propsName, propName);
  return value === '' || value === '1' || value === 'on' || value === 'true';
}

// Plain text of a node's runs, used to recognise names like "sin" or "lim"
function rawText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.data;
  if (!isElement(node)) return '';
  if (node.localName === 't') return node.textContent || '';
  let text = '';
  for (let c = node.firstChild; c; c = c.nextSibling) text += rawText(c);
  return text;
}

function escapeText(text, ctx) {
  let out = '';
  for (const ch of text) {
    if (ch === '&') {
      out += ctx.allowAmpersand ? '&' : '\\&';
    } else if (Object.prototype.hasOwnProperty.call(SYMBOLS, ch)) {
      const symbol = SYMBOLS[ch];
      // Space after a command name so it never runs into the next letter (\alpha x, not \alphax)
      out += /\\[A-Za-z]+$/.test(symbol) ? `${symbol} ` : symbol;
    } else {
      out += ch;
    }
  }
  return out;
}

// Puts a base in braces when it is more than one symbol, so x^2 stays x^{2} but ab^2 becomes {ab}^{2}
function wrapBase(base) {
  const trimmed = base.trim();
  if (/^[A-Za-z0-9]$/.test(trimmed) || /^\\[A-Za-z]+$/.test(trimmed)) return trimmed;
  if (/^\\left[\s\S]*\\right\S+$/.test(trimmed)) return trimmed;
  return `{${trimmed}}`;
}

function convertChildren(node, ctx) {
  let out = '';
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (isElement(c)) out += convertNode(c, ctx);
  }
  return out;
}

function convertPart(node, partName, ctx) {
  const part = childElement(node, partName);
  return part ? convertChildren(part, ctx).trim() : '';
}

function convertRun(node, ctx) {
  const text = childElements(node, 't').map((t) => t.textContent || '').join('');
  if (!text) return '';

  if (flagOn(node, 'rPr', 'nor')) {
    return `\\text{${text.replace(/[{}\\]/g, (c) => `\\${c === '\\' ? 'backslash ' : c}`)}}`;
  }

  // Upright multi-letter words (sty="p") are names like "mol" or "kg"
  const style = propValue(node, 'rPr', 'sty');
  if (style === 'p' && /^[A-Za-z]{2,}$/.test(text)) {
    return FUNCTIONS.has(text) ? `\\${text} ` : `\\mathrm{${text}}`;
  }

  // Words typed between spaces ("x=2 or x=3") are text; LaTeX would run them together
  if (/\s/.test(text)) {
    return text.split(/(\s+)/).map((part) => (
      isTextWord(part) ? `\\text{ ${part} }` : escapeText(part, ctx)
    )).join('');
  }

  return escapeText(text, ctx);
}

const TEXT_WORDS = new Set([
  'or', 'and', 'if', 'for', 'then', 'where', 'when', 'is', 'are', 'of', 'to', 'in', 'with', 'but',
  'not', 'so', 'at', 'as', 'be', 'by', 'on', 'all', 'any', 'each', 'else', 'otherwise', 'such', 'that',
]);

// A word of 4+ letters, or a short common word, that is not a function name like "sin"
function isTextWord(part) {
  if (!/^[A-Za-z]{2,}$/.test(part) || FUNCTIONS.has(part)) return false;
  return part.length >= 4 || TEXT_WORDS.has(part.toLowerCase());
}

function convertFraction(node, ctx) {
  const num = convertPart(node, 'num', ctx);
  const den = convertPart(node, 'den', ctx);
  const type = propValue(node, 'fPr', 'type');
  if (type === 'lin' || type === 'skw') return `${wrapBase(num)}/${wrapBase(den)}`;
  if (type === 'noBar') return `{${num} \\atop ${den}}`;
  return `\\frac{${num}}{${den}}`;
}

function convertNary(node, ctx) {
  const chr = propValue(node, 'naryPr', 'chr');
  const symbol = chr === null ? '∫' : chr;
  const op = NARY[symbol] || escapeText(symbol, ctx).trim() || '\\int';
  const sub = flagOn(node, 'naryPr', 'subHide') ? '' : convertPart(node, 'sub', ctx);
  const sup = flagOn(node, 'naryPr', 'supHide') ? '' : convertPart(node, 'sup', ctx);
  const body = convertPart(node, 'e', ctx);
  return `${op}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''} ${body}`;
}

function convertDelimiter(node, ctx) {
  const beg = propValue(node, 'dPr', 'begChr');
  const end = propValue(node, 'dPr', 'endChr');
  const sep = propValue(node, 'dPr', 'sepChr');
  const open = DELIMITERS[beg === null ? '(' : beg] ?? escapeText(beg, ctx);
  const close = DELIMITERS[end === null ? ')' : end] ?? escapeText(end, ctx);
  const separator = sep === null ? '|' : (DELIMITERS[sep] ?? escapeText(sep, ctx));
  const parts = childElements(node, 'e').map((e) => convertChildren(e, ctx).trim());
  return `\\left${open}${parts.join(` ${separator === '|' ? '\\mid' : separator} `)}\\right${close}`;
}

function convertFunction(node, ctx) {
  const fName = childElement(node, 'fName');
  const arg = convertPart(node, 'e', ctx);
  const onlyRuns = fName && childElements(fName).every((c) => c.localName === 'r' || c.localName.endsWith('Pr'));
  let name;
  if (onlyRuns) {
    const text = rawText(fName).trim();
    name = FUNCTIONS.has(text) ? `\\${text}` : `\\operatorname{${text}}`;
  } else {
    name = fName ? convertChildren(fName, ctx).trim() : '';
  }
  return `${name} ${arg}`;
}

function convertLimit(node, ctx, lower) {
  const baseNode = childElement(node, 'e');
  const baseText = rawText(baseNode).trim();
  const limit = convertPart(node, 'lim', ctx);
  if (lower && LIMIT_OPERATORS.has(baseText)) return `\\${baseText}_{${limit}}`;
  const base = baseNode ? convertChildren(baseNode, ctx).trim() : '';
  return lower ? `\\underset{${limit}}{${base}}` : `\\overset{${limit}}{${base}}`;
}

function convertGroupChar(node, ctx) {
  const chr = propValue(node, 'groupChrPr', 'chr');
  const pos = propValue(node, 'groupChrPr', 'pos');
  const body = convertPart(node, 'e', ctx);
  const symbol = chr === null ? '⏟' : chr;
  if (symbol === '⏟') return `\\underbrace{${body}}`;
  if (symbol === '⏞') return `\\overbrace{${body}}`;
  const mark = escapeText(symbol, ctx).trim();
  return pos === 'top' ? `\\overset{${mark}}{${body}}` : `\\underset{${mark}}{${body}}`;
}

function convertMatrix(node, ctx) {
  const rows = childElements(node, 'mr').map((row) => (
    childElements(row, 'e').map((e) => convertChildren(e, ctx).trim()).join(' & ')
  ));
  return `\\begin{matrix}${rows.join(' \\\\ ')}\\end{matrix}`;
}

function convertEquationArray(node, ctx) {
  const rows = childElements(node, 'e').map((e) => convertChildren(e, { ...ctx, allowAmpersand: true }).trim());
  return `\\begin{aligned}${rows.join(' \\\\ ')}\\end{aligned}`;
}

function convertNode(node, ctx) {
  const name = node.localName;

  // Property elements (fPr, rPr, ctrlPr, ...) only describe their parent
  if (name.endsWith('Pr')) return '';

  switch (name) {
    case 'oMathPara':
      return childElements(node, 'oMath').map((m) => convertChildren(m, ctx).trim()).join(' \\quad ');
    case 'r':
      return node.namespaceURI === MATH_NS ? convertRun(node, ctx) : escapeText(rawText(node), ctx);
    case 't':
      return escapeText(node.textContent || '', ctx);
    case 'f':
      return convertFraction(node, ctx);
    case 'sSup':
      return `${wrapBase(convertPart(node, 'e', ctx))}^{${convertPart(node, 'sup', ctx)}}`;
    case 'sSub':
      return `${wrapBase(convertPart(node, 'e', ctx))}_{${convertPart(node, 'sub', ctx)}}`;
    case 'sSubSup':
      return `${wrapBase(convertPart(node, 'e', ctx))}_{${convertPart(node, 'sub', ctx)}}^{${convertPart(node, 'sup', ctx)}}`;
    case 'sPre':
      return `{}_{${convertPart(node, 'sub', ctx)}}^{${convertPart(node, 'sup', ctx)}}${wrapBase(convertPart(node, 'e', ctx))}`;
    case 'rad': {
      const body = convertPart(node, 'e', ctx);
      const degree = flagOn(node, 'radPr', 'degHide') ? '' : convertPart(node, 'deg', ctx);
      return degree ? `\\sqrt[${degree}]{${body}}` : `\\sqrt{${body}}`;
    }
    case 'nary':
      return convertNary(node, ctx);
    case 'd':
      return convertDelimiter(node, ctx);
    case 'func':
      return convertFunction(node, ctx);
    case 'limLow':
      return convertLimit(node, ctx, true);
    case 'limUpp':
      return convertLimit(node, ctx, false);
    case 'acc': {
      const chr = propValue(node, 'accPr', 'chr');
      const command = ACCENTS[chr === null ? '̂' : chr] || '\\hat';
      return `${command}{${convertPart(node, 'e', ctx)}}`;
    }
    case 'bar': {
      const pos = propValue(node, 'barPr', 'pos');
      return `${pos === 'top' ? '\\overline' : '\\underline'}{${convertPart(node, 'e', ctx)}}`;
    }
    case 'groupChr':
      return convertGroupChar(node, ctx);
    case 'borderBox':
      return `\\boxed{${convertPart(node, 'e', ctx)}}`;
    case 'm':
      return convertMatrix(node, ctx);
    case 'eqArr':
      return convertEquationArray(node, ctx);
    case 'phant': {
      const show = propValue(node, 'phantPr', 'show');
      const body = convertPart(node, 'e', ctx);
      return show === '0' || show === 'off' ? `\\phantom{${body}}` : body;
    }
    default:
      // oMath, e, num, den, box and anything unknown: keep the content
      return convertChildren(node, ctx);
  }
}

/**
 * Converts one <m:oMath> or <m:oMathPara> element to a LaTeX string.
 */
function ommlToLatex(node) {
  return convertNode(node, { allowAmpersand: false })
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { ommlToLatex, MATH_NS };
