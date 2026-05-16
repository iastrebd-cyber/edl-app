'use strict';

const bcrypt = require('bcrypt');
const db     = require('../config/db');
const {
  signAccessToken,
  signRefreshToken,
  generateRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_MS,
} = require('../utils/jwt');

/**
 * src/api/controllers/auth.controller.js
 *
 * Handles:
 *   POST /auth/login    — email + password → access + refresh tokens
 *   POST /auth/refresh  — refresh token → new access token
 *   POST /auth/logout   — invalidate refresh token
 *   GET  /auth/me       — return current user profile
 */

// How many bcrypt rounds (12 = ~250ms on modern hardware — good balance)
const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS  = Number(process.env.MAX_LOGIN_ATTEMPTS)  || 5;
const LOCK_MINUTES  = Number(process.env.LOCK_DURATION_MINUTES) || 30;

// ─────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────

async function login(req, res) {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const user = await db('users')
      .where({ email: email.toLowerCase().trim() })
      .first();

    // Always run bcrypt even if user not found (prevents timing attacks)
    const dummyHash = '$2b$12$invalidhashfortimingprotectiononly000000000000000000';
    const hashToCheck = user ? user.password_hash : dummyHash;

    // 2. Check account lock
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      const unlockAt = new Date(user.locked_until).toISOString();
      return res.status(423).json({
        error:   'ACCOUNT_LOCKED',
        message: `Account locked due to too many failed attempts. Try again after ${unlockAt}`,
      });
    }

    // 3. Verify password
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatch) {
      // Increment failed attempts if user exists
      if (user) {
        const newAttempts = (user.failed_login_attempts || 0) + 1;
        const updateData  = { failed_login_attempts: newAttempts };

        if (newAttempts >= MAX_ATTEMPTS) {
          updateData.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000);
        }

        await db('users').where({ id: user.id }).update(updateData);
      }

      // Same error message for wrong email and wrong password (security best practice)
      return res.status(401).json({
        error:   'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    }

    // 4. Check account is active
    if (!user.is_active) {
      return res.status(403).json({
        error:   'ACCOUNT_DISABLED',
        message: 'This account has been disabled. Contact your carrier admin.',
      });
    }

    // 5. Generate tokens
    const rawRefreshToken  = generateRefreshToken();
    const signedRefresh    = signRefreshToken(user.id, rawRefreshToken);
    const refreshTokenHash = await bcrypt.hash(rawRefreshToken, BCRYPT_ROUNDS);

    // 6. Save refresh token hash + reset failed attempts + update last login
    await db('users').where({ id: user.id }).update({
      refresh_token_hash:    refreshTokenHash,
      refresh_token_expires_at: new Date(Date.now() + REFRESH_TTL_MS),
      failed_login_attempts: 0,
      locked_until:          null,
      last_login_at:         new Date(),
    });

    // 7. Build access token
    const accessToken = signAccessToken(user);

    // 8. Get driver profile id if role is driver
    let driverProfile = null;
    if (user.role === 'driver') {
      driverProfile = await db('drivers')
        .where({ user_id: user.id })
        .select('id', 'current_status', 'hos_cycle', 'current_vehicle_id')
        .first();
    }

    return res.status(200).json({
      access_token:  accessToken,
      refresh_token: signedRefresh,
      token_type:    'Bearer',
      expires_in:    process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      user: {
        id:         user.id,
        email:      user.email,
        first_name: user.first_name,
        last_name:  user.last_name,
        role:       user.role,
        carrier_id: user.carrier_id,
        language:   user.language,
        timezone:   user.timezone,
        driver:     driverProfile,
      },
    });

  } catch (err) {
    console.error('[auth.login]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Login failed' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /auth/refresh
// ─────────────────────────────────────────────────────────────

async function refresh(req, res) {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({
      error:   'MISSING_TOKEN',
      message: 'refresh_token is required',
    });
  }

  try {
    // 1. Verify the JWT signature and expiry
    let payload;
    try {
      payload = verifyRefreshToken(refresh_token);
    } catch (err) {
      return res.status(401).json({
        error:   'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    // 2. Load user from DB
    const user = await db('users').where({ id: payload.sub }).first();

    if (!user || !user.refresh_token_hash || !user.is_active) {
      return res.status(401).json({
        error:   'REFRESH_REVOKED',
        message: 'Refresh token has been revoked',
      });
    }

    // 3. Check token hasn't expired in DB (belt-and-suspenders)
    if (new Date(user.refresh_token_expires_at) < new Date()) {
      return res.status(401).json({
        error:   'REFRESH_EXPIRED',
        message: 'Refresh token has expired — please log in again',
      });
    }

    // 4. Verify the raw token value matches the hash (token rotation check)
    const tokenMatch = await bcrypt.compare(payload.token, user.refresh_token_hash);
    if (!tokenMatch) {
      // Token reuse detected — possible theft — invalidate everything
      await db('users').where({ id: user.id }).update({
        refresh_token_hash:    null,
        refresh_token_expires_at: null,
      });
      return res.status(401).json({
        error:   'TOKEN_REUSE_DETECTED',
        message: 'Refresh token already used. Please log in again.',
      });
    }

    // 5. Rotate refresh token (old one is now invalidated)
    const newRawToken      = generateRefreshToken();
    const newSignedRefresh = signRefreshToken(user.id, newRawToken);
    const newHash          = await bcrypt.hash(newRawToken, BCRYPT_ROUNDS);

    await db('users').where({ id: user.id }).update({
      refresh_token_hash:       newHash,
      refresh_token_expires_at: new Date(Date.now() + REFRESH_TTL_MS),
    });

    // 6. Issue new access token
    const newAccessToken = signAccessToken(user);

    return res.status(200).json({
      access_token:  newAccessToken,
      refresh_token: newSignedRefresh,
      token_type:    'Bearer',
    });

  } catch (err) {
    console.error('[auth.refresh]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────

async function logout(req, res) {
  // req.user is set by authenticate middleware
  try {
    await db('users').where({ id: req.user.id }).update({
      refresh_token_hash:       null,
      refresh_token_expires_at: null,
    });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[auth.logout]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────

async function me(req, res) {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select(
        'id', 'email', 'first_name', 'last_name', 'role',
        'carrier_id', 'language', 'timezone', 'phone',
        'license_number', 'license_state', 'last_login_at'
      )
      .first();

    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND' });
    }

    // Attach driver profile if role is driver
    let driverProfile = null;
    if (user.role === 'driver') {
      driverProfile = await db('drivers')
        .where({ user_id: user.id })
        .select(
          'id', 'current_status', 'hos_cycle',
          'current_vehicle_id', 'current_latitude', 'current_longitude',
          'short_haul_exception', 'exempt_from_eld', 'operates_in_canada'
        )
        .first();
    }

    return res.status(200).json({ ...user, driver: driverProfile });

  } catch (err) {
    console.error('[auth.me]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /auth/change-password
// ─────────────────────────────────────────────────────────────

async function changePassword(req, res) {
  const { current_password, new_password } = req.body;

  try {
    const user = await db('users').where({ id: req.user.id }).first();

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) {
      return res.status(401).json({
        error:   'WRONG_PASSWORD',
        message: 'Current password is incorrect',
      });
    }

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

    // Invalidate all refresh tokens on password change (security)
    await db('users').where({ id: user.id }).update({
      password_hash:            newHash,
      refresh_token_hash:       null,
      refresh_token_expires_at: null,
    });

    return res.status(200).json({ message: 'Password changed. Please log in again.' });

  } catch (err) {
    console.error('[auth.changePassword]', err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}

module.exports = { login, refresh, logout, me, changePassword };
