/**
 * C:\Users\RegenU3\eld-app\frontend-dispatcher\src\components\FleetMap.jsx
 *
 * Карта с живыми маркерами грузовиков (Leaflet + react-leaflet).
 * Каждый маркер показывает: имя, HOS статус, скорость.
 * При клике — выделяет водителя в списке слева.
 */
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ── Исправление стандартных иконок Leaflet (Vite ломает пути) ── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ── Цвета HOS статусов ── */
const HOS_COLOR = {
  OFF: '#64748b',
  SB:  '#8b5cf6',
  D:   '#22c55e',
  ON:  '#f59e0b',
};

const HOS_LABEL = {
  OFF: 'Off Duty',
  SB:  'Sleeper Berth',
  D:   'Driving',
  ON:  'On Duty',
};

/* ── Создаём кастомный маркер-грузовик ── */
function truckIcon(hosStatus, selected) {
  const color  = HOS_COLOR[hosStatus] || '#64748b';
  const border = selected ? '#fff' : color;
  const size   = selected ? 44 : 36;

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" fill="${color}" stroke="${border}" stroke-width="${selected ? 3 : 2}" opacity="0.95"/>
      <text x="20" y="26" text-anchor="middle" font-size="18" fill="white">🚛</text>
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -size / 2],
  });
}

/* ── Автоцентрирование на выбранном водителе ── */
function MapController({ selected, drivers }) {
  const map = useMap();
  useEffect(() => {
    if (selected && drivers[selected]) {
      const d = drivers[selected];
      if (d.latitude && d.longitude) {
        map.setView([d.latitude, d.longitude], 12, { animate: true });
      }
    }
  }, [selected, drivers, map]);
  return null;
}

/* ── Главный компонент ── */
export default function FleetMap({ drivers, selected, onSelect }) {
  const driverList = Object.values(drivers).filter(d => d.latitude && d.longitude);

  return (
    <MapContainer
      center={[39.8283, -98.5795]}   // центр США по умолчанию
      zoom={5}
      style={{ height: '100%', width: '100%', background: '#0f172a' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      <MapController selected={selected} drivers={drivers} />

      {driverList.map(driver => (
        <Marker
          key={driver.id}
          position={[driver.latitude, driver.longitude]}
          icon={truckIcon(driver.hosStatus, selected === driver.id)}
          eventHandlers={{ click: () => onSelect(driver.id) }}
        >
          <Popup>
            <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                🚛 {driver.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                <span>
                  <b>Status:</b>{' '}
                  <span style={{ color: HOS_COLOR[driver.hosStatus] }}>
                    {HOS_LABEL[driver.hosStatus] || driver.hosStatus}
                  </span>
                </span>
                <span><b>Speed:</b> {driver.speed || 0} mph</span>
                <span><b>Odometer:</b> {driver.odometer || 0} mi</span>
                <span style={{ color: driver.online ? '#22c55e' : '#ef4444' }}>
                  {driver.online ? '● Online' : '○ Offline'}
                </span>
                <span style={{ color: '#64748b', fontSize: 10 }}>
                  {driver.lastSeen ? new Date(driver.lastSeen).toLocaleTimeString() : ''}
                </span>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Пустое состояние */}
      {driverList.length === 0 && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000, textAlign: 'center',
          color: '#475569', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 48 }}>🚛</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Waiting for driver locations…
          </div>
        </div>
      )}
    </MapContainer>
  );
}
