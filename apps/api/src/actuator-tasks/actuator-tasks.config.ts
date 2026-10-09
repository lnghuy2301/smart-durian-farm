export interface ActuatorTasksConfig { ackTimeoutMs: number }
export const ACTUATOR_TASKS_CONFIG = Symbol('ACTUATOR_TASKS_CONFIG');
export function readActuatorTasksConfig(env: NodeJS.ProcessEnv): ActuatorTasksConfig {
  const raw = env.ACTUATOR_ACK_TIMEOUT_MS ?? '10000';
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 100 || value > 60000) {
    throw new Error('ACTUATOR_ACK_TIMEOUT_MS must be an integer between 100 and 60000');
  }
  return { ackTimeoutMs: value };
}
