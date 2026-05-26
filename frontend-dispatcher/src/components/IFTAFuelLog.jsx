/**
 * frontend-dispatcher/src/components/IFTAFuelLog.jsx
 *
 * IFTA Fuel Purchase Log — modal panel.
 * Displays, filters, adds, edits and deletes fuel purchase records.
 */

import { useEffect, useState, useRef } from 'react';
import { authFetch } from '../auth';

const API = 'http://localhost:3000';
const LIMIT = 100;

const FUEL_TYPES = [
  { value: 'diesel',   label: 'Diesel' },
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'propane',  label: 'Propane' },
  { value: 'cng',      label: 'CNG' },
  { value: 'lng',      label: 'LNG' },
  { value: 'electric', label: 'Electric' },
];

const FUEL_TYPE_COLORS = {
  diesel:   'var(--primary)',
  gasoline: 'var(--warning)',
  propane:  'var(--tertiary)',
  cng:      'var(--ok)',
  lng:      'var(--secondary)',
  electric: 'var(--caution)',
};

const YEARS = [2024, 2025, 2026, 2027];


function emptyForm() {
  return {
    purchase_date: '',
    vehicle_id: '',
    jurisdiction_code: '',
    gallons: '',
    price_per_gallon: '',
    total_amount: '',
    fuel_type: 'diesel',
    station_name: '',
    station_address: '',
    notes: '',
    _totalTouched: false,
  };
}

