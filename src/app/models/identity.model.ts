/** Matches backend Identity.Models */

export interface ApplicationUser {
  id: string;
  userName: string;
  email: string;
  phoneNumber?: string | null;
  roleName?: string;
}

export interface ApplicationRole {
  id: string;
  name: string;
  normalizedName?: string;
}

export interface UserModel {
  email: string;
  phoneNumber?: string;
  password: string;
  roleName: string;
  confirmUrl: string;
}

export interface UpdateRoleModel {
  id: string;
  name: string;
}

export interface Responses {
  isSuccess: boolean;
  returnCode: string;
  message: string;
  success: string;
}
