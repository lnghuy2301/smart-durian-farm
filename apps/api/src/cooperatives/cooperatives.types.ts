import { OtpProof } from '../auth/sms/otp.provider';
import { ManagerCooperativeUpdateDto } from './cooperatives.dto';

export type CooperativeUpdateStatus = 'EmailSending' | 'EmailPending' | 'EmailVerified'
  | 'SmsSending' | 'SmsPending' | 'SmsChecking' | 'Accepted' | 'Cancelled' | 'Expired' | 'Failed';

export interface CooperativeUpdateRequest {
  id: string;
  cooperative_id: string;
  manager_id: string;
  proposed_changes: ManagerCooperativeUpdateDto;
  status: CooperativeUpdateStatus;
  created_at: string;
  resolved_at: string | null;
  expires_at: string;
  email_verified_at: string | null;
}

// Chứng cứ OTP/phiên bản và địa chỉ tài khoản là metadata riêng, không trả qua API.
export interface StoredCooperativeUpdate {
  value: CooperativeUpdateRequest;
  cooperativeVersion: number;
  tokenVersion: number;
  email: string;
  phone: string;
  emailSalt?: string;
  emailDigest?: Buffer;
  smsProof?: OtpProof;
  emailAttempts: number;
  smsAttempts: number;
  emailValidUntil: number;
  nextEmailSendAt: number;
  nextSmsSendAt: number;
  busy: boolean;
}

export interface CooperativeNotification {
  id: string;
  cooperative_id: string;
  cooperative_name: string;
  type: 'ManagerMissing' | 'DeletionBlocked' | 'CooperativeDeleted';
  created_at: string;
  manager_deadline: string;
}
