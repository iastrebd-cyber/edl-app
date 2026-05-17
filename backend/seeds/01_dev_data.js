'use strict';

const bcrypt = require('bcrypt');

/**
 * Seed: development data — uses gen_random_uuid() for all IDs
 */

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

  // ── Carrier ──────────────────────────────────────────────────
  const [carrier] = await knex('carriers').insert({
    name:                   'Swift Transport Demo',
    usdot_number:           '123456',
    mc_number:              'MC-654321',
    home_terminal_timezone: 'America/Chicago',
    default_hos_cycle:      'usa_70',
    operates_in_canada:     false,
    main_office_address:    '2200 S 75th Ave, Phoenix, AZ 85043',
    phone:                  '+1-800-800-1234',
    email:                  'safety@swiftdemo.com',
  }).returning('id');

  const carrierId = carrier.id || carrier;

  // ── ELD Devices ───────────────────────────────────────────────
  const [eld1] = await knex('eld_devices').insert({
    carrier_id:      carrierId,
    serial_number:   'SAM-VG54-00001',
    manufacturer:    'Samsara',
    model:           'VG54',
    firmware_version:'4.2.1',
    registration_id: 'FMCSA-REG-00001',
    fmcsa_certified: true,
    connection_type: 'bluetooth',
  }).returning('id');

  const eld1Id = eld1.id || eld1;

  // ── Vehicles ──────────────────────────────────────────────────
  const [vehicle1] = await knex('vehicles').insert({
    carrier_id:           carrierId,
    eld_device_id:        eld1Id,
    vin:                  '1XPWD40X1ED215307',
    plate_number:         'AZ-ELD-001',
    plate_state:          'AZ',
    make:                 'Peterbilt',
    model:                '579',
    year:                 2021,
    fuel_type:            'diesel',
    vehicle_type:         'truck',
    current_odometer:     158340.5,
    current_engine_hours: 4250.25,
  }).returning('id');

  const vehicle1Id = vehicle1.id || vehicle1;

  // ── Users ─────────────────────────────────────────────────────
  const [userAdmin] = await knex('users').insert({
    carrier_id:     carrierId,
    email:          'admin@swiftdemo.com',
    password_hash:  passwordHash,
    role:           'admin',
    first_name:     'Alex',
    last_name:      'Admin',
    phone:          '+1-555-000-0001',
    timezone:       'America/Chicago',
    language:       'en',
    email_verified: true,
  }).returning('id');

  const [userDisp] = await knex('users').insert({
    carrier_id:     carrierId,
    email:          'dispatch@swiftdemo.com',
    password_hash:  passwordHash,
    role:           'dispatcher',
    first_name:     'Dana',
    last_name:      'Dispatcher',
    phone:          '+1-555-000-0002',
    timezone:       'America/Chicago',
    language:       'en',
    email_verified: true,
  }).returning('id');

  const [userDriver1] = await knex('users').insert({
    carrier_id:      carrierId,
    email:           'driver1@swiftdemo.com',
    password_hash:   passwordHash,
    role:            'driver',
    first_name:      'John',
    last_name:       'Smith',
    phone:           '+1-555-100-0001',
    license_number:  'S123456789',
    license_state:   'AZ',
    timezone:        'America/Chicago',
    language:        'en',
    email_verified:  true,
  }).returning('id');

  const userDriver1Id = userDriver1.id || userDriver1;

  // ── Drivers ───────────────────────────────────────────────────
  await knex('drivers').insert({
    user_id:            userDriver1Id,
    carrier_id:         carrierId,
    hos_cycle:          'usa_70',
    current_status:     'OFF',
    current_vehicle_id: vehicle1Id,
    is_active:          true,
  });

  console.log('\n✓ Seed complete');
  console.log('  Login: driver1@swiftdemo.com / Password1!');
  console.log('  Login: dispatch@swiftdemo.com / Password1!');
  console.log('  Login: admin@swiftdemo.com / Password1!\n');
};
