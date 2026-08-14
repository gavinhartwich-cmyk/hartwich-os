import "server-only";

const PLACES_BASE = "https://places.googleapis.com/v1";

export type PlaceResult = {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  userRatingCount: number | null;
};

export type ReviewSnippet = {
  rating: number;
  text: string;
  relativeTime: string;
};

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not set — required for lead discovery (Phase 2). See SETUP.md."
    );
  }
  return key;
}

/**
 * Text Search against the Places API (New) for HVAC companies in an area
 * (architecture doc §5, "Discover"). Returns just enough to dedupe and
 * pre-screen — review snippets are a separate, per-candidate Place Details
 * call (below) so we don't spend that quota on companies we're about to
 * skip as duplicates.
 */
export async function searchHvacCompanies(params: {
  area: string; // e.g. "Austin, TX"
  keyword: string; // e.g. "HVAC contractor"
}): Promise<PlaceResult[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount",
    },
    body: JSON.stringify({
      textQuery: `${params.keyword} in ${params.area}`,
      maxResultCount: 20,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Places text search failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      userRatingCount?: number;
    }>;
  };

  return (data.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "(unnamed)",
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
  }));
}

/**
 * Place Details for one candidate, fetched only after it survives dedup.
 * Review text approximates "recent negative or unanswered" (§5) — the
 * Places API doesn't expose whether an owner replied to a review, which is
 * a documented known limitation (architecture doc §5).
 */
export async function getPlaceReviewSnippets(placeId: string): Promise<ReviewSnippet[]> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": "reviews",
    },
  });

  if (!res.ok) {
    return []; // best-effort — qualification still runs without review text
  }

  const data = (await res.json()) as {
    reviews?: Array<{
      rating?: number;
      text?: { text?: string };
      relativePublishTimeDescription?: string;
    }>;
  };

  return (data.reviews ?? []).map((r) => ({
    rating: r.rating ?? 0,
    text: r.text?.text ?? "",
    relativeTime: r.relativePublishTimeDescription ?? "",
  }));
}
