'use strict';

const { validationResult } = require('express-validator');

/**
 * src/api/middlewares/validate.middleware.js
 *
 * Runs express-validator checks and returns 422 if any fail.
 * Always use as the last middleware in a validation chain:
 *
 *   router.post('/login',
 *     body('email').isEmail(),
 *     body('password').notEmpty(),
 *     validate,          // <-- this
 *     authController.login
 *   )
 */
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: errors.array().map((e) => ({
        field:   e.path,
        message: e.msg,
        value:   e.value,
      })),
    });
  }

  next();
}

module.exports = { validate };
