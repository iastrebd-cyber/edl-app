'use strict';

const db               = require('../config/db');
const { calculateHOS } = require('./hos-calculator.service');
const { VIOLATION }    = require('../utils/hos-rules');

/**
 * src/services/violation-detector.service.js
 *
 * Runs after every hos_event INSERT.
 * Compares HOS Calculator output against limits,
 * writes new violations to DB, resolves old ones if cleared,
 * and returns a list of active violations to the caller.
 *
 * DEDUPLICATION RULE:
 *   A violation is only inserted if no identical unresolved violation
 *   exists for the same driver + session + type within the last 30 min.
 *   This prevents flooding the table when a driver stays over-limit.
 *
 * RESOLUTION RULE:
 *   When a violation clears (e.g. driver takes a break after break_30min),
 *   the existing row is marked resolved = true.
 *   This lets the dispatcher panel auto-dismiss cleared alerts.
 *
 * NOTIFICATION HOOK:
 *   After saving violations, emits events for the WebSocket server
 *   so dispatchers get real-time alerts (wired in Phase 3).
 */

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────

/**
 * Run violation detection for a driver after a new HOS event.
 *
 * @param {string} driverId    - driver UUID
 * @param {string} sessionId   - current duty_session UUID
 * @param {string} eventId     - the hos_event that triggered this check
 * @param {string} hosCycle    - 'usa_70' | 'usa_60' | 'canada_70' | 'canada_120'
 * @returns {Promise<DetectionResult>}
 */
async function detectAndSave(driverId, sessionId, eventId, hosCycle) {
  // 1. Fetch last 14 days of active events for this driver
  const since = new Date(Date.now() - 14 * 24 * 3600000).toISOString();

  const events = await db('hos_events')
    .where({ driver_id: driverId, record_status: '1' })
    .where('event_datetime', '>=', since)
    .orderBy('event_datetime', 'asc');

  // 2. Run HOS Calculator
  const hosResult = calculateHOS(events, hosCycle || 'usa_70');

  // 3. Separate violations from warnings
  const activeViolations = hosResult.violations.filter(v => v.severity === 'violation');
  const activeWarnings   = hosResult.violations.filter(v => v.severity === 'warning');
  const activeTypes      = new Set(hosResult.violations.map(v => v.type));

  // 4. Resolve violations that are no longer active
  await resolveCleared(driverId, sessionId, activeTypes);

  // 5. Insert new violations (with deduplication)
  const inserted = [];
  for (const v of hosResult.violations) {
    const saved = await upsertViolation(v, driverId, sessionId, eventId);
    if (saved) inserted.push(saved);
  }

  // 6. Load full current violation list for this session
  const currentViolations = await db('violations')
    .where({ driver_id: driverId, session_id: sessionId, resolved: false })
    .orderBy('occurred_at', 'desc');

  return {
    hos:               hosResult,
    violations:        currentViolations,
    newly_inserted:    inserted,
    has_violation:     activeViolations.length > 0,
    has_warning:       activeWarnings.length > 0,
    violation_count:   activeViolations.length,
    warning_count:     activeWarnings.length,
  };
}

// ─────────────────────────────────────────────────────────────
// UPSERT VIOLATION
// Insert if not exists within the last 30 min (deduplication)
// ─────────────────────────────────────────────────────────────

async function upsertViolation(v, driverId, sessionId, triggerEventId) {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Check for recent duplicate
  const existing = await db('violations')
    .where({
      driver_id:      driverId,
      session_id:     sessionId,
      violation_type: v.type,
      resolved:       false,
    })
    .where('occurred_at', '>=', thirtyMinAgo)
    .first();

  if (existing) {
    // Already recorded — update overage if it grew
    if (v.overage_minutes > (existing.overage_minutes || 0)) {
      await db('violations')
        .where({ id: existing.id })
        .update({
          overage_minutes: v.overage_minutes,
          description:     v.description,
          updated_at:      new Date(),
        });
    }
    return null; // not newly inserted
  }

  // Insert new violation
  const [inserted] = await db('violations')
    .insert({
      driver_id:        driverId,
      session_id:       sessionId,
      trigger_event_id: triggerEventId,
      violation_type:   v.type,
      severity:         v.severity,
      occurred_at:      new Date(),
      overage_minutes:  v.overage_minutes || 0,
      description:      buildDescription(v),
      acknowledged:     false,
      resolved:         false,
    })
    .returning('*');

  return inserted;
}

// ─────────────────────────────────────────────────────────────
// RESOLVE CLEARED VIOLATIONS
// Mark violations as resolved when the driver is back in compliance
// ─────────────────────────────────────────────────────────────

