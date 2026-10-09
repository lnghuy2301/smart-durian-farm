import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoneFixture } from '../integration/helpers/zone-fixture';
import { DevicesService } from '../src/devices/devices.service';
import { SensorsService } from '../src/sensors/sensors.service';
import { ActuatorsService } from '../src/actuators/actuators.service';

const page = { limit: 20, offset: 0 };
async function fixture() {
  const f = await zoneFixture();
  const zone = f.zones.create(f.owner.id, f.input);
  const devices = f.app.get(DevicesService);
  const device = devices.create(f.owner.id, { zone_id: zone.id, station_id: 'DEMO_STATION', installed_at: '2026-10-07T00:00:00Z', cost: 0 });
  return { ...f, zone, device, devices, sensors: f.app.get(SensorsService), actuators: f.app.get(ActuatorsService) };
}
test('IoT metadata follows new lowercase enums and bounded configurable units without unit conversion', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    for (const unit of ['C', '%', '%rH', 'oC', 'custom-unit']) {
      const r = await f.http('sensors', 'POST', { device_id: f.device.id, name: 'Sensor', sensor_type: 'air_temperature',
        data_stream_id: unit === '%' ? '302' : 'S-' + unit.replace(/[^A-Za-z0-9]/g, ''), unit }, token);
      assert.equal(r.status, 201);
      assert.equal((await r.json() as {unit: string}).unit, unit);
    }
    const sensor = f.sensors.create(f.owner.id, { device_id: f.device.id, name: 'Temp', sensor_type: 'air_temperature', data_stream_id: '301', unit: 'C',
      min_threshold: 10, max_threshold: 40 });
    assert.equal((await f.http(`sensors/${sensor.id}`, 'PATCH', { unit: ' %rH ' }, token)).status, 200);
    assert.equal(f.sensors.get(f.owner.id, sensor.id).unit, '%rH');
    assert.equal(f.sensors.get(f.owner.id, sensor.id).max_threshold, 40);
    for (const body of [{ sensor_type: 'Air_temperature' }, { sensor_type: 'soil_temperature' }, { unit: '' }, { unit: ' ' }, { unit: 'x'.repeat(17) }]) {
      assert.equal((await f.http('sensors', 'POST', { device_id: f.device.id, name: 'Test', sensor_type: 'air_temperature', data_stream_id: 'OTHER', unit: 'C', ...body }, token)).status, 400);
    }
    for (const [capability_id, purpose] of (['watering', 'spraying', 'shared'] as const).entries()) {
      assert.equal(f.actuators.create(f.owner.id, { device_id: f.device.id, name: purpose, purpose, capability_id: capability_id + 1 }).purpose, purpose);
    }
    assert.equal((await f.http('actuators', 'POST', {device_id: f.device.id, name: 'Old', purpose: 'Shared', capability_id: 100}, token)).status, 400);
  } finally { await f.app.close(); }
});
test('Valid receive presence is monotonic and cannot invalidate or overwrite a metadata proposal', async () => {
  const f = await fixture();
  try {
    const request = f.devices.updateRequest(f.admin.id, f.device.id, { cost: 1 });
    f.devices.recordSeen(f.device.id, '2026-10-07T02:00:00Z');
    f.devices.recordSeen(f.device.id, '2026-10-07T01:00:00Z');
    assert.equal(f.devices.getRecord(f.device.id).last_seen_at, '2026-10-07T02:00:00.000Z');
    assert.equal(f.devices.history(f.owner.id, f.device.id, page).total, 1);
    f.devices.approve(f.owner.id, request.id);
    assert.equal(f.devices.getRecord(f.device.id).last_seen_at, '2026-10-07T02:00:00.000Z');
    assert.equal(f.devices.getRecord(f.device.id).cost, 1);
    assert.throws(() => f.devices.recordSeen(f.device.id, 'invalid'), /MQTT/);
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http(`devices/${f.device.id}`, 'PATCH', {last_seen_at:'2026-10-07T03:00:00Z'}, token)).status, 400);
  } finally { await f.app.close(); }
});
test('Device Maintenance uses the same ownership and approval rules while retaining all metadata', async () => {
  const f = await fixture();
  try {
    const token = await f.login(f.owner.phone_number);
    assert.equal((await f.http(`devices/${f.device.id}`, 'PATCH', {status:'Maintenance'}, token)).status, 200);
    assert.equal(f.devices.list(f.owner.id, {...page,status:'Maintenance'}).total, 1);
    const request = f.devices.updateRequest(f.admin.id, f.device.id, {status:'Active'});
    f.devices.recordSeen(f.device.id, '2026-10-07T02:00:00Z');
    f.devices.approve(f.owner.id,request.id);
    assert.equal(f.devices.getRecord(f.device.id).status,'Active');
    assert.equal(f.devices.getRecord(f.device.id).last_seen_at,'2026-10-07T02:00:00.000Z');
    assert.throws(()=>f.devices.create(f.owner.id,{...f.device}),/Không sửa/);
  } finally { await f.app.close(); }
});
