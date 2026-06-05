import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import type {
    MemberAppointmentReportParams,
    MemberAppointmentReportRow,
    BatchCourseReportParams,
    BatchCourseReportRow,
    EducationReportParams,
    EducationReportRow,
    GenericReportParams,
    GenericReportRow,
    BloodGroupReportParams,
    BloodGroupReportRow,
    FamilyOccupationReportParams,
    FamilyOccupationReportRow,
    RftsCompletionReportParams,
    RftsCompletionReportRow,
    AddressLocationReportParams,
    AddressLocationReportRow,
    AddressLocationReportPagedResponse,
    ScopedReportPagedResponse,
    ReportAccessibleScope,
    MemberTypeServingReportParams,
    MemberTypeServingReportRow,
    ReportPagedResponse,
    PresentStatusByMotherOrgReportParams,
    PresentStatusByMotherOrgReportResponse,
    PresentStatusUnitWiseReportParams,
    PresentStatusUnitWiseReportResponse,
    UnitDurationNominalRollReportRow,
    LongStayNominalRollReportRow,
    StayAfterRelieverJoinedReportRow,
    DeceasedReportRow,
    DynamicReportFieldMeta,
    DynamicReportRequest,
    DynamicReportResponse
} from '@/models/report.model';
import type { PagedResponse } from '@/Core/Models/Pagination';

/** Normalize backend pages (Rows/TotalPages) to frontend PageInfo (rows/totalPages). */
function normalizePages<T>(res: ReportPagedResponse<T>): PagedResponse<T> {
    const p = res.pages || {};
    const rows = p.rows ?? p.Rows ?? 0;
    const totalPages = p.totalPages ?? p.TotalPages ?? 0;
    return {
        datalist: res.datalist ?? [],
        pages: { rows, totalPages }
    };
}

/**
 * Same as {@link normalizePages} but preserves the accessibleScope envelope
 * shipped by scope-aware report endpoints under employee-reports. The
 * component reads `accessibleScope` to render the unit / member-type chip
 * and lock the PostingStatus filter when the caller is org-restricted.
 */
function normalizeScopedPages<T>(res: ScopedReportPagedResponse<T>): PagedResponse<T> & { accessibleScope: ReportAccessibleScope | null } {
    return {
        ...normalizePages(res),
        accessibleScope: res.accessibleScope ?? null
    };
}

@Injectable({ providedIn: 'root' })
export class ReportService {
    private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

    constructor(private http: HttpClient) {}

    /**
     * Returns ONLY the caller's access-scope snapshot, no report data. Used by
     * the /employee-reports parent so it can lock its shared PostingStatus
     * dropdown on init (before any child report has fired).
     */
    getMyReportAccessScope(): Observable<ReportAccessibleScope> {
        return this.http.get<ReportAccessibleScope>(`${this.apiUrl}/GetMyReportAccessScope`);
    }

