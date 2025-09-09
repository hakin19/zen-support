import type { UserRole } from '../middleware/web-portal-auth.middleware';

export type UserStatus = 'active' | 'invited' | 'suspended';

export interface UserManagementRecord {
  id: string;
  customer_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  status: UserStatus;
  is_active: boolean;
  last_login_at?: string;
  invitation_token?: string;
  invitation_sent_at?: string;
  invitation_expires_at?: string;
  invited_by?: string;
  created_at: string;
  updated_at: string;
  role: UserRole;
  customer_name?: string;
  auth_email?: string;
}

export interface AuthenticatedUser {
  id: string;
  customerId: string;
  role: UserRole;
  email?: string;
}
