/**
 * Request/response types for employee reports. Each report has its own params and row type.
 * Backend may return pages as { Rows, TotalPages }; normalize to PageInfo when needed.
 */

/** Pagination request (align with backend: page_no 1-based, row_per_page). */
export interface ReportPagination {
  page_no: number;
  row_per_page: number;
}

/** Common base for report row (Ser added by backend or client). */
export interface ReportRowBase {
  ser?: number;
  orgName?: string | null;
  serviceId?: string | null;
  rank?: string | null;
  corps?: string | null;
  trade?: string | null;
  name?: string | null;
  presentUnit?: string | null;
}

/** Report A: Member / Appointment – Joining Date, Rmks. */
export interface MemberAppointmentReportRow extends ReportRowBase {
  joiningDate?: string | null;
  rmks?: string | null;
}

/** Report B: Batch/Course – Course/Batch, Rmks. */
export interface BatchCourseReportRow extends ReportRowBase {
  courseBatch?: string | null;
  rmks?: string | null;
}

/** Report C: Education – Higher Education Qualification, Subject. */
export interface EducationReportRow extends ReportRowBase {
  higherEducationQualification?: string | null;
  subject?: string | null;
}

/** Request for Report A (filters + pagination). */
export interface MemberAppointmentReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  joiningDateFrom?: string | null;
  joiningDateTo?: string | null;
  pagination: ReportPagination;
}

/** Request for Report B (filters + pagination). */
export interface BatchCourseReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  courseBatchId?: number | null;
  pagination: ReportPagination;
}

/** Request for Report C (filters + pagination). */
export interface EducationReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  qualificationId?: number | null;
  subjectId?: number | null;
  pagination: ReportPagination;
}

/** Backend paged response (may use Rows/TotalPages). */
export interface ReportPagedResponse<T> {
  datalist: T[];
  pages: { rows?: number; totalPages?: number; Rows?: number; TotalPages?: number };
}
