'use strict';

const db = require('../../config/db')

/**
 * src/api/controllers/sessions.controller.js
 *
 * Duty sessions = one per driver per calendar day.
 *
 * GET  /api/sessions/today     — get or create today's session for the driver
 * GET  /api/sessions/:id       — get a specific session
 * GET  /api/drivers/:id/sessions — get session history for a driver
 * PUT  /api/sessions/:id       — update session metadata (shipping docs, trailers)
 */

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/today
// Get today's open session, or create one if it doesn't exist
// Called by Driver App on startup every day
// ─────────────────────────────────────────────────────────────

async function getTodaySession(req, res) {
  try {
    const driver = await db('drivers')
      .where({ user_id: req.user.id })
      .first();

    if (!driver) {
      return res.status(403).json({ error: 'NOT_A_DRIVER' });
    }

    // Load carrier for timezone
    const carrier = await db('carriers')
      .where({ id: driver.carrier_id })
      .first();

    const homeTimezone = carrier?.home_terminal_timezone || 'America/Chicago';

    // Get today's date in home terminal timezone
    const today = getTodayInTimezone(homeTimezone);

    // Try to find existing session for today
    let session = await db('duty_sessions')
      .where({ driver_id: driver.id, session_date: today })
      .first();

    if (!session) {
      // Create new session for today
      [session] = await db('duty_sessions')
        .insert({
          driver_id:              driver.id,
          carrier_id:             driver.carrier_id,
          vehicle_id:             driver.current_vehicle_id || null,
          session_date:           today,
          home_terminal_timezone: homeTimezone,
          status:                 'open',
        })
        .returning('*');
    }

    return res.status(200).json({ session, created: !session });

  } catch (err) {
    console.error('[sessions.getTodaySession]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/sessions/:id
// ─────────────────────────────────────────────────────────────

async function getSession(req, res) {
  const { id } = req.params;

  try {
    const session = await db('duty_sessions').where({ id }).first();

    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    // Access control
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || session.driver_id !== driver.id) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    return res.status(200).json({ session });

  } catch (err) {
    console.error('[sessions.getSession]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/drivers/:id/sessions
// Get last 14 days of sessions for a driver
// ─────────────────────────────────────────────────────────────

async function getDriverSessions(req, res) {
  const { id: driverId } = req.params;
  const { days = 8 } = req.query;

  try {
    // Access control
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || driver.id !== driverId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const since = new Date();
    since.setDate(since.getDate() - Math.min(Number(days), 14));

    const sessions = await db('duty_sessions')
      .where({ driver_id: driverId })
      .where('session_date', '>=', since.toISOString().slice(0, 10))
      .orderBy('session_date', 'desc');

    return res.status(200).json({ sessions, count: sessions.length });

  } catch (err) {
    console.error('[sessions.getDriverSessions]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// PUT /api/sessions/:id
// Update session metadata (shipping docs, trailer numbers)
// ─────────────────────────────────────────────────────────────

async function updateSession(req, res) {
  const { id } = req.params;
  const { shipping_documents, trailer_numbers, home_terminal_address } = req.body;

  try {
    const session = await db('duty_sessions').where({ id }).first();
    if (!session) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    if (session.status === 'certified') {
      return res.status(409).json({
        error:   'SESSION_CERTIFIED',
        message: 'Cannot update a certified session',
      });
    }

    // Access control
    if (req.user.role === 'driver') {
      const driver = await db('drivers').where({ user_id: req.user.id }).first();
      if (!driver || session.driver_id !== driver.id) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const updateData = {};
    if (shipping_documents !== undefined) updateData.shipping_documents = shipping_documents;
    if (trailer_numbers    !== undefined) updateData.trailer_numbers    = JSON.stringify(trailer_numbers);
    if (home_terminal_address !== undefined) updateData.home_terminal_address = home_terminal_address;

    const [updated] = await db('duty_sessions')
      .where({ id })
      .update(updateData)
      .returning('*');

    return res.status(200).json({ session: updated });

  } catch (err) {
    console.error('[sessions.updateSession]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────

/**
 * Get today's date string (YYYY-MM-DD) in a given IANA timezone.
 * Uses Intl.DateTimeFormat for timezone-aware date.
 */
function getTodayInTimezone(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year:     'numeric',
      month:    '2-digit',
      day:      '2-digit',
    });
    return formatter.format(new Date()); // returns YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = {
  getTodaySession,
  getSession,
  getDriverSessions,
  updateSession,
};
