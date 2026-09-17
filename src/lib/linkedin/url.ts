/**
 * Accepts a pasted LinkedIn profile URL, rejects anything that isn't
 * actually one, and normalizes it (strips tracking query params, hash
 * fragments, a trailing slash, and any www./mobile subdomain) so the same
 * profile always dedupes to the same stored value — the `linkedin_url`
 * unique constraint (src/db/schema.ts) only works if two pastes of the
 * same profile actually produce identical strings.
 */
export function normalizeLinkedInUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
  if (host !== "linkedin.com") return null;

  const path = url.pathname.replace(/\/+$/, "");
  if (!path.startsWith("/in/")) return null;

  return `https://www.linkedin.com${path}`;
}
