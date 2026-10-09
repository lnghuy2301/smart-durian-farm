export const CONTROL_OPERATIONS = ['Watering', 'Spraying', 'Stop'] as const;
export type ControlOperation = typeof CONTROL_OPERATIONS[number];
export type TaskOperation = ControlOperation | 'Reset' | 'RecoveryStop';
export type TaskStatus = 'Pending' | 'Confirmed' | 'Failed';
export type AcknowledgedMode = 'Unknown' | 'Off' | 'Watering' | 'Spraying';
export interface TaskStep {
  task_id: number;
  tasking_capability_id: number;
  action: 0 | 1;
  status: 'Queued' | 'WaitingAck' | 'Acknowledged' | 'Failed' | 'Cancelled';
  sent_at: string | null;
  ack_received_at: string | null;
  ack: { taskId: number; status: 'ACK'; action: 0 | 1 } | null;
}
// ERD shape: tiến trình/links nằm trong response_payload, không thêm created_by/confirmed_by.
export interface ActuatorTask {
  _id: string;
  device_id: string;
  command_id: number;
  targets: { task_id: number; tasking_capability_id: number }[];
  tasking_parameters: { actionType: 'control'; action: 0 | 1 };
  status: TaskStatus;
  created_at: string;
  sent_at: string | null;
  confirmed_at: string | null;
  error_message: string | null;
  response_payload: {
    operation: TaskOperation;
    confirmation_kind: 'CommandReceipt';
    parent_task_id: string | null;
    reset_task_id: string | null;
    recovery_task_id: string | null;
    steps: TaskStep[];
  };
}
