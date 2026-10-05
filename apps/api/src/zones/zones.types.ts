import { CreateZoneDto, ZoneDetailsDto } from './zones.dto';
import { FarmRequestStatus } from '../farms/farms.dto';

export interface TestZone extends CreateZoneDto { id: string }

export interface ZoneChangeRequest {
  id: string;
  action: 'Create' | 'Update';
  status: FarmRequestStatus;
  farm_id: string;
  zone_id: string | null;
  owner_id: string;
  proposed_by: string;
  proposed_changes: ZoneDetailsDto | Partial<ZoneDetailsDto>;
  zone_snapshot: TestZone | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}
