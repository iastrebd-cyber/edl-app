# ELD Database — PostgreSQL Schema

Full schema for the ELD/EDL application. 8 migrations, 11 tables, 40+ indexes.

## Setup

```bash
# Install dependencies
npm install

# Create the database
createdb eld_dev

# Run all migrations
npx knex migrate:latest --env development

# Load dev seed data
npx knex seed:run --env development
```

## Table Overview

```
001  carriers           Motor carriers (USDOT-registered companies)
001  eld_devices        Physical ELD hardware units
002  users              All authenticated accounts (all roles)
002  vehicles           CMV trucks registered to a carrier
003  drivers            Driver-specific data, extends users
004  duty_sessions      One session = one driver's 24-hour log day
005  hos_events         ⬅ CORE — immutable HOS event log (FMCSA §395.26)
006  gps_breadcrumbs    Continuous position trail (every ~60s)
006  violations         Detected HOS violations (computed)
006  dvir_reports       Pre/post-trip vehicle inspections (FMCSA §396.11)
007  trips              Freight loads assigned to drivers
007  audit_log          Immutable change log (FMCSA §395.8(i))
007  notifications      Outbound push/SMS/email queue
008  eld_transfers      DOT inspector data transfer records
```

## Dependency Order (FK hierarchy)

```
carriers ──────────────────────────────────────┐
eld_devices ──────────────────────────────────┐│
                                               ││
users ────────────────────────────────────────┐││
vehicles (→ carriers, eld_devices) ──────────┐│││
                                              ││││
drivers (→ users, carriers, vehicles) ───────┐││││
                                             │││││
duty_sessions (→ drivers, vehicles,         ││││││
               carriers, users)             ││││││
                                            ││││││
hos_events (→ sessions, drivers,           ┘│││││
             vehicles, users, eld_devices)  │││││
                                            │││││
gps_breadcrumbs (→ vehicles, drivers,      ┘││││
                  sessions)                 │││││
violations (→ drivers, sessions,           ┘││││
             hos_events, users)             ││││
dvir_reports (→ drivers, vehicles,        ┘│││
              carriers, sessions)          │││
trips (→ carriers, users, drivers,        ┘││
        vehicles)                          ││
audit_log (→ users)                       ┘│
notifications (→ users, violations,        │
                trips, sessions)          ┘
eld_transfers (→ drivers, carriers)
```

## Critical Rules

### hos_events is APPEND-ONLY

**Never run `UPDATE` or `DELETE` on `hos_events`.**

FMCSA §395.8(i) requires a complete, unaltered audit trail of all duty status changes.

To edit a log entry:
```sql
-- Step 1: Mark the old event as superseded
UPDATE hos_events
SET record_status = '2'          -- inactive-changed
WHERE id = 'old-event-uuid';

-- Step 2: Insert the corrected record
INSERT INTO hos_events (
  session_id, driver_id, vehicle_id,
  event_type, event_code, event_datetime,
  latitude, longitude, location_description,
  distance_since_last, accumulated_miles, engine_hours,
  sequence_id, record_origin, record_status,
  original_event_id, edit_reason,  -- required when record_origin = '2'
  jurisdiction, created_at
) VALUES (
  ...,
  '2',                   -- record_origin: driver edit
  '1',                   -- record_status: active
  'old-event-uuid',      -- original_event_id
  'Incorrect status — was stopped for pre-trip inspection',
  ...
);
```

### All timestamps in UTC

Store all timestamps as `TIMESTAMPTZ` in UTC. Convert to the driver's home terminal timezone only for display and HOS calculations.

```js
// In HOS Calculator:
const homeTerminalTz = session.home_terminal_timezone; // 'America/Chicago'
const localDate = toZonedTime(event.event_datetime, homeTerminalTz);
```

### sequence_id must be monotonically increasing per session

The FMCSA ELD output file uses `sequence_id` to detect data integrity issues. Always assign the next sequence_id using:

```sql
SELECT COALESCE(MAX(sequence_id), 0) + 1
FROM hos_events
WHERE session_id = $1;
```

### Edit reason is required for driver/admin edits

The `chk_edit_reason_required` constraint enforces this at the DB level. Do not bypass it.

## Index Strategy

### Hot path: HOS Calculator (runs after every event)

```sql
-- Uses: idx_hos_events_driver_time
SELECT * FROM hos_events
WHERE driver_id = $1
  AND event_datetime >= NOW() - INTERVAL '8 days'
  AND record_status = '1'
ORDER BY event_datetime ASC;
```

### Hot path: Fleet map update (every 60s per vehicle)

```sql
-- Uses: idx_gps_vehicle_time
SELECT latitude, longitude, recorded_at
FROM gps_breadcrumbs
WHERE vehicle_id = $1
ORDER BY recorded_at DESC
LIMIT 1;
```

### Hot path: Dispatcher alerts panel

```sql
-- Uses: idx_violations_unacked
SELECT v.*, u.first_name, u.last_name
FROM violations v
JOIN drivers d ON d.id = v.driver_id
JOIN users u ON u.id = d.user_id
WHERE d.carrier_id = $1
  AND v.acknowledged = FALSE
ORDER BY v.occurred_at DESC;
```

## FMCSA Event Type / Code Reference

| event_type | Meaning           | event_code values                     |
|------------|-------------------|---------------------------------------|
| 1          | Duty status change | 1=OFF  2=SB  3=D  4=ON               |
| 2          | Intermediate log  | 1=Position (auto every 60min Driving) |
| 3          | Driver login      | 1=Login  2=Logout                     |
| 4          | CMV power         | 1=PowerOn  2=PowerOff  3=EngineOn  4=EngineOff |
| 5          | Malfunction       | P E T L R S O (malfunction codes)    |

| record_origin | Meaning                                   |
|---------------|-------------------------------------------|
| '1'           | Automatically recorded by ELD             |
| '2'           | Edited or entered by driver               |
| '3'           | Edited by authenticated user (dispatcher) |
| '4'           | Unidentified driver (no login)            |

| record_status | Meaning                       |
|---------------|-------------------------------|
| '1'           | Active                        |
| '2'           | Inactive – changed (edited)   |
| '3'           | Inactive – deactivated        |
| '4'           | Change requested (pending)    |

## Useful Queries

### Get last 8 days of events for HOS calculation

```sql
SELECT e.*
FROM hos_events e
WHERE e.driver_id = $1
  AND e.event_datetime >= NOW() AT TIME ZONE 'UTC' - INTERVAL '8 days'
  AND e.record_status = '1'
ORDER BY e.event_datetime ASC;
```

### Get today's session (or create if missing)

```js
const today = format(
  toZonedTime(new Date(), driver.home_terminal_timezone),
  'yyyy-MM-dd'
);

let session = await knex('duty_sessions')
  .where({ driver_id: driverId, session_date: today })
  .first();

if (!session) {
  [session] = await knex('duty_sessions')
    .insert({ driver_id: driverId, session_date: today, ... })
    .returning('*');
}
```

### Pending DVIR mechanic reviews

```sql
SELECT d.*, v.plate_number, v.make, v.model,
       u.first_name || ' ' || u.last_name AS driver_name
FROM dvir_reports d
JOIN vehicles v ON v.id = d.vehicle_id
JOIN drivers dr ON dr.id = d.driver_id
JOIN users u ON u.id = dr.user_id
WHERE d.defects_found = TRUE
  AND d.mechanic_reviewed_at IS NULL
  AND d.carrier_id = $1
ORDER BY d.created_at DESC;
```

## Environment Variables

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=eld_dev
DB_USER=postgres
DB_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eld_dev
```
