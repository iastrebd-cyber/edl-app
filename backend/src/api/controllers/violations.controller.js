'use strict';

const db                     = require('../../config/db');
const violationDetector      = require('../../services/violation-detector.service');

/**
 * src/api/controllers/violations.controller.js
 *
 * GET  /api/violations/fleet     — all active violations for carrier (dispatcher)
 * GET  /api/violations/driver/:id — violations for one driver
 * POST /api/violations/:id/acknowledge — dispatcher acknowledges alert
 */

// ─────────────────────────────────────────────────────────────
// GET /api/violations/fleet
// All unresolved violations for the carrier — dispatcher panel
// ─────────────────────────────────────────────────────────────

async function getFleetViolations(req, res) {
  try {
    const carrierId = req.user.carrier_id;
    if (!carrierId) {
      return res.status(403).json({ error: 'NO_CARRIER' });
    }

    const { severity, acknowledged, driver_id } = req.query;

    const filters = {
      ...(severity     ? { severity }                          : {}),
      ...(acknowledged !== undefined ? { acknowledged: acknowledged === 'true' } : {}),
      ...(driver_id    ? { driverId: driver_id }               : {}),
    };

    const violations = await violationDetector.getCarrierViolations(carrierId, filters);

    return res.status(200).json({
      violations,
      count:           violations.length,
      violation_count: violations.filter(v => v.severity === 'violation').length,
      warning_count:   violations.filter(v => v.severity === 'warning').length,
    });

  } catch (err) {
    console.error('[violations.getFleetViolations]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/violations/driver/:id
// Violations for one driver (driver sees own, dispatcher sees all)
// ─────────────────────────────────────────────────────────────

async function getDriverViolations(req, res) {
  const { id: driverId } = req.params;
  const { resolved = 'false', limit = 50 } = req.query;

  try {
    // Access control — driver can only see own violations
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || driver.id !== driverId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const violations = await db('violations')
      .where({ driver_id: driverId })
      .where('resolved', resolved === 'true')
      .orderBy('occurred_at', 'desc')
      .limit(Number(limit));

    return res.status(200).json({ violations, count: violations.length });

  } catch (err) {
    console.error('[violations.getDriverViolations]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/violations/:id/acknowledge
// Dispatcher marks a violation as seen
// ─────────────────────────────────────────────────────────────

async function acknowledgeViolation(req, res) {
  const { id } = req.params;

  try {
    const violation = await db('violations').where({ id }).first();
    if (!violation) {
      return res.status(404).json({ error: 'VIOLATION_NOT_FOUND' });
    }

    const updated = await violationDetector.acknowledge(id, req.user.id);

    return res.status(200).json({ violation: updated });

  } catch (err) {
    console.error('[violations.acknowledgeViolation]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

module.exports = {
  getFleetViolations,
  getDriverViolations,
  acknowledgeViolation,
};
