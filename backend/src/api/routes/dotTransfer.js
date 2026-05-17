/**
 * backend/routes/dotTransfer.js
 *
 * POST /dot-transfer
 *
 * Handles three FMCSA-compliant transfer methods:
 *   1. https — forward to FMCSA eRODS (stub — replace with real endpoint)
 *   2. email — send ELD file to inspector via nodemailer
 *   3. local — return base64-encoded ELD output file for client download
 *
 * FMCSA ELD output file spec: 49 CFR §395.26 / FMCSA ELD Technical Spec v4
 */

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { buildELDOutputFile } = require('../../services/eldExport');   // see below
// const nodemailer = require('nodemailer');  // uncomment when ready

/* ── POST /dot-transfer ─────────────────────────────────────────────── */
router.post('/', async (req, res) => {
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

    const driver = req.user;   // set by auth middleware

    if (!method) {
      return res.status(400).json({ message: 'Transfer method is required.' });
    }
    if (!date_from || !date_to) {
      return res.status(400).json({ message: 'date_from and date_to are required.' });
    }
    if (method === 'email' && !inspector_email) {
      return res.status(400).json({ message: 'Inspector email is required for email transfer.' });
    }

    /* 1. Build ELD output file (FMCSA format) */
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

    /* ── Method: HTTPS → FMCSA eRODS ── */
    if (method === 'https') {
      /*
       * TODO: Replace stub with real FMCSA eRODS API call.
       * Production endpoint: https://eld.fmcsa.dot.gov/ELDSubmission
       * Requires: ELD provider registration + API credentials.
       *
       * const fmcsaRes = await axios.post(
       *   process.env.FMCSA_ERODS_URL,
       *   eldBuffer,
       *   { headers: { 'Content-Type': 'application/octet-stream',
       *                'X-Output-File-Comment': output_code || '' } }
       * );
       */

      // Stub — log and return confirmation
      console.log(`[DOT Transfer] HTTPS — driver ${driver.id} — ${date_from} → ${date_to}`);

      await logTransfer({ driver, method, date_from, date_to, status: 'success',
        confirmation_code: confirmationCode, latitude, longitude });

      return res.json({
        ok:                true,
        method:            'https',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        message:           'ELD records transmitted to FMCSA eRODS portal.',
      });
    }

    /* ── Method: Email ── */
    if (method === 'email') {
      /*
       * TODO: Configure nodemailer transport (SMTP / SES / SendGrid).
       *
       * const transporter = nodemailer.createTransport({ ... });
       * await transporter.sendMail({
       *   from:        process.env.MAIL_FROM,
       *   to:          inspector_email,
       *   subject:     `ELD Records — ${driver.name} — ${date_from} to ${date_to}`,
       *   text:        `Please find attached the ELD output file.\n\nConf: ${confirmationCode}`,
       *   attachments: [{ filename, content: eldBuffer }],
       * });
       */

      console.log(`[DOT Transfer] Email → ${inspector_email} — driver ${driver.id}`);

      await logTransfer({ driver, method, date_from, date_to, status: 'success',
        confirmation_code: confirmationCode, latitude, longitude, recipient: inspector_email });

      return res.json({
        ok:                true,
        method:            'email',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        message:           `ELD file sent to ${inspector_email}.`,
      });
    }

    /* ── Method: Local download ── */
    if (method === 'local') {
      const file_base64 = eldBuffer.toString('base64');

      await logTransfer({ driver, method, date_from, date_to, status: 'success',
        confirmation_code: confirmationCode, latitude, longitude });

      return res.json({
        ok:                true,
        method:            'local',
        confirmation_code: confirmationCode,
        transmitted_at:    timestamp,
        filename,
        file_base64,
        message:           'ELD output file ready for download.',
      });
    }

    return res.status(400).json({ message: `Unknown transfer method: ${method}` });

  } catch (err) {
    console.error('[DOT Transfer] Error:', err);
    res.status(500).json({ message: 'Transfer failed.', detail: err.message });
  }
});

/* ── helpers ────────────────────────────────────────────────────────── */

/** 6-char alphanumeric confirmation code shown to inspector */
function generateConfirmationCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Persist transfer log to DB.
 * Replace with your actual DB call (Prisma / Knex / raw SQL).
 */
async function logTransfer(params) {
  // TODO: await db('dot_transfers').insert({ ... params });
  console.log('[DOT Transfer] Log:', JSON.stringify(params, null, 2));
}

module.exports = router;