export default function IFTAFuelLog({ onClose }) {
  const currentYear = String(new Date().getFullYear());

  const [purchases,    setPurchases]    = useState([]);
  const [total,        setTotal]        = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(null);
  const [successMsg,   setSuccessMsg]   = useState(null);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [filters,      setFilters]      = useState({
    vehicle_id: '', year: currentYear, quarter: '',
    jurisdiction_code: '', fuel_type: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    vehicle_id: '', year: currentYear, quarter: '',
    jurisdiction_code: '', fuel_type: '',
  });
  const [page,         setPage]         = useState(0);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [addForm,      setAddForm]      = useState(emptyForm());
  const [editingId,    setEditingId]    = useState(null);
  const [editForm,     setEditForm]     = useState({});

  // ── Auto-dismiss success ───────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 2000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Initial parallel fetch ─────────────────────────────
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [jurRes, fuelRes] = await Promise.all([
          authFetch(`${API}/api/ifta/jurisdictions`, {}),
          authFetch(`${API}/api/ifta/fuel?year=${currentYear}&limit=${LIMIT}&offset=0`, {}),
        ]);
        if (jurRes.status === 401 || fuelRes.status === 401) {
          if (!cancel) setError('Session expired. Please log in again.');
          return;
        }
        const jurJson  = jurRes.ok  ? await jurRes.json()  : { jurisdictions: [] };
        const fuelJson = fuelRes.ok ? await fuelRes.json() : { purchases: [], total: 0 };
        if (cancel) return;
        setJurisdictions(jurJson.jurisdictions || []);
        setPurchases(fuelJson.purchases || []);
        setTotal(fuelJson.total || 0);
      } catch (e) {
        console.error('[IFTAFuelLog.load]', e);
        if (!cancel) setError('Network error. Try again.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // ── Load purchases when appliedFilters / page changes ──
  async function loadPurchases(f = appliedFilters, pg = page) {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams();
      if (f.year)              p.set('year',              f.year);
      if (f.quarter)           p.set('quarter',           f.quarter);
      if (f.vehicle_id)        p.set('vehicle_id',        f.vehicle_id);
      if (f.jurisdiction_code) p.set('jurisdiction_code', f.jurisdiction_code);
      if (f.fuel_type)         p.set('fuel_type',         f.fuel_type);
      p.set('limit',  LIMIT);
      p.set('offset', pg * LIMIT);

      const res = await authFetch(`${API}/api/ifta/fuel?${p}`, {});
      if (res.status === 401) { setError('Session expired.'); return; }
      const json = res.ok ? await res.json() : { purchases: [], total: 0 };
      setPurchases(json.purchases || []);
      setTotal(json.total || 0);
    } catch (e) {
      console.error('[IFTAFuelLog.loadPurchases]', e);
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleApplyFilters() {
    setPage(0);
    setAppliedFilters({ ...filters });
    loadPurchases({ ...filters }, 0);
  }

  function handlePageChange(dir) {
    const next = page + dir;
    if (next < 0) return;
    if (next * LIMIT >= total && dir > 0) return;
    setPage(next);
    loadPurchases(appliedFilters, next);
  }

  // ── Add form helpers ───────────────────────────────────
  function setAddField(field, value) {
    setAddForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'total_amount') next._totalTouched = true;
      // Auto-compute total if not manually set
      if ((field === 'gallons' || field === 'price_per_gallon') && !next._totalTouched) {
        const g = parseFloat(field === 'gallons' ? value : next.gallons);
        const p = parseFloat(field === 'price_per_gallon' ? value : next.price_per_gallon);
        if (!isNaN(g) && !isNaN(p) && g > 0 && p > 0) {
          next.total_amount = (g * p).toFixed(2);
        }
      }
      return next;
    });
  }

  async function handleAdd() {
    if (!addForm.purchase_date) { setError('Purchase date is required.'); return; }
    if (!addForm.vehicle_id)    { setError('Vehicle ID is required.'); return; }
    if (!addForm.jurisdiction_code) { setError('State is required.'); return; }
    if (!addForm.gallons || parseFloat(addForm.gallons) <= 0) {
      setError('Gallons must be a positive number.'); return;
    }

    setSaving(true); setError(null);
    try {
      const body = {
        vehicle_id:        addForm.vehicle_id.trim(),
        purchase_date:     new Date(addForm.purchase_date).toISOString(),
        jurisdiction_code: addForm.jurisdiction_code,
        gallons:           parseFloat(addForm.gallons),
        fuel_type:         addForm.fuel_type || 'diesel',
      };
      if (addForm.price_per_gallon) body.price_per_gallon = parseFloat(addForm.price_per_gallon);
      if (addForm.total_amount)     body.total_amount     = parseFloat(addForm.total_amount);
      if (addForm.station_name)     body.station_name     = addForm.station_name;
      if (addForm.station_address)  body.station_address  = addForm.station_address;
      if (addForm.notes)            body.notes            = addForm.notes;

      const res = await authFetch(`${API}/api/ifta/fuel`, {
        method: 'POST', body: JSON.stringify(body),
      });
      const json = await res.json();

      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 400) {
        setError(json.message || 'Validation error.');
        return;
      }
      if (res.status === 404) { setError('Vehicle not found or does not belong to your carrier.'); return; }
      if (!res.ok) { setError(json.message || 'Server error. Try again.'); return; }

      setPurchases(prev => [json.purchase, ...prev]);
      setTotal(prev => prev + 1);
      setAddForm(emptyForm());
      setShowAddForm(false);
      setSuccessMsg('Fuel purchase added.');
    } catch (e) {
      console.error('[IFTAFuelLog.add]', e);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Edit helpers ───────────────────────────────────────
  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({
      purchase_date:     p.purchase_date ? p.purchase_date.slice(0, 10) : '',
      jurisdiction_code: p.jurisdiction_code || '',
      gallons:           p.gallons != null ? String(parseFloat(p.gallons)) : '',
      price_per_gallon:  p.price_per_gallon != null ? String(parseFloat(p.price_per_gallon)) : '',
      total_amount:      p.total_amount != null ? String(parseFloat(p.total_amount)) : '',
      fuel_type:         p.fuel_type || 'diesel',
      station_name:      p.station_name || '',
      station_address:   p.station_address || '',
      notes:             p.notes || '',
    });
  }

  async function handleSaveEdit() {
    if (!editForm.gallons || parseFloat(editForm.gallons) <= 0) {
      setError('Gallons must be a positive number.'); return;
    }
    setSaving(true); setError(null);
    try {
      const body = {};
      if (editForm.purchase_date)     body.purchase_date     = new Date(editForm.purchase_date).toISOString();
      if (editForm.jurisdiction_code) body.jurisdiction_code = editForm.jurisdiction_code;
      if (editForm.gallons)           body.gallons           = parseFloat(editForm.gallons);
      if (editForm.fuel_type)         body.fuel_type         = editForm.fuel_type;
      if (editForm.price_per_gallon)  body.price_per_gallon  = parseFloat(editForm.price_per_gallon);
      if (editForm.total_amount)      body.total_amount      = parseFloat(editForm.total_amount);
      body.station_name    = editForm.station_name    || null;
      body.station_address = editForm.station_address || null;
      body.notes           = editForm.notes           || null;

      const res = await authFetch(`${API}/api/ifta/fuel/${editingId}`, {
        method: 'PATCH', body: JSON.stringify(body),
      });
      const json = await res.json();

      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 400) { setError(json.message || 'Validation error.'); return; }
      if (res.status === 404) { setError('Purchase not found.'); return; }
      if (!res.ok) { setError(json.message || 'Server error. Try again.'); return; }

      setPurchases(prev => prev.map(p => p.id === editingId ? json.purchase : p));
      setEditingId(null);
      setEditForm({});
      setSuccessMsg('Purchase updated.');
    } catch (e) {
      console.error('[IFTAFuelLog.edit]', e);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────
  async function handleDelete(id) {
    if (!window.confirm('Delete this fuel purchase?')) return;
    setSaving(true); setError(null);
    try {
      const res = await authFetch(`${API}/api/ifta/fuel/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 401) { setError('Session expired.'); return; }
      if (res.status === 404) { setError('Purchase not found.'); return; }
      if (!res.ok) { setError('Server error. Try again.'); return; }

      setPurchases(prev => prev.filter(p => p.id !== id));
      setTotal(prev => prev - 1);
      setSuccessMsg('Purchase deleted.');
    } catch (e) {
      console.error('[IFTAFuelLog.delete]', e);
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Shared input style ─────────────────────────────────
  const inputSt = {
    background: 'var(--surface-mid)', border: '1px solid var(--outline)',
    borderRadius: 'var(--r-md)', color: 'var(--on-surface)',
    padding: '7px 10px', fontFamily: 'var(--font-body)', fontSize: 13,
    width: '100%', outline: 'none',
  };
  const selectSt = { ...inputSt, cursor: 'pointer' };
  const labelSt  = { fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--on-surface-dim)', letterSpacing: '0.04em', marginBottom: 4, display: 'block' };

  // ── IFTA-member jurisdictions for dropdown ─────────────
  const iftaJurs = jurisdictions.filter(j => j.is_ifta_member);

  // ── Shared form fields renderer ────────────────────────
  function renderFormFields(form, setField) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <div>
          <label style={labelSt}>PURCHASE DATE *</label>
          <input type="date" style={inputSt} value={form.purchase_date}
            onChange={e => setField('purchase_date', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>VEHICLE ID *</label>
          <input type="text" style={inputSt} placeholder="UUID" value={form.vehicle_id || ''}
            onChange={e => setField('vehicle_id', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>STATE *</label>
          <select style={selectSt} value={form.jurisdiction_code}
            onChange={e => setField('jurisdiction_code', e.target.value)}>
            <option value="">— Select —</option>
            {iftaJurs.map(j => (
              <option key={j.code} value={j.code}>{j.code} — {j.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelSt}>GALLONS *</label>
          <input type="number" style={inputSt} step="0.001" min="0" placeholder="0.000"
            value={form.gallons} onChange={e => setField('gallons', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>PRICE / GAL ($)</label>
          <input type="number" style={inputSt} step="0.001" min="0" placeholder="0.000"
            value={form.price_per_gallon} onChange={e => setField('price_per_gallon', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>
            TOTAL AMOUNT ($)
            {form.price_per_gallon && form.gallons && !form._totalTouched && (
              <span style={{ color: 'var(--on-surface-dim)', marginLeft: 6 }}>(auto)</span>
            )}
          </label>
          <input type="number" style={inputSt} step="0.01" min="0" placeholder="0.00"
            value={form.total_amount} onChange={e => setField('total_amount', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>FUEL TYPE</label>
          <select style={selectSt} value={form.fuel_type}
            onChange={e => setField('fuel_type', e.target.value)}>
            {FUEL_TYPES.map(ft => (
              <option key={ft.value} value={ft.value}>{ft.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelSt}>STATION NAME</label>
          <input type="text" style={inputSt} placeholder="e.g. Pilot Flying J"
            value={form.station_name} onChange={e => setField('station_name', e.target.value)} />
        </div>
        <div>
          <label style={labelSt}>STATION ADDRESS</label>
          <input type="text" style={inputSt} placeholder="City, State"
            value={form.station_address} onChange={e => setField('station_address', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelSt}>NOTES</label>
          <textarea style={{ ...inputSt, resize: 'vertical', minHeight: 56 }}
            placeholder="Optional notes"
            value={form.notes} onChange={e => setField('notes', e.target.value)} />
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,14,23,0.85)',
      zIndex: 1100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '24px 16px', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 960,
        background: 'var(--surface-low)',
        border: '1px solid var(--outline)',
        borderRadius: 'var(--r-lg)',
        display: 'flex', flexDirection: 'column',
        marginTop: 'auto', marginBottom: 'auto',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)',
          borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>
            ⛽ IFTA FUEL LOG
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--outline)',
            color: 'var(--on-surface-dim)', borderRadius: 'var(--r-md)',
            padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-mono)',
          }}>✕</button>
        </div>

        {/* Messages */}
        {successMsg && (
          <div style={{ margin: '12px 20px 0', padding: '8px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--ok-glow)', border: '1px solid var(--ok)',
            color: 'var(--ok)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            ✓ {successMsg}
          </div>
        )}
        {error && (
          <div style={{ margin: '12px 20px 0', padding: '8px 14px', borderRadius: 'var(--r-md)',
            background: 'var(--danger-glow)', border: '1px solid var(--danger)',
            color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {error}
            <button onClick={() => setError(null)} style={{
              float: 'right', background: 'none', border: 'none', color: 'var(--danger)',
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>
        )}

        {/* Filters bar */}
        <div style={{
          padding: '10px 20px', borderBottom: '1px solid var(--outline)',
          background: 'var(--surface-mid)',
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelSt, marginBottom: 2 }}>YEAR</label>
            <select style={{ ...selectSt, width: 90 }} value={filters.year}
              onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}>
              <option value="">All</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelSt, marginBottom: 2 }}>QUARTER</label>
            <select style={{ ...selectSt, width: 90 }} value={filters.quarter}
              onChange={e => setFilters(f => ({ ...f, quarter: e.target.value }))}>
              <option value="">All</option>
              {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelSt, marginBottom: 2 }}>STATE</label>
            <select style={{ ...selectSt, width: 110 }} value={filters.jurisdiction_code}
              onChange={e => setFilters(f => ({ ...f, jurisdiction_code: e.target.value }))}>
              <option value="">All</option>
              {iftaJurs.map(j => <option key={j.code} value={j.code}>{j.code}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ ...labelSt, marginBottom: 2 }}>FUEL TYPE</label>
            <select style={{ ...selectSt, width: 110 }} value={filters.fuel_type}
              onChange={e => setFilters(f => ({ ...f, fuel_type: e.target.value }))}>
              <option value="">All</option>
              {FUEL_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={handleApplyFilters} style={{
            padding: '7px 18px', background: 'var(--surface-high)',
            border: '1px solid var(--outline)', borderRadius: 'var(--r-md)',
            color: 'var(--on-surface)', fontFamily: 'var(--font-mono)',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer',
          }}>APPLY</button>
          <button onClick={() => { setShowAddForm(v => !v); setEditingId(null); setError(null); }} style={{
            padding: '7px 18px', background: showAddForm ? 'var(--primary-glow)' : 'var(--primary)',
            border: `1px solid ${showAddForm ? 'var(--primary)' : 'transparent'}`,
            borderRadius: 'var(--r-md)',
            color: showAddForm ? 'var(--primary)' : 'black',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.04em', cursor: 'pointer',
          }}>+ ADD</button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--outline)',
            background: 'var(--surface)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', color: 'var(--primary)', marginBottom: 12 }}>
              ADD FUEL PURCHASE
            </div>
            {renderFormFields(addForm, setAddField)}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={handleAdd} disabled={saving} style={{
                padding: '8px 22px', background: saving ? 'rgba(0,229,255,0.3)' : 'var(--primary)',
                border: 'none', borderRadius: 'var(--r-md)',
                color: 'black', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}>{saving ? 'SAVING...' : 'SAVE'}</button>
              <button onClick={() => { setShowAddForm(false); setAddForm(emptyForm()); setError(null); }} style={{
                padding: '8px 22px', background: 'transparent',
                border: '1px solid var(--outline)', borderRadius: 'var(--r-md)',
                color: 'var(--on-surface-dim)', fontFamily: 'var(--font-mono)', fontSize: 12,
                cursor: 'pointer',
              }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
              fontSize: 13, color: 'var(--on-surface-dim)',
              animation: 'blink 1.2s ease-in-out infinite' }}>
              LOADING...
            </div>
          ) : purchases.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)',
              fontSize: 13, color: 'var(--on-surface-dim)' }}>
              No fuel purchases found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-mid)', borderBottom: '1px solid var(--outline)' }}>
                  {['Date', 'State', 'Station', 'Gallons', '$/Gal', 'Total', 'Type', ''].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                      color: 'var(--on-surface-dim)', letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchases.map((p, i) => {
                  if (editingId === p.id) {
                    return (
                      <tr key={p.id} style={{ background: 'var(--surface)', borderBottom: '1px solid var(--outline)' }}>
                        <td colSpan={8} style={{ padding: '14px 20px' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                            letterSpacing: '0.06em', color: 'var(--warning)', marginBottom: 10 }}>
                            EDIT PURCHASE
                          </div>
                          {renderFormFields(editForm, (field, val) => setEditForm(prev => ({ ...prev, [field]: val })))}
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button onClick={handleSaveEdit} disabled={saving} style={{
                              padding: '7px 18px', background: saving ? 'rgba(0,229,255,0.3)' : 'var(--primary)',
                              border: 'none', borderRadius: 'var(--r-md)', color: 'black',
                              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                            }}>{saving ? 'SAVING...' : 'SAVE'}</button>
                            <button onClick={() => { setEditingId(null); setEditForm({}); setError(null); }} style={{
                              padding: '7px 18px', background: 'transparent',
                              border: '1px solid var(--outline)', borderRadius: 'var(--r-md)',
                              color: 'var(--on-surface-dim)', fontFamily: 'var(--font-mono)', fontSize: 11,
                              cursor: 'pointer',
                            }}>CANCEL</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const dateStr = p.purchase_date
                    ? new Date(p.purchase_date).toLocaleDateString('en-US', { month:'short', day:'2-digit', year:'numeric' })
                    : '—';
                  const gallons   = p.gallons != null ? parseFloat(p.gallons).toFixed(3) : '—';
                  const priceGal  = p.price_per_gallon != null ? `$${parseFloat(p.price_per_gallon).toFixed(3)}` : '—';
                  const totalAmt  = p.total_amount != null ? `$${parseFloat(p.total_amount).toFixed(2)}` : '—';
                  const ftColor   = FUEL_TYPE_COLORS[p.fuel_type] || 'var(--on-surface-dim)';

                  return (
                    <tr key={p.id} style={{
                      borderBottom: '1px solid var(--outline)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        color: 'var(--on-surface-dim)', whiteSpace: 'nowrap' }}>
                        {dateStr}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          borderRadius: 'var(--r-full)', background: 'var(--surface-high)',
                          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                          color: 'var(--on-surface)', letterSpacing: '0.04em',
                        }}>{p.jurisdiction_code}</span>
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: 'var(--on-surface)',
                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.station_name || '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        textAlign: 'right', color: 'var(--on-surface)' }}>
                        {gallons}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        textAlign: 'right', color: 'var(--on-surface-dim)' }}>
                        {priceGal}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12,
                        textAlign: 'right', color: 'var(--on-surface)' }}>
                        {totalAmt}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          borderRadius: 'var(--r-full)', border: `1px solid ${ftColor}`,
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                          color: ftColor, letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>{p.fuel_type}</span>
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => startEdit(p)} title="Edit" style={{
                          marginRight: 6, background: 'transparent',
                          border: '1px solid var(--outline)', borderRadius: 'var(--r-sm)',
                          color: 'var(--on-surface-dim)', padding: '3px 8px', cursor: 'pointer', fontSize: 12,
                        }}>✎</button>
                        <button onClick={() => handleDelete(p.id)} title="Delete" style={{
                          background: 'transparent', border: '1px solid var(--danger)',
                          borderRadius: 'var(--r-sm)', color: 'var(--danger)',
                          padding: '3px 8px', cursor: 'pointer', fontSize: 12,
                        }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div style={{
            padding: '10px 20px', borderTop: '1px solid var(--outline)',
            background: 'var(--surface-mid)', borderRadius: '0 0 var(--r-lg) var(--r-lg)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--on-surface-dim)' }}>
              Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => handlePageChange(-1)} disabled={page === 0} style={{
              background: 'transparent', border: '1px solid var(--outline)',
              borderRadius: 'var(--r-md)', color: page === 0 ? 'var(--on-surface-dim)' : 'var(--on-surface)',
              padding: '4px 14px', cursor: page === 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 12, opacity: page === 0 ? 0.4 : 1,
            }}>←</button>
            <button onClick={() => handlePageChange(1)} disabled={(page + 1) * LIMIT >= total} style={{
              background: 'transparent', border: '1px solid var(--outline)',
              borderRadius: 'var(--r-md)',
              color: (page + 1) * LIMIT >= total ? 'var(--on-surface-dim)' : 'var(--on-surface)',
              padding: '4px 14px', cursor: (page + 1) * LIMIT >= total ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 12,
              opacity: (page + 1) * LIMIT >= total ? 0.4 : 1,
            }}>→</button>
          </div>
        )}
      </div>
    </div>
  );
}
