// Shape của IOT_TELEMETRIES; ObjectId serialize thành hex string khi trả HTTP.
// Không lưu station_id/sensor_id/zone_id: device_id UUID + stream định danh nguồn.
export interface TelemetryRecord {
  _id: string;
  device_id: string;
  data_stream_id: string;
  measured_at: string;
  received_at: string;
  value: number;
  unit: string;
}
