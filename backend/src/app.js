'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────

const app = express();

// ─── Security headers (helmet defaults are good) ─────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Global rate limit (safety net) ──────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max:      300,          // 300 req/min per IP — generous for legitimate use
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'TOO_MANY_REQUESTS' },
}));

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

const authRoutes       = require('./api/routes/auth.routes');
const hosEventsRoutes  = require('./api/routes/hos-events.routes');
const sessionsRoutes   = require('./api/routes/sessions.routes');
const violationsRoutes = require('./api/routes/violations.routes');

app.use('/api/auth',       authRoutes);
app.use('/api/hos-events', hosEventsRoutes);
app.use('/api/sessions',   sessionsRoutes);
app.use('/api/violations', violationsRoutes);

// Health check — used by Docker, load balancer, monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status:  'ok',
    version: process.env.npm_package_version || '1.0.0',
    env:     process.env.NODE_ENV,
    time:    new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────
// Error handlers
// ─────────────────────────────────────────────────────────────

// 404 — route not found
app.use((req, res) => {
  res.status(404).json({
    error:   'NOT_FOUND',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

// 500 — unhandled errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS_ERROR', message: err.message });
  }

  res.status(500).json({
    error:   'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  });
});

module.exports = app;
