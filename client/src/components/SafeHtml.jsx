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
