'use strict';

const db                  = require('../../config/db');
const { calculateHOS }    = require('../../services/hos-calculator.service');
const violationDetector   = require('../../services/violation-detector.service');

/**
 * src/api/controllers/hos-events.controller.js
 *
 * Handles all HOS event operations:
 *
 *   POST   /api/hos-events              — create new duty status event
 *   GET    /api/sessions/:id/events     — get all events for a session
 *   GET    /api/drivers/:id/hos         — get current HOS remaining for driver
 *   POST   /api/hos-events/:id/edit     — edit an existing event (FMCSA audit trail)
 *   POST   /api/sessions/:id/certify    — driver certifies the daily log
 *
 * CRITICAL RULES enforced here:
 *   1. hos_events is APPEND-ONLY — never UPDATE or DELETE
 *   2. Editing = soft-deactivate old + INSERT new with original_event_id
 *   3. sequence_id must be monotonically increasing per session
 *   4. Driving status (D) can only be set by ECM auto-detection (record_origin='1')
 *      or explicitly allowed sources — never arbitrary manual input
 *   5. After every INSERT, run HOS calculator and check for violations
 */

// ─────────────────────────────────────────────────────────────
// POST /api/hos-events
// Create a new duty status event
// ─────────────────────────────────────────────────────────────

async function createEvent(req, res) {
  const {
    session_id,
    event_type,
    event_code,
    event_datetime,
    latitude,
    longitude,
    location_description,
    distance_since_last,
    accumulated_miles,
    engine_hours,
    record_origin,
    annotation,
    special_condition,
    malfunction_code,
    data_diagnostic_code,
    jurisdiction,
    vehicle_id,
    co_driver_id,
  } = req.body;

  const userId = req.user.id;

  try {
    // 1. Load the session and verify it belongs to this driver
    const session = await db('duty_sessions')
      .where({ id: session_id })
      .first();

    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    // Load driver profile for this user
    const driver = await db('drivers')
      .where({ user_id: userId })
      .first();

    if (!driver) {
      return res.status(403).json({ error: 'NOT_A_DRIVER' });
    }

    // Dispatchers/admins can create events on behalf of a driver
    // Drivers can only create events for their own sessions
    if (req.user.role === 'driver' && session.driver_id !== driver.id) {
      return res.status(403).json({
        error:   'FORBIDDEN',
        message: 'You can only create events for your own sessions',
      });
    }

    // 2. Verify session is not certified (can't add to certified logs)
    if (session.status === 'certified') {
      return res.status(409).json({
        error:   'SESSION_CERTIFIED',
        message: 'Cannot add events to a certified session. Use edit instead.',
      });
    }

    // 3. Get next sequence_id for this session (monotonically increasing)
    const seqResult = await db('hos_events')
      .where({ session_id })
      .max('sequence_id as max_seq')
      .first();

    const nextSeq = (seqResult.max_seq || 0) + 1;

    // 4. Determine effective vehicle_id
    const effectiveVehicleId = vehicle_id || session.vehicle_id;

    // 5. Insert the new event (APPEND ONLY — no updates ever)
    const [newEvent] = await db('hos_events')
      .insert({
        session_id,
        driver_id:             session.driver_id,
        vehicle_id:            effectiveVehicleId,
        co_driver_id:          co_driver_id || null,
        event_type:            event_type || 1,
        event_code:            String(event_code),
        event_datetime,
        latitude:              latitude  || null,
        longitude:             longitude || null,
        location_description:  location_description || null,
        distance_since_last:   distance_since_last  || 0,
        accumulated_miles:     accumulated_miles    || 0,
        engine_hours:          engine_hours         || 0,
        sequence_id:           nextSeq,
        record_origin:         record_origin || '1',
        record_status:         '1',  // active
        annotation:            annotation         || null,
        special_condition:     special_condition  || null,
        malfunction_code:      malfunction_code   || null,
        data_diagnostic_code:  data_diagnostic_code || null,
        jurisdiction:          jurisdiction || 'us',
      })
      .returning('*');

    // 6. Update driver's current status (denormalized for fast fleet map)
    const statusMap = { '1': 'OFF', '2': 'SB', '3': 'D', '4': 'ON' };
    const newStatus = statusMap[String(event_code)];

    if (newStatus && event_type === 1) {
      await db('drivers')
        .where({ id: session.driver_id })
        .update({
          current_status:    newStatus,
          status_changed_at: event_datetime,
          current_vehicle_id: effectiveVehicleId || db.raw('current_vehicle_id'),
          ...(latitude  ? { current_latitude:  latitude  } : {}),
          ...(longitude ? { current_longitude: longitude } : {}),
          position_updated_at: event_datetime,
        });
    }

    // 7. Run violation detector (calculates HOS + saves violations)
    const detectionResult = await violationDetector.detectAndSave(
      session.driver_id, session_id, newEvent.id, driver.hos_cycle
    );
    const hosResult = detectionResult.hos;

    // 9. Return the new event + current HOS status
    return res.status(201).json({
      event: newEvent,
      hos:   hosResult,
    });

  } catch (err) {
    console.error('[hos-events.createEvent]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/:id/events
// Get all active events for a session (for logbook display)
// ─────────────────────────────────────────────────────────────

async function getSessionEvents(req, res) {
  const { id: sessionId } = req.params;

  try {
    const session = await db('duty_sessions').where({ id: sessionId }).first();
    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    // Access control: driver can only see own session
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || session.driver_id !== driver.id) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    // Return ALL events including inactive (record_status != '1')
    // so the logbook can show the edit history
    const events = await db('hos_events')
      .where({ session_id: sessionId })
      .orderBy('event_datetime', 'asc')
      .orderBy('sequence_id', 'asc');

    // Separate active from history for easier client consumption
    const activeEvents   = events.filter(e => e.record_status === '1');
    const historyEvents  = events.filter(e => e.record_status !== '1');

    return res.status(200).json({
      session,
      events:  activeEvents,
      history: historyEvents,
      count:   activeEvents.length,
    });

  } catch (err) {
    console.error('[hos-events.getSessionEvents]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/drivers/:id/hos
// Get current HOS remaining hours for a driver
// This is the endpoint the Driver App polls to update the clocks
// ─────────────────────────────────────────────────────────────

async function getDriverHOS(req, res) {
  const { id: driverId } = req.params;

  try {
    // Access control
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || driver.id !== driverId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const driver = await db('drivers').where({ id: driverId }).first();
    if (!driver) {
      return res.status(404).json({ error: 'DRIVER_NOT_FOUND' });
    }

    const hosResult = await runHOSCheck(driverId, driver.hos_cycle);

    // Also return current session if open
    const today = new Date().toISOString().slice(0, 10);
    const session = await db('duty_sessions')
      .where({ driver_id: driverId })
      .where('session_date', '<=', today)
      .orderBy('session_date', 'desc')
      .first();

    return res.status(200).json({
      driver_id:      driverId,
      current_status: driver.current_status,
      hos:            hosResult,
      session:        session || null,
    });

  } catch (err) {
    console.error('[hos-events.getDriverHOS]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/hos-events/:id/edit
// Edit an existing event (FMCSA AUDIT TRAIL — append only)
// ─────────────────────────────────────────────────────────────

async function editEvent(req, res) {
  const { id: originalEventId } = req.params;
  const {
    event_code,
    event_datetime,
    latitude,
    longitude,
    location_description,
    annotation,
    edit_reason,   // REQUIRED by FMCSA when editing
  } = req.body;

  if (!edit_reason || edit_reason.trim().length < 5) {
    return res.status(422).json({
      error:   'EDIT_REASON_REQUIRED',
      message: 'edit_reason is required and must be at least 5 characters (FMCSA §395.8)',
    });
  }

  try {
    // 1. Load the original event
    const original = await db('hos_events')
      .where({ id: originalEventId, record_status: '1' })
      .first();

    if (!original) {
      return res.status(404).json({
        error:   'EVENT_NOT_FOUND',
        message: 'Event not found or already inactive',
      });
    }

    // 2. Verify the session isn't locked
    const session = await db('duty_sessions')
      .where({ id: original.session_id })
      .first();

    // 3. Access control — driver can only edit own events
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || original.driver_id !== driver.id) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    // 4. FMCSA IMMUTABILITY: soft-deactivate the original event
    await db('hos_events')
      .where({ id: originalEventId })
      .update({ record_status: '2' });  // inactive-changed

    // 5. Get next sequence_id
    const seqResult = await db('hos_events')
      .where({ session_id: original.session_id })
      .max('sequence_id as max_seq')
      .first();

    const nextSeq = (seqResult.max_seq || 0) + 1;

    // 6. INSERT corrected event (new row, record_origin='2' = driver edit)
    const recordOrigin = req.user.role === 'driver' ? '2' : '3';

    const [correctedEvent] = await db('hos_events')
      .insert({
        // Inherit fields from original
        session_id:           original.session_id,
        driver_id:            original.driver_id,
        vehicle_id:           original.vehicle_id,
        co_driver_id:         original.co_driver_id,
        event_type:           original.event_type,
        jurisdiction:         original.jurisdiction,

        // Override with corrected values
        event_code:           event_code       ? String(event_code)    : original.event_code,
        event_datetime:       event_datetime   || original.event_datetime,
        latitude:             latitude         ?? original.latitude,
        longitude:            longitude        ?? original.longitude,
        location_description: location_description || original.location_description,
        annotation:           annotation       || original.annotation,
        distance_since_last:  original.distance_since_last,
        accumulated_miles:    original.accumulated_miles,
        engine_hours:         original.engine_hours,

        // Edit metadata (FMCSA required)
        sequence_id:          nextSeq,
        record_origin:        recordOrigin,
        record_status:        '1',             // new record is active
        original_event_id:    originalEventId,
        edit_reason:          edit_reason.trim(),
        edited_by_user_id:    req.user.id,
      })
      .returning('*');

    // 7. Recalculate HOS after edit
    const driver  = await db('drivers').where({ id: original.driver_id }).first();
    const hosResult = await runHOSCheck(original.driver_id, driver.hos_cycle);

    return res.status(200).json({
      original_event_id: originalEventId,
      corrected_event:   correctedEvent,
      hos:               hosResult,
      message: 'Event edited. Driver must re-certify the daily log.',
    });

  } catch (err) {
    console.error('[hos-events.editEvent]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/sessions/:id/certify
// Driver certifies (signs) the daily log
// Required by FMCSA §395.8(j)(2)
// ─────────────────────────────────────────────────────────────

async function certifySession(req, res) {
  const { id: sessionId } = req.params;
  const { signature } = req.body;  // base64 encoded signature image

  if (!signature) {
    return res.status(422).json({
      error:   'SIGNATURE_REQUIRED',
      message: 'Driver signature is required to certify the log',
    });
  }

  try {
    const session = await db('duty_sessions').where({ id: sessionId }).first();
    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    // Only the driver themselves can certify
    const driver = await db('drivers').where({ user_id: req.user.id }).first();
    if (!driver || session.driver_id !== driver.id) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // Calculate HOS summary for the session
    const hosResult = await runHOSCheck(driver.id, driver.hos_cycle);

    // Update session to certified
    const [updated] = await db('duty_sessions')
      .where({ id: sessionId })
      .update({
        status:                    'certified',
        certified_at:              new Date(),
        certification_signature:   signature,
        total_driving_hours:       hosResult.driving_today,
        total_on_duty_hours:       hosResult.on_duty_in_cycle,
        violation_count:           hosResult.violations.filter(v => v.severity === 'violation').length,
      })
      .returning('*');

    return res.status(200).json({
      session:  updated,
      hos:      hosResult,
      message:  'Daily log certified successfully',
    });

  } catch (err) {
    console.error('[hos-events.certifySession]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Run HOS calculation for a driver.
 * Fetches last 14 days of events (covers USA 8-day and Canada 14-day cycles).
 */
async function runHOSCheck(driverId, hosCycle) {
  const since = new Date(Date.now() - 14 * 24 * 3600000).toISOString();

  const events = await db('hos_events')
    .where({ driver_id: driverId })
    .where('event_datetime', '>=', since)
    .orderBy('event_datetime', 'asc');

  return calculateHOS(events, hosCycle || 'usa_70');
}

/**
 * Save detected violations to the violations table.
 * Avoids duplicates by checking if the same violation already exists
 * within the last 30 minutes.
 */
async function saveViolations(violations, driverId, sessionId, triggerEventId) {
  for (const v of violations) {
    // Check for duplicate within last 30 min
    const existing = await db('violations')
      .where({
        driver_id:      driverId,
        session_id:     sessionId,
        violation_type: v.type,
        acknowledged:   false,
      })
      .where('occurred_at', '>=', new Date(Date.now() - 30 * 60000))
      .first();

    if (existing) continue;  // already recorded

    await db('violations').insert({
      driver_id:       driverId,
      session_id:      sessionId,
      trigger_event_id: triggerEventId,
      violation_type:  v.type,
      severity:        v.severity,
      occurred_at:     new Date(),
      overage_minutes: v.overage_minutes || 0,
      description:     v.description,
      acknowledged:    false,
      resolved:        false,
    });
  }
}

module.exports = {
  createEvent,
  getSessionEvents,
  getDriverHOS,
  editEvent,
  certifySession,
};
