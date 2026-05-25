'use strict';

/**
 * src/services/ifta/distance-calculator.service.js
 *
 * Distance between two GPS breadcrumbs. Prefers ECM odometer delta when
 * available (more accurate than GPS), falls back to haversine. Gaps larger
 * than MAX_REASONABLE_GAP_MILES are rejected — they indicate the driver
 * powered down the ELD or the vehicle was towed.
 */

const EARTH_RADIUS_MILES = 3958.7613;

// A breadcrumb pair > this is treated as a gap (driver off ELD, ferry, etc.).
const MAX_REASONABLE_GAP_MILES = 500;

function toRad(deg) { return deg * Math.PI / 180; }

/**
 * Great-circle distance in miles.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance in miles between two breadcrumbs.
 *
 * @param {{latitude:number, longitude:number, odometer?:number|string}} prev
 * @param {{latitude:number, longitude:number, odometer?:number|string}} curr
 * @returns {number} miles, >= 0
 */
function milesBetween(prev, curr) {
  if (!prev || !curr) return 0;
  if (typeof prev.latitude !== 'number' || typeof prev.longitude !== 'number') return 0;
  if (typeof curr.latitude !== 'number' || typeof curr.longitude !== 'number') return 0;

  const haversineMiles = haversine(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

  // Gap rejection comes first — odometer between far-apart points is meaningless.
  if (haversineMiles > MAX_REASONABLE_GAP_MILES) return 0;

  const prevOdo = typeof prev.odometer === 'string' ? parseFloat(prev.odometer) : prev.odometer;
  const currOdo = typeof curr.odometer === 'string' ? parseFloat(curr.odometer) : curr.odometer;
  if (typeof prevOdo === 'number' && typeof currOdo === 'number' &&
      !Number.isNaN(prevOdo) && !Number.isNaN(currOdo)) {
    const odoDelta = currOdo - prevOdo;
    if (odoDelta >= 0 && odoDelta <= MAX_REASONABLE_GAP_MILES) {
      return odoDelta;
    }
    // ECM reset or rollback — drop through to haversine.
  }

  return haversineMiles;
}

module.exports = { milesBetween, haversine, MAX_REASONABLE_GAP_MILES };
