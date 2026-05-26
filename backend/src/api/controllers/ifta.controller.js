'use strict';

/**
 * src/api/controllers/ifta.controller.js
 *
 * IFTA REST API controller.
 * Handles fuel purchases, jurisdictional miles, and quarterly reports.
 *
 * Security invariants:
 *   - carrier_id is ALWAYS sourced from req.user.carrier_id — never from body/params.
 *   - Vehicle ownership is verified via JOIN against carriers, never trusting
 *     a carrier_id field in the request body.
 *   - All decimal values from the DB are coerced through Number() before
 *     arithmetic (pg driver returns NUMERIC as string).
 */

const db = require('../../config/db');
const {
  recalculateVehicleQuarter,
  recalculateCarrierQuarter,
  quarterRange,
} = require('../../services/ifta/ifta-calculator.service');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roundTo(val, decimals) {
  const factor = 10 ** decimals;
  return Math.round(Number(val) * factor) / factor;
}

function bad(res, field, message) {
  return res.status(400).json({ error: 'VALIDATION_ERROR', field, message });
}

const VALID_FUEL_TYPES = ['diesel', 'gasoline', 'propane', 'cng', 'lng', 'electric'];

// ─────────────────────────────────────────────────────────────────────────────
// FUEL PURCHASES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/ifta/fuel
 * Create a new fuel purchase. Vehicle must belong to the requesting carrier.
 */
