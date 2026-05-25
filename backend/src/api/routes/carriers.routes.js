'use strict';
const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/carriers.controller');
const router = Router();

router.get('/me',                  authenticate, authorize('dispatcher','admin','driver'), ctrl.getMyCarrier);
router.patch('/me',                authenticate, authorize('dispatcher','admin'),          ctrl.updateMyCarrier);
router.get('/me/devices',          authenticate, authorize('dispatcher','admin','driver'), ctrl.listDevices);
router.post('/me/devices',         authenticate, authorize('dispatcher','admin'),          ctrl.createDevice);
router.patch('/me/devices/:id',    authenticate, authorize('dispatcher','admin'),          ctrl.updateDevice);
router.delete('/me/devices/:id',   authenticate, authorize('dispatcher','admin'),          ctrl.deactivateDevice);

module.exports = router;
