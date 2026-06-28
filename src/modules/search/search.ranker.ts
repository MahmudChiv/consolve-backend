/**
 * search.ranker.ts
 *
 * Deterministic ranking algorithm for search results.
 *
 * Score breakdown (max ~9 pts):
 *   Location match  — city exact = 3pts, state match = 1pt
 *   Experience      — 1pt per 5 years, capped at 3pts
 *   Profile completeness:
 *     avatar  = 1pt
 *     pricing = 1pt
 *     availability = 1pt
 *
 * When the Trust module is built, replace completeness score with trust score.
 */

export interface RankableProvider {
  userProfileId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  profession: string | null;
  summary: string | null;
  expertise: string[];
  experience: number | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  pricing: Record<string, unknown> | null;
  availability: Record<string, unknown> | null;
}

export interface ParsedIntentForRanker {
  location?: string | null;
  experienceMin?: number | null;
  specialties?: string[];
}

export interface RankedProvider extends RankableProvider {
  rankScore: number;
  distanceKm?: number;
  explanation?: string;
}

/**
 * Compute a numeric rank score for one provider given the parsed search intent.
 */
export function computeRankScore(
  provider: RankableProvider,
  intent: ParsedIntentForRanker,
  distanceKm?: number,
): number {
  let score = 0;

  // ── Location match ────────────────────────────────────────────────────────
  if (intent.location) {
    const loc = intent.location.toLowerCase().trim();
    if (provider.city?.toLowerCase().trim() === loc) {
      score += 3; // Exact city match
    } else if (
      provider.state?.toLowerCase().includes(loc) ||
      loc.includes(provider.state?.toLowerCase() ?? '__no_match__')
    ) {
      score += 1; // State-level match
    }
  }

  // ── Experience ────────────────────────────────────────────────────────────
  if (provider.experience != null && provider.experience > 0) {
    score += Math.min(Math.floor(provider.experience / 5), 3);
  }

  // ── Profile completeness ──────────────────────────────────────────────────
  if (provider.avatarUrl) score += 1;
  if (provider.pricing) score += 1;
  if (provider.availability) score += 1;

  // ── Proximity bonus (closer = higher) ────────────────────────────────────
  if (distanceKm !== undefined && distanceKm <= 5) score += 1;

  return score;
}

/**
 * Sort providers by rank score descending, distance ascending as tiebreaker.
 */
export function sortByRank(providers: RankedProvider[]): RankedProvider[] {
  return [...providers].sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    // Tiebreak: closer provider wins
    const aDist = a.distanceKm ?? Infinity;
    const bDist = b.distanceKm ?? Infinity;
    return aDist - bDist;
  });
}
