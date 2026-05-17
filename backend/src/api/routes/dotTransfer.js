/**
 * C:\Users\RegenU3\eld-app\backend\src\api\routes\dotTransfer.js
 *
 * POST /api/dot-transfer        — передача инспектору (3 метода)
 * GET  /api/dot-transfer/export — прямое скачивание ELD файла
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { buildELDOutputFile }  = require('../../services/eldExport');
const { authenticate }        = require('../middlewares/auth.middleware');

/* ── GET /api/dot-transfer/export ───────────────────────────────────── */
router.get('/export', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, session_id } = req.query;

    const from = date_from || todayMinus(7);
    const to   = date_to   || today();

    const eldBuffer = await buildELDOutputFile({
      driver:     req.user,
      session_id: session_id || null,
      date_from:  from,
      date_to:    to,
    });

    const filename = `ELD_${req.user.id}_${from}_${to}.elds`;

    res.setHeader('Content-Type',        'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length',      eldBuffer.length);
    res.send(eldBuffer);

  } catch (err) {
    console.error('[DOT Export] Error:', err);
    res.status(500).json({ message: 'Export failed.', detail: err.message });
  }
});

/* ── POST /api/dot-transfer ─────────────────────────────────────────── */
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      method,
      session_id,
      date_from,
      date_to,
      output_code,
      inspector_email,
      comment,
      latitude,
      longitude,
    } = req.body;

    const driver = req.user;

    if (!method) {
      return res.status(400).json({ message: 'Transfer method is required.' });
    }
    if (!date_from || !date_to) {
      return res.status(400).json({ message: 'date_from and date_to are required.' });
    }
    if (method === 'email' && !inspector_email) {
      return res.status(400).json({ message: 'Inspector email is required for email transfer.' });
    }

    /* Build ELD file */
    const eldBuffer = await buildELDOutputFile({
      driver,
      session_id,
      date_from,
      date_to,
      output_code,
      comment,
    });

    const confirmationCode = generateConfirmationCode();
    const timestamp        = new Date().toISOString();
    const filename         = `ELD_${driver.id}_${date_from}_${date_to}.elds`;

    await logTransfer({
      driver, method, date_from, date_to,
      status: 'success',
      confirmation_code: confirmationCode,
      latitude, longitude,
      recipient: inspector_email,
    });

    /* ── HTTPS → FMCSA eRODS (stub) ── */
    if (method === 'https') {
      console.log(`[DOT Transfer] HTTPS — driver ${driver.id}`);
      return res.json({
        ok: true, method: 'https',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        message: 'ELD records transmitted to FMCSA eRODS portal.',
      });
    }

    /* ── Email ── */
    if (method === 'email') {
      /*
       * TODO: nodemailer
       * await transporter.sendMail({
       *   from, to: inspector_email,
       *   subject: `ELD Records — ${driverName}`,
       *   attachments: [{ filename, content: eldBuffer }],
       * });
       */
      console.log(`[DOT Transfer] Email → ${inspector_email}`);
      return res.json({
        ok: true, method: 'email',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        message: `ELD file sent to ${inspector_email}.`,
      });
    }

    /* ── Local download ── */
    if (method === 'local') {
      return res.json({
        ok: true, method: 'local',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        filename,
        file_base64: eldBuffer.toString('base64'),
        message: 'ELD output file ready for download.',
      });
    }

    return res.status(400).json({ message: `Unknown method: ${method}` });

  } catch (err) {
    console.error('[DOT Transfer] Error:', err);
    res.status(500).json({ message: 'Transfer failed.', detail: err.message });
  }
});

/* ── Helpers ────────────────────────────────────────────────────────── */
function generateConfirmationCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function logTransfer(params) {
  // TODO: await db('eld_transfers').insert({ ... });
  console.log('[DOT Transfer] Log:', JSON.stringify({
    driver_id: params.driver.id,
    method:    params.method,
    date_from: params.date_from,
    date_to:   params.date_to,
    status:    params.status,
    code:      params.confirmation_code,
  }));
}

function today() {
  return new Date().toISOString().split('T')[0];
}
function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

module.exports = router;
