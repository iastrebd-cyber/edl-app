'use strict';
const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/dvir.controller');
const router = Router();

// NOTE: /pretrip-status must be registered BEFORE /driver/:id
// to avoid Express matching 'pretrip-status' as the :id param.
router.get('/pretrip-status', authenticate, authorize('driver'),                       ctrl.checkPretrip);
router.post('/',              authenticate, authorize('driver'),                       ctrl.submitDVIR);
router.get('/driver/:id',     authenticate, authorize('driver','dispatcher','admin'),  ctrl.getDriverDVIR);

module.exports = router;
