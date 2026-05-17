'use strict';

const { Router } = require('express');
const { param }  = require('express-validator');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const ctrl = require('../controllers/violations.controller');

const router = Router();

/**
 * GET /api/violations/fleet
 * All active violations for the carrier — dispatcher dashboard.
 * Query params: severity, acknowledged, driver_id
 */
router.get(
  '/fleet',
  authenticate,
  authorize('dispatcher', 'admin'),
  ctrl.getFleetViolations
);

/**
 * GET /api/violations/driver/:id
 * Violations for a specific driver.
 * Query params: resolved (true/false), limit
 */
router.get(
  '/driver/:id',
  authenticate,
  authorize('driver', 'dispatcher', 'admin'),
  [param('id').isUUID()],
  validate,
  ctrl.getDriverViolations
);

/**
 * POST /api/violations/:id/acknowledge
 * Dispatcher acknowledges (dismisses) a violation alert.
 */
router.post(
  '/:id/acknowledge',
  authenticate,
  authorize('dispatcher', 'admin'),
  [param('id').isUUID()],
  validate,
  ctrl.acknowledgeViolation
);

module.exports = router;
