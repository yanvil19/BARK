import DOMPurify from 'dompurify';

/**
 * Safely renders an HTML string via DOMPurify + dangerouslySetInnerHTML.
 *
 * Only allows inline formatting tags (b, strong, i, em, u, br, p, span) so
 * injected scripts, images, links, etc. are stripped automatically.
 *
 * Props:
 *   html      – the raw HTML string to render
 *   tag       – wrapper element type (default 'span')
 *   className – extra CSS class
 *   fallback  – text shown when html is falsy
 *   ...rest   – forwarded to the wrapper element
 */
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span'];
const ALLOWED_ATTR = [];

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

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
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
  // Sanitize first to be safe, then extract text
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // The sanitizer with no allowed tags returns text-only content
  return clean.replace(/\s+/g, ' ').trim();
}
