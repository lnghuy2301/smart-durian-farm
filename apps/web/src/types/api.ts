export type Role = "Admin" | "Manager" | "Farmer";
export type CatalogStatus = "Active" | "Inactive";
export interface User {
  id: string;
  user_name: string;
  phone_number: string;
  gmail: string | null;
  gmail_verify: boolean;
  role: Role;
  status: "Active" | "Locked" | "Pending" | "Reject";
  is_owner: boolean;
  created_at: string;
}
export interface LoginResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: User;
}
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface Material {
  id: string;
  name: string;
  material_type: "Fertilizer" | "Pesticide" | "Biological";
  default_dosage: string;
  unit: string;
  quarantine_days: number;
  status: CatalogStatus;
}
export interface Standard {
  id: string;
  code: string;
  name: string;
  description: string;
  certifying_body: string;
  status: CatalogStatus;
}
export interface Farm {
  id: string;
  owner_id: string;
  cooperative_id: string | null;
  join_cooperative_date: string | null;
  area_size: number;
  address: string;
  certificate_number: string;
  longitude: number;
  latitude: number;
}
export interface Zone {
  id: string;
  farm_id: string;
  standard_id: string;
  zone_name: string;
  area_size: number;
  longitude: number;
  latitude: number;
}
export interface Tree {
  id: string;
  zone_id: string;
  tree_code: string;
  variety: string;
  plant_date: string;
  longitude: number;
  latitude: number;
  status: "Active" | "Dead" | "Removed";
}
export interface CooperativeInput {
  cooperative_name: string;
  director: string;
  certificate_number: string;
  address: string;
  contact_number: string;
}
export interface Cooperative extends CooperativeInput {
  id: string;
  manager_id: string | null;
}
export interface CooperativeDetail extends Cooperative {
  lifecycle: {
    created_at: string;
    warning_at: string | null;
    deletion_due_at: string | null;
  };
}
export interface Device {
  id: string;
  zone_id: string;
  station_id: string;
  installed_at: string;
  cost: number;
  status: "Active" | "Inactive" | "Maintenance";
  last_seen_at: string | null;
}
export interface Harvest {
  id: string;
  tree_id: string;
  season_name: string;
  harvest_date: string;
  fruit_count: number;
  total_weight_kg: number;
  batch_code: string;
  created_by: string;
  status: "Draft" | "Pending" | "Confirmed";
  updated_by: string | null;
  updated_at: string | null;
  created_at: string;
}
export interface Sensor {
  id: string;
  device_id: string;
  name: string;
  unit: string;
  min_threshold: number | null;
  max_threshold: number | null;
  status: CatalogStatus;
  sensor_type: "air_temperature" | "air_humidity" | "soil_moisture";
  data_stream_id: string;
}
export interface AssignmentHistory {
  assignment: {
    id: string;
    user_id: string;
    zone_id: string;
    start_date: string;
    end_date: string | null;
  };
  zone_snapshot: Zone;
  accepted_at: string;
  active: boolean;
  correction_grace_days: number;
  correction_deadline: string | null;
}
export interface DevicePresence {
  device_id: string;
  status: Device["status"];
  last_seen_at: string | null;
  connectivity: "Unknown" | "Online" | "Offline";
  broker_connected: boolean;
  receiver_ready: boolean;
  offline_after_ms: number;
}
export interface TelemetryRecord {
  _id: string;
  device_id: string;
  data_stream_id: string;
  measured_at: string;
  received_at: string;
  value: number;
  unit: string;
}
export interface TelemetryPage extends Page<TelemetryRecord> {
  device_id: string;
  storage: {
    mode: "Memory";
    capacity_readings: number;
    eviction: "OldestInserted";
  };
}
