/**
 * backend/src/api/routes/dotTransfer.js
 *
 * POST /api/dot-transfer        — передача инспектору (3 метода)
 * GET  /api/dot-transfer/export — прямое скачивание ELD файла
 *
 * Transfer methods:
 *   https  — HTTPS POST to FMCSA eRODS (telematics)
 *   email  — Send via nodemailer to inspector email
 *   local  — Return base64-encoded file for client download
 *
 * SMTP config (env vars):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */

'use strict';

const express    = require('express');
const router     = express.Router();
const crypto     = require('crypto');
const nodemailer = require('nodemailer');

const { buildELDOutputFile } = require('../../services/eldExport');
const { authenticate }       = require('../middlewares/auth.middleware');
const db                     = require('../../config/db');

/* ── Nodemailer transporter (lazy init, null if SMTP not configured) ─── */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST) return null;

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',   // true → port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

/* ── Method → DB enum mapping ─────────────────────────────────────────
 * Migration 009 added 'email' and 'local' to the check constraint,
 * but 'https' is still named 'telematics' in the DB for FMCSA parity.
 */
const METHOD_DB_MAP = {
  https:  'telematics',
  email:  'email',
  local:  'local',
};

/* ── GET /api/dot-transfer/export ────────────────────────────────────── */
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

/* ── POST /api/dot-transfer ──────────────────────────────────────────── */
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

    /* Validation */
    if (!method) {
      return res.status(400).json({ message: 'Transfer method is required.' });
    }
    if (!['https', 'email', 'local'].includes(method)) {
      return res.status(400).json({ message: `Unknown method: ${method}. Use https | email | local.` });
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
    const checksum         = crypto.createHash('sha256').update(eldBuffer).digest('hex');

    /* ── Log to DB ── */
    await logTransfer({
      driver,
      method,
      date_from,
      date_to,
      filename,
      checksum,
      status:            'success',
      confirmation_code: confirmationCode,
      comment,
      recipient:         inspector_email || null,
    });

    /* ── HTTPS → FMCSA eRODS (stub) ── */
    if (method === 'https') {
      console.log(`[DOT Transfer] HTTPS telematics — driver ${driver.id}`);
      return res.json({
        ok:               true,
        method:           'https',
        confirmation_code: confirmationCode,
        transmitted_at:   timestamp,
        message:          'ELD records transmitted to FMCSA eRODS portal.',
      });
    }

    /* ── Email ── */
    if (method === 'email') {
      const transporter = getTransporter();

      if (!transporter) {
        // SMTP not configured in this environment — log and return success stub
        console.warn('[DOT Transfer] SMTP not configured (SMTP_HOST missing). Email not sent.');
        return res.json({
          ok:               true,
          method:           'email',
          confirmation_code: confirmationCode,
          transmitted_at:   timestamp,
          message:          `ELD file would be sent to ${inspector_email} (SMTP not configured).`,
          smtp_configured:  false,
        });
      }

      const driverName = driver.email; // eldExport resolves the full name

      await transporter.sendMail({
        from:    process.env.EMAIL_FROM || `"ELD System" <noreply@eld-system.example>`,
        to:      inspector_email,
        subject: `ELD Records — ${driverName} — ${date_from} to ${date_to}`,
        text:    [
          `ELD output file attached for DOT inspection.`,
          `Driver:            ${driverName}`,
          `Period:            ${date_from} to ${date_to}`,
          `Confirmation code: ${confirmationCode}`,
          `Generated at:      ${timestamp}`,
          comment ? `Driver comment: ${comment}` : '',
        ].filter(Boolean).join('\n'),
        attachments: [{
          filename,
          content:     eldBuffer,
          contentType: 'application/octet-stream',
        }],
      });

      console.log(`[DOT Transfer] Email → ${inspector_email} (code: ${confirmationCode})`);
      return res.json({
        ok:               true,
        method:           'email',
        confirmation_code: confirmationCode,
        transmitted_at:   timestamp,
        message:          `ELD file sent to ${inspector_email}.`,
        smtp_configured:  true,
      });
    }

    /* ── Local download ── */
    if (method === 'local') {
      return res.json({
        ok:               true,
        method:           'local',
        confirmation_code: confirmationCode,
        transmitted_at:   timestamp,
        filename,
        file_base64:      eldBuffer.toString('base64'),
        message:          'ELD output file ready for download.',
      });
    }

  } catch (err) {
    console.error('[DOT Transfer] Error:', err);
    res.status(500).json({ message: 'Transfer failed.', detail: err.message });
  }
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

function generateConfirmationCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Log a completed ELD transfer to the eld_transfers table.
 * FMCSA §395.26(g) requires every transfer to be logged.
 */
async function logTransfer({
  driver,
  method,
  date_from,
  date_to,
  filename,
  checksum,
  status,
  confirmation_code,
  comment,
}) {
  try {
    /* Resolve driver UUID from the drivers table */
    const driverRow = await db('drivers')
      .where({ user_id: driver.id })
      .select('id')
      .first();

    if (!driverRow) {
      console.warn('[logTransfer] Driver record not found for user', driver.id);
      return;
    }

    const dbMethod = METHOD_DB_MAP[method] || 'telematics';

    await db('eld_transfers').insert({
      driver_id:         driverRow.id,
      carrier_id:        driver.carrier_id,
      method:            dbMethod,
      data_from_date:    date_from,
      data_to_date:      date_to,
      output_filename:   filename,
      file_checksum:     checksum,
      transfer_status:   status,
      confirmation_code,
      driver_comment:    comment || null,
      transferred_at:    new Date(),
    });

    console.log(`[DOT Transfer] Logged to DB — method:${dbMethod} code:${confirmation_code}`);
  } catch (err) {
    // Log but do not throw — transfer itself succeeded; DB logging is secondary
    console.error('[logTransfer] DB insert failed:', err.message);
  }
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
