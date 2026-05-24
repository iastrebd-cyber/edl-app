import { useState, useEffect, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';

function generateHourlyData(drivers) {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
        const hour = new Date(now);
        hour.setHours(hour.getHours() - (23 - i), 0, 0, 0);
        const label = hour.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        const base = Math.max(drivers.length, 3);
        const driving = Math.max(0, Math.round(base * 0.4 + Math.sin(i * 0.5) * base * 0.3 + Math.random() * 1.5));
        const onDuty = Math.max(0, Math.round(base * 0.2 + Math.cos(i * 0.4) * base * 0.15 + Math.random()));
        const offDuty = Math.max(0, base - driving - onDuty);
        return { time: label, Driving: driving, OnDuty: onDuty, OffDuty: offDuty };
    });
}

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: '#0d1828', border: '1px solid rgba(0,200,255,0.2)',
            borderRadius: 8, padding: '10px 14px', fontSize: 12,
        }}>
            <div style={{ color: '#5a7a9a', marginBottom: 6, fontFamily: 'monospace' }}>{label}</div>
            {payload.map(p => (
                <div key={p.name} style={{ color: p.color, marginBottom: 3 }}>
                    {p.name}: <strong>{p.value}</strong>
                </div>
            ))}
        </div>
    );
};

export default function ActivityChart({ drivers }) {
    const [data, setData] = useState(() => generateHourlyData(drivers));
    const [metric, setMetric] = useState('all');
    const intervalRef = useRef(null);

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            setData(prev => {
                const next = [...prev];
                const base = Math.max(drivers.length, 3);
                const last = next[next.length - 1];
                next[next.length - 1] = {
                    ...last,
                    Driving: Math.max(0, Math.round(base * 0.4 + Math.random() * 2 - 1)),
                    OnDuty: Math.max(0, Math.round(base * 0.2 + Math.random() * 1.5 - 0.5)),
                };
                return next;
            });
        }, 10000);
        return () => clearInterval(intervalRef.current);
    }, [drivers.length]);

    const tabs = [
        { key: 'all', label: 'All' },
        { key: 'driving', label: 'Driving' },
        { key: 'onduty', label: 'On Duty' },
    ]; return (
        <div style={{ padding: '20px 16px', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#00c8ff', letterSpacing: '1px' }}>FLEET ACTIVITY</div>
                    <div style={{ fontSize: 10, color: '#5a7a9a', marginTop: 2 }}>24-hour driver status distribution</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setMetric(t.key)} style={{
                            padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            background: metric === t.key ? 'rgba(0,200,255,0.15)' : 'transparent',
                            border: `1px solid ${metric === t.key ? 'rgba(0,200,255,0.4)' : 'rgba(0,200,255,0.1)'}`,
                            color: metric === t.key ? '#00c8ff' : '#5a7a9a',
                        }}>{t.label}</button>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gradDriving" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradOnDuty" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#00c8ff" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#00c8ff" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradOff" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#475569" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#475569" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,200,255,0.05)" />
                        <XAxis dataKey="time" tick={{ fill: '#5a7a9a', fontSize: 9 }} tickLine={false} axisLine={false} interval={5} />
                        <YAxis tick={{ fill: '#5a7a9a', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        {(metric === 'all' || metric === 'driving') && (
                            <Area type="monotone" dataKey="Driving" stroke="#f59e0b" strokeWidth={2} fill="url(#gradDriving)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
                        )}
                        {(metric === 'all' || metric === 'onduty') && (
                            <Area type="monotone" dataKey="OnDuty" stroke="#00c8ff" strokeWidth={2} fill="url(#gradOnDuty)" dot={false} activeDot={{ r: 4, fill: '#00c8ff' }} />
                        )}
                        {metric === 'all' && (
                            <Area type="monotone" dataKey="OffDuty" stroke="#475569" strokeWidth={1} fill="url(#gradOff)" dot={false} />
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div>
                <div style={{ fontSize: 10, color: '#5a7a9a', letterSpacing: '1px', marginBottom: 10 }}>CURRENT STATUS BREAKDOWN</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[
                        { label: 'Driving', count: drivers.filter(d => d.hosStatus === 'D').length, color: '#f59e0b' },
                        { label: 'On Duty', count: drivers.filter(d => d.hosStatus === 'ON').length, color: '#00c8ff' },
                        { label: 'Sleeper', count: drivers.filter(d => d.hosStatus === 'SB').length, color: '#a855f7' },
                        { label: 'Off Duty', count: drivers.filter(d => d.hosStatus === 'OFF').length, color: '#475569' },
                    ].map(s => (
                        <div key={s.label} style={{
                            flex: 1, padding: '10px 12px',
                            background: `${s.color}11`, border: `1px solid ${s.color}33`,
                            borderRadius: 8, textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.count}</div>
                            <div style={{ fontSize: 9, color: '#5a7a9a', marginTop: 3 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(0,200,255,0.08)', paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: '#5a7a9a', letterSpacing: '1px', marginBottom: 10 }}>LIVE DRIVER SPEEDS</div>
                {drivers.length === 0 && (
                    <div style={{ color: '#475569', fontSize: 12, textAlign: 'center', padding: 16 }}>No drivers online</div>
                )}
                {drivers.slice(0, 5).map(d => (
                    <div key={d.id} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                            <span style={{ color: '#94a3b8' }}>{d.name || 'Driver'}</span>
                            <span style={{ fontFamily: 'monospace', color: '#00c8ff' }}>{d.speed || 0} mph</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(0,200,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${Math.min(100, ((d.speed || 0) / 80) * 100)}%`,
                                background: d.speed > 65 ? '#ff4466' : d.speed > 45 ? '#f59e0b' : '#00c8ff',
                                borderRadius: 2, transition: 'width 0.5s ease',
                            }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}