export const SENSOR_STATUSES = ['Active', 'Inactive'] as const;
export const SENSOR_TYPES = ['air_temperature', 'air_humidity', 'soil_moisture'] as const;
export type SensorStatus = typeof SENSOR_STATUSES[number];
export type SensorType = typeof SENSOR_TYPES[number];
export type SensorUnit = string;

export interface SensorDetails {
  name: string;
  unit: SensorUnit;
  min_threshold: number | null;
  max_threshold: number | null;
  status: SensorStatus;
}
export interface SensorCreationDetails extends SensorDetails {
  sensor_type: SensorType;
  data_stream_id: string;
}
export interface TestSensor extends SensorCreationDetails {
  id: string;
  device_id: string;
}
// Metadata duyệt/version/audit chỉ trong RAM, không thêm bảng/field vào ERD.
export interface SensorChangeRequest {
  id: string;
  action: 'Create' | 'Update';
  status: 'Pending' | 'Accepted' | 'Rejected';
  sensor_id: string | null;
  device_id: string;
  zone_id: string;
  farm_id: string;
  owner_id: string;
  proposed_by: string;
  proposed_changes: Partial<SensorCreationDetails>;
  sensor_snapshot: TestSensor | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}
export interface SensorMetadataHistory {
  id: string;
  sensor_id: string;
  action: 'Create' | 'Update';
  actor_id: string;
  proposed_by: string | null;
  request_id: string | null;
  version: number;
  changed_at: string;
  before: TestSensor | null;
  after: TestSensor;
}
