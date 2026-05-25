'use strict';

const db = require('../../config/db');

/**
 * src/api/controllers/carriers.controller.js
 *
 * Carrier settings + ELD devices for the authenticated user's carrier.
 *   GET    /api/carriers/me
 *   PATCH  /api/carriers/me
 *   GET    /api/carriers/me/devices
 *   POST   /api/carriers/me/devices
 *   PATCH  /api/carriers/me/devices/:id
 *   DELETE /api/carriers/me/devices/:id   (soft-delete)
 *
 * carrier_id is ALWAYS sourced from req.user.carrier_id —
 * never from req.body or req.params.
 */

const HOS_CYCLES = ['usa_60', 'usa_70', 'canada_70', 'canada_120'];
const CONNECTION_TYPES = ['bluetooth', 'wifi', 'cellular', 'usb'];

const MC_RX     = /^MC-?\d{4,8}$/i;
const EMAIL_RX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bad(res, field, message) {
  return res.status(400).json({ error: 'VALIDATION_ERROR', field, message });
}

// ─────────────────────────────────────────────────────────────
// GET /api/carriers/me
// ─────────────────────────────────────────────────────────────
async function getMyCarrier(req, res) {
  try {
    if (!req.user.carrier_id) {
      return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });
    }

    const carrier = await db('carriers').where({ id: req.user.carrier_id }).first();
    if (!carrier) return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });

    return res.status(200).json({ carrier });
  } catch (err) {
    console.error('[carriers.getMyCarrier]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/carriers/me
// ─────────────────────────────────────────────────────────────
async function updateMyCarrier(req, res) {
  const {
    name, mc_number, canadian_nsc, main_office_address,
    phone, email, home_terminal_timezone, default_hos_cycle,
    operates_in_canada, eld_provider_name, eld_registration_id,
  } = req.body;

  try {
    if (!req.user.carrier_id) {
      return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });
    }

    const patch = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return bad(res, 'name', 'Name cannot be empty');
      }
      patch.name = name.trim();
    }

    if (mc_number !== undefined) {
      const raw = (mc_number || '').toString().trim();
      if (raw === '') {
        patch.mc_number = null;
      } else if (!MC_RX.test(raw)) {
        return bad(res, 'mc_number', 'Must match format MC-123456');
      } else {
        // Normalize to "MC-<digits>"
        const digits = raw.replace(/[^\d]/g, '');
        patch.mc_number = `MC-${digits}`;
      }
    }

    if (canadian_nsc !== undefined) {
      patch.canadian_nsc = canadian_nsc ? String(canadian_nsc).trim() : null;
    }

    if (main_office_address !== undefined) {
      patch.main_office_address = main_office_address
        ? String(main_office_address).trim()
        : null;
    }

    if (phone !== undefined) {
      const raw = (phone || '').toString().trim();
      if (raw.length > 30) return bad(res, 'phone', 'Phone is too long (max 30)');
      patch.phone = raw || null;
    }

    if (email !== undefined) {
      const raw = (email || '').toString().trim();
      if (raw && !EMAIL_RX.test(raw)) {
        return bad(res, 'email', 'Invalid email format');
      }
      patch.email = raw || null;
    }

    if (home_terminal_timezone !== undefined) {
      const raw = (home_terminal_timezone || '').toString().trim();
      if (raw.length === 0 || raw.length > 60) {
        return bad(res, 'home_terminal_timezone', 'Timezone must be 1–60 chars');
      }
      patch.home_terminal_timezone = raw;
    }

    if (default_hos_cycle !== undefined) {
      if (!HOS_CYCLES.includes(default_hos_cycle)) {
        return bad(res, 'default_hos_cycle', `Must be one of ${HOS_CYCLES.join(', ')}`);
      }
      patch.default_hos_cycle = default_hos_cycle;
    }

    if (operates_in_canada !== undefined) {
      if (typeof operates_in_canada !== 'boolean') {
        return bad(res, 'operates_in_canada', 'Must be a boolean');
      }
      patch.operates_in_canada = operates_in_canada;
    }

    if (eld_provider_name !== undefined) {
      patch.eld_provider_name = eld_provider_name
        ? String(eld_provider_name).trim()
        : null;
    }

    if (eld_registration_id !== undefined) {
      patch.eld_registration_id = eld_registration_id
        ? String(eld_registration_id).trim()
        : null;
    }

    patch.updated_at = new Date();

    const [carrier] = await db('carriers')
      .where({ id: req.user.carrier_id })
      .update(patch)
      .returning('*');

    if (!carrier) return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });

    return res.status(200).json({ carrier });
  } catch (err) {
    console.error('[carriers.updateMyCarrier]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/carriers/me/devices
// ─────────────────────────────────────────────────────────────
async function listDevices(req, res) {
  try {
    if (!req.user.carrier_id) {
      return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });
    }

    const devices = await db('eld_devices')
      .where({ carrier_id: req.user.carrier_id })
      .orderBy([
        { column: 'is_active',  order: 'desc' },
        { column: 'created_at', order: 'desc' },
      ]);

    return res.status(200).json({ devices });
  } catch (err) {
    console.error('[carriers.listDevices]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/carriers/me/devices
// ─────────────────────────────────────────────────────────────
async function createDevice(req, res) {
  const {
    serial_number, manufacturer, model, firmware_version,
    registration_id, fmcsa_certified, certified_at, connection_type,
  } = req.body;

  try {
    if (!req.user.carrier_id) {
      return res.status(404).json({ error: 'CARRIER_NOT_FOUND' });
    }

    if (!serial_number || !String(serial_number).trim()) {
      return bad(res, 'serial_number', 'serial_number is required');
    }
    if (!manufacturer || !String(manufacturer).trim()) {
      return bad(res, 'manufacturer', 'manufacturer is required');
    }
    if (!model || !String(model).trim()) {
      return bad(res, 'model', 'model is required');
    }

    const conn = connection_type || 'bluetooth';
    if (!CONNECTION_TYPES.includes(conn)) {
      return bad(res, 'connection_type', `Must be one of ${CONNECTION_TYPES.join(', ')}`);
    }

    const sn = String(serial_number).trim();
    const existing = await db('eld_devices').where({ serial_number: sn }).first();
    if (existing) {
      return res.status(409).json({ error: 'DUPLICATE_SERIAL' });
    }

    const certified = fmcsa_certified === true;

    const [device] = await db('eld_devices').insert({
      carrier_id:       req.user.carrier_id,
      serial_number:    sn,
      manufacturer:     String(manufacturer).trim(),
      model:            String(model).trim(),
      firmware_version: firmware_version ? String(firmware_version).trim() : null,
      registration_id:  registration_id  ? String(registration_id).trim()  : null,
      fmcsa_certified:  certified,
      certified_at:     certified && certified_at ? new Date(certified_at) : null,
      connection_type:  conn,
      is_active:        true,
    }).returning('*');

    return res.status(201).json({ device });
  } catch (err) {
    console.error('[carriers.createDevice]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/carriers/me/devices/:id
// ─────────────────────────────────────────────────────────────
async function updateDevice(req, res) {
  const { id } = req.params;
  const {
    firmware_version, registration_id, fmcsa_certified,
    certified_at, connection_type, is_active,
  } = req.body;

  try {
    const device = await db('eld_devices').where({ id }).first();
    if (!device || device.carrier_id !== req.user.carrier_id) {
      return res.status(404).json({ error: 'DEVICE_NOT_FOUND' });
    }

    const patch = {};

    if (firmware_version !== undefined) {
      patch.firmware_version = firmware_version
        ? String(firmware_version).trim()
        : null;
    }
    if (registration_id !== undefined) {
      patch.registration_id = registration_id
        ? String(registration_id).trim()
        : null;
    }
    if (fmcsa_certified !== undefined) {
      if (typeof fmcsa_certified !== 'boolean') {
        return bad(res, 'fmcsa_certified', 'Must be a boolean');
      }
      patch.fmcsa_certified = fmcsa_certified;
    }
    if (certified_at !== undefined) {
      patch.certified_at = certified_at ? new Date(certified_at) : null;
    }
    if (connection_type !== undefined) {
      if (!CONNECTION_TYPES.includes(connection_type)) {
        return bad(res, 'connection_type', `Must be one of ${CONNECTION_TYPES.join(', ')}`);
      }
      patch.connection_type = connection_type;
    }
    if (is_active !== undefined) {
      if (typeof is_active !== 'boolean') {
        return bad(res, 'is_active', 'Must be a boolean');
      }
      patch.is_active = is_active;
    }

    patch.updated_at = new Date();

    const [updated] = await db('eld_devices')
      .where({ id })
      .update(patch)
      .returning('*');

    return res.status(200).json({ device: updated });
  } catch (err) {
    console.error('[carriers.updateDevice]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/carriers/me/devices/:id   (soft-delete)
// ─────────────────────────────────────────────────────────────
async function deactivateDevice(req, res) {
  const { id } = req.params;

  try {
    const device = await db('eld_devices').where({ id }).first();
    if (!device || device.carrier_id !== req.user.carrier_id) {
      return res.status(404).json({ error: 'DEVICE_NOT_FOUND' });
    }

    const [updated] = await db('eld_devices')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('*');

    return res.status(200).json({ device: updated });
  } catch (err) {
    console.error('[carriers.deactivateDevice]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
}

module.exports = {
  getMyCarrier,
  updateMyCarrier,
  listDevices,
  createDevice,
  updateDevice,
  deactivateDevice,
};