async function resolveCleared(driverId, sessionId, activeTypes) {
  // Get all unresolved violations for this session
  const unresolved = await db('violations')
    .where({ driver_id: driverId, session_id: sessionId, resolved: false });

  for (const v of unresolved) {
    if (!activeTypes.has(v.violation_type)) {
      // This violation type is no longer active — mark resolved
      await db('violations')
        .where({ id: v.id })
        .update({
          resolved:    true,
          resolved_at: new Date(),
        });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// DESCRIPTION BUILDER
// Human-readable violation messages for the dispatcher panel
// ─────────────────────────────────────────────────────────────

function buildDescription(v) {
  const overMin = v.overage_minutes ? Math.round(v.overage_minutes) : 0;
  const overH   = (overMin / 60).toFixed(1);

  const messages = {
    [VIOLATION.DRIVING_11H]:     overMin > 0
      ? `11-hour driving limit exceeded by ${overMin} min (${overH}h over)`
      : 'Approaching 11-hour driving limit',

    [VIOLATION.DRIVING_13H]:     overMin > 0
      ? `13-hour driving limit exceeded by ${overMin} min`
      : 'Approaching 13-hour driving limit (Canada)',

    [VIOLATION.SHIFT_14H]:       overMin > 0
      ? `14-hour on-duty window exceeded by ${overMin} min`
      : 'Less than 1 hour remaining in on-duty window',

    [VIOLATION.BREAK_30MIN]:
      'Driver has been driving 8+ hours without a 30-minute break',

    [VIOLATION.CYCLE_60H]:       overMin > 0
      ? `60-hour/7-day cycle exceeded by ${overMin} min`
      : 'Less than 2 hours remaining in 60h cycle',

    [VIOLATION.CYCLE_70H]:       overMin > 0
      ? `70-hour/8-day cycle exceeded by ${overMin} min`
      : 'Less than 2 hours remaining in 70h cycle',

    [VIOLATION.CYCLE_120H]:      overMin > 0
      ? `120-hour/14-day cycle exceeded by ${overMin} min`
      : 'Less than 2 hours remaining in 120h cycle',

    [VIOLATION.RESTART_INVALID]:
      '34-hour restart did not include two 1am–5am periods',

    // Warnings
    [VIOLATION.WARN_DRIVING_1H]:
      'Less than 1 hour of driving time remaining',

    [VIOLATION.WARN_SHIFT_1H]:
      'Less than 1 hour remaining in 14-hour on-duty window',

    [VIOLATION.WARN_CYCLE_2H]:
      'Less than 2 hours remaining in cycle limit',

    [VIOLATION.WARN_BREAK_30MIN]:
      '30-minute break required within the next 30 minutes',
  };

  return messages[v.type] || v.description || `HOS violation: ${v.type}`;
}

// ─────────────────────────────────────────────────────────────
// ACKNOWLEDGE
// Dispatcher acknowledges a violation (dismisses from alert panel)
// ─────────────────────────────────────────────────────────────

/**
 * Mark a violation as acknowledged by a dispatcher.
 * @param {string} violationId
 * @param {string} acknowledgedByUserId
 */
async function acknowledge(violationId, acknowledgedByUserId) {
  const [updated] = await db('violations')
    .where({ id: violationId })
    .update({
      acknowledged:    true,
      acknowledged_at: new Date(),
      acknowledged_by: acknowledgedByUserId,
    })
    .returning('*');

  return updated;
}

// ─────────────────────────────────────────────────────────────
// GET ACTIVE VIOLATIONS FOR CARRIER
// Used by dispatcher fleet panel
// ─────────────────────────────────────────────────────────────

/**
 * Get all unresolved violations for a carrier's fleet.
 * Joined with driver + user names for display.
 *
 * @param {string} carrierId
 * @param {object} filters - { severity, acknowledged, driverId }
 */
async function getCarrierViolations(carrierId, filters = {}) {
  let query = db('violations as v')
    .join('drivers as d',  'd.id', 'v.driver_id')
    .join('users as u',    'u.id', 'd.user_id')
    .where('d.carrier_id', carrierId)
    .where('v.resolved', false)
    .select(
      'v.*',
      'u.first_name',
      'u.last_name',
      'u.phone',
      'd.current_status',
      'd.current_latitude',
      'd.current_longitude',
    )
    .orderBy('v.occurred_at', 'desc');

  if (filters.severity)     query = query.where('v.severity', filters.severity);
  if (filters.acknowledged !== undefined) {
    query = query.where('v.acknowledged', filters.acknowledged);
  }
  if (filters.driverId)     query = query.where('v.driver_id', filters.driverId);

  return query;
}

module.exports = {
  detectAndSave,
  acknowledge,
  getCarrierViolations,
  buildDescription,
};
