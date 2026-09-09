/**
 * Base URL for links embedded in outbound content — the tracking-pixel
 * <img src> (src/lib/integrations/gmail-multi.ts) and the company-page links
 * in ops-notification emails (src/lib/notifications/notify.ts). Not
 * "server-only" — cheap enough, and nothing here is a secret.
 */
export function getAppUrl(): string | null {
  const url = process.env.APP_URL;
  return url ? url.replace(/\/$/, "") : null;
}

/** Absolute link to a company's detail page, or null when APP_URL isn't configured. */
export function companyUrl(companyId: string): string | null {
  const base = getAppUrl();
  return base ? `${base}/companies/${companyId}` : null;
}
