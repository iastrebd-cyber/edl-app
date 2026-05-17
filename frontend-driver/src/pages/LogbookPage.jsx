/**
 * src/pages/LogbookPage.jsx
 *
 * Full logbook screen:
 *   - 24-hour SVG grid
 *   - Event list (chronological)
 *   - Day navigation (prev/next)
 *   - Certify button
 */

import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { useTranslation }      from 'react-i18next';
import { useAuth }             from '../store/AuthContext';
import { useHOS }              from '../store/HOSContext';
import { hosAPI, sessionsAPI } from '../api/client';
import LogbookGrid             from '../components/hos/LogbookGrid';

const STATUS_LABELS = { OFF: 'Off Duty', SB: 'Sleeper Berth', D: 'Driving', ON: 'On Duty' };
const STATUS_COLORS = { OFF: '#64748b', SB: '#6366f1', D: '#22c55e', ON: '#f59e0b' };
const CODE_MAP      = { '1': 'OFF', '2': 'SB', '3': 'D', '4': 'ON' };

export default function LogbookPage() {
  const { t }              = useTranslation();
  const navigate           = useNavigate();
  const { driver }         = useAuth();
  const { session }        = useHOS();

  // Current displayed date
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [events,   setEvents]   = useState([]);
  const [daySession, setDaySession] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [certifying, setCertifying] = useState(false);
  const [error,    setError]    = useState(null);

  // Load events for displayed date
  useEffect(() => {
    if (!driver?.id) return;
    loadDayData();
  }, [date, driver?.id]);

  async function loadDayData() {
    setLoading(true);
    setError(null);
    try {
      // Find session for this date
      const { data: sessData } = await sessionsAPI.getHistory(driver.id, 14);
      const found = sessData.sessions?.find(s => s.session_date?.slice(0, 10) === date);

      if (found) {
        setDaySession(found);
        const { data } = await hosAPI.getSessionEvents(found.id);
        setEvents(data.events || []);
      } else {
        setDaySession(null);
        setEvents([]);
      }
    } catch (err) {
      setError('Failed to load logbook data');
    } finally {
      setLoading(false);
    }
  }

  const goToPrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };

  const goToNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const today = new Date().toISOString().slice(0, 10);
    if (d.toISOString().slice(0, 10) <= today) {
      setDate(d.toISOString().slice(0, 10));
    }
  };

  const isToday = date === new Date().toISOString().slice(0, 10);

  const handleCertify = async () => {
    if (!daySession) return;
    setCertifying(true);
    try {
      // Simple text signature for now (canvas in step 2.6)
      const sig = `Certified by driver on ${new Date().toISOString()}`;
      await hosAPI.certifySession(daySession.id, sig);
      await loadDayData();
    } catch (err) {
      setError(err.response?.data?.message || 'Certification failed');
    } finally {
      setCertifying(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f1f5f9',
      maxWidth: 480,
      margin: '0 auto',
      paddingBottom: 40,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: '#64748b',
            fontSize: 20, cursor: 'pointer', padding: 0 }}>
          ←
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>{t('logbook')}</h1>
        {daySession?.status === 'certified' && (
          <span style={{ fontSize: 11, color: '#22c55e', background: '#052e16',
            padding: '3px 8px', borderRadius: 20, border: '1px solid #22c55e' }}>
            ✓ {t('certified')}
          </span>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {/* Day navigator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <button onClick={goToPrevDay}
            style={{ background: '#1e293b', border: '1px solid #334155',
              color: '#94a3b8', borderRadius: 8, padding: '8px 14px',
              cursor: 'pointer', fontSize: 16 }}>
            ‹
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
              })}
            </div>
            {isToday && (
              <div style={{ color: '#3b82f6', fontSize: 11 }}>{t('today')}</div>
            )}
          </div>

          <button onClick={goToNextDay}
            disabled={isToday}
            style={{ background: '#1e293b', border: '1px solid #334155',
              color: isToday ? '#334155' : '#94a3b8',
              borderRadius: 8, padding: '8px 14px',
              cursor: isToday ? 'default' : 'pointer', fontSize: 16 }}>
            ›
          </button>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#475569', padding: 20 }}>
            {t('loading')}
          </div>
        )}
        {error && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12,
            padding: '8px 12px', background: '#450a0a',
            borderRadius: 8, border: '1px solid #ef4444' }}>
            {error}
          </div>
        )}

        {/* Logbook Grid */}
        {!loading && (
          <div style={{ marginBottom: 16 }}>
            <LogbookGrid
              events={events}
              sessionDate={date}
              timezone={daySession?.home_terminal_timezone || 'America/Chicago'}
            />
          </div>
        )}

        {/* Event list */}
        {events.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ color: '#64748b', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 10 }}>
              Events
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {events
                .filter(e => e.record_status === '1')
                .sort((a, b) => new Date(a.event_datetime) - new Date(b.event_datetime))
                .map((event, i) => {
                  const status = CODE_MAP[String(event.event_code)] || 'OFF';
                  const color  = STATUS_COLORS[status];
                  const time   = new Date(event.event_datetime)
                    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={event.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: '#1e293b',
                      borderRadius: 8,
                      border: '1px solid #334155',
                    }}>
                      <div style={{
                        width: 36, height: 36,
                        borderRadius: 8,
                        background: color + '22',
                        border: `1px solid ${color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color,
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}>
                        {status}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
                          {STATUS_LABELS[status]}
                          {event.special_condition === 'personal_conveyance' && (
                            <span style={{ color: '#6366f1', fontSize: 11, marginLeft: 6 }}>PC</span>
                          )}
                          {event.special_condition === 'yard_move' && (
                            <span style={{ color: '#f59e0b', fontSize: 11, marginLeft: 6 }}>YM</span>
                          )}
                        </div>
                        {event.annotation && (
                          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                            {event.annotation}
                          </div>
                        )}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }}>
                        {time}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* No events */}
        {!loading && events.length === 0 && (
          <div style={{
            textAlign: 'center', color: '#475569',
            padding: 40, background: '#1e293b',
            borderRadius: 12, border: '1px solid #334155',
          }}>
            No events recorded for this day
          </div>
        )}

        {/* Certify button */}
        {daySession && daySession.status !== 'certified' && events.length > 0 && (
          <button
            onClick={handleCertify}
            disabled={certifying}
            style={{
              width: '100%', padding: '14px 0',
              background: certifying ? '#334155' : '#22c55e',
              border: 'none', borderRadius: 10,
              color: certifying ? '#64748b' : '#000',
              fontWeight: 700, fontSize: 15,
              cursor: certifying ? 'not-allowed' : 'pointer',
            }}
          >
            {certifying ? 'Certifying...' : `✓ ${t('certify')}`}
          </button>
        )}
      </div>
    </div>
  );
}
