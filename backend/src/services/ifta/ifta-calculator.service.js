'use strict';

/**
 * src/services/ifta/ifta-calculator.service.js
 *
 * Recalculates per-jurisdiction miles for a given (vehicle, year, quarter)
 * or (carrier, year, quarter) by replaying the quarter's gps_breadcrumbs.
 *
 * Side effects:
 *   - Fills in gps_breadcrumbs.jurisdiction_code where NULL.
 *   - UPSERTs ifta_jurisdiction_miles rows per (carrier, vehicle, code, year, quarter).
 *
 * MVP simplifications:
 *   - taxable_miles = total_miles (no toll-road or off-highway carveouts).
 *   - A pair (prev, curr) is fully attributed to curr's jurisdiction — border
 *     crossings between two breadcrumbs are not split. At 1 fix/minute,
 *     the resulting error is bounded by ~1.5 mi per crossing.
 */

const db = require('../../config/db');
const { geocode } = require('./reverse-geocoder.service');
const { milesBetween } = require('./distance-calculator.service');

/**
 * UTC [start, end) range for an IFTA quarter.
 *   Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec.
 */
function quarterRange(year, quarter) {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error('quarter must be 1..4');
  }
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth,     1));
  const end   = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start, end };
}

/**
 * Recalculate one vehicle's mileage breakdown for the quarter.
 */
async function recalculateVehicleQuarter(carrierId, vehicleId, year, quarter) {
  const { start, end } = quarterRange(year, quarter);

  const rows = await db('gps_breadcrumbs')
    .select('id', 'latitude', 'longitude', 'odometer', 'jurisdiction_code', 'recorded_at')
    .where('vehicle_id', vehicleId)
    .where('recorded_at', '>=', start)
    .where('recorded_at', '<',  end)
    .orderBy('recorded_at', 'asc');

  if (rows.length === 0) {
    return {
      vehicle_id: vehicleId,
      year, quarter,
      jurisdictions: [],
      total_miles: 0,
      total_breadcrumbs: 0,
    };
  }

  // Step 1: geocode any breadcrumb missing jurisdiction_code, batch the writes.
  const updatesByCode = new Map();
  for (const row of rows) {
    if (row.jurisdiction_code) continue;
    const code = geocode(parseFloat(row.latitude), parseFloat(row.longitude));
    if (code) {
      row.jurisdiction_code = code;
      if (!updatesByCode.has(code)) updatesByCode.set(code, []);
      updatesByCode.get(code).push(row.id);
    }
  }

  for (const [code, ids] of updatesByCode.entries()) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await db('gps_breadcrumbs').whereIn('id', chunk).update({ jurisdiction_code: code });
    }
  }

  // Step 2: aggregate miles + breadcrumb counts per jurisdiction.
  const milesByCode = new Map();
  const countByCode = new Map();

  for (const row of rows) {
    if (!row.jurisdiction_code) continue;
    countByCode.set(row.jurisdiction_code, (countByCode.get(row.jurisdiction_code) || 0) + 1);
  }

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (!curr.jurisdiction_code) continue;

    const miles = milesBetween(
      { latitude: parseFloat(prev.latitude), longitude: parseFloat(prev.longitude), odometer: prev.odometer },
      { latitude: parseFloat(curr.latitude), longitude: parseFloat(curr.longitude), odometer: curr.odometer },
    );

    if (miles > 0) {
      const code = curr.jurisdiction_code;
      milesByCode.set(code, (milesByCode.get(code) || 0) + miles);
    }
  }

  // Step 3: UPSERT ifta_jurisdiction_miles.
  const calculatedAt = new Date();
  const jurisdictions = [];

  for (const [code, miles] of milesByCode.entries()) {
    const breadcrumbs  = countByCode.get(code) || 0;
    const roundedMiles = Math.round(miles * 100) / 100;

    await db('ifta_jurisdiction_miles')
      .insert({
        carrier_id:        carrierId,
        vehicle_id:        vehicleId,
        jurisdiction_code: code,
        year,
        quarter,
        total_miles:       roundedMiles,
        taxable_miles:     roundedMiles,
        calculation_method:'gps',
        breadcrumbs_count: breadcrumbs,
        calculated_at:     calculatedAt,
      })
      .onConflict(['carrier_id', 'vehicle_id', 'jurisdiction_code', 'year', 'quarter'])
      .merge({
        total_miles:       roundedMiles,
        taxable_miles:     roundedMiles,
        calculation_method:'gps',
        breadcrumbs_count: breadcrumbs,
        calculated_at:     calculatedAt,
        updated_at:        calculatedAt,
      });

    jurisdictions.push({ code, miles: roundedMiles, breadcrumbs });
  }

  const totalMiles = jurisdictions.reduce((s, j) => s + j.miles, 0);
  return {
    vehicle_id: vehicleId,
    year, quarter,
    jurisdictions: jurisdictions.sort((a, b) => b.miles - a.miles),
    total_miles: Math.round(totalMiles * 100) / 100,
    total_breadcrumbs: rows.length,
  };
}

/**
 * Recalculate every vehicle in a carrier for the quarter, then aggregate.
 */
async function recalculateCarrierQuarter(carrierId, year, quarter) {
  const vehicles = await db('vehicles').select('id').where('carrier_id', carrierId);

  const perVehicle = [];
  for (const v of vehicles) {
    const result = await recalculateVehicleQuarter(carrierId, v.id, year, quarter);
    perVehicle.push(result);
  }

  const fleetByCode = new Map();
  let totalMiles = 0;
  let totalBreadcrumbs = 0;
  for (const r of perVehicle) {
    totalMiles += r.total_miles;
    totalBreadcrumbs += r.total_breadcrumbs;
    for (const j of r.jurisdictions) {
      if (!fleetByCode.has(j.code)) {
        fleetByCode.set(j.code, { code: j.code, miles: 0, breadcrumbs: 0 });
      }
      const entry = fleetByCode.get(j.code);
      entry.miles += j.miles;
      entry.breadcrumbs += j.breadcrumbs;
    }
  }

  const jurisdictions = [...fleetByCode.values()]
    .map(j => ({ ...j, miles: Math.round(j.miles * 100) / 100 }))
    .sort((a, b) => b.miles - a.miles);

  return {
    carrier_id: carrierId,
    year, quarter,
    vehicles_processed: perVehicle.length,
    total_miles: Math.round(totalMiles * 100) / 100,
    total_breadcrumbs: totalBreadcrumbs,
    jurisdictions,
    per_vehicle: perVehicle,
  };
}

module.exports = {
  recalculateVehicleQuarter,
  recalculateCarrierQuarter,
  quarterRange,
};
