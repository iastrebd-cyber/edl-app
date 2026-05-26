/**
 * frontend-dispatcher/src/components/CarrierSettings.jsx
 *
 * Carrier Settings panel:
 *   - Company Info     (name, USDOT, MC, addr, phone, email)
 *   - HOS & Operations (timezone, default cycle, Canada flag)
 *   - ELD Provider     (provider name, registration ID)
 *   - ELD Devices      (list / add / edit / deactivate)
 */

import { useEffect, useState } from 'react';
import { authFetch } from '../auth';

const API = 'http://localhost:3000';

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
];

const HOS_CYCLES = [
  { value: 'usa_60',     label: 'USA 60-hour / 7-day' },
  { value: 'usa_70',     label: 'USA 70-hour / 8-day' },
  { value: 'canada_70',  label: 'Canada 70-hour / 7-day' },
  { value: 'canada_120', label: 'Canada 120-hour / 14-day' },
];

const CONNECTION_TYPES = ['bluetooth', 'wifi', 'cellular', 'usb'];

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MC_RX    = /^MC-?\d{4,8}$/i;

const TABS = [
  { id: 'company', label: 'COMPANY INFO' },
  { id: 'hos',     label: 'HOS & OPERATIONS' },
  { id: 'eld',     label: 'ELD PROVIDER' },
];


