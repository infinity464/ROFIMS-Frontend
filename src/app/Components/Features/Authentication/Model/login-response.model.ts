export interface LoginResponse {
  token: string;
  refreshToken: string;
  userName: string;
  validity: string;

  userId: string;
  emailId: string;
  roleId: string;
  roleName: string;

  expiredTime: string;
  id: string;
}
