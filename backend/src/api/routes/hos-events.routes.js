'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const { authenticate, authorize, driverOrCarrier } = require('../middlewares/auth.middleware');
const { validate }   = require('../middlewares/validate.middleware');
const ctrl           = require('../controllers/hos-events.controller');

const router = Router();

/**
 * src/api/routes/hos-events.routes.js
 *
 * All routes require authentication.
 * Drivers can only access their own data.
 * Dispatchers and admins can access all data in their carrier.
 */

// ─────────────────────────────────────────────────────────────
// Validation rules
// ─────────────────────────────────────────────────────────────

const createEventValidation = [
  body('session_id')
    .isUUID().withMessage('session_id must be a valid UUID'),

  body('event_code')
    .isIn(['1', '2', '3', '4'])
    .withMessage('event_code must be 1 (OFF), 2 (SB), 3 (D), or 4 (ON)'),

  body('event_datetime')
    .isISO8601().withMessage('event_datetime must be a valid ISO8601 datetime'),

  body('event_type')
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage('event_type must be 1-5'),

  body('latitude')
    .optional()
    .isFloat({ min: -90,  max: 90  }).withMessage('latitude must be -90 to 90'),

  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 }).withMessage('longitude must be -180 to 180'),

  body('record_origin')
    .optional()
    .isIn(['1', '2', '3', '4']).withMessage('record_origin must be 1-4'),

  body('special_condition')
    .optional()
    .isIn(['personal_conveyance', 'yard_move', null])
    .withMessage('special_condition must be personal_conveyance or yard_move'),

  body('jurisdiction')
    .optional()
    .isIn(['us', 'ca']).withMessage('jurisdiction must be us or ca'),

  body('accumulated_miles')
    .optional()
    .isFloat({ min: 0 }).withMessage('accumulated_miles must be a positive number'),

  body('engine_hours')
    .optional()
    .isFloat({ min: 0 }).withMessage('engine_hours must be a positive number'),
];

const editEventValidation = [
  param('id')
    .isUUID().withMessage('Event ID must be a valid UUID'),

  body('edit_reason')
    .notEmpty().withMessage('edit_reason is required for FMCSA compliance')
    .isLength({ min: 5, max: 500 }).withMessage('edit_reason must be 5-500 characters'),

  body('event_code')
    .optional()
    .isIn(['1', '2', '3', '4']).withMessage('event_code must be 1-4'),

  body('event_datetime')
    .optional()
    .isISO8601().withMessage('event_datetime must be valid ISO8601'),
];

const certifyValidation = [
  param('id')
    .isUUID().withMessage('Session ID must be a valid UUID'),

  body('signature')
    .notEmpty().withMessage('Driver signature is required'),
];

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/hos-events
 * Create a new duty status event.
 * Accessible by: driver (own events), dispatcher, admin
 */
router.post(
  '/',
  authenticate,
  authorize('driver', 'dispatcher', 'admin'),
  createEventValidation,
  validate,
  ctrl.createEvent
);

/**
 * GET /api/sessions/:id/events
 * Get all events for a session (logbook view).
 * Accessible by: driver (own session), dispatcher, admin
 */
router.get(
  '/sessions/:id/events',
  authenticate,
  authorize('driver', 'dispatcher', 'admin'),
  [param('id').isUUID().withMessage('Session ID must be a UUID')],
  validate,
  ctrl.getSessionEvents
);

/**
 * GET /api/drivers/:id/hos
 * Get current HOS remaining hours for a driver.
 * Used by the Driver App to update the three HOS clocks.
 * Accessible by: driver (own data), dispatcher, admin
 */
router.get(
  '/drivers/:id/hos',
  authenticate,
  authorize('driver', 'dispatcher', 'admin'),
  [param('id').isUUID().withMessage('Driver ID must be a UUID')],
  validate,
  ctrl.getDriverHOS
);

/**
 * POST /api/hos-events/:id/edit
 * Edit an existing event (creates audit trail per FMCSA §395.8).
 * Accessible by: driver (own events), dispatcher, admin
 */
router.post(
  '/:id/edit',
  authenticate,
  authorize('driver', 'dispatcher', 'admin'),
  editEventValidation,
  validate,
  ctrl.editEvent
);

/**
 * POST /api/sessions/:id/certify
 * Driver certifies (digitally signs) the daily log.
 * Only the driver themselves can certify their own log.
 */
router.post(
  '/sessions/:id/certify',
  authenticate,
  authorize('driver'),
  certifyValidation,
  validate,
  ctrl.certifySession
);

module.exports = router;
