'use strict';

const { Router } = require('express');
const { param, body } = require('express-validator');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const ctrl = require('../controllers/sessions.controller');

const router = Router();

router.get('/today', authenticate, authorize('driver'), ctrl.getTodaySession);
router.get('/:id', authenticate, authorize('driver', 'dispatcher', 'admin'), [param('id').isUUID()], validate, ctrl.getSession);
router.get('/drivers/:id/sessions', authenticate, authorize('driver', 'dispatcher', 'admin'), [param('id').isUUID()], validate, ctrl.getDriverSessions);
router.put('/:id', authenticate, authorize('driver', 'dispatcher', 'admin'), [param('id').isUUID(), body('trailer_numbers').optional().isArray()], validate, ctrl.updateSession);

module.exports = router;
