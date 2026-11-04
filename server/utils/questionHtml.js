const sanitizeHtml = require('sanitize-html');

// Question text (the question, its answer choices, the rationalization and a
// group's shared passage) is HTML from the rich-text editor. Only the markup the
// editor makes is kept, which is the same list SafeHtml allows when the text is
// shown (client/src/components/SafeHtml.jsx). So no stored question can carry a
// script, an event handler or any other markup, whichever client sent it.
const QUESTION_HTML_OPTIONS = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span', 'div', 'math-field'],
  allowedAttributes: { '*': ['data-latex', 'data-type', 'read-only', 'default-mode'] },
  disallowedTagsMode: 'discard',
};

// True when the HTML shows something: text or an equation. Empty paragraphs and
// line breaks alone (for example "<p></p><p></p>" from pressing Enter in an
// empty editor) show nothing.
function hasVisibleContent(html) {
  if (/<math-field\b/i.test(html)) return true;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;| /gi, ' ');
  return text.trim().length > 0;
}

// Returns the cleaned, trimmed HTML, or '' when nothing visible is left.
// Anything that is not a string becomes ''.
function cleanQuestionHtml(value) {
  if (typeof value !== 'string') return '';
  const cleaned = sanitizeHtml(value, QUESTION_HTML_OPTIONS).trim();
  return hasVisibleContent(cleaned) ? cleaned : '';
}

module.exports = { cleanQuestionHtml };
