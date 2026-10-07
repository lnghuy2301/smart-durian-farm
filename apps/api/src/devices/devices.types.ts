export const DEVICE_STATUSES = ['Active', 'Inactive', 'Maintenance'] as const;
export type DeviceStatus = typeof DEVICE_STATUSES[number];

export interface DeviceDetails {
  installed_at: string;
  cost: number;
  status: DeviceStatus;
}

export interface DeviceCreationDetails extends DeviceDetails {
  station_id: string;
}

export interface TestDevice extends DeviceCreationDetails {
  id: string;
  zone_id: string;
  last_seen_at: string | null;
}

// Metadata duyệt/version/audit chỉ trong RAM, không thêm bảng hoặc field vào ERD.
export interface DeviceChangeRequest {
  id: string;
  action: 'Create' | 'Update';
  status: 'Pending' | 'Accepted' | 'Rejected';
  device_id: string | null;
  zone_id: string;
  farm_id: string;
  owner_id: string;
  proposed_by: string;
  proposed_changes: Partial<DeviceCreationDetails>;
  device_snapshot: TestDevice | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}

export interface DeviceMetadataHistory {
  id: string;
  device_id: string;
  action: 'Create' | 'Update';
  actor_id: string;
  proposed_by: string | null;
  request_id: string | null;
  version: number;
  changed_at: string;
  before: TestDevice | null;
  after: TestDevice;
}
