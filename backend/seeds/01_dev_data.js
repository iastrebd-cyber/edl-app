'use strict';

const bcrypt = require('bcrypt'); // npm install bcrypt

/**
 * Seed: development data for local testing
 *
 * Creates:
 *   - 1 carrier (Swift Transport demo)
 *   - 2 ELD devices
 *   - 3 vehicles
 *   - 1 admin user + 1 dispatcher user + 2 driver users
 *   - 2 driver profiles
 *
 * Run: npx knex seed:run --env development
 */

const CARRIER_ID    = '11111111-1111-1111-1111-111111111111';
const ELD_1         = '22222222-2222-2222-2222-222222222222';
const ELD_2         = '33333333-3333-3333-3333-333333333333';
const VEHICLE_1     = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VEHICLE_2     = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VEHICLE_3     = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ADMIN    = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_DISP     = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const USER_DRIVER1  = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const USER_DRIVER2  = '00000000-0000-0000-aaaa-000000000000';
const DRIVER_1      = '12345678-1234-1234-1234-123456789012';
const DRIVER_2      = '87654321-4321-4321-4321-876543210987';

exports.seed = async (knex) => {
  // Clean in reverse FK order
  await knex('violations').del();
  await knex('dvir_reports').del();
  await knex('gps_breadcrumbs').del();
  await knex('hos_events').del();
  await knex('duty_sessions').del();
  await knex('trips').del();
  await knex('notifications').del();
  await knex('eld_transfers').del();
  await knex('drivers').del();
  await knex('users').del();
  await knex('vehicles').del();
  await knex('eld_devices').del();
  await knex('carriers').del();

  const passwordHash = await bcrypt.hash('Password1!', 12);

  // ── Carrier ──────────────────────────────────
  await knex('carriers').insert({
    id:                    CARRIER_ID,
    name:                  'Swift Transport Demo',
    usdot_number:          '123456',
    mc_number:             'MC-654321',
    home_terminal_timezone:'America/Chicago',
    default_hos_cycle:     'usa_70',
    operates_in_canada:    false,
    main_office_address:   '2200 S 75th Ave, Phoenix, AZ 85043',
    phone:                 '+1-800-800-1234',
    email:                 'safety@swiftdemo.com',
  });

  // ── ELD Devices ───────────────────────────────
  await knex('eld_devices').insert([
    {
      id:                ELD_1,
      carrier_id:        CARRIER_ID,
      serial_number:     'SAM-VG54-00001',
      manufacturer:      'Samsara',
      model:             'VG54',
      firmware_version:  '4.2.1',
      registration_id:   'FMCSA-REG-00001',
      fmcsa_certified:   true,
      connection_type:   'bluetooth',
    },
    {
      id:                ELD_2,
      carrier_id:        CARRIER_ID,
      serial_number:     'KT-VG34-00002',
      manufacturer:      'Motive',
      model:             'VG34',
      firmware_version:  '3.8.0',
      fmcsa_certified:   true,
      connection_type:   'bluetooth',
    },
  ]);

  // ── Vehicles ──────────────────────────────────
  await knex('vehicles').insert([
    {
      id:              VEHICLE_1,
      carrier_id:      CARRIER_ID,
      eld_device_id:   ELD_1,
      vin:             '1XPWD40X1ED215307',
      plate_number:    'AZ-ELD-001',
      plate_state:     'AZ',
      make:            'Peterbilt',
      model:           '579',
      year:            2021,
      fuel_type:       'diesel',
      vehicle_type:    'truck',
      current_odometer:    158340.5,
      current_engine_hours: 4250.25,
    },
    {
      id:              VEHICLE_2,
      carrier_id:      CARRIER_ID,
      eld_device_id:   ELD_2,
      vin:             '3HSDJSJR0CN097421',
      plate_number:    'AZ-ELD-002',
      plate_state:     'AZ',
      make:            'Kenworth',
      model:           'T680',
      year:            2022,
      fuel_type:       'diesel',
      vehicle_type:    'truck',
      current_odometer:    87200.0,
      current_engine_hours: 2100.0,
    },
    {
      id:              VEHICLE_3,
      carrier_id:      CARRIER_ID,
      vin:             '4V4NC9EH6EN171723',
      plate_number:    'AZ-ELD-003',
      plate_state:     'AZ',
      make:            'Volvo',
      model:           'VNL 860',
      year:            2023,
      fuel_type:       'diesel',
      vehicle_type:    'truck',
      current_odometer: 14500.0,
      current_engine_hours: 380.0,
    },
  ]);

  // ── Users ─────────────────────────────────────
  await knex('users').insert([
    {
      id:             USER_ADMIN,
      carrier_id:     CARRIER_ID,
      email:          'admin@swiftdemo.com',
      password_hash:  passwordHash,
      role:           'admin',
      first_name:     'Alex',
      last_name:      'Admin',
      phone:          '+1-555-000-0001',
      timezone:       'America/Chicago',
      language:       'en',
      email_verified: true,
    },
    {
      id:             USER_DISP,
      carrier_id:     CARRIER_ID,
      email:          'dispatch@swiftdemo.com',
      password_hash:  passwordHash,
      role:           'dispatcher',
      first_name:     'Dana',
      last_name:      'Dispatcher',
      phone:          '+1-555-000-0002',
      timezone:       'America/Chicago',
      language:       'en',
      email_verified: true,
    },
    {
      id:             USER_DRIVER1,
      carrier_id:     CARRIER_ID,
      email:          'driver1@swiftdemo.com',
      password_hash:  passwordHash,
      role:           'driver',
      first_name:     'John',
      last_name:      'Smith',
      phone:          '+1-555-100-0001',
      license_number: 'S123456789',
      license_state:  'AZ',
      timezone:       'America/Chicago',
      language:       'en',
      email_verified: true,
    },
    {
      id:             USER_DRIVER2,
      carrier_id:     CARRIER_ID,
      email:          'driver2@swiftdemo.com',
      password_hash:  passwordHash,
      role:           'driver',
      first_name:     'Maria',
      last_name:      'Garcia',
      phone:          '+1-555-100-0002',
      license_number: 'G987654321',
      license_state:  'TX',
      timezone:       'America/Chicago',
      language:       'es',   // Spanish UI
      email_verified: true,
    },
  ]);

  // ── Drivers ───────────────────────────────────
  await knex('drivers').insert([
    {
      id:               DRIVER_1,
      user_id:          USER_DRIVER1,
      carrier_id:       CARRIER_ID,
      hos_cycle:        'usa_70',
      current_status:   'OFF',
      current_vehicle_id: VEHICLE_1,
      is_active:        true,
    },
    {
      id:               DRIVER_2,
      user_id:          USER_DRIVER2,
      carrier_id:       CARRIER_ID,
      hos_cycle:        'usa_70',
      current_status:   'OFF',
      current_vehicle_id: VEHICLE_2,
      is_active:        true,
    },
  ]);

  console.log('✓ Seed complete — dev data inserted');
  console.log('  Login: driver1@swiftdemo.com / Password1!');
  console.log('  Login: dispatch@swiftdemo.com / Password1!');
  console.log('  Login: admin@swiftdemo.com / Password1!');
};
