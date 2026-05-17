/**
 * C:\Users\RegenU3\eld-app\backend\src\api\routes\ws.routes.js
 *
 * GET /api/ws/status — кто сейчас онлайн (для диспетчера)
 */

'use strict';

const express          = require('express');
const router           = express.Router();
const { getOnlineClients } = require('../../services/websocket.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/status', authenticate, authorize('dispatcher', 'admin'), (req, res) => {
  res.json({ clients: getOnlineClients() });
});

module.exports = router;