    getMemberAppointmentReport(params: MemberAppointmentReportParams): Observable<PagedResponse<MemberAppointmentReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<MemberAppointmentReportRow>>(`${this.apiUrl}/GetMemberAppointmentReport`, params).pipe(map(normalizeScopedPages));
    }

    getBatchCourseReport(params: BatchCourseReportParams): Observable<PagedResponse<BatchCourseReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<BatchCourseReportRow>>(`${this.apiUrl}/GetBatchCourseReport`, params).pipe(map(normalizeScopedPages));
    }

    getEducationReport(params: EducationReportParams): Observable<PagedResponse<EducationReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<EducationReportRow>>(`${this.apiUrl}/GetEducationReport`, params).pipe(map(normalizeScopedPages));
    }

    getMotherOrgReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetMotherOrgReport`, params).pipe(map(normalizeScopedPages));
    }

    getOfficerTypeReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetOfficerTypeReport`, params).pipe(map(normalizeScopedPages));
    }

    getCorpsReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetCorpsReport`, params).pipe(map(normalizeScopedPages));
    }

    getTradeReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetTradeReport`, params).pipe(map(normalizeScopedPages));
    }

    getRabUnitReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetRabUnitReport`, params).pipe(map(normalizeScopedPages));
    }

    getWingsReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetWingsReport`, params).pipe(map(normalizeScopedPages));
    }

    getPersonalQualificationReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetPersonalQualificationReport`, params).pipe(map(normalizeScopedPages));
    }

    getProfessionalQualificationReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetProfessionalQualificationReport`, params).pipe(map(normalizeScopedPages));
    }

    getSpecialQualificationReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetSpecialQualificationReport`, params).pipe(map(normalizeScopedPages));
    }

    getRabRankReport(params: GenericReportParams): Observable<PagedResponse<GenericReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<GenericReportRow>>(`${this.apiUrl}/GetRabRankReport`, params).pipe(map(normalizeScopedPages));
    }

    getBloodGroupReport(params: BloodGroupReportParams): Observable<PagedResponse<BloodGroupReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<BloodGroupReportRow>>(`${this.apiUrl}/GetBloodGroupReport`, params).pipe(map(normalizeScopedPages));
    }

    getFamilyOccupationReport(params: FamilyOccupationReportParams): Observable<PagedResponse<FamilyOccupationReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<FamilyOccupationReportRow>>(`${this.apiUrl}/GetFamilyOccupationReport`, params).pipe(map(normalizeScopedPages));
    }

    getRftsCompletionReport(params: RftsCompletionReportParams): Observable<PagedResponse<RftsCompletionReportRow>> {
        return this.http.post<ReportPagedResponse<RftsCompletionReportRow>>(`${this.apiUrl}/GetRftsCompletionReport`, params).pipe(map(normalizePages));
    }

    getAddressLocationReport(params: AddressLocationReportParams): Observable<PagedResponse<AddressLocationReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<AddressLocationReportRow>>(`${this.apiUrl}/GetAddressLocationReport`, params).pipe(map(normalizeScopedPages));
    }

    getMemberTypeServingReport(params: MemberTypeServingReportParams): Observable<PagedResponse<MemberTypeServingReportRow> & { accessibleScope: ReportAccessibleScope | null }> {
        return this.http.post<ScopedReportPagedResponse<MemberTypeServingReportRow>>(`${this.apiUrl}/GetMemberTypeServingReport`, params).pipe(map(normalizeScopedPages));
    }

    getPresentStatusByMotherOrgReport(params: PresentStatusByMotherOrgReportParams): Observable<PresentStatusByMotherOrgReportResponse> {
        return this.http.post<PresentStatusByMotherOrgReportResponse>(`${this.apiUrl}/GetPresentStatusByMotherOrgReport`, params);
    }

    getPresentStatusUnitWiseReport(params: PresentStatusUnitWiseReportParams): Observable<PresentStatusUnitWiseReportResponse> {
        return this.http.post<PresentStatusUnitWiseReportResponse>(`${this.apiUrl}/GetPresentStatusUnitWiseReport`, params);
    }

    // ── Dynamic Employee Report ─────────────────────────────────────────────
    // These hit a different controller (`DynamicReport`) than the rest of the
    // report endpoints, so they build their URLs against the core API base
    // rather than `apiUrl` (which is scoped to `/EmployeeInfo`).

    /** Field catalog for the column picker + filter builder. Result is stable
      for the session; callers should cache (e.g. shareReplay) on their side. */
    getDynamicReportFields(): Observable<DynamicReportFieldMeta[]> {
        return this.http.get<DynamicReportFieldMeta[]>(`${environment.apis.core}/DynamicReport/GetFields`);
    }

    /** Runs the dynamic report. Backend echoes the columns it projected so the
      UI can render headers in the order the user asked for. */
    runDynamicReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/EmployeeOverview`, req);
    }

    /** Family-member-cardinality counterpart to runDynamicReport. Same wire
      shape — backs the family-occupation report's full column picker. */
    runDynamicFamilyReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/FamilyMemberOverview`, req);
    }

    /** Per-employee variant — one row per employee (no address row
      multiplication). Use for any employee-overview report where
      address-cardinality from runDynamicReport would produce duplicates. */
    runDynamicEmployeeBaseReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/EmployeeBaseOverview`, req);
    }

    /** Course-cardinality variant — one row per (employee × course). Backs
      the standalone Course report under individual-reports. */
    runDynamicEmployeeCourseReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/EmployeeCourseOverview`, req);
    }

    /** Education-cardinality variant — one row per (employee × education).
      Backs the Individual Personnel → Education report. */
    runDynamicEmployeeEducationReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/EmployeeEducationOverview`, req);
    }

    /** Field catalog for the dynamic Death Member report (employee fields +
      deceased-specific dateOfDeath / deceasedReason / lastUnit). */
    getDeceasedReportFields(): Observable<DynamicReportFieldMeta[]> {
        return this.http.get<DynamicReportFieldMeta[]>(`${environment.apis.core}/DynamicReport/GetDeceasedFields`);
    }

    /** Deceased-cardinality variant — one row per deceased member (the
      'Deceased' present-status filter is baked into the view). Backs the
      Death Member report's dynamic column picker. */
    runDynamicDeceasedReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/DeceasedOverview`, req);
    }

    /** Field catalog for the long-stay family (Stay over N Years + Stay After
      Reliever Joined). */
    getLongStayReportFields(): Observable<DynamicReportFieldMeta[]> {
        return this.http.get<DynamicReportFieldMeta[]>(`${environment.apis.core}/DynamicReport/GetLongStayFields`);
    }

    /** Long-stay-cardinality variant (one row per employee). The request's
      relieverJoinedOnly / minStayValue + minStayUnit select between the two
      reports. */
    runDynamicLongStayReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/LongStayOverview`, req);
    }

    /** Field catalog for the Unit-Duration nominal roll (per-stint). */
    getUnitDurationReportFields(): Observable<DynamicReportFieldMeta[]> {
        return this.http.get<DynamicReportFieldMeta[]>(`${environment.apis.core}/DynamicReport/GetUnitDurationFields`);
    }

    /** Unit-duration-cardinality variant — one row per posting stint. Requires
      stintUnitId; optional stintOverlapFrom / stintOverlapTo. */
    runDynamicUnitDurationReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/UnitDurationOverview`, req);
    }

    /** Field catalog for the RFTS-completion report. */
    getRftsReportFields(): Observable<DynamicReportFieldMeta[]> {
        return this.http.get<DynamicReportFieldMeta[]>(`${environment.apis.core}/DynamicReport/GetRftsFields`);
    }

    /** RFTS-completion variant (one row per employee). The request's
      rftsCompletionStatus / rftsCourseNo / rftsDateFrom / rftsDateTo drive the
      Completed-vs-NotCompleted membership + the latest-course columns. */
    runDynamicRftsReport(req: DynamicReportRequest): Observable<DynamicReportResponse> {
        return this.http.post<DynamicReportResponse>(`${environment.apis.core}/DynamicReport/RftsOverview`, req);
    }
}
