export const ACTUATOR_STATUSES = ['Active', 'Inactive'] as const;
export const ACTUATOR_PURPOSES = ['watering', 'spraying', 'shared'] as const;
export type ActuatorStatus = typeof ACTUATOR_STATUSES[number];
export type ActuatorPurpose = typeof ACTUATOR_PURPOSES[number];

export interface ActuatorDetails {
  name: string;
  status: ActuatorStatus;
}
export interface ActuatorCreationDetails extends ActuatorDetails {
  purpose: ActuatorPurpose;
  capability_id: number;
}
export interface TestActuator extends ActuatorCreationDetails {
  id: string;
  device_id: string;
}
// Metadata duyệt/version/audit chỉ lưu trong RAM; không thêm bảng/field vào ERD.
export interface ActuatorChangeRequest {
  id: string;
  action: 'Create' | 'Update';
  status: 'Pending' | 'Accepted' | 'Rejected';
  actuator_id: string | null;
  device_id: string;
  zone_id: string;
  farm_id: string;
  owner_id: string;
  proposed_by: string;
  proposed_changes: Partial<ActuatorCreationDetails>;
  actuator_snapshot: TestActuator | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}
export interface ActuatorMetadataHistory {
  id: string;
  actuator_id: string;
  action: 'Create' | 'Update';
  actor_id: string;
  proposed_by: string | null;
  request_id: string | null;
  version: number;
  changed_at: string;
  before: TestActuator | null;
  after: TestActuator;
}
