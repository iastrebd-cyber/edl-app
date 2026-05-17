'use strict';

require('dotenv').config();

const app  = require('./src/app');
const PORT = process.env.PORT || 3000;

/* ─── Создаём HTTP сервер вручную (нужно для WebSocket) ─────────────── */
const http = require('http');
const server = http.createServer(app);

/* ─── Инициализируем WebSocket поверх того же сервера ──────────────── */
const { initWebSocket } = require('./src/services/websocket.service');
initWebSocket(server);

/* ─── Запуск ────────────────────────────────────────────────────────── */
server.listen(PORT, () => {
  console.log(`\n ELD Backend running`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Env:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health:  http://localhost:${PORT}/health`);
  console.log(`  WS:      ws://localhost:${PORT}/ws?token=JWT\n`);
});

/* ─── Graceful shutdown ──────────────────────────────────────────────── */
const db = require('./src/config/db');

async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed');
    await db.destroy();
    console.log('DB connections closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
