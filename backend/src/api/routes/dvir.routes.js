'use strict';
const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/dvir.controller');
const router = Router();

router.post('/',          authenticate, authorize('driver'), ctrl.submitDVIR);
router.get('/driver/:id', authenticate, authorize('driver','dispatcher','admin'), ctrl.getDriverDVIR);

module.exports = router;
