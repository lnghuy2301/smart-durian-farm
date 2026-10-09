import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/application';
import { readEnvironment } from '../../src/config/environment';
import { MockUserStore } from '../../src/auth/mock-user.store';
import { FarmsService } from '../../src/farms/farms.service';
import { MockCooperativeStore } from '../../src/users/mock-cooperative.store';
import { StandardsService } from '../../src/standards/standards.service';
import { ZonesService } from '../../src/zones/zones.service';
import { MqttConfig } from '../../src/mqtt/mqtt.config';
import { MqttTransport } from '../../src/mqtt/mqtt.transport';
import { ActuatorTasksConfig } from '../../src/actuator-tasks/actuator-tasks.config';

export async function zoneFixture(options: { mqtt?: MqttConfig; transport?: MqttTransport; actuatorTasks?: ActuatorTasksConfig } = {}) {
  const config = readEnvironment({ DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test', MONGODB_URI: 'mongodb://127.0.0.1:1/test',
    NODE_ENV: 'test', AUTH_MODE: 'mock', AUTH_TEST_PHONE: '0900000000', AUTH_TEST_PASSWORD: 'LocalTestOnly123!',
    JWT_SECRET: 'test-only-secret-with-at-least-32-bytes', AUTH_TEST_ADMIN_PHONE: '0900000001', AUTH_TEST_ADMIN_PASSWORD: 'LocalAdminOnly123!' });
  if (options.mqtt) { config.mqtt = options.mqtt; }
  if (options.actuatorTasks) { config.actuatorTasks = options.actuatorTasks; }
  const builder = Test.createTestingModule({ imports: [AppModule.register(config)] });
  if (options.transport) { builder.overrideProvider(MqttTransport).useValue(options.transport); }
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  configureApplication(app, config);
  await app.listen(0, '127.0.0.1');
  const users = app.get(MockUserStore);
  const owner = users.user;
  const admin = users.findByPhone('0900000001')!;
  const worker = users.add({ ...users.publicUser(), phone_number: '0900000002', password: owner.password });
  const manager = users.add({ ...users.publicUser(), role: 'Manager', phone_number: '0900000003', password: owner.password });
  const farms = app.get(FarmsService);
  const request = farms.createRequest(owner.id, { area_size: 1, address: 'Farm demo', certificate_number: 'DEMO', longitude: 106, latitude: 10 });
  const farm = farms.get(owner.id, farms.approve(admin.id, request.id).farm_id!);
  const standards = app.get(StandardsService);
  const standard = standards.create({ code: 'STD', name: 'Tiêu chuẩn', description: '', certifying_body: 'Demo' });
  const zones = app.get(ZonesService);
  const input = { farm_id: farm.id, standard_id: standard.id, zone_name: 'Khu A', area_size: 0.3, longitude: 106, latitude: 10 };
  const http = async (path: string, method = 'GET', body?: object, token?: string) => fetch(`${await app.getUrl()}/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (phone: string, password = 'LocalTestOnly123!') => {
    const response = await http('auth/login', 'POST', { phone_number: phone, password });
    assert.equal(response.status, 200);
    return (await response.json() as { access_token: string }).access_token;
  };
  const join = () => {
    const coop = app.get(MockCooperativeStore).create({ cooperative_name: 'HTX', director: 'Demo', certificate_number: 'COOP', address: 'Demo', contact_number: '0900000003' }, manager.id);
    const proposal = farms.joinRequest(owner.id, farm.id, coop.id);
    farms.approve(admin.id, proposal.id);
    farms.approve(manager.id, proposal.id);
  };
  return { app, users, owner, admin, worker, manager, farms, farm, standards, standard, zones, input, http, login, join };
}
