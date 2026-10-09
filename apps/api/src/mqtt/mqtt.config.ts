import { isIP } from 'node:net';

export interface MqttConfig {
  enabled: boolean;
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls: boolean;
  offlineAfterMs: number;
  reconnectMs: number;
  connectTimeoutMs: number;
}
export const MQTT_CONFIG = Symbol('MQTT_CONFIG');

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}
function boolean(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key] ?? 'false';
  if (!['true', 'false'].includes(raw)) { throw new Error(`${key} must be true or false`); }
  return raw === 'true';
}
export function readMqttConfig(env: NodeJS.ProcessEnv): MqttConfig {
  const enabled = boolean(env, 'MQTT_ENABLED');
  const tls = boolean(env, 'MQTT_USE_TLS');
  const host = env.MQTT_BROKER_HOST?.trim() ?? '';
  const username = env.MQTT_USERNAME || undefined;
  const password = env.MQTT_PASSWORD || undefined;
  if (enabled && (!host || !(isIP(host) || /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)))) {
    throw new Error('MQTT_BROKER_HOST requires a hostname or IP, without scheme, path or credentials');
  }
  if (enabled && !env.MQTT_BROKER_PORT) { throw new Error('MQTT_BROKER_PORT is required when MQTT_ENABLED=true'); }
  if (enabled && !!username !== !!password) { throw new Error('Configure both MQTT_USERNAME and MQTT_PASSWORD, or leave both empty'); }
  return { enabled, host, port: integer(env, 'MQTT_BROKER_PORT', tls ? 8883 : 1883, 1, 65535), username, password, tls,
    offlineAfterMs: integer(env, 'MQTT_OFFLINE_AFTER_MS', 1800000, 1000, 86400000),
    reconnectMs: integer(env, 'MQTT_RECONNECT_MS', 3000, 1000, 60000),
    connectTimeoutMs: integer(env, 'MQTT_CONNECT_TIMEOUT_MS', 10000, 1000, 60000) };
}