export default function CarrierSettings({ onClose }) {
  const [tab,            setTab]            = useState('company');
  const [carrier,        setCarrier]        = useState(null);
  const [formCarrier,    setFormCarrier]    = useState(null);
  const [devices,        setDevices]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);
  const [fieldErrors,    setFieldErrors]    = useState({});
  const [successMsg,     setSuccessMsg]     = useState(null);
  const [showAddDevice,  setShowAddDevice]  = useState(false);
  const [editingDevice,  setEditingDevice]  = useState(null);

  // ── Initial fetch ──────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [carrierRes, devicesRes] = await Promise.all([
          authFetch(`${API}/api/carriers/me`,         {}),
          authFetch(`${API}/api/carriers/me/devices`, {}),
        ]);

        if (carrierRes.status === 401 || devicesRes.status === 401) {
          if (!cancel) setError('Session expired. Please log in again.');
          return;
        }
        if (!carrierRes.ok) {
          if (!cancel) setError(`Failed to load carrier (${carrierRes.status})`);
          return;
        }

        const carrierJson = await carrierRes.json();
        const devicesJson = devicesRes.ok ? await devicesRes.json() : { devices: [] };

        if (cancel) return;
        setCarrier(carrierJson.carrier);
        setFormCarrier({ ...carrierJson.carrier });
        setDevices(devicesJson.devices || []);
      } catch (err) {
        console.error('[CarrierSettings.load]', err);
        if (!cancel) setError('Network error. Try again.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // ── Auto-dismiss success message ───────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 2000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Helpers ────────────────────────────────────────────
  const set = (field, value) => {
    setFormCarrier(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev }; delete next[field]; return next;
    });
  };

  function validateCarrier() {
    const errs = {};
    if (formCarrier.email && !EMAIL_RX.test(formCarrier.email.trim())) {
      errs.email = 'Invalid email format';
    }
    if (formCarrier.mc_number && !MC_RX.test(formCarrier.mc_number.trim())) {
      errs.mc_number = 'Must match format MC-123456';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Save carrier ───────────────────────────────────────
  async function handleSaveCarrier() {
    if (!validateCarrier()) return;
    setSaving(true);
    setError(null);

    const payload = {
      name:                   formCarrier.name,
      mc_number:              formCarrier.mc_number || null,
      canadian_nsc:           formCarrier.canadian_nsc || null,
      main_office_address:    formCarrier.main_office_address || null,
      phone:                  formCarrier.phone || null,
      email:                  formCarrier.email || null,
      home_terminal_timezone: formCarrier.home_terminal_timezone,
      default_hos_cycle:      formCarrier.default_hos_cycle,
      operates_in_canada:     !!formCarrier.operates_in_canada,
      eld_provider_name:      formCarrier.eld_provider_name || null,
      eld_registration_id:    formCarrier.eld_registration_id || null,
    };

    try {
      const res = await authFetch(`${API}/api/carriers/me`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        setError('Session expired. Please log in again.');
        return;
      }
      const json = await res.json();
      if (res.status === 400 && json.field) {
        setFieldErrors({ [json.field]: json.message || 'Invalid value' });
        return;
      }
      if (!res.ok) {
        setError(json.message || 'Server error. Try again.');
        return;
      }

      setCarrier(json.carrier);
      setFormCarrier({ ...json.carrier });
      setSuccessMsg('Saved!');
    } catch (err) {
      console.error('[CarrierSettings.save]', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Device CRUD ────────────────────────────────────────
  async function handleCreateDevice(deviceForm) {
    setSaving(true); setError(null);
    try {
      const res = await authFetch(`${API}/api/carriers/me/devices`, {
        method: 'POST',
        body: JSON.stringify(deviceForm),
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired. Please log in again.'); return; }
      if (res.status === 409) { setError('A device with this serial number already exists.'); return; }
      if (res.status === 400) { setError(json.message || 'Invalid device data.'); return; }
      if (!res.ok)            { setError(json.message || 'Server error. Try again.'); return; }

      setDevices(prev => [json.device, ...prev]);
      setShowAddDevice(false);
      setSuccessMsg('Device added.');
    } catch (err) {
      console.error('[CarrierSettings.createDevice]', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateDevice(id, patch) {
    setSaving(true); setError(null);
    try {
      const res = await authFetch(`${API}/api/carriers/me/devices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired. Please log in again.'); return; }
      if (!res.ok)            { setError(json.message || 'Server error. Try again.'); return; }

      setDevices(prev => prev.map(d => d.id === id ? json.device : d));
      setEditingDevice(null);
      setSuccessMsg('Device updated.');
    } catch (err) {
      console.error('[CarrierSettings.updateDevice]', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateDevice(id) {
    if (!window.confirm('Deactivate this device? It will remain in records but stop being used.')) return;
    setSaving(true); setError(null);
    try {
      const res = await authFetch(`${API}/api/carriers/me/devices/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (res.status === 401) { setError('Session expired. Please log in again.'); return; }
      if (!res.ok)            { setError(json.message || 'Server error. Try again.'); return; }

      setDevices(prev => prev.map(d => d.id === id ? json.device : d));
      setSuccessMsg('Device deactivated.');
    } catch (err) {
      console.error('[CarrierSettings.deactivateDevice]', err);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(10, 14, 23, 0.8)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '32px 16px', overflowY: 'auto',
        }}
        onClick={onClose}
      >
        {/* Container */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 800,
            maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--surface-low)',
            border: '1px solid var(--outline)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--on-surface)',
            fontFamily: 'var(--font-body)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px',
            background: 'var(--surface-mid)',
            borderBottom: '1px solid var(--outline)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 15, fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--on-surface)',
            }}>
              CARRIER<span style={{ color: 'var(--primary)' }}>_SETTINGS</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={closeBtnStyle}
            >✕</button>
          </div>

          {/* Body */}
          <div style={{ padding: 18 }}>
            {loading && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--on-surface-dim)' }}>
                Loading…
              </div>
            )}

            {!loading && error && (
              <div style={errorBoxStyle}>{error}</div>
            )}

            {successMsg && (
              <div style={successBoxStyle}>{successMsg}</div>
            )}

            {!loading && formCarrier && (
              <>
                {/* Tab bar */}
                <div style={{
                  display: 'flex', gap: 0,
                  borderBottom: '1px solid var(--outline)',
                  marginBottom: 18,
                }}>
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      style={{
                        padding: '10px 16px',
                        border: 'none',
                        background: 'transparent',
                        color: tab === t.id ? 'var(--primary)' : 'var(--on-surface-dim)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        borderBottom: tab === t.id
                          ? '2px solid var(--primary)'
                          : '2px solid transparent',
                        transition: 'all var(--ease-fast)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* TAB: Company */}
                {tab === 'company' && (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <Field label="Name">
                      <input
                        type="text"
                        value={formCarrier.name || ''}
                        onChange={e => set('name', e.target.value)}
                        style={inputStyle}
                      />
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <Field label="USDOT Number" hint="Issued by FMCSA — cannot be changed">
                        <input
                          type="text"
                          value={formCarrier.usdot_number || ''}
                          readOnly disabled
                          style={{ ...inputStyle, ...readonlyStyle }}
                        />
                      </Field>
                      <Field label="MC Number" error={fieldErrors.mc_number}>
                        <input
                          type="text"
                          placeholder="MC-123456"
                          value={formCarrier.mc_number || ''}
                          onChange={e => set('mc_number', e.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                    </div>

                    <Field label="Canadian NSC (optional)">
                      <input
                        type="text"
                        value={formCarrier.canadian_nsc || ''}
                        onChange={e => set('canadian_nsc', e.target.value)}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="Main Office Address">
                      <textarea
                        rows={2}
                        value={formCarrier.main_office_address || ''}
                        onChange={e => set('main_office_address', e.target.value)}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <Field label="Phone">
                        <input
                          type="tel"
                          value={formCarrier.phone || ''}
                          onChange={e => set('phone', e.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Email" error={fieldErrors.email}>
                        <input
                          type="email"
                          value={formCarrier.email || ''}
                          onChange={e => set('email', e.target.value)}
                          style={inputStyle}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {/* TAB: HOS */}
                {tab === 'hos' && (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <Field label="Home Terminal Timezone">
                      <select
                        value={formCarrier.home_terminal_timezone || 'America/Chicago'}
                        onChange={e => set('home_terminal_timezone', e.target.value)}
                        style={inputStyle}
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Default HOS Cycle">
                      <select
                        value={formCarrier.default_hos_cycle || 'usa_70'}
                        onChange={e => set('default_hos_cycle', e.target.value)}
                        style={inputStyle}
                      >
                        {HOS_CYCLES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </Field>

                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px',
                      background: 'var(--surface-mid)',
                      border: '1px solid var(--outline)',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={!!formCarrier.operates_in_canada}
                        onChange={e => set('operates_in_canada', e.target.checked)}
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontSize: 13 }}>Operates in Canada</span>
                    </label>
                  </div>
                )}

                {/* TAB: ELD */}
                {tab === 'eld' && (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <Field label="ELD Provider Name">
                      <input
                        type="text"
                        value={formCarrier.eld_provider_name || ''}
                        onChange={e => set('eld_provider_name', e.target.value)}
                        style={inputStyle}
                      />
                    </Field>

                    <Field label="ELD Registration ID">
                      <input
                        type="text"
                        value={formCarrier.eld_registration_id || ''}
                        onChange={e => set('eld_registration_id', e.target.value)}
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                      />
                    </Field>

                    <div style={hintStyle}>
                      Carrier-level FMCSA ELD provider registration
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleSaveCarrier}
                    disabled={saving}
                    style={{
                      ...primaryBtnStyle,
                      opacity: saving ? 0.6 : 1,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? 'SAVING…' : 'SAVE CHANGES'}
                  </button>
                </div>

                {/* ELD Devices section */}
                <div style={{
                  marginTop: 30,
                  paddingTop: 18,
                  borderTop: '1px solid var(--outline)',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 14,
                  }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13, fontWeight: 700,
                      letterSpacing: '0.06em',
                      color: 'var(--on-surface)',
                    }}>
                      ELD DEVICES <span style={{ color: 'var(--on-surface-dim)' }}>({devices.length})</span>
                    </h3>
                    {!showAddDevice && (
                      <button
                        onClick={() => setShowAddDevice(true)}
                        style={secondaryBtnStyle}
                        disabled={saving}
                      >+ ADD DEVICE</button>
                    )}
                  </div>

                  {showAddDevice && (
                    <DeviceForm
                      saving={saving}
                      onSubmit={handleCreateDevice}
                      onCancel={() => setShowAddDevice(false)}
                    />
                  )}

                  {devices.length === 0 && !showAddDevice && (
                    <div style={{
                      padding: 30, textAlign: 'center',
                      color: 'var(--on-surface-dim)', fontSize: 13,
                      background: 'var(--surface-mid)',
                      border: '1px dashed var(--outline)',
                      borderRadius: 'var(--r-md)',
                    }}>
                      No ELD devices registered yet.
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                    {devices.map(d => (
                      editingDevice && editingDevice.id === d.id ? (
                        <DeviceForm
                          key={d.id}
                          saving={saving}
                          initial={d}
                          edit
                          onSubmit={patch => handleUpdateDevice(d.id, patch)}
                          onCancel={() => setEditingDevice(null)}
                        />
                      ) : (
                        <DeviceCard
                          key={d.id}
                          device={d}
                          onEdit={() => setEditingDevice(d)}
                          onDeactivate={() => handleDeactivateDevice(d.id)}
                        />
                      )
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Field wrapper ───────────────────────────────────── */
function Field({ label, hint, error, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && !error && <span style={hintStyle}>{hint}</span>}
      {error && <span style={errorTextStyle}>{error}</span>}
    </label>
  );
}

/* ── Device card ─────────────────────────────────────── */
function DeviceCard({ device, onEdit, onDeactivate }) {
  const faded = !device.is_active;
  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--surface-mid)',
      border: '1px solid var(--outline)',
      borderRadius: 'var(--r-md)',
      opacity: faded ? 0.55 : 1,
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13, fontWeight: 600,
          color: 'var(--on-surface)',
        }}>
          {device.serial_number}
          {faded && (
            <span style={{
              marginLeft: 8, fontSize: 10,
              padding: '2px 6px', borderRadius: 'var(--r-full)',
              background: 'var(--surface-high)',
              color: 'var(--on-surface-dim)',
            }}>INACTIVE</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--on-surface-muted)' }}>
          {device.manufacturer} · {device.model}
          {device.firmware_version && (
            <span style={{ color: 'var(--on-surface-dim)' }}> · FW {device.firmware_version}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={badgeStyle}>{device.connection_type}</span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: device.fmcsa_certified ? 'var(--ok)' : 'var(--danger)',
          }}>
            {device.fmcsa_certified ? '✓ FMCSA certified' : '✕ not certified'}
          </span>
          {device.registration_id && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--on-surface-dim)',
            }}>
              {device.registration_id}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onEdit} style={smallBtnStyle}>EDIT</button>
        {device.is_active && (
          <button
            onClick={onDeactivate}
            style={{ ...smallBtnStyle, color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >DEACTIVATE</button>
        )}
      </div>
    </div>
  );
}

/* ── Device form (add/edit) ──────────────────────────── */
function DeviceForm({ initial, edit, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    serial_number:    initial?.serial_number    || '',
    manufacturer:     initial?.manufacturer     || '',
    model:            initial?.model            || '',
    firmware_version: initial?.firmware_version || '',
    registration_id:  initial?.registration_id  || '',
    connection_type:  initial?.connection_type  || 'bluetooth',
    fmcsa_certified:  initial?.fmcsa_certified  || false,
    certified_at:     initial?.certified_at
      ? new Date(initial.certified_at).toISOString().slice(0, 10)
      : '',
    is_active:        initial?.is_active ?? true,
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const valid = form.serial_number.trim() &&
                form.manufacturer.trim()  &&
                form.model.trim();

  function handleSubmit() {
    if (!valid) return;
    if (edit) {
      // Only mutable fields
      onSubmit({
        firmware_version: form.firmware_version || null,
        registration_id:  form.registration_id  || null,
        fmcsa_certified:  !!form.fmcsa_certified,
        certified_at:     form.fmcsa_certified && form.certified_at ? form.certified_at : null,
        connection_type:  form.connection_type,
        is_active:        !!form.is_active,
      });
    } else {
      onSubmit({
        serial_number:    form.serial_number.trim(),
        manufacturer:     form.manufacturer.trim(),
        model:            form.model.trim(),
        firmware_version: form.firmware_version || null,
        registration_id:  form.registration_id  || null,
        connection_type:  form.connection_type,
        fmcsa_certified:  !!form.fmcsa_certified,
        certified_at:     form.fmcsa_certified && form.certified_at ? form.certified_at : null,
      });
    }
  }

  return (
    <div style={{
      padding: 14,
      background: 'var(--surface-mid)',
      border: '1px solid var(--outline-primary)',
      borderRadius: 'var(--r-md)',
      display: 'grid', gap: 12,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11, fontWeight: 700,
        letterSpacing: '0.06em',
        color: 'var(--primary)',
      }}>
        {edit ? 'EDIT DEVICE' : 'NEW DEVICE'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Serial Number *">
          <input
            type="text"
            value={form.serial_number}
            onChange={e => set('serial_number', e.target.value)}
            disabled={edit}
            style={{ ...inputStyle, ...(edit ? readonlyStyle : null), fontFamily: 'var(--font-mono)' }}
          />
        </Field>
        <Field label="Manufacturer *">
          <input
            type="text"
            value={form.manufacturer}
            onChange={e => set('manufacturer', e.target.value)}
            disabled={edit}
            style={{ ...inputStyle, ...(edit ? readonlyStyle : null) }}
          />
        </Field>
        <Field label="Model *">
          <input
            type="text"
            value={form.model}
            onChange={e => set('model', e.target.value)}
            disabled={edit}
            style={{ ...inputStyle, ...(edit ? readonlyStyle : null) }}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="Firmware">
          <input
            type="text"
            value={form.firmware_version}
            onChange={e => set('firmware_version', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Registration ID">
          <input
            type="text"
            value={form.registration_id}
            onChange={e => set('registration_id', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </Field>
        <Field label="Connection">
          <select
            value={form.connection_type}
            onChange={e => set('connection_type', e.target.value)}
            style={inputStyle}
          >
            {CONNECTION_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!form.fmcsa_certified}
            onChange={e => set('fmcsa_certified', e.target.checked)}
            style={{ accentColor: 'var(--primary)' }}
          />
          FMCSA Certified
        </label>

        {form.fmcsa_certified && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--on-surface-dim)' }}>Certified at:</span>
            <input
              type="date"
              value={form.certified_at}
              onChange={e => set('certified_at', e.target.value)}
              style={{ ...inputStyle, padding: '6px 10px' }}
            />
          </label>
        )}

        {edit && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
            Active
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={secondaryBtnStyle} disabled={saving}>CANCEL</button>
        <button
          onClick={handleSubmit}
          disabled={!valid || saving}
          style={{
            ...primaryBtnStyle,
            opacity: (!valid || saving) ? 0.6 : 1,
            cursor: (!valid || saving) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'SAVING…' : 'SAVE DEVICE'}
        </button>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────── */
const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10, fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'var(--on-surface-dim)',
  textTransform: 'uppercase',
};

const hintStyle = {
  fontSize: 11,
  color: 'var(--on-surface-dim)',
  fontStyle: 'italic',
};

const errorTextStyle = {
  fontSize: 11,
  color: 'var(--danger)',
};

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 'var(--r-md)',
  border: '1px solid var(--outline)',
  background: 'var(--surface-mid)',
  color: 'var(--on-surface)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
  transition: 'border-color var(--ease-fast)',
};

const readonlyStyle = {
  background: 'var(--surface)',
  color: 'var(--on-surface-dim)',
  cursor: 'not-allowed',
};

const primaryBtnStyle = {
  padding: '9px 18px',
  borderRadius: 'var(--r-md)',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  fontFamily: 'var(--font-mono)',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em',
  cursor: 'pointer',
  transition: 'transform var(--ease-fast)',
};

const secondaryBtnStyle = {
  padding: '8px 14px',
  borderRadius: 'var(--r-md)',
  background: 'transparent',
  color: 'var(--on-surface-dim)',
  border: '1px solid var(--outline)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em',
  cursor: 'pointer',
};

const smallBtnStyle = {
  padding: '4px 10px',
  borderRadius: 'var(--r-sm)',
  background: 'transparent',
  color: 'var(--on-surface-dim)',
  border: '1px solid var(--outline)',
  fontFamily: 'var(--font-mono)',
  fontSize: 9, fontWeight: 700,
  letterSpacing: '0.06em',
  cursor: 'pointer',
};

const closeBtnStyle = {
  width: 30, height: 30,
  borderRadius: 'var(--r-full)',
  background: 'transparent',
  color: 'var(--on-surface-dim)',
  border: '1px solid var(--outline)',
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const badgeStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10, fontWeight: 600,
  letterSpacing: '0.04em',
  padding: '2px 8px',
  borderRadius: 'var(--r-full)',
  background: 'var(--surface-high)',
  color: 'var(--on-surface-muted)',
  textTransform: 'uppercase',
};

const errorBoxStyle = {
  padding: '10px 12px',
  marginBottom: 14,
  borderRadius: 'var(--r-md)',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid var(--danger)',
  color: 'var(--danger)',
  fontSize: 13,
};

const successBoxStyle = {
  padding: '10px 12px',
  marginBottom: 14,
  borderRadius: 'var(--r-md)',
  background: 'rgba(34, 197, 94, 0.1)',
  border: '1px solid var(--ok)',
  color: 'var(--ok)',
  fontSize: 13,
};
