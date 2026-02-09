export interface ApiResponse {
  isSuccess: boolean;
  success?: string;
  message: string;
  returnCode?: string;
}

export interface ResetPasswordRequest {
  email: string;
  resetPasswordToken: string;
  newPassword: string;
}
