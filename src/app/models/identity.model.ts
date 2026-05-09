/** Matches backend Identity.Models */

export interface ApplicationUser {
  id: string;
  userName: string;
  email: string;
  phoneNumber?: string | null;
  roleName?: string;
  lockoutEnd?: string | null;
}

export interface ApplicationRole {
  id: string;
  name: string;
  normalizedName?: string;
  /** Role IDs this role may reset passwords for. `["*"]` = any. Empty/undefined = none. */
  canResetRoleIds?: string[];
}

export interface CreateRoleModel {
  name: string;
  canResetRoleIds?: string[];
}

export interface UserModel {
  email: string;
  userName?: string;
  phoneNumber?: string;
  password: string;
  roleName: string;
  confirmUrl: string;
}

export interface AdminResetPasswordModel {
  email: string;
  newPassword: string;
}

export interface SetUserActiveModel {
  email: string;
  isActive: boolean;
}

export interface UpdateRoleModel {
  id: string;
  name: string;
  canResetRoleIds?: string[];
}

export interface Responses {
  isSuccess: boolean;
  returnCode: string;
  message: string;
  success: string;
}
