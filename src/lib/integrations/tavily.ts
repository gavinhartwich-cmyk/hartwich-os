import "server-only";

const TAVILY_BASE = "https://api.tavily.com";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
};

/**
 * Free web search for the enrichment pipeline (docs.tavily.com — 1,000
 * search credits/month on the free plan, no credit card, one credit per
 * basic search). This is what makes the automated "find the owner from BBB
 * or LinkedIn" step possible at $0: it's a real search API, unlike Google's
 * Custom Search JSON API (closed to new signups) or Bing's (discontinued).
 * No-ops (returns null) when TAVILY_API_KEY isn't set — same "optional,
 * fails closed" shape as the other integrations in this directory.
 */
export function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function searchWeb(params: {
  query: string;
  includeDomains?: string[];
  maxResults?: number;
}): Promise<TavilySearchResult[] | null> {
  if (!isTavilyConfigured()) return null;

  try {
    const res = await fetch(`${TAVILY_BASE}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query: params.query,
        search_depth: "basic",
        max_results: params.maxResults ?? 5,
        include_domains: params.includeDomains,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { results?: TavilySearchResult[] };
    return data.results ?? [];
  } catch {
    return null;
  }
}
