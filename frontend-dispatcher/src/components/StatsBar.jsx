import { useMemo } from 'react';

export default function StatsBar({ drivers, alerts }) {
    const stats = useMemo(() => {
        const online = drivers.filter(d => d.online).length;
        const driving = drivers.filter(d => d.hosStatus === 'D').length;
        const hosWarn = alerts.filter(a => a.type === 'hos').length;
        const avgSpeed = drivers.filter(d => d.speed > 0).length
            ? Math.round(drivers.filter(d => d.speed > 0).reduce((s, d) => s + (d.speed || 0), 0) / drivers.filter(d => d.speed > 0).length)
            : 0;
        return { total: drivers.length, online, driving, hosWarn, avgSpeed };
    }, [drivers, alerts]);

    return (
        <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
            <StatCard label="TOTAL DRIVERS" value={stats.total} color="#00c8ff" icon="👥" />
            <StatCard label="ONLINE" value={stats.online} color="#00ff88" icon="📡" />
            <StatCard label="DRIVING" value={stats.driving} color="#f59e0b" icon="🚛" />
            <StatCard label="HOS ALERTS" value={stats.hosWarn} color="#ff4466" icon="⚠️" warn={stats.hosWarn > 0} />
            <StatCard label="AVG SPEED" value={`${stats.avgSpeed} mph`} color="#a855f7" icon="⚡" />
        </div>
    );
}

function StatCard({ label, value, color, icon, warn }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 12px',
            background: warn ? 'rgba(255,68,102,0.08)' : 'rgba(0,0,0,0.3)',
            border: `1px solid ${warn ? 'rgba(255,68,102,0.3)' : 'rgba(0,200,255,0.1)'}`,
            borderRadius: 8, minWidth: 90,
        }}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <div>
                <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                    {value}
                </div>
                <div style={{ fontSize: 8, color: '#5a7a9a', letterSpacing: '1px', marginTop: 2 }}>
                    {label}
                </div>
            </div>
        </div>
    );
}