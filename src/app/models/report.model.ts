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
  orgNameBN?: string | null;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  corps?: string | null;
  corpsBN?: string | null;
  trade?: string | null;
  tradeBN?: string | null;
  name?: string | null;
  nameBN?: string | null;
  presentUnit?: string | null;
  presentUnitBN?: string | null;
}

/** Report A: Appointment – Joining Date, Rmks. */
export interface MemberAppointmentReportRow extends ReportRowBase {
  joiningDate?: string | null;
  rmks?: string | null;
}

/** Report B: Course – Course/Batch, Rmks. */
export interface BatchCourseReportRow extends ReportRowBase {
  courseBatch?: string | null;
  courseBatchBN?: string | null;
  rmks?: string | null;
}

/** Report C: Education – Higher Education Qualification, Subject. */
export interface EducationReportRow extends ReportRowBase {
  higherEducationQualification?: string | null;
  higherEducationQualificationBN?: string | null;
  subject?: string | null;
  subjectBN?: string | null;
}

/** Request for Report A (filters + pagination). */
export interface MemberAppointmentReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  joiningDateFrom?: string | null;
  joiningDateTo?: string | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** Request for Report B (filters + pagination). */
export interface BatchCourseReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  courseBatchId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** Request for Report C (filters + pagination). */
export interface EducationReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  qualificationId?: number | null;
  subjectId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** Report D–G: Mother Org, Officer Type, RAB Unit, Wings – same row shape as Appointment. */
export interface GenericReportRow extends ReportRowBase {
  rmks?: string | null;
}

/** Request for Mother Org / Officer Type / RAB Unit / Wings reports. motherUnitId = Mother Org Unit (child org) for Mother Org report only. */
export interface GenericReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  commonCodeId?: number | null;
  motherUnitId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** Report: Blood Group – same base shape as the generic report, plus blood group column. */
export interface BloodGroupReportRow extends ReportRowBase {
  bloodGroup?: string | null;
  rmks?: string | null;
}

/**
 * Request for Blood Group report. PersonalInfo.BloodGroup is a free-text column (e.g. "A+"),
 * so the filter is a string rather than a CommonCode CodeId.
 */
export interface BloodGroupReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  bloodGroup?: string | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** Report: Family Member Occupation – family member details. */
export interface FamilyOccupationReportRow {
  ser?: number;
  familyMemberName?: string | null;
  familyMemberNameBN?: string | null;
  occupation?: string | null;
  occupationBN?: string | null;
  occupationDetails?: string | null;
  name?: string | null;
  nameBN?: string | null;
  rabid?: string | null;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  orgName?: string | null;
  orgNameBN?: string | null;
}

/** Request for Family Member Occupation report. */
export interface FamilyOccupationReportParams {
  relationId?: number | null;
  occupationId?: number | null;
  postingStatus?: string | null;
  rabId?: string | null;
  serviceId?: string | null;
  nid?: string | null;
  pagination: ReportPagination;
}

/** Report H: Address Location – Division, District, Upazila, Post Office, Address details, RAB Unit. */
export interface AddressLocationReportRow extends ReportRowBase {
  rabid?: string | null;
  rabUnit?: string | null;
  rabUnitBN?: string | null;
  locationType?: string | null;
  addressOwner?: string | null;
  addressOwnerBN?: string | null;
  division?: string | null;
  divisionBN?: string | null;
  district?: string | null;
  districtBN?: string | null;
  upazila?: string | null;
  upazilaBN?: string | null;
  postOffice?: string | null;
  postOfficeBN?: string | null;
  address?: string | null;
  addressBN?: string | null;
  rmks?: string | null;
}

/** Request for Address Location report (filters + pagination). */
export interface AddressLocationReportParams {
  divisionId?: number | null;
  districtId?: number | null;
  upazilaId?: number | null;
  postOfficeId?: number | null;
  postingStatus?: string | null;
  rabId?: string | null;
  serviceId?: string | null;
  nid?: string | null;
  activeOnly?: boolean | null;
  locationType?: string | null;
  addressOwner?: string | null;
  pagination: ReportPagination;
}

/** Backend paged response (may use Rows/TotalPages). */
export interface ReportPagedResponse<T> {
  datalist: T[];
  pages: { rows?: number; totalPages?: number; Rows?: number; TotalPages?: number };
}
