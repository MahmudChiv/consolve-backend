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
export declare function computeRankScore(provider: RankableProvider, intent: ParsedIntentForRanker, distanceKm?: number): number;
export declare function sortByRank(providers: RankedProvider[]): RankedProvider[];
