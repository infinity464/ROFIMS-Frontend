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
  /** Combined remark set (present status + inter-posting joining + leave + temp move + additional), from vw_MemberAllRemarks. */
  allRemarks?: string | null;
  allRemarksBN?: string | null;
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
  /** Additional remarks, bullet-joined when an employee has several. */
  rmks?: string | null;
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

/** Confidential Remarks report — only members with confidential remarks. */
export interface ConfidentialRemarksReportRow extends ReportRowBase {
  confidentialRemarks?: string | null;
  rmks?: string | null;
  [key: string]: unknown;
}

export interface ConfidentialRemarksReportParams {
  orgIds?: number[] | null;
  memberTypeIds?: number[] | null;
  rankIds?: number[] | null;
  /** EquivalentName CodeIds — matched through RankEquivalent (RAB rank tier). */
  rabRankIds?: number[] | null;
  corpsIds?: number[] | null;
  tradeIds?: number[] | null;
  rabOrgNodeIds?: number[] | null;
  /** Optional Contains filter on remark text. */
  remarksSearchText?: string | null;
  /** Optional Contains filter matching Service ID or RAB ID. */
  idSearchText?: string | null;
  postingStatus?: string | null;
  /** Registry field keys to project (same as dynamic employee-base report). */
  columns?: string[] | null;
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

/**
 * Report: RFTS Completion. Returns either members who completed at
 * least one RFTS course or members who completed none, filtered by the
 * caller's member-type access scope (no org/unit scope).
 */
export interface RftsCompletionReportRow {
  ser?: number;
  employeeId?: number;
  name?: string | null;
  nameBN?: string | null;
  rabid?: string | null;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  corps?: string | null;
  corpsBN?: string | null;
  trade?: string | null;
  tradeBN?: string | null;
  orgName?: string | null;
  orgNameBN?: string | null;
  /** Only populated for the "Completed" view; 0 for "NotCompleted". */
  coursesCompleted?: number;
  /** Only populated for the "Completed" view. */
  latestCourseNo?: string | null;
  /** Most recent course start date (ISO yyyy-MM-dd). */
  latestCourseDateFrom?: string | null;
  /** Most recent course end date (ISO yyyy-MM-dd). */
  latestCourseDateTo?: string | null;
  /** Additional remarks, bullet-joined when an employee has several. */
  rmks?: string | null;
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
  /**
   * Member-status code (e.g. "Servings", "ExMember", "PendingForJoining",
   * "Supernumerary"). Frontend maps the code to a localized label. Only
   * meaningful when the Status filter is "All" — otherwise every row carries
   * the same value and the column is hidden.
   */
  status?: string | null;
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
  rabUnitId?: number | null;
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

/** One row of the Unit + Duration nominal roll (one per matching PreviousRABServiceInfo stint). */
export interface UnitDurationNominalRollReportRow extends ReportRowBase {
  /**
   * Full-career RAB posting history collapsed into one string, e.g.
   * "01-05-2026 to 03-08-2026 (RAB-4), 04-08-2026-Present (RAB HQ)".
   * Built server-side; the report emits one row per member.
   */
  serviceHistory?: string | null;
  serviceHistoryBN?: string | null;
  /** RAB joining date — start of service; backs the "Duration of Stay" column. */
  joiningInRab?: string | null;
  /** RAB service end date (ex-members) — end of service for "Duration of Stay". */
  rabServiceTo?: string | null;
  postingStatus?: string | null;
  rmks?: string | null;
}

// ── Nominal Roll of Stay in RAB Above N Years ───────────────────────────

// ── Nominal Roll of Deceased Members ───────────────────────────────────

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

/** One row of the "Members Posted Near Home / Wife District" report (#10). */
export interface NearHomeReportRow {
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
  /** ISO "yyyy-MM-dd" — EmployeeInfo.JoiningDate (joining in RAB). */
  joiningInRab?: string | null;
  presentUnit?: string | null;
  presentUnitBN?: string | null;
  /** ISO "yyyy-MM-dd" — active placement ServiceFrom (joining in present Bn/Wg). */
  currentUnitFrom?: string | null;
  ownHomeDistrict?: string | null;
  ownHomeDistrictBN?: string | null;
  spouseHomeDistrict?: string | null;
  spouseHomeDistrictBN?: string | null;
  rmks?: string | null;
}

/** One row of the "Members on Joining Leave" report (#15). */
export interface JoiningLeaveReportRow {
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
  presentBnWg?: string | null;
  presentBnWgBN?: string | null;
  postedBnWg?: string | null;
  postedBnWgBN?: string | null;
  /** ISO "yyyy-MM-dd" — JoiningLeaveTo (date of joining the new unit). */
  joiningDate?: string | null;
  /** Inclusive leave length in days. */
  leaveDuration?: number | null;
  rmks?: string | null;
}

/** One row of the "Members on Movement" report (one row per movement × member). */
export interface MovementReportRow {
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
  movementType?: string | null;
  movementTypeBN?: string | null;
  moveOrderType?: string | null;
  moveOrderTypeBN?: string | null;
  movementReason?: string | null;
  movementReasonBN?: string | null;
  currentUnit?: string | null;
  currentUnitBN?: string | null;
  destinedUnit?: string | null;
  destinedUnitBN?: string | null;
  /** ISO "yyyy-MM-dd" — DateOfRelease. */
  dateOfRelease?: string | null;
  /** Returned flag (true once a temporary movement's return is recorded). */
  isReturned?: boolean | null;
  rmks?: string | null;
}

/** One row of the "Members on Leave" report (leave-application / history). */
export interface LeaveReportRow {
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
  leaveType?: string | null;
  leaveTypeBN?: string | null;
  /** ISO "yyyy-MM-dd" — leave start date. */
  leaveFrom?: string | null;
  /** ISO "yyyy-MM-dd" — leave end date. */
  leaveTo?: string | null;
  /** Inclusive leave length in days. */
  leaveDays?: number | null;
  rmks?: string | null;
}

/** One row of the "Punishment Report" (#23). */
export interface PunishmentReportRow {
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
  offenceDetails?: string | null;
  /** ISO "yyyy-MM-dd" — RAB punishment date. */
  punishmentDate?: string | null;
  punishment?: string | null;
  punishmentBN?: string | null;
  punishmentMo?: string | null;
  punishmentMoBN?: string | null;
  punishmentDateMo?: string | null;
  offenseType?: string | null;
  offenseTypeBN?: string | null;
  briefStatementOfOffence?: string | null;
  briefStatementOfOffenceBN?: string | null;
  isRTU?: boolean | null;
  rmks?: string | null;
}

/** One row of the overall "Employee Present-Status Report". */
export interface PresentStatusReportRow {
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
  motherOrganization?: string | null;
  motherOrganizationBN?: string | null;
  presentUnit?: string | null;
  presentUnitBN?: string | null;
  /** Raw present-status enum ('OnDuty'…'Arrested'); mapped to a label client-side. */
  presentStatus?: string | null;
  /** ISO "yyyy-MM-dd" — status date. */
  statusDate?: string | null;
  statusDetails?: string | null;
  rmks?: string | null;
}

/** One row of the "Rank-wise Report". */
export interface RankWiseReportRow {
  ser?: number;
  serviceId?: string | null;
  rank?: string | null;
  rankBN?: string | null;
  name?: string | null;
  nameBN?: string | null;
  ownHomeDistrict?: string | null;
  ownHomeDistrictBN?: string | null;
  spouseHomeDistrict?: string | null;
  spouseHomeDistrictBN?: string | null;
  motherUnit?: string | null;
  motherUnitBN?: string | null;
  /** ISO "yyyy-MM-dd". */
  dob?: string | null;
  joiningInRab?: string | null;
  joiningPresentUnit?: string | null;
  presentWorkplace?: string | null;
  presentWorkplaceBN?: string | null;
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

// ── Dynamic Employee Report ───────────────────────────────────────────────

/**
 * Field metadata returned by GET /rab/api/DynamicReport/GetFields.
 * Mirrors the backend ReportFieldDefinition shape (camelCased on the wire).
 * Drives the column picker and per-field filter UI on the report-dynamic
 * component.
 */
export interface DynamicReportFieldMeta {
  fieldKey: string;
  displayLabel: string;
  displayLabelBN: string;
  /** "Text" | "ExactId" | "DateRange" | "Boolean" | "Composite" | "Synthetic" */
  fieldType: string;
  /** "Composite" | "Service" | "Personal" — drives MultiSelect grouping. */
  group: string;
  /** "Plain" | "PersonnelComposite" | "AddressComposite" | "Serial" */
  renderHint: string;
  /** CommonCode CodeType for ExactId fields — frontend feeds CommonCodeService. */
  codeType?: string | null;
  /** For composite columns: atomic field keys the SQL projection includes. */
  underlyingFields?: string[] | null;
  defaultVisible: boolean;
  sortOrder: number;
}

/** One filter clause. Matches the backend DynamicSearchCriterion envelope. */
export interface DynamicReportCriterion {
  fieldKey: string;
  textValue?: string | null;
  idValue?: number | null;
  /** Multi-value variant of idValue: match if the row's FK is IN this list.
      Used by the Corps / Trade "N/A" bundle where one UI option collapses
      several CommonCode rows. When set, takes precedence over idValue. */
  idValues?: number[] | null;
  stringIdValue?: string | null;
  /** ISO "yyyy-MM-dd". */
  dateFrom?: string | null;
  /** ISO "yyyy-MM-dd". */
  dateTo?: string | null;
}

export interface DynamicReportSort {
  fieldKey: string;
  /** "asc" | "desc" */
  direction: 'asc' | 'desc';
}

/** Which seniority leads the nominal-roll ordering. Mirrors the server's values. */
export type NominalRollSeniority = 'RankSeniority' | 'OrganizationSeniority';

export interface DynamicReportRequest {
  columns: string[];
  criteria: DynamicReportCriterion[];
  sort?: DynamicReportSort[];
  /** Toolbar quick-search: Contains match against Service ID OR RAB ID. */
  idSearchText?: string | null;
  /**
   * Nominal Roll Seniority — which seniority leads the employee-base ordering.
   * "RankSeniority" leads on the RAB (equivalent) rank ladder — the EquivalentName
   * SortOrder set on basic-setup/equivalent-name, reached through the
   * basic-setup/rank-equivalent map — then Mother Org, then the mother-org rank.
   * It is deliberately NOT the mother-org rank ladder: each org curates its own,
   * so those are only comparable within one org. "OrganizationSeniority" leads on
   * Mother Org, then the mother-org rank (right scale inside a single org).
   * Omitted/null keeps Organization Seniority (the server default).
   */
  nominalRollSeniority?: NominalRollSeniority | null;
  /** "Servings" / "ExMember" / "Supernumerary" / "Pending" / "" (All). */
  postingStatusFilter?: string | null;
  /** "Permanent" / "Present" / "" (All). Matches base + Spouse* server-side. */
  locationTypeFilter?: string | null;
  /** "Self" / "<relationCodeId>" / "" (All). */
  addressOwnerFilter?: string | null;
  /** True = active addresses only (default UI value). */
  activeOnly?: boolean | null;
  // ── Report-specific filter slots (nominal-roll family) ──────────────
  /** Stay-After-Reliever: keep only members whose reliever has joined RAB. */
  relieverJoinedOnly?: boolean | null;
  /** Stay-After-Reliever (inverse): posted out but reliever has NOT yet joined. */
  relieverNotJoinedOnly?: boolean | null;
  /** Stay-After-Reliever (Stand Release): every member in the posted-out list. */
  postedOutAllOnly?: boolean | null;
  /** Stay-After-Reliever (New Posting Person List): joinee-detail entry still pending. */
  newPostingPendingOnly?: boolean | null;
  /** Long-Stay: minimum RAB tenure threshold value (paired with minStayUnit). */
  minStayValue?: number | null;
  /** "Years" (default) | "Months" — unit for minStayValue. */
  minStayUnit?: string | null;
  /** Unit-Duration: REQUIRED RAB Unit (stint unit) for the per-stint view. */
  stintUnitId?: number | null;
  /** Unit-Duration: one or more RAB Units (takes precedence over stintUnitId). */
  stintUnitIds?: number[];
  /** Unit-Duration overlap window start, ISO "yyyy-MM-dd". */
  stintOverlapFrom?: string | null;
  /** Unit-Duration overlap window end, ISO "yyyy-MM-dd". */
  stintOverlapTo?: string | null;
  /** RFTS: "Completed" (default) | "NotCompleted". */
  rftsCompletionStatus?: string | null;
  /** RFTS course-no filter. */
  rftsCourseNo?: string | null;
  /** RFTS course-window start, ISO "yyyy-MM-dd". */
  rftsDateFrom?: string | null;
  /** RFTS course-window end, ISO "yyyy-MM-dd". */
  rftsDateTo?: string | null;
  /** Joining-Leave: leave-window lower bound, ISO "yyyy-MM-dd". Null+null = currently on leave. */
  joiningLeaveDateFrom?: string | null;
  /** Joining-Leave: leave-window upper bound, ISO "yyyy-MM-dd". */
  joiningLeaveDateTo?: string | null;
  /** Leave (leave-application/history): leave-window lower bound, ISO "yyyy-MM-dd". Null+null = currently on leave. */
  leaveDateFrom?: string | null;
  /** Leave: leave-window upper bound, ISO "yyyy-MM-dd". */
  leaveDateTo?: string | null;
  /** Present-Status: selected status type ('OnDuty'…'Arrested'). "" = all. */
  presentStatusTypeFilter?: string | null;
  // ── Movement report ("Members on Movement") ───────────────────────────
  /** Movement: MovementType enum (1 Permanent | 2 Temporary). Null = all. */
  movementType?: number | null;
  /** Movement: MoveOrderType enum (1 CC | 2 MO | 3 Art.47 Handover | 4 Art.47 Takeover). Null = all. */
  moveOrderType?: number | null;
  /** Movement: MovementReasonId (CommonCode 'MovementReason'). Null = all. */
  movementReasonId?: number | null;
  /** Movement: DestinedRABUnitId (unit being moved to). Null = all. */
  destinedRabUnitId?: number | null;
  /** Movement: "NotReturned" (default — currently on movement) | "Returned" | "All". */
  movementReturnedFilter?: string | null;
  /** Movement: DateOfRelease window lower bound, ISO "yyyy-MM-dd". */
  movementDateFrom?: string | null;
  /** Movement: DateOfRelease window upper bound, ISO "yyyy-MM-dd". */
  movementDateTo?: string | null;
  pagination: ReportPagination;
}

/**
 * Each row is a property bag keyed by ReportFieldRegistry field keys —
 * the backend only projects the columns the caller asked for (plus the
 * underlying atomics any selected composite needs).
 */
export type DynamicReportRow = Record<string, unknown>;

export interface DynamicReportAccessibleScope {
  rabUnitIds: number[];
  memberTypeIds: number[];
  orgScopeRestricted: boolean;
  /**
   * True when the same user-supplied criteria would match at least one
   * row IF access filters were not applied. Lets the frontend tell
   * "no permission" apart from "not found" on a filtered-empty result.
   * Optional — only EmployeeBaseOverview currently emits this flag.
   */
  unrestrictedHasMatches?: boolean;
}

export interface DynamicReportResponse {
  datalist: DynamicReportRow[];
  /** Echo of the columns the backend projected, in caller order. */
  columns: string[];
  pages: { Rows?: number; TotalPages?: number; rows?: number; totalPages?: number };
  accessibleScope: DynamicReportAccessibleScope;
}
