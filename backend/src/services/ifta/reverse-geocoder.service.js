'use strict';

/**
 * src/services/ifta/reverse-geocoder.service.js
 *
 * Lat/lng → 2-letter jurisdiction code, using a US-states GeoJSON polygon set
 * shipped at ./data/us-states.geojson.
 *
 * Lazy-loaded: GeoJSON is parsed on first call. Each polygon's bounding box
 * is precomputed once for cheap rejection before invoking turf's
 * point-in-polygon. The last-hit feature index is remembered so consecutive
 * breadcrumbs along a route check their own state first (very common case).
 *
 * Returns null for any point outside the US (ocean, Canada, Mexico) or
 * inside Puerto Rico (not an IFTA member).
 */

const path = require('path');
const fs   = require('fs');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;

// Full state name (matches properties.name in us-states.geojson) → 2-letter code.
// Anything not in this map (e.g. Puerto Rico) is treated as out-of-coverage.
const NAME_TO_CODE = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'District of Columbia': 'DC', 'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI',
  'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME',
  'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
  'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
  'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
  'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
  'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
};

let features    = null;   // GeoJSON Features for the 51 IFTA-relevant jurisdictions
let bboxes      = null;   // [minLng, minLat, maxLng, maxLat] per feature, parallel to `features`
let lastHitIndex = -1;    // index of the last feature a geocode landed in

function loadGeoJson() {
  if (features !== null) return;
  const filePath = path.join(__dirname, 'data', 'us-states.geojson');
  const raw = fs.readFileSync(filePath, 'utf8');
  const fc = JSON.parse(raw);
  if (!fc.features || !Array.isArray(fc.features)) {
    throw new Error('Invalid GeoJSON: features array missing');
  }
  features = fc.features.filter(f => NAME_TO_CODE[f.properties.name]);
  bboxes   = features.map(f => computeBbox(f.geometry));
}

function computeBbox(geom) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) visit(c);
    }
  };
  visit(geom.coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

function bboxContains(bbox, lng, lat) {
  return lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

/**
 * Resolve lat/lng to a 2-letter jurisdiction code.
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null}
 */
function geocode(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  loadGeoJson();

  const pt = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {},
  };

  // Hot path: same jurisdiction as last hit.
  if (lastHitIndex >= 0 && bboxContains(bboxes[lastHitIndex], lng, lat)) {
    if (booleanPointInPolygon(pt, features[lastHitIndex])) {
      return NAME_TO_CODE[features[lastHitIndex].properties.name];
    }
  }

  for (let i = 0; i < features.length; i++) {
    if (i === lastHitIndex) continue;
    if (!bboxContains(bboxes[i], lng, lat)) continue;
    if (booleanPointInPolygon(pt, features[i])) {
      lastHitIndex = i;
      return NAME_TO_CODE[features[i].properties.name];
    }
  }

  return null;
}

function _reset() {
  features = null;
  bboxes = null;
  lastHitIndex = -1;
}

module.exports = { geocode, _reset };
