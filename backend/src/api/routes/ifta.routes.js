'use strict';

/**
 * src/api/routes/ifta.routes.js
 *
 * IFTA routes — fuel purchases, jurisdictional miles, quarterly reports.
 *
 * Route ordering notes:
 *   POST /miles/recalculate  MUST be declared before  GET /miles
 *   POST /reports/generate   MUST be declared before  GET /reports/:year/:quarter
 * Express matches routes in declaration order; without this ordering a literal
 * segment ("recalculate", "generate") would be shadowed by a param pattern.
 */

const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/ifta.controller');

const router = Router();

const DISPATCHER_ADMIN        = ['dispatcher', 'admin'];
const DISPATCHER_ADMIN_DRIVER = ['dispatcher', 'admin', 'driver'];

// ─── Fuel purchases ───────────────────────────────────────────────────────────
router.post(  '/fuel',     authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.createFuelPurchase);
router.get(   '/fuel',     authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.listFuelPurchases);
router.get(   '/fuel/:id', authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.getFuelPurchase);
router.patch( '/fuel/:id', authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.updateFuelPurchase);
router.delete('/fuel/:id', authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.deleteFuelPurchase);

// ─── Jurisdictional miles ─────────────────────────────────────────────────────
// IMPORTANT: /miles/recalculate BEFORE /miles (literal beats param)
router.post('/miles/recalculate', authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.recalculateMiles);
router.get( '/miles',             authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.getMiles);

// ─── Quarterly reports ────────────────────────────────────────────────────────
// IMPORTANT: /reports/generate BEFORE /reports/:year/:quarter
router.post('/reports/generate',          authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.generateReport);
router.get( '/reports',                   authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.listReports);
router.get( '/reports/:year/:quarter',    authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.getReport);
router.post('/reports/:id/finalize',      authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.finalizeReport);
router.post('/reports/:id/file',          authenticate, authorize(...DISPATCHER_ADMIN),        ctrl.fileReport);

// ─── Reference data ───────────────────────────────────────────────────────────
router.get('/jurisdictions', authenticate, authorize(...DISPATCHER_ADMIN_DRIVER), ctrl.listJurisdictions);

module.exports = router;
