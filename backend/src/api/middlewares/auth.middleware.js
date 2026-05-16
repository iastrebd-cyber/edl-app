'use strict';

const { verifyAccessToken } = require('../utils/jwt');

/**
 * src/api/middlewares/auth.middleware.js
 *
 * Three middleware functions:
 *
 *   authenticate  — verifies the JWT in Authorization header.
 *                   Attaches req.user = { id, role, carrier_id, email }.
 *                   Required on every protected route.
 *
 *   authorize     — role-based access control.
 *                   Use after authenticate.
 *                   authorize('admin')
 *                   authorize('dispatcher', 'admin')
 *
 *   sameCarrier   — ensures driver/dispatcher can only access
 *                   data within their own carrier.
 *                   Prevents carrier A from reading carrier B's data.
 */

// ─────────────────────────────────────────────────────────────
// authenticate
// ─────────────────────────────────────────────────────────────

/**
 * Verify JWT access token from Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or malformed Authorization header',
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  try {
    const payload = verifyAccessToken(token);

    // Attach to request for downstream use
    req.user = {
      id:         payload.sub,
      role:       payload.role,
      carrier_id: payload.carrier_id,
      email:      payload.email,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Access token expired — use /auth/refresh to get a new one',
      });
    }

    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// authorize
// ─────────────────────────────────────────────────────────────

/**
 * Role-based access control.
 *
 * Usage:
 *   router.get('/fleet', authenticate, authorize('dispatcher', 'admin'), handler)
 *
 * @param {...string} roles - allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // authenticate wasn't called first — programming error
      return res.status(500).json({ error: 'AUTH_ORDER_ERROR' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
      });
    }

    next();
  };
}

// ─────────────────────────────────────────────────────────────
// sameCarrier
// ─────────────────────────────────────────────────────────────

/**
 * Ensures the authenticated user belongs to the same carrier
 * as the resource they're trying to access.
 *
 * Reads carrier_id from:
 *   1. req.params.carrierId
 *   2. req.query.carrier_id
 *   3. req.body.carrier_id
 *
 * Admins and dot_officers bypass this check.
 *
 * Usage:
 *   router.get('/drivers', authenticate, sameCarrier, handler)
 */
function sameCarrier(req, res, next) {
  const { role, carrier_id } = req.user;

  // Admins and DOT officers can see all carriers
  if (role === 'admin' || role === 'dot_officer') {
    return next();
  }

  const requestedCarrierId =
    req.params.carrierId ||
    req.query.carrier_id  ||
    req.body?.carrier_id;

  // If no carrier filter specified, scope to user's carrier automatically
  if (!requestedCarrierId) {
    req.carrierFilter = carrier_id; // downstream can use this
    return next();
  }

  if (requestedCarrierId !== carrier_id) {
    return res.status(403).json({
      error: 'CARRIER_MISMATCH',
      message: 'You can only access data within your own carrier',
    });
  }

  next();
}

// ─────────────────────────────────────────────────────────────
// driverOnly
// ─────────────────────────────────────────────────────────────

/**
 * Ensures the authenticated user is the driver who owns the resource,
 * or a dispatcher/admin from the same carrier.
 *
 * Reads driver_id from req.params.driverId.
 *
 * Usage:
 *   router.get('/drivers/:driverId/sessions', authenticate, driverOrCarrier, handler)
 */
function driverOrCarrier(req, res, next) {
  const { role, id: userId, carrier_id } = req.user;
  const { driverId } = req.params;

  // Admins see everything
  if (role === 'admin' || role === 'dot_officer') return next();

  // Dispatchers can see drivers in their carrier (carrier check done separately)
  if (role === 'dispatcher') return next();

  // Drivers can only see their own data
  if (role === 'driver') {
    // We compare against the user id — the driver profile lookup
    // maps user_id → driver_id in the controller
    req.restrictToSelf = true;
    return next();
  }

  return res.status(403).json({ error: 'FORBIDDEN' });
}

module.exports = { authenticate, authorize, sameCarrier, driverOrCarrier };
