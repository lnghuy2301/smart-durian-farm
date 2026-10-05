import { FarmDetailsDto, FarmRequestStatus } from './farms.dto';

// Farm chỉ chứa các field hiện có trong ERD; metadata duyệt nằm riêng trong bộ nhớ.
export interface TestFarm extends FarmDetailsDto {
  id: string;
  owner_id: string;
  cooperative_id: string | null;
  join_cooperative_date: string | null;
}

export type FarmAction = 'Create' | 'Update' | 'Join' | 'Leave';

export interface FarmApproval {
  role: 'Admin' | 'Farmer' | 'Manager';
  user_id: string | null; // null cho Admin: bất kỳ Admin Active nào cũng có thể duyệt.
  approved_by: string | null;
  approved_at: string | null;
}

export interface FarmChangeRequest {
  id: string;
  action: FarmAction;
  status: FarmRequestStatus;
  farm_id: string | null;
  owner_id: string;
  proposed_by: string;
  proposed_role: 'Admin' | 'Farmer';
  proposed_changes: Partial<FarmDetailsDto>;
  cooperative_id: string | null;
  required_approvals: FarmApproval[];
  farm_snapshot: TestFarm | null; // Manager xem thông tin tại lúc đề xuất để xét gia nhập, chưa có quyền đọc Farm chính thức.
  created_at: string;
  resolved_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
}

export interface FarmLeaveNotification {
  id: string;
  recipient_id: string;
  type: 'FarmLeftCooperative';
  farm_id: string;
  owner_id: string;
  cooperative_id: string;
  request_id: string;
  created_at: string;
}
