'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const db         = require('./config/db');

const app = express();

// ─── In-memory metrics ────────────────────────────────────────────────
const metrics = {
  startedAt:     new Date(),
  requests:      0,
  errors:        0,
  responseTimes: [],
};

// ─── Request logger ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  metrics.requests++;

  res.on('finish', () => {
    const ms = Date.now() - start;
    metrics.responseTimes.push(ms);
    if (metrics.responseTimes.length > 1000) metrics.responseTimes.shift();
    if (res.statusCode >= 500) metrics.errors++;

    if (res.statusCode >= 400 || ms > 500) {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`
      );
    }
  });

  next();
});

// ─── Security headers ─────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Rate limit ───────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60 * 1000,
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'TOO_MANY_REQUESTS' },
}));

// ─────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────

const authRoutes       = require('./api/routes/auth.routes');
const hosEventsRoutes  = require('./api/routes/hos-events.routes');
const sessionsRoutes   = require('./api/routes/sessions.routes');
const violationsRoutes = require('./api/routes/violations.routes');

app.use('/api/auth',         authRoutes);
app.use('/api/hos-events',   hosEventsRoutes);
app.use('/api/sessions',     sessionsRoutes);
app.use('/api/violations',   violationsRoutes);
app.use('/api/dvir',         require('./api/routes/dvir.routes'));
app.use('/api/carriers',     require('./api/routes/carriers.routes'));
app.use('/api/ifta',         require('./api/routes/ifta.routes'));
app.use('/api/dot-transfer', require('./api/routes/dotTransfer'));
app.use('/api/ws',           require('./api/routes/ws.routes'));

// ─── Health check (расширенный) ───────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await db.raw('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  const mem       = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());

  res.status(dbStatus === 'ok' ? 200 : 503).json({
    status:   dbStatus === 'ok' ? 'ok' : 'degraded',
    version:  process.env.npm_package_version || '1.0.0',
    env:      process.env.NODE_ENV,
    time:     new Date().toISOString(),
    uptime:   `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`,
    database: dbStatus,
    memory: {
      heapUsed:  `${Math.round(mem.heapUsed  / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
      rss:       `${Math.round(mem.rss       / 1024 / 1024)}MB`,
    },
  });
});

// ─── Metrics endpoint ─────────────────────────────────────────────────
app.get('/metrics', (req, res) => {
  const times = metrics.responseTimes;
  const avg   = times.length
    ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    : 0;
  const max = times.length ? Math.max(...times) : 0;

  res.json({
    uptime_seconds: Math.floor(process.uptime()),
    started_at:     metrics.startedAt.toISOString(),
    requests_total: metrics.requests,
    errors_total:   metrics.errors,
    response_time: {
      avg_ms:  avg,
      max_ms:  max,
      samples: times.length,
    },
    memory_mb: {
      heap_used:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
      heap_total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error:   'NOT_FOUND',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});

// ─── 500 ──────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
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
