export const TREE_STATUSES = ['Active', 'Removed', 'Dead'] as const;
export type TreeStatus = typeof TREE_STATUSES[number];

export interface TreeDetails {
  variety: string;
  plant_date: string;
  longitude: number;
  latitude: number;
  status: TreeStatus;
}

export interface TestTree extends TreeDetails {
  id: string;
  zone_id: string;
  tree_code: string;
}

// Đề xuất/phiên bản/lịch sử là metadata bộ nhớ, không thêm field vào TREES trong ERD.
export interface TreeChangeRequest {
  id: string;
  action: 'Create' | 'Update';
  status: 'Pending' | 'Accepted' | 'Rejected';
  tree_id: string | null;
  zone_id: string;
  farm_id: string;
  owner_id: string;
  proposed_by: string;
  proposed_changes: Partial<TreeDetails>;
  tree_snapshot: TestTree | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}

export interface TreeMetadataHistory {
  id: string;
  tree_id: string;
  action: 'Create' | 'Update';
  actor_id: string;
  proposed_by: string | null;
  request_id: string | null;
  version: number;
  changed_at: string;
  before: TestTree | null;
  after: TestTree;
}
