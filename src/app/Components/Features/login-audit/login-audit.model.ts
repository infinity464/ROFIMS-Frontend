export interface LoginAudit {
  id: number;
  attemptedEmail: string;
  attemptedAt: string;
  isSuccess: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  userAgent: string | null;
  userId: string | null;
}

export interface LoginAuditPagedResponse {
  data: LoginAudit[];
  totalRecords: number;
  page: number;
  pageSize: number;
}
