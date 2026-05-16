'use strict';

require('dotenv').config();

const app  = require('./src/app');
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n ELD Backend running`);
  console.log(` Port:    ${PORT}`);
  console.log(` Env:     ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health:  http://localhost:${PORT}/health\n`);
});

// ─── Graceful shutdown ────────────────────────────────────────
// Allows in-flight requests to complete before process exits.
// Important for FMCSA compliance — no partial HOS event writes.

const db = require('./src/config/db');

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed');
    await db.destroy();
    console.log('DB connections closed');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled promise rejections (Node 15+ crashes without this)
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
