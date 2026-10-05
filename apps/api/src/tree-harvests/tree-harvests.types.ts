export const HARVEST_STATUSES = ['Draft', 'Pending', 'Confirmed'] as const;
export type HarvestStatus = typeof HARVEST_STATUSES[number];

export interface HarvestDetails {
  season_name: string;
  harvest_date: string;
  fruit_count: number;
  total_weight_kg: number;
  batch_code: string;
}

// Đúng một bảng nghiệp vụ theo ERD; các bằng chứng duyệt nằm riêng trong RAM.
export interface TestTreeHarvest extends HarvestDetails {
  id: string;
  tree_id: string;
  created_by: string;
  status: HarvestStatus;
  updated_by: string | null;
  updated_at: string | null;
  created_at: string;
}

export interface HarvestRequest {
  id: string;
  harvest_id: string;
  action: 'Confirm' | 'Correct';
  status: 'Pending' | 'Accepted' | 'Rejected';
  requested_by: string;
  editor_id: string | null;
  owner_id: string;
  cooperative_id: string | null;
  reason: string | null;
  proposed_changes: Partial<HarvestDetails> | null;
  harvest_snapshot: TestTreeHarvest;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}

export interface HarvestBackdatePermission {
  id: string;
  user_id: string;
  zone_id: string;
  harvest_date: string;
  granted_by: string;
  reason: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}
