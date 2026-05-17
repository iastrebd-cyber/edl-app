/**
 * C:\Users\RegenU3\eld-app\backend\src\services\websocket.service.js
 *
 * WebSocket сервер для real-time обмена данными:
 *   - Диспетчер видит live GPS и HOS статусы всех водителей
 *   - Водитель получает сообщения от диспетчера мгновенно
 *   - Автоматический ping/pong для определения разрыва соединения
 */

'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');

/* ─── Хранилище подключённых клиентов ──────────────────────────────── */
// Map: userId → { ws, role, name, lastSeen }
const clients = new Map();

/* ─── Инициализация ─────────────────────────────────────────────────── */
function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  console.log('[WS] WebSocket server ready on path /ws');

  wss.on('connection', (ws, req) => {
    /* 1. Авторизация через token в query string: /ws?token=JWT */
    const url    = new URL(req.url, `http://${req.headers.host}`);
    const token  = url.searchParams.get('token');
    let user     = null;

    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(1008, 'Unauthorized');
      return;
    }

    /* 2. Регистрируем клиента */
    clients.set(user.id, { ws, role: user.role, name: user.name, lastSeen: Date.now() });
    console.log(`[WS] Connected: ${user.name} (${user.role}) — total: ${clients.size}`);

    /* 3. Подтверждаем подключение */
    send(ws, { type: 'connected', userId: user.id, role: user.role });

    /* 4. Обработка входящих сообщений */
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handleMessage(user, msg);
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    /* 5. Ping каждые 30 секунд */
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
        clients.get(user.id) && (clients.get(user.id).lastSeen = Date.now());
      }
    }, 30_000);

    /* 6. Отключение */
    ws.on('close', () => {
      clients.delete(user.id);
      clearInterval(pingInterval);
      console.log(`[WS] Disconnected: ${user.name} — total: ${clients.size}`);

      /* Уведомить диспетчеров что водитель офлайн */
      if (user.role === 'driver') {
        broadcastToDispatchers({
          type:     'driver_offline',
          driverId: user.id,
          name:     user.name,
          at:       new Date().toISOString(),
        });
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error for ${user.name}:`, err.message);
    });
  });

  return wss;
}

/* ─── Обработка сообщений ───────────────────────────────────────────── */
function handleMessage(user, msg) {
  switch (msg.type) {

    /* Водитель отправляет GPS + HOS статус (каждые 60 сек) */
    case 'location_update':
      broadcastToDispatchers({
        type:      'driver_location',
        driverId:  user.id,
        name:      user.name,
        latitude:  msg.latitude,
        longitude: msg.longitude,
        speed:     msg.speed      || 0,
        heading:   msg.heading    || 0,
        hosStatus: msg.hosStatus  || 'OFF',
        odometer:  msg.odometer   || 0,
        at:        new Date().toISOString(),
      });
      break;

    /* Водитель сменил HOS статус */
    case 'hos_status_change':
      broadcastToDispatchers({
        type:      'driver_hos_change',
        driverId:  user.id,
        name:      user.name,
        oldStatus: msg.oldStatus,
        newStatus: msg.newStatus,
        at:        new Date().toISOString(),
      });
      break;

    /* Диспетчер отправляет сообщение водителю */
    case 'dispatcher_message':
      if (user.role !== 'dispatcher') break;
      sendToDriver(msg.driverId, {
        type:    'message_from_dispatcher',
        text:    msg.text,
        from:    user.name,
        at:      new Date().toISOString(),
      });
      break;

    /* Водитель отвечает диспетчеру */
    case 'driver_message':
      if (user.role !== 'driver') break;
      broadcastToDispatchers({
        type:     'message_from_driver',
        driverId: user.id,
        name:     user.name,
        text:     msg.text,
        at:       new Date().toISOString(),
      });
      break;

    default:
      console.log(`[WS] Unknown message type: ${msg.type}`);
  }
}

/* ─── Хелперы отправки ──────────────────────────────────────────────── */

/** Отправить одному клиенту */
function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/** Отправить конкретному водителю по ID */
function sendToDriver(driverId, data) {
  const client = clients.get(driverId);
  if (client) send(client.ws, data);
}

/** Разослать всем диспетчерам */
function broadcastToDispatchers(data) {
  for (const [, client] of clients) {
    if (client.role === 'dispatcher') {
      send(client.ws, data);
    }
  }
}

/** Разослать всем (broadcast) */
function broadcastAll(data) {
  for (const [, client] of clients) {
    send(client.ws, data);
  }
}

/** Получить список онлайн-клиентов (для REST /api/ws/status) */
function getOnlineClients() {
  const result = [];
  for (const [userId, client] of clients) {
    result.push({
      userId,
      role:     client.role,
      name:     client.name,
      lastSeen: client.lastSeen,
    });
  }
  return result;
}

module.exports = {
  initWebSocket,
  sendToDriver,
  broadcastToDispatchers,
  broadcastAll,
  getOnlineClients,
};
