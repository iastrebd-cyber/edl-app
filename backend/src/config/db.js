'use strict';

const knex = require('knex');

/**
 * src/config/db.js
 *
 * Single shared Knex instance for the entire backend.
 * Import this wherever you need DB access — never create
 * a second Knex instance (it would open a second connection pool).
 *
 * Usage:
 *   const db = require('../config/db');
 *   const user = await db('users').where({ id }).first();
 */

const config = {
  client: 'postgresql',
  connection: {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'eld_dev',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  pool: {
    min: 2,
    max: 10,
    // Destroy connections idle for 30s
    idleTimeoutMillis: 30000,
    // Kill connections that take more than 10s to acquire
    acquireTimeoutMillis: 10000,
  },
  // Log slow queries in development
  debug: process.env.NODE_ENV === 'development' && process.env.DB_DEBUG === 'true',
};

const db = knex(config);

// Test connection on startup
db.raw('SELECT 1')
  .then(() => console.log('✓ Database connected'))
  .catch((err) => {
    console.error('✗ Database connection failed:', err.message);
    // Don't crash — let the app start, requests will fail gracefully
  });

module.exports = db;
