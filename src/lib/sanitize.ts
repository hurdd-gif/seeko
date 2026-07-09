import DOMPurify from 'isomorphic-dompurify';

/**
 * SSR-safe HTML sanitizer.
 *
 * The bare `dompurify` default export has no `.sanitize` when there is no DOM,
 * so server-rendering the agreement / doc-share components under Next 16 threw
 * `DOMPurify.sanitize is not a function` (a 500). `isomorphic-dompurify` wires
 * up jsdom on the server and the native DOM in the browser, so this works in
 * both contexts. Centralized here so every call site is SSR-safe by default and
 * the dependency stays swappable if the rendering runtime changes again.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty ?? '');
}

/**
 * Strict allow-list sanitizer for HTML that goes into an *email* body.
 *
 * Email section content (`custom_sections[].content`, `custom_title`) is derived
 * from an uploaded PDF → Claude → stored HTML and is NEVER sanitized at insert,
 * so it is attacker-influenced. A plain `sanitizeHtml` pass keeps anchors and
 * images, which in an email sent from the trusted `noreply@seekostudios.com`
 * domain become phishing links and tracking pixels. This keeps only inert
 * structural/formatting tags and drops every link, image, style, and handler.
 *
 * Use this — not `esc()` or `sanitizeHtml` — at any email `html:` content sink.
 * See `.claude/claude-security-guidance.md` §2.
 */
export function sanitizeEmailHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty ?? '', {
    ALLOWED_TAGS: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['a', 'img', 'style', 'script', 'iframe', 'link', 'object', 'embed'],
    FORBID_ATTR: ['style', 'href', 'src', 'srcset', 'class', 'id', 'target'],
  });
}
