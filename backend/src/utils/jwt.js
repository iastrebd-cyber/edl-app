'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * src/utils/jwt.js
 *
 * Two-token auth strategy:
 *
 *   ACCESS TOKEN  — short-lived (15 min), sent in Authorization header.
 *                   Contains user id, role, carrier_id.
 *                   Never stored in DB — verified purely by signature.
 *
 *   REFRESH TOKEN — long-lived (30 days), stored as bcrypt hash in DB.
 *                   Used only to issue a new access token.
 *                   Rotated on every use (old token invalidated).
 *
 * Why two tokens?
 *   If an access token leaks, it expires in 15 min automatically.
 *   If a refresh token leaks, we can invalidate it by clearing the DB hash.
 */

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TTL     = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_TTL    = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    'JWT secrets not set. Add JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to .env'
  );
}

// ─────────────────────────────────────────────────────────────
// ACCESS TOKEN
// ─────────────────────────────────────────────────────────────

/**
 * Sign a new access token.
 * @param {object} user - user row from DB
 * @returns {string} signed JWT
 */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub:        user.id,          // subject = user UUID
      role:       user.role,        // 'driver' | 'dispatcher' | 'admin' | 'dot_officer'
      carrier_id: user.carrier_id,  // null for dot_officer
      email:      user.email,
    },
    ACCESS_SECRET,
    {
      expiresIn: ACCESS_TTL,
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify an access token.
 * @param {string} token
 * @returns {{ sub, role, carrier_id, email, iat, exp }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET, { algorithms: ['HS256'] });
}

// ─────────────────────────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token string.
 * This raw value is sent to the client.
 * We store only its bcrypt hash in the DB.
 * @returns {string} 64-byte hex string (128 chars)
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Sign a refresh JWT (wraps the random token for tamper-detection).
 * @param {string} userId
 * @param {string} rawToken - the random token from generateRefreshToken()
 * @returns {string} signed JWT
 */
function signRefreshToken(userId, rawToken) {
  return jwt.sign(
    {
      sub:   userId,
      token: rawToken,  // embedded so we can verify the raw value on refresh
    },
    REFRESH_SECRET,
    {
      expiresIn: REFRESH_TTL,
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify a refresh JWT.
 * @param {string} token - the signed refresh JWT
 * @returns {{ sub, token, iat, exp }}
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError}
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] });
}

/**
 * Parse TTL string (e.g. '30d', '15m') into milliseconds.
 * Used to set cookie maxAge.
 */
function parseTTLms(ttlStr) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = ttlStr.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 3600000; // default 7 days
  return parseInt(match[1]) * units[match[2]];
}

const REFRESH_TTL_MS = parseTTLms(REFRESH_TTL);

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TTL_MS,
};
