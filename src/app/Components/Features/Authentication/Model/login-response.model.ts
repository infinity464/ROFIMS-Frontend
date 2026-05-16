export interface LoginResponse {
  token: string;
  refreshToken: string;
  userName: string;
  validity: string;

  userId: string;
  emailId: string;
  roleId: string;
  roleName: string;

  /**
   * Role IDs whose users this caller may reset passwords for.
   * `["*"]` = any role. `[]` / undefined = none.
   */
  canResetRoleIds?: string[];

  expiredTime: string;
  id: string;
}
