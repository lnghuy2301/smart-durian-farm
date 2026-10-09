import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const id: SchemaObject = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const nullableId: SchemaObject = { ...id, nullable: true };
const time: SchemaObject = { type: 'string', format: 'date-time', nullable: true };
const integer: SchemaObject = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const action: SchemaObject = { type: 'integer', enum: [0, 1] };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties,
  required: Object.keys(properties), additionalProperties: false });
const target = object({ task_id: integer, tasking_capability_id: integer });
const ack = { ...object({ taskId: integer, status: { type: 'string', enum: ['ACK'] }, action }), nullable: true };
export const taskSchema = object({
  _id: id, device_id: { type: 'string', format: 'uuid' }, command_id: integer,
  targets: { type: 'array', items: target },
  tasking_parameters: object({ actionType: { type: 'string', enum: ['control'] }, action }),
  status: { type: 'string', enum: ['Pending', 'Confirmed', 'Failed'] },
  created_at: { ...time, nullable: false }, sent_at: time, confirmed_at: time,
  error_message: { type: 'string', nullable: true },
  response_payload: object({
    operation: { type: 'string', enum: ['Watering', 'Spraying', 'Stop', 'Reset', 'RecoveryStop'] },
    confirmation_kind: { type: 'string', enum: ['CommandReceipt'], description: 'ACK confirms command receipt, not physical execution' },
    parent_task_id: nullableId, reset_task_id: nullableId, recovery_task_id: nullableId,
    steps: { type: 'array', items: object({ ...target.properties, action,
      status: { type: 'string', enum: ['Queued', 'WaitingAck', 'Acknowledged', 'Failed', 'Cancelled'] },
      sent_at: time, ack_received_at: time, ack }) },
  }),
});
export const acceptedSchema = object({ task: taskSchema, status_url: { type: 'string' }, state_url: { type: 'string' } });
export const listSchema = object({ items: { type: 'array', items: taskSchema }, total: { type: 'integer' },
  limit: { type: 'integer' }, offset: { type: 'integer' }, storage: object({ mode: { type: 'string', enum: ['Memory'] },
    capacity_tasks: { type: 'integer', example: 5000 }, eviction: { type: 'string', enum: ['OldestTerminal'] } }) });
export const stateSchema = object({ device_id: { type: 'string', format: 'uuid' },
  acknowledged_mode: { type: 'string', enum: ['Unknown', 'Off', 'Watering', 'Spraying'] },
  physical_state: { type: 'string', enum: ['Unknown'] }, confirmation_kind: { type: 'string', enum: ['CommandReceipt'] },
  busy: { type: 'boolean' }, active_task_id: nullableId, reset_required: { type: 'boolean' },
  broker_ready: { type: 'boolean' }, ack_timeout_ms: { type: 'integer', example: 10000 } });
