import type { UserAccessRule } from '@/models/identity.model';

export interface LoginResponse {
  token: string;
  refreshToken: string;
  userName: string;
  validity: string;

  userId: string;
  emailId: string;
  roleId: string;
  roleName: string;

  /** Which roles' users this caller may see / manage, per action. Empty = none. */
  userAccessRules?: UserAccessRule[];
  /** All six actions on all roles — may edit role permissions and the session policy. */
  hasFullUserAccess?: boolean;

  expiredTime: string;
  id: string;
}
