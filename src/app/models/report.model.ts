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
  /** AppointmentCategory CommonCode CodeId from the parent dropdown. */
  commonCodeId?: number | null;
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

/** Request for Mother Org / Officer Type / RAB Unit / Wings / Corps / Trade reports. motherUnitId = Mother Org Unit (child org) for Mother Org report only. */
export interface GenericReportParams {
  orgId?: number | null;
  rankId?: number | null;
  tradeId?: number | null;
  commonCodeId?: number | null;
  /**
   * Multi-value variant: when present and non-empty, backend filters on FilterCodeId IN (commonCodeIds)
   * and ignores commonCodeId. Used by the Corps and Trade reports where multiple "N/A" CommonCode rows
   * collapse into a single dropdown option.
   */
  commonCodeIds?: number[] | null;
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
  /** Relation type label (e.g. "Father", "Mother"), resolved from CommonCode of CodeType "Relationship". */
  relation?: string | null;
  relationBN?: string | null;
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

/**
 * Combined "Member Type Serving" report. Cascaded filter MemberTypeId → RabUnitId → RabWingId,
 * plus OrgId/RankId and two date ranges. PostingStatus defaults to "Servings" server-side.
 */
export interface MemberTypeServingReportParams {
  memberTypeId?: number | null;
  rabUnitId?: number | null;
  rabWingId?: number | null;
  orgId?: number | null;
  rankId?: number | null;
  joiningInRabFrom?: string | null;
  joiningInRabTo?: string | null;
  serviceHistoryFrom?: string | null;
  serviceHistoryTo?: string | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

export interface MemberTypeServingReportRow extends ReportRowBase {
  joiningInRab?: string | null;
  dateOfJoinInPresentUnit?: string | null;
  rmks?: string | null;
}

/** Backend paged response (may use Rows/TotalPages). */
export interface ReportPagedResponse<T> {
  datalist: T[];
  pages: { rows?: number; totalPages?: number; Rows?: number; TotalPages?: number };
}

/**
 * Snapshot of the caller's accessible scope, attached to scope-aware reports
 * so the UI can render the chip and lock filters that don't make sense under
 * a restricted scope (e.g. the PostingStatus filter on AddressLocation —
 * only currently-serving members carry a RAB placement to scope against).
 */
export interface ReportAccessibleScope {
  rabUnitNames?: string[] | null;
  rabUnitNamesBN?: string[] | null;
  memberTypeNames?: string[] | null;
  memberTypeNamesBN?: string[] | null;
  /** True when the caller has org-tree restrictions — FE locks status filter. */
  orgScopeRestricted?: boolean;
}

/**
 * Standard scope-aware report response — every employee-reports endpoint that
 * applies org-tree + member-type scoping returns this shape. The legacy
 * `AddressLocationReportPagedResponse` alias is kept for compatibility.
 */
export interface ScopedReportPagedResponse<T> extends ReportPagedResponse<T> {
  accessibleScope?: ReportAccessibleScope | null;
}

/** @deprecated Use {@link ScopedReportPagedResponse} — kept for back-compat. */
export type AddressLocationReportPagedResponse<T> = ScopedReportPagedResponse<T>;

// ── Present Status by Mother Org monthly pivot report ───────────────────

/** One dynamic column (mother org) for the monthly pivot report. */
export interface PresentStatusMotherOrgColumn {
  orgId: number;
  orgNameEN: string;
  orgNameBN: string;
}

/** One row (a month) in the Present Status × Mother Org monthly pivot report. */
export interface PresentStatusByMotherOrgRow {
  monthNumber: number;
  year: number;
  monthLabelEN: string;
  monthLabelBN: string;
  /** Counts keyed by orgId. Missing key = 0. */
  counts: Record<number, number>;
  total: number;
}

/** Full response for the monthly pivot report. */
export interface PresentStatusByMotherOrgReportResponse {
  columns: PresentStatusMotherOrgColumn[];
  rows: PresentStatusByMotherOrgRow[];
  columnTotals: Record<number, number>;
  grandTotal: number;
}

/** Request for the monthly pivot report. */
export interface PresentStatusByMotherOrgReportParams {
  fromDate?: string | null;
  toDate?: string | null;
  postingStatus?: string | null;
  presentStatusType?: string | null;
}

// ── Present Status Unit Wise monthly pivot report ───────────────────────

/** Request for Present Status Unit Wise report. */
export interface PresentStatusUnitWiseReportParams {
  fromDate?: string | null;
  toDate?: string | null;
  postingStatus?: string | null;
  presentStatusType?: string | null;
}

/** One dynamic column (a month) in the Present Status Unit Wise pivot report. */
export interface PresentStatusUnitWiseMonthColumn {
  monthNumber: number;
  year: number;
  labelEN: string;
  labelBN: string;
}

/** One row (a wing/battalion) in the Present Status Unit Wise report. */
export interface PresentStatusUnitWiseRow {
  unitId: number;
  unitNameEN: string;
  unitNameBN: string;
  unitType: string;
  /** Counts keyed by monthNumber. Missing key = 0. */
  counts: Record<number, number>;
  total: number;
}

/** Full response for Present Status Unit Wise report. */
export interface PresentStatusUnitWiseReportResponse {
  monthColumns: PresentStatusUnitWiseMonthColumn[];
  rows: PresentStatusUnitWiseRow[];
  monthTotals: Record<number, number>;
  grandTotal: number;
}

// ── Unit & Specific Duration wise Nominal Roll ──────────────────────────

/**
 * Request for the Unit + Duration nominal roll. RabUnitId is required for a meaningful result.
 * DurationFrom/DurationTo are ISO "yyyy-MM-dd"; backend treats them as an inclusive overlap window
 * against PreviousRABServiceInfo stints. PostingStatus defaults to "Servings" server-side.
 */
export interface UnitDurationNominalRollReportParams {
  rabUnitId?: number | null;
  durationFrom?: string | null;
  durationTo?: string | null;
  orgId?: number | null;
  rankId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** One row of the Unit + Duration nominal roll (one per matching PreviousRABServiceInfo stint). */
export interface UnitDurationNominalRollReportRow extends ReportRowBase {
  /** Stint start date (ISO "yyyy-MM-dd") — RAB Service "From" column. */
  rabServiceFrom?: string | null;
  /** Stint end date (ISO "yyyy-MM-dd"). Null when still serving in that unit. */
  rabServiceTo?: string | null;
  rmks?: string | null;
}

// ── Nominal Roll of Stay in RAB Above N Years ───────────────────────────

/**
 * Request for the long-stay nominal roll. MinDuration + Unit ("Years" | "Months") select the
 * threshold; both default to 2 / "Years" server-side. PostingStatus defaults to "Servings".
 */
export interface LongStayNominalRollReportParams {
  minDuration?: number | null;
  unit?: 'Years' | 'Months' | null;
  orgId?: number | null;
  rankId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

// ── Nominal Roll of Deceased Members ───────────────────────────────────

/** Filter on Date of Death (PresentStatusInfo.Dated); both bounds optional. Mother Org + Rank optional. */
export interface DeceasedReportParams {
  dateFrom?: string | null;
  dateTo?: string | null;
  orgId?: number | null;
  rankId?: number | null;
  pagination: ReportPagination;
}

export interface DeceasedReportRow {
  ser?: number;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  corps?: string | null;
  corpsBN?: string | null;
  trade?: string | null;
  tradeBN?: string | null;
  name?: string | null;
  nameBN?: string | null;
  joiningInRab?: string | null;
  lastUnit?: string | null;
  lastUnitBN?: string | null;
  dateOfDeath?: string | null;
  deceasedReason?: string | null;
  rmks?: string | null;
}

// ── Nominal Roll of Stay in RAB after Reliever Joined ──────────────────

export interface StayAfterRelieverJoinedReportParams {
  orgId?: number | null;
  rankId?: number | null;
  postingStatus?: string | null;
  pagination: ReportPagination;
}

/** One row — subset of the long-stay row, minus Mother Unit / Posting Order Date. */
export interface StayAfterRelieverJoinedReportRow {
  ser?: number;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  name?: string | null;
  nameBN?: string | null;
  joiningInRab?: string | null;
  durationOfStay?: string | null;
  presentUnit?: string | null;
  presentUnitBN?: string | null;
  postedOutUnit?: string | null;
  postedOutUnitBN?: string | null;
  relieverServiceId?: string | null;
  relieverJoiningDate?: string | null;
  rmks?: string | null;
}

/** One row of the long-stay nominal roll. */
export interface LongStayNominalRollReportRow {
  ser?: number;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  name?: string | null;
  nameBN?: string | null;
  motherUnit?: string | null;
  motherUnitBN?: string | null;
  /** ISO "yyyy-MM-dd" — EmployeeInfo.JoiningDate. */
  joiningInRab?: string | null;
  /** Server-formatted "Yy Mm" — gap from current-unit ServiceFrom to today. */
  durationOfStay?: string | null;
  presentUnit?: string | null;
  presentUnitBN?: string | null;
  postedOutUnit?: string | null;
  postedOutUnitBN?: string | null;
  /** ISO "yyyy-MM-dd" — latest PermanentPostingMORecord.PostingOrderDate. */
  postingOrderDate?: string | null;
  /** ISO "yyyy-MM-dd" — Reliever EmployeeInfo.JoiningDate (when reliever's ServiceId exists in EmployeeInfo). */
  relieverJoiningDate?: string | null;
  rmks?: string | null;
}