async function createFuelPurchase(req, res) {
  const carrierId = req.user.carrier_id;
  const {
    vehicle_id, driver_id, purchase_date, jurisdiction_code,
    station_name, station_address, gallons, price_per_gallon,
    total_amount, fuel_type, odometer, receipt_url, notes,
  } = req.body;

  try {
    // Required fields
    if (!vehicle_id)        return bad(res, 'vehicle_id',        'vehicle_id is required');
    if (!purchase_date)     return bad(res, 'purchase_date',     'purchase_date is required');
    if (!jurisdiction_code) return bad(res, 'jurisdiction_code', 'jurisdiction_code is required');
    if (!gallons)           return bad(res, 'gallons',           'gallons is required');

    const gallonsNum = Number(gallons);
    if (isNaN(gallonsNum) || gallonsNum <= 0) {
      return bad(res, 'gallons', 'gallons must be a positive number');
    }

    const fuelTypeResolved = fuel_type || 'diesel';
    if (!VALID_FUEL_TYPES.includes(fuelTypeResolved)) {
      return bad(res, 'fuel_type', `fuel_type must be one of: ${VALID_FUEL_TYPES.join(', ')}`);
    }

    // Jurisdiction must exist
    const jurisdiction = await db('jurisdictions').where({ code: jurisdiction_code }).first();
    if (!jurisdiction) {
      return bad(res, 'jurisdiction_code', `Unknown jurisdiction: ${jurisdiction_code}`);
    }

    // Vehicle must belong to carrier (ownership check via JOIN — never trust body)
    const vehicle = await db('vehicles')
      .select('id')
      .where({ id: vehicle_id, carrier_id: carrierId })
      .first();
    if (!vehicle) {
      return res.status(404).json({ error: 'VEHICLE_NOT_FOUND' });
    }

    const [purchase] = await db('ifta_fuel_purchases').insert({
      carrier_id:        carrierId,
      vehicle_id,
      driver_id:         driver_id || null,
      purchase_date:     new Date(purchase_date),
      jurisdiction_code,
      station_name:      station_name   ? String(station_name).trim()   : null,
      station_address:   station_address ? String(station_address).trim() : null,
      gallons:           gallonsNum,
      price_per_gallon:  price_per_gallon != null ? Number(price_per_gallon) : null,
      total_amount:      total_amount    != null ? Number(total_amount)    : null,
      fuel_type:         fuelTypeResolved,
      odometer:          odometer        != null ? Number(odometer)        : null,
      receipt_url:       receipt_url     ? String(receipt_url).trim()     : null,
      notes:             notes           ? String(notes).trim()           : null,
      created_by_user_id: req.user.id,
    }).returning('*');

    return res.status(201).json({ purchase });
  } catch (err) {
    console.error('[ifta.createFuelPurchase]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * GET /api/ifta/fuel
 * List fuel purchases for this carrier. Supports filters + pagination.
 * Query params: year, quarter, date_from, date_to, vehicle_id,
 *               jurisdiction_code, fuel_type, limit, offset
 */
async function listFuelPurchases(req, res) {
  const carrierId = req.user.carrier_id;
  const {
    year, quarter, date_from, date_to,
    vehicle_id, jurisdiction_code, fuel_type,
    limit: rawLimit = '50', offset: rawOffset = '0',
  } = req.query;

  try {
    const limit  = Math.min(parseInt(rawLimit,  10) || 50,  500);
    const offset = Math.max(parseInt(rawOffset, 10) || 0,   0);

    let q = db('ifta_fuel_purchases').where('carrier_id', carrierId);

    // Date-range filters — quarter takes precedence over date_from/date_to
    if (year && quarter) {
      const { start, end } = quarterRange(parseInt(year), parseInt(quarter));
      q = q.where('purchase_date', '>=', start).where('purchase_date', '<', end);
    } else {
      if (date_from) q = q.where('purchase_date', '>=', new Date(date_from));
      if (date_to)   q = q.where('purchase_date', '<=', new Date(date_to));
    }

    if (vehicle_id)        q = q.where('vehicle_id',        vehicle_id);
    if (jurisdiction_code) q = q.where('jurisdiction_code', jurisdiction_code);
    if (fuel_type)         q = q.where('fuel_type',         fuel_type);

    const [{ count: totalStr }] = await q.clone().count('id as count');
    const total    = parseInt(totalStr, 10);
    const purchases = await q.orderBy('purchase_date', 'desc').limit(limit).offset(offset);

    return res.status(200).json({ purchases, total, limit, offset });
  } catch (err) {
    console.error('[ifta.listFuelPurchases]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * GET /api/ifta/fuel/:id
 * Get a single fuel purchase. Returns 404 if not found or not owned by carrier.
 */
async function getFuelPurchase(req, res) {
  const carrierId = req.user.carrier_id;
  const { id } = req.params;

  try {
    const purchase = await db('ifta_fuel_purchases')
      .where({ id, carrier_id: carrierId })
      .first();

    if (!purchase) return res.status(404).json({ error: 'PURCHASE_NOT_FOUND' });
    return res.status(200).json({ purchase });
  } catch (err) {
    console.error('[ifta.getFuelPurchase]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * PATCH /api/ifta/fuel/:id
 * Update allowed fields of a fuel purchase.
 */
async function updateFuelPurchase(req, res) {
  const carrierId = req.user.carrier_id;
  const { id } = req.params;
  const {
    purchase_date, jurisdiction_code, station_name, station_address,
    gallons, price_per_gallon, total_amount, fuel_type,
    odometer, receipt_url, notes,
  } = req.body;

  try {
    const existing = await db('ifta_fuel_purchases')
      .where({ id, carrier_id: carrierId })
      .first();

    if (!existing) return res.status(404).json({ error: 'PURCHASE_NOT_FOUND' });

    const patch = {};

    if (purchase_date     !== undefined) patch.purchase_date     = new Date(purchase_date);
    if (station_name      !== undefined) patch.station_name      = station_name      ? String(station_name).trim()      : null;
    if (station_address   !== undefined) patch.station_address   = station_address   ? String(station_address).trim()   : null;
    if (receipt_url       !== undefined) patch.receipt_url       = receipt_url       ? String(receipt_url).trim()       : null;
    if (notes             !== undefined) patch.notes             = notes             ? String(notes).trim()             : null;

    if (jurisdiction_code !== undefined) {
      const jur = await db('jurisdictions').where({ code: jurisdiction_code }).first();
      if (!jur) return bad(res, 'jurisdiction_code', `Unknown jurisdiction: ${jurisdiction_code}`);
      patch.jurisdiction_code = jurisdiction_code;
    }

    if (gallons !== undefined) {
      const gallonsNum = Number(gallons);
      if (isNaN(gallonsNum) || gallonsNum <= 0) {
        return bad(res, 'gallons', 'gallons must be a positive number');
      }
      patch.gallons = gallonsNum;
    }

    if (price_per_gallon !== undefined) patch.price_per_gallon = price_per_gallon != null ? Number(price_per_gallon) : null;
    if (total_amount     !== undefined) patch.total_amount     = total_amount     != null ? Number(total_amount)     : null;
    if (odometer         !== undefined) patch.odometer         = odometer         != null ? Number(odometer)         : null;

    if (fuel_type !== undefined) {
      if (!VALID_FUEL_TYPES.includes(fuel_type)) {
        return bad(res, 'fuel_type', `fuel_type must be one of: ${VALID_FUEL_TYPES.join(', ')}`);
      }
      patch.fuel_type = fuel_type;
    }

    patch.updated_at = new Date();

    const [purchase] = await db('ifta_fuel_purchases')
      .where({ id })
      .update(patch)
      .returning('*');

    return res.status(200).json({ purchase });
  } catch (err) {
    console.error('[ifta.updateFuelPurchase]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * DELETE /api/ifta/fuel/:id
 * Hard-delete a fuel purchase.
 */
async function deleteFuelPurchase(req, res) {
  const carrierId = req.user.carrier_id;
  const { id } = req.params;

  try {
    const existing = await db('ifta_fuel_purchases')
      .where({ id, carrier_id: carrierId })
      .first();

    if (!existing) return res.status(404).json({ error: 'PURCHASE_NOT_FOUND' });

    await db('ifta_fuel_purchases').where({ id }).del();

    return res.status(200).json({ deleted: true, id });
  } catch (err) {
    console.error('[ifta.deleteFuelPurchase]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JURISDICTIONAL MILES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ifta/miles?year=&quarter=[&vehicle_id=]
 * Return mileage rows from ifta_jurisdiction_miles for the quarter.
 * If vehicle_id provided, returns rows for that vehicle only.
 * Otherwise returns aggregate across all carrier vehicles.
 */
async function getMiles(req, res) {
  const carrierId = req.user.carrier_id;
  const { year, quarter, vehicle_id } = req.query;

  if (!year || !quarter) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter are required' });
  }

  // Reject non-integer strings like "1.5" — parseInt('1.5')===1 would silently pass
  if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(quarter))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter must be integers' });
  }

  const yearInt    = parseInt(year,    10);
  const quarterInt = parseInt(quarter, 10);

  try {
    quarterRange(yearInt, quarterInt); // validates 1..4 range
  } catch (e) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: e.message });
  }

  try {
    let q = db('ifta_jurisdiction_miles')
      .select(
        'jurisdiction_code',
        db.raw('SUM(total_miles)   AS total_miles'),
        db.raw('SUM(taxable_miles) AS taxable_miles'),
        db.raw('SUM(breadcrumbs_count) AS breadcrumbs_count'),
      )
      .where({ carrier_id: carrierId, year: yearInt, quarter: quarterInt })
      .groupBy('jurisdiction_code')
      .orderBy('total_miles', 'desc');

    if (vehicle_id) {
      // Verify ownership before returning data
      const vehicle = await db('vehicles')
        .select('id')
        .where({ id: vehicle_id, carrier_id: carrierId })
        .first();
      if (!vehicle) return res.status(404).json({ error: 'VEHICLE_NOT_FOUND' });

      q = db('ifta_jurisdiction_miles')
        .select('jurisdiction_code', 'total_miles', 'taxable_miles',
                'breadcrumbs_count', 'calculation_method', 'calculated_at')
        .where({ carrier_id: carrierId, vehicle_id, year: yearInt, quarter: quarterInt })
        .orderBy('total_miles', 'desc');
    }

    const rows = await q;

    const total_miles = rows.reduce((s, r) => s + roundTo(r.total_miles || 0, 2), 0);

    return res.status(200).json({
      year:        yearInt,
      quarter:     quarterInt,
      vehicle_id:  vehicle_id || null,
      total_miles: roundTo(total_miles, 2),
      jurisdictions: rows.map(r => ({
        jurisdiction_code: r.jurisdiction_code,
        total_miles:       roundTo(r.total_miles   || 0, 2),
        taxable_miles:     roundTo(r.taxable_miles || 0, 2),
        breadcrumbs_count: Number(r.breadcrumbs_count || 0),
        ...(vehicle_id ? {
          calculation_method: r.calculation_method,
          calculated_at:      r.calculated_at,
        } : {}),
      })),
    });
  } catch (err) {
    console.error('[ifta.getMiles]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * POST /api/ifta/miles/recalculate
 * Trigger (synchronous) miles recalculation from GPS breadcrumbs.
 * Body: { year, quarter, vehicle_id? }
 * If vehicle_id omitted, recalculates all vehicles for the carrier.
 */
async function recalculateMiles(req, res) {
  const carrierId = req.user.carrier_id;
  const { year, quarter, vehicle_id } = req.body;

  if (!year || !quarter) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter are required' });
  }

  if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(quarter))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter must be integers' });
  }

  const yearInt    = parseInt(year,    10);
  const quarterInt = parseInt(quarter, 10);

  try {
    quarterRange(yearInt, quarterInt); // validates 1..4 range
  } catch (e) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: e.message });
  }

  try {
    let result;
    if (vehicle_id) {
      // Ownership check
      const vehicle = await db('vehicles')
        .select('id')
        .where({ id: vehicle_id, carrier_id: carrierId })
        .first();
      if (!vehicle) return res.status(404).json({ error: 'VEHICLE_NOT_FOUND' });

      result = await recalculateVehicleQuarter(carrierId, vehicle_id, yearInt, quarterInt);
    } else {
      result = await recalculateCarrierQuarter(carrierId, yearInt, quarterInt);
    }

    return res.status(200).json({ recalculated: true, result });
  } catch (err) {
    console.error('[ifta.recalculateMiles]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUARTERLY REPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ifta/reports
 * List quarterly reports for this carrier.
 * Query params: year, status
 */
async function listReports(req, res) {
  const carrierId = req.user.carrier_id;
  const { year, status } = req.query;

  try {
    let q = db('ifta_quarterly_reports')
      .where('carrier_id', carrierId)
      .orderBy([{ column: 'year', order: 'desc' }, { column: 'quarter', order: 'desc' }]);

    if (year)   q = q.where('year',   parseInt(year, 10));
    if (status) q = q.where('status', status);

    const reports = await q;
    return res.status(200).json({ reports });
  } catch (err) {
    console.error('[ifta.listReports]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * GET /api/ifta/reports/:year/:quarter
 * Get a specific quarterly report by year+quarter.
 */
async function getReport(req, res) {
  const carrierId = req.user.carrier_id;
  const yearInt    = parseInt(req.params.year,    10);
  const quarterInt = parseInt(req.params.quarter, 10);

  try {
    const report = await db('ifta_quarterly_reports')
      .where({ carrier_id: carrierId, year: yearInt, quarter: quarterInt })
      .first();

    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
    return res.status(200).json({ report });
  } catch (err) {
    console.error('[ifta.getReport]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * POST /api/ifta/reports/generate
 * Generate (or regenerate) a quarterly IFTA report.
 *   1. Recalculate GPS miles for every vehicle.
 *   2. Aggregate fuel purchases for the quarter.
 *   3. Compute taxable gallons and tax owed per jurisdiction using fleet-average MPG.
 *   4. UPSERT ifta_quarterly_reports.
 *
 * Returns 409 if the existing report is already finalized or filed (locked).
 * Returns 422 if no GPS mileage data exists for the period.
 */
async function generateReport(req, res) {
  const carrierId = req.user.carrier_id;
  const { year, quarter } = req.body;

  if (!year || !quarter) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter are required' });
  }

  if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(quarter))) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'year and quarter must be integers' });
  }

  const yearInt    = parseInt(year,    10);
  const quarterInt = parseInt(quarter, 10);

  let qRange;
  try {
    qRange = quarterRange(yearInt, quarterInt);
  } catch (e) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: e.message });
  }

  try {
    // Check for locked report
    const existing = await db('ifta_quarterly_reports')
      .where({ carrier_id: carrierId, year: yearInt, quarter: quarterInt })
      .first();

    if (existing && ['finalized', 'filed'].includes(existing.status)) {
      return res.status(409).json({
        error: 'REPORT_LOCKED',
        message: `Report is ${existing.status} and cannot be regenerated`,
      });
    }

    // Step 1: Recalculate GPS miles (also backfills jurisdiction_code on breadcrumbs)
    const calcResult = await recalculateCarrierQuarter(carrierId, yearInt, quarterInt);

    if (!calcResult.total_miles || calcResult.total_miles === 0) {
      return res.status(422).json({
        error:   'NO_GPS_MILES',
        message: 'No GPS mileage data found for this carrier/period — cannot generate report',
      });
    }

    // Step 2: Aggregate fuel purchases for the quarter
    const fuelRows = await db('ifta_fuel_purchases')
      .where('carrier_id', carrierId)
      .where('purchase_date', '>=', qRange.start)
      .where('purchase_date', '<',  qRange.end);

    const totalGallons = fuelRows.reduce((s, r) => s + Number(r.gallons || 0), 0);
    const totalMiles   = calcResult.total_miles;

    // Gallons purchased per jurisdiction
    const galsByJurCode = new Map();
    for (const row of fuelRows) {
      const g = Number(row.gallons || 0);
      galsByJurCode.set(row.jurisdiction_code, (galsByJurCode.get(row.jurisdiction_code) || 0) + g);
    }

    // Fleet average MPG (miles / total gallons purchased)
    const fleetMpg = totalGallons > 0 ? totalMiles / totalGallons : 0;

    // Step 3: Fetch tax rates for all jurisdictions that have miles
    const mileCodes = calcResult.jurisdictions.map(j => j.code);
    const taxRateRows = await db('jurisdictions')
      .select('code', 'fuel_tax_rate', 'surcharge_rate')
      .whereIn('code', mileCodes);

    const rateByCode = new Map(
      taxRateRows.map(r => [r.code, {
        rate:      Number(r.fuel_tax_rate  || 0),
        surcharge: Number(r.surcharge_rate || 0),
      }])
    );

    // Step 4: Build per-jurisdiction breakdown
    let totalTaxPaid = 0;

    const breakdown = calcResult.jurisdictions.map(j => {
      const miles          = roundTo(j.miles, 2);
      const purchasedGals  = galsByJurCode.get(j.code) || 0;
      const taxableGals    = fleetMpg > 0 ? roundTo(miles / fleetMpg, 3) : 0;
      const rates          = rateByCode.get(j.code) || { rate: 0, surcharge: 0 };
      const totalRate      = rates.rate + rates.surcharge;
      const taxPaidAtPump  = roundTo(purchasedGals  * totalRate, 2);
      const taxOwed        = roundTo((taxableGals - roundTo(purchasedGals, 3)) * totalRate, 2);

      totalTaxPaid += taxPaidAtPump;

      return {
        jurisdiction:     j.code,
        miles,
        taxable_gallons:  taxableGals,
        tax_paid_at_pump: taxPaidAtPump,
        tax_owed:         taxOwed,
        net_tax:          taxOwed,
      };
    });

    const now = new Date();

    const reportPayload = {
      carrier_id:                    carrierId,
      year:                          yearInt,
      quarter:                       quarterInt,
      total_miles_all_jurisdictions: roundTo(totalMiles,   2),
      total_taxable_gallons:         roundTo(totalGallons, 3),
      total_tax_paid:                roundTo(totalTaxPaid, 2),
      jurisdiction_breakdown:        JSON.stringify(breakdown),
      status:                        existing ? existing.status : 'draft',
      generated_at:                  now,
      created_by_user_id:            req.user.id,
      updated_at:                    now,
    };

    let report;
    if (existing) {
      [report] = await db('ifta_quarterly_reports')
        .where({ id: existing.id })
        .update(reportPayload)
        .returning('*');
      return res.status(200).json({ report });
    } else {
      [report] = await db('ifta_quarterly_reports')
        .insert(reportPayload)
        .returning('*');
      return res.status(201).json({ report });
    }
  } catch (err) {
    console.error('[ifta.generateReport]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * POST /api/ifta/reports/:id/finalize
 * Transition report from draft → finalized.
 */
async function finalizeReport(req, res) {
  const carrierId = req.user.carrier_id;
  const { id } = req.params;

  try {
    const report = await db('ifta_quarterly_reports')
      .where({ id, carrier_id: carrierId })
      .first();

    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });

    if (report.status !== 'draft') {
      return res.status(409).json({
        error:   'INVALID_TRANSITION',
        message: `Cannot finalize a report that is already ${report.status}`,
      });
    }

    const now = new Date();
    const [updated] = await db('ifta_quarterly_reports')
      .where({ id })
      .update({ status: 'finalized', finalized_at: now, updated_at: now })
      .returning('*');

    return res.status(200).json({ report: updated });
  } catch (err) {
    console.error('[ifta.finalizeReport]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

/**
 * POST /api/ifta/reports/:id/file
 * Transition report from finalized → filed.
 * Body: { confirmation_number? }
 */
async function fileReport(req, res) {
  const carrierId = req.user.carrier_id;
  const { id } = req.params;
  const { confirmation_number } = req.body;

  try {
    const report = await db('ifta_quarterly_reports')
      .where({ id, carrier_id: carrierId })
      .first();

    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });

    if (report.status !== 'finalized') {
      return res.status(409).json({
        error:   'INVALID_TRANSITION',
        message: `Report must be finalized before filing (current: ${report.status})`,
      });
    }

    const now = new Date();
    const [updated] = await db('ifta_quarterly_reports')
      .where({ id })
      .update({
        status:                    'filed',
        filed_at:                  now,
        filed_confirmation_number: confirmation_number ? String(confirmation_number).trim() : null,
        updated_at:                now,
      })
      .returning('*');

    return res.status(200).json({ report: updated });
  } catch (err) {
    console.error('[ifta.fileReport]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE — JURISDICTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/ifta/jurisdictions
 * Return all jurisdictions with current tax rates (reference data).
 */
async function listJurisdictions(req, res) {
  try {
    const jurisdictions = await db('jurisdictions')
      .select('code', 'name', 'country', 'is_ifta_member',
              'fuel_tax_rate', 'surcharge_rate', 'rate_effective_from')
      .orderBy('code', 'asc');

    return res.status(200).json({ jurisdictions });
  } catch (err) {
    console.error('[ifta.listJurisdictions]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

module.exports = {
  createFuelPurchase,
  listFuelPurchases,
  getFuelPurchase,
  updateFuelPurchase,
  deleteFuelPurchase,
  getMiles,
  recalculateMiles,
  listReports,
  getReport,
  generateReport,
  finalizeReport,
  fileReport,
  listJurisdictions,
};
