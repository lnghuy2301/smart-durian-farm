import { TestZone } from '../zones/zones.types';

// Bản ghi nghiệp vụ USERS_ZONES; trạng thái chấp thuận nằm ở request riêng.
export interface UserZoneAssignment {
  id: string;
  user_id: string;
  zone_id: string;
  start_date: string;
  end_date: string | null;
}

export interface AssignmentHistory {
  assignment: UserZoneAssignment;
  zone_snapshot: TestZone;
  accepted_at: string;
}

export interface AssignmentApproval {
  purpose: 'Owner' | 'Assignee';
  user_id: string;
  approved_at: string | null;
}

export interface AssignmentRequest {
  id: string;
  action: 'Assign' | 'End';
  status: 'Pending' | 'Accepted' | 'Rejected';
  zone_id: string;
  owner_id: string;
  user_id: string;
  proposed_by: string;
  proposed_role: 'Admin' | 'Farmer';
  start_date: string;
  end_date: string | null;
  assignment_id: string | null;
  zone_snapshot: TestZone;
  required_approvals: AssignmentApproval[];
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rejection_reason: string | null;
}
