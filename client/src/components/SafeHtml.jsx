import DOMPurify from 'dompurify';
import 'mathlive';
import 'mathlive/static.css';

/**
 * Safely renders an HTML string via DOMPurify + dangerouslySetInnerHTML.
 *
 * Allows inline formatting tags (b, strong, i, em, u, br, p, span) and math-field
 * web component tags/attributes so LaTeX math equations are preserved and rendered.
 *
 * Props:
 *   html      – the raw HTML string to render
 *   tag       – wrapper element type (default 'span')
 *   className – extra CSS class
 *   fallback  – text shown when html is falsy
 *   ...rest   – forwarded to the wrapper element
 */
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span', 'math-field', 'div'];
const ALLOWED_ATTR = ['data-latex', 'data-type', 'read-only', 'default-mode'];

export default function SafeHtml({
  html,
  tag: Tag = 'span',
  className = '',
  fallback = '',
  ...rest
}) {
  if (!html) {
    return fallback ? <Tag className={className} {...rest}>{fallback}</Tag> : null;
  }

  // Ensure <math-field> in display mode is read-only
  let processedHtml = html;
  if (typeof processedHtml === 'string' && processedHtml.includes('<math-field')) {
    processedHtml = processedHtml.replace(/<math-field(?![^>]*\bread-only\b)/gi, '<math-field read-only');
  }

  const clean = DOMPurify.sanitize(processedHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    CUSTOM_ELEMENT_HANDLING: {
      tagNameCheck: (tagName) => tagName === 'math-field',
      attributeNameCheck: () => true,
      allowCustomizedBuiltInElements: false,
    },
  });

  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
      {...rest}
    />
  );
}

/**
 * Safely truncates an HTML string while preserving formatted text and <math-field> formulas.
 * Text outside math-fields is truncated to `max` characters, and unclosed tags are cleaned up.
 */
export function truncateHtml(html, max = 100) {
  if (!html) return '';

  // Extract and preserve math-field components by temporary placeholder tokens
  const mathFields = [];
  let tokenized = String(html).replace(/<math-field[^>]*>[\s\S]*?<\/math-field>/gi, (match) => {
    // Ensure the math-field is read-only for inline preview
    let readOnlyMatch = match;
    if (!readOnlyMatch.includes('read-only')) {
      readOnlyMatch = readOnlyMatch.replace('<math-field', '<math-field read-only style="display:inline-block; vertical-align:middle; font-size:0.9em; margin:0 4px; border:none; background:transparent;"');
    }
    const token = `___MATH_FIELD_${mathFields.length}___`;
    mathFields.push(readOnlyMatch);
    return token;
  });

  // Strip regular HTML tags (p, div, etc.) but keep the mathfield tokens
  let plain = tokenized
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If plain length is within limit, restore math fields and return
  if (plain.length <= max) {
    let restored = plain;
    mathFields.forEach((mf, i) => {
      restored = restored.replace(`___MATH_FIELD_${i}___`, mf);
    });
    return restored;
  }

  // If exceeding max, check if truncation cuts through tokens
  let truncated = plain.slice(0, max);
  // If we cut in the middle of a token, expand up to the end of the token
  const partialTokenMatch = truncated.match(/___MATH_FIELD_\d*$/);
  if (partialTokenMatch) {
    const tokenIndex = plain.indexOf('___', truncated.length);
    if (tokenIndex !== -1) {
      truncated = plain.slice(0, tokenIndex + 3);
    }
  }

  truncated += '...';

  // Restore math fields
  mathFields.forEach((mf, i) => {
    truncated = truncated.replace(`___MATH_FIELD_${i}___`, mf);
  });

  return truncated;
}

/**
 * Strips all HTML tags from a string, returning plain text.
 * Useful for table cells, search matching, truncation, etc.
 */
export function stripHtml(html) {
  if (!html) return '';
  // Convert math-field tags to their latex representation or a [Math] placeholder for plain text
  let text = String(html).replace(/<math-field[^>]*data-latex="([^"]*)"[^>]*>.*?<\/math-field>/gi, '$1');
  text = text.replace(/<math-field[^>]*>(.*?)<\/math-field>/gi, '$1');
  // Sanitize with no allowed tags to extract text-only content
  const clean = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return clean.replace(/\s+/g, ' ').trim();
}
