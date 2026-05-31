/**
 * Integrity hash for a signed agreement's content.
 *
 * Produces a SHA-256 digest (64 lowercase hex chars) over the exact title +
 * ordered sections the signer agreed to. The hash is printed on the Certificate
 * of Completion so the document is self-verifying: re-hashing the stored
 * agreement text must reproduce the printed value, proving the content was not
 * altered after signing.
 *
 * Canonicalization uses JSON.stringify over an explicitly-shaped object, which
 * is deterministic (fixed key order: number → title → content), order-sensitive
 * (the sections array order is preserved), and field-boundary safe (JSON quoting
 * disambiguates field edges, so text cannot migrate between title and content
 * without changing the digest). A naive `title + content` concat would collide.
 *
 * Web Crypto (`crypto.subtle`) is available as a global in the Node runtime that
 * runs the sign route and in the Vitest/Node test environment, so no import is
 * needed.
 */
export async function computeAgreementHash(
  title: string,
  sections: { number: number; title: string; content: string }[],
): Promise<string> {
  const canonical = JSON.stringify({
    title,
    sections: sections.map((s) => ({
      number: s.number,
      title: s.title,
      content: s.content,
    })),
  });

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
