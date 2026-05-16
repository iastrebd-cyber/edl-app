'use strict';

const { Router }    = require('express');
const rateLimit     = require('express-rate-limit');
const { body }      = require('express-validator');
const { validate }  = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const authController   = require('../controllers/auth.controller');

const router = Router();

// ─────────────────────────────────────────────────────────────
// Rate limiters
// ─────────────────────────────────────────────────────────────

// Strict limit on login attempts — prevents brute force
const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              10,               // 10 attempts per IP per 15 min
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    error:   'TOO_MANY_REQUESTS',
    message: 'Too many login attempts. Try again in 15 minutes.',
  },
});

// Lighter limit on other auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─────────────────────────────────────────────────────────────
// Validation rules
// ─────────────────────────────────────────────────────────────

const loginValidation = [
  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ max: 128 }).withMessage('Password too long'),
];

const refreshValidation = [
  body('refresh_token')
    .notEmpty().withMessage('refresh_token is required')
    .isString(),
];

const changePasswordValidation = [
  body('current_password')
    .notEmpty().withMessage('current_password is required'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number'),
];

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { access_token, refresh_token, user }
 */
router.post(
  '/login',
  loginLimiter,
  loginValidation,
  validate,
  authController.login
);

/**
 * POST /api/auth/refresh
 * Body: { refresh_token }
 * Returns: { access_token, refresh_token }
 */
router.post(
  '/refresh',
  authLimiter,
  refreshValidation,
  validate,
  authController.refresh
);

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <access_token>
 * Invalidates refresh token in DB.
 */
router.post(
  '/logout',
  authLimiter,
  authenticate,
  authController.logout
);

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <access_token>
 * Returns current user profile + driver profile if role=driver
 */
router.get(
  '/me',
  authLimiter,
  authenticate,
  authController.me
);

/**
 * POST /api/auth/change-password
 * Header: Authorization: Bearer <access_token>
 * Body: { current_password, new_password }
 */
router.post(
  '/change-password',
  authLimiter,
  changePasswordValidation,
  validate,
  authenticate,
  authController.changePassword
);

module.exports = router;
