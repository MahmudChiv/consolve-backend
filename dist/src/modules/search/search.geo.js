"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineDistanceKm = haversineDistanceKm;
const EARTH_RADIUS_KM = 6371;
function toRad(degrees) {
    return (degrees * Math.PI) / 180;
}
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((EARTH_RADIUS_KM * c).toFixed(2));
}
//# sourceMappingURL=search.geo.js.map