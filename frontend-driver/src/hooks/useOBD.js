/**
 * C:\Users\RegenU3\eld-app\frontend-driver\src\hooks\useOBD.js
 *
 * WebBluetooth + OBD-II bridge для ELD.
 * Подключается к ELM327 / OBD адаптеру через Bluetooth Low Energy.
 *
 * Читает:
 *   - Скорость (PID 0x0D) — mph
 *   - Обороты двигателя (PID 0x0C) — RPM
 *   - Моточасы (PID 0x7F) — hours
 *   - Статус двигателя (on/off)
 *
 * FMCSA требует интеграцию с ECM для сертифицированных ELD.
 * Ref: 49 CFR §395.26(b) — engine synchronization
 */

import { useState, useRef, useCallback } from 'react';

/* ── Bluetooth UUIDs для ELM327 ── */
const ELM327_SERVICE  = '0000fff0-0000-1000-8000-00805f9b34fb';
const ELM327_CHAR_TX  = '0000fff1-0000-1000-8000-00805f9b34fb'; // write
const ELM327_CHAR_RX  = '0000fff2-0000-1000-8000-00805f9b34fb'; // notify

/* ── OBD PID команды ── */
const PID = {
  SPEED:       '010D\r', // Vehicle speed (km/h)
  RPM:         '010C\r', // Engine RPM
  ENGINE_LOAD: '0104\r', // Engine load %
  ENGINE_HOURS:'017F\r', // Engine run time (hours)
  VIN:         '0902\r', // Vehicle VIN
};

/* ── Парсинг OBD ответов ── */
function parseOBD(pid, response) {
  try {
    // Убираем echo, пробелы, спецсимволы
    const clean = response.replace(/[^0-9A-Fa-f\s]/g, '').trim();
    const bytes  = clean.split(/\s+/).map(b => parseInt(b, 16));

    switch (pid) {
      case 'SPEED': {
        // 41 0D XX — скорость в км/ч
        const kmh = bytes[2] || 0;
        return Math.round(kmh * 0.621371); // → mph
      }
      case 'RPM': {
        // 41 0C A B — RPM = (A*256+B)/4
        const rpm = ((bytes[2] * 256) + bytes[3]) / 4;
        return Math.round(rpm);
      }
      case 'ENGINE_LOAD': {
        // 41 04 XX — load = XX*100/255
        return Math.round((bytes[2] / 255) * 100);
      }
      case 'ENGINE_HOURS': {
        // 41 7F A B C — hours = (A*65536+B*256+C)/3600
        const secs = (bytes[2] * 65536) + (bytes[3] * 256) + bytes[4];
        return Math.round(secs / 3600 * 10) / 10;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/* ── Главный хук ── */
export function useOBD() {
  const [connected,   setConnected]   = useState(false);
  const [connecting,  setConnecting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [deviceName,  setDeviceName]  = useState(null);

  const [speed,       setSpeed]       = useState(0);
  const [rpm,         setRpm]         = useState(0);
  const [engineLoad,  setEngineLoad]  = useState(0);
  const [engineHours, setEngineHours] = useState(0);
  const [engineOn,    setEngineOn]    = useState(false);

  const deviceRef   = useRef(null);
  const charTxRef   = useRef(null);
  const pollTimer   = useRef(null);
  const rxBufferRef = useRef('');
  const pendingPID  = useRef(null);

  /* ── Отправить AT/OBD команду ── */
  const sendCommand = useCallback(async (cmd) => {
    if (!charTxRef.current) return;
    const encoder = new TextEncoder();
    await charTxRef.current.writeValue(encoder.encode(cmd));
  }, []);

  /* ── Обработка входящих данных ── */
  const handleRx = useCallback((event) => {
    const decoder = new TextDecoder();
    const chunk   = decoder.decode(event.target.value);
    rxBufferRef.current += chunk;

    // Ждём промпт '>' — признак конца ответа
    if (rxBufferRef.current.includes('>')) {
      const response = rxBufferRef.current;
      rxBufferRef.current = '';

      if (!pendingPID.current) return;
      const value = parseOBD(pendingPID.current, response);

      switch (pendingPID.current) {
        case 'SPEED':       if (value !== null) { setSpeed(value); setEngineOn(value >= 0); } break;
        case 'RPM':         if (value !== null) { setRpm(value); setEngineOn(value > 0); }   break;
        case 'ENGINE_LOAD': if (value !== null) setEngineLoad(value);   break;
        case 'ENGINE_HOURS':if (value !== null) setEngineHours(value);  break;
      }
    }
  }, []);

  /* ── Цикл опроса OBD (каждые 2 сек) ── */
  const startPolling = useCallback(() => {
    const pids = ['SPEED', 'RPM', 'ENGINE_LOAD', 'ENGINE_HOURS'];
    let i = 0;

    pollTimer.current = setInterval(async () => {
      if (!charTxRef.current) return;
      pendingPID.current = pids[i % pids.length];
      await sendCommand(PID[pendingPID.current]);
      i++;
    }, 2000);
  }, [sendCommand]);

  /* ── Подключиться ── */
  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);

    try {
      // Проверка поддержки WebBluetooth
      if (!navigator.bluetooth) {
        throw new Error('WebBluetooth not supported. Use Chrome on Android/Desktop.');
      }

      // Запрос устройства
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { name: 'OBDII' },
          { name: 'ELM327' },
          { name: 'OBD' },
          { namePrefix: 'V-Link' },
          { namePrefix: 'Kiwi' },
        ],
        optionalServices: [ELM327_SERVICE],
      });

      deviceRef.current = device;
      setDeviceName(device.name);

      device.addEventListener('gattserverdisconnected', () => {
        setConnected(false);
        setEngineOn(false);
        clearInterval(pollTimer.current);
        console.log('[OBD] Device disconnected');
      });

      // Подключаемся к GATT серверу
      const server  = await device.gatt.connect();
      const service = await server.getPrimaryService(ELM327_SERVICE);

      // TX — для записи команд
      charTxRef.current = await service.getCharacteristic(ELM327_CHAR_TX);

      // RX — для чтения ответов
      const charRx = await service.getCharacteristic(ELM327_CHAR_RX);
      await charRx.startNotifications();
      charRx.addEventListener('characteristicvaluechanged', handleRx);

      // Инициализация ELM327
      await sendCommand('ATZ\r');    // Reset
      await new Promise(r => setTimeout(r, 1000));
      await sendCommand('ATE0\r');   // Echo off
      await sendCommand('ATL0\r');   // Linefeeds off
      await sendCommand('ATS0\r');   // Spaces off
      await sendCommand('ATH0\r');   // Headers off
      await sendCommand('ATSP0\r'); // Auto protocol

      setConnected(true);
      setConnecting(false);
      startPolling();

    } catch (err) {
      setError(err.message || 'Connection failed');
      setConnecting(false);
    }
  }, [handleRx, sendCommand, startPolling]);

  /* ── Отключиться ── */
  const disconnect = useCallback(() => {
    clearInterval(pollTimer.current);
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setConnected(false);
    setEngineOn(false);
    setDeviceName(null);
    charTxRef.current = null;
  }, []);

  return {
    connected,
    connecting,
    error,
    deviceName,
    speed,
    rpm,
    engineLoad,
    engineHours,
    engineOn,
    connect,
    disconnect,
  };
}
