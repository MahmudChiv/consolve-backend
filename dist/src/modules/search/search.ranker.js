"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRankScore = computeRankScore;
exports.sortByRank = sortByRank;
function computeRankScore(provider, intent, distanceKm) {
    let score = 0;
    if (intent.location) {
        const loc = intent.location.toLowerCase().trim();
        if (provider.city?.toLowerCase().trim() === loc) {
            score += 3;
        }
        else if (provider.state?.toLowerCase().includes(loc) ||
            loc.includes(provider.state?.toLowerCase() ?? '__no_match__')) {
            score += 1;
        }
    }
    if (provider.experience != null && provider.experience > 0) {
        score += Math.min(Math.floor(provider.experience / 5), 3);
    }
    if (provider.avatarUrl)
        score += 1;
    if (provider.pricing)
        score += 1;
    if (provider.availability)
        score += 1;
    if (distanceKm !== undefined && distanceKm <= 5)
        score += 1;
    return score;
}
function sortByRank(providers) {
    return [...providers].sort((a, b) => {
        if (b.rankScore !== a.rankScore)
            return b.rankScore - a.rankScore;
        const aDist = a.distanceKm ?? Infinity;
        const bDist = b.distanceKm ?? Infinity;
        return aDist - bDist;
    });
}
//# sourceMappingURL=search.ranker.js.map