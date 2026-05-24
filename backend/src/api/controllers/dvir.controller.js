'use strict';

const db = require('../../config/db');

/**
 * src/api/controllers/dvir.controller.js
 * POST /api/dvir — submit inspection report
 * GET  /api/dvir/driver/:id — get driver's DVIR history
 */

async function submitDVIR(req, res) {
  const {
    report_type, defects, defects_found, safe_to_operate,
    driver_signature, driver_signed_at, session_id,
    latitude, longitude,
  } = req.body;

  try {
    const driver = await db('drivers').where({ user_id: req.user.id }).first();
    if (!driver) return res.status(403).json({ error: 'NOT_A_DRIVER' });

    const [report] = await db('dvir_reports').insert({
      driver_id:        driver.id,
      vehicle_id:       driver.current_vehicle_id,
      carrier_id:       driver.carrier_id,
      session_id:       session_id || null,
      report_type:      report_type || 'pre',
      latitude:         latitude    || null,
      longitude:        longitude   || null,
      defects:          JSON.stringify(defects || []),
      defects_found:    defects_found || false,
      safe_to_operate:  safe_to_operate !== false,
      driver_signature: driver_signature || null,
      driver_signed_at: driver_signed_at || new Date(),
    }).returning('*');

    return res.status(201).json({ report });
  } catch (err) {
    console.error('[dvir.submit]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

async function getDriverDVIR(req, res) {
  const { id: driverId } = req.params;
  try {
    const reports = await db('dvir_reports')
      .where({ driver_id: driverId })
      .orderBy('created_at', 'desc')
      .limit(20);
    return res.status(200).json({ reports });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

/**
 * GET /api/dvir/pretrip-status?session_id=<uuid>
 *
 * Returns whether the driver has completed a pre-trip DVIR today.
 * Used by the frontend to block switching to Driving status
 * until a pre-trip inspection is on record.
 *
 * Response:
 *   { completed: bool, safe_to_operate: bool|null, report: dvir_report|null }
 */
async function checkPretrip(req, res) {
  try {
    const driver = await db('drivers').where({ user_id: req.user.id }).first();
    if (!driver) return res.status(403).json({ error: 'NOT_A_DRIVER' });

    const { session_id } = req.query;
    let report = null;

    if (session_id) {
      // Prefer lookup by session if caller provides it
      report = await db('dvir_reports')
        .where({ driver_id: driver.id, report_type: 'pre', session_id })
        .orderBy('created_at', 'desc')
        .first();
    }

    // Fall back to any pre-trip DVIR created today (home timezone-agnostic: use UTC date)
    if (!report) {
      const todayUtc = new Date().toISOString().slice(0, 10);
      report = await db('dvir_reports')
        .where({ driver_id: driver.id, report_type: 'pre' })
        .where(db.raw('DATE(created_at AT TIME ZONE \'UTC\')', []), todayUtc)
        .orderBy('created_at', 'desc')
        .first();
    }

    return res.json({
      completed:       !!report,
      safe_to_operate: report ? report.safe_to_operate : null,
      report:          report || null,
    });
  } catch (err) {
    console.error('[dvir.checkPretrip]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

module.exports = { submitDVIR, getDriverDVIR, checkPretrip };
