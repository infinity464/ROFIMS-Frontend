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
  AddressLocationReportParams,
  AddressLocationReportRow,
  MemberTypeServingReportParams,
  MemberTypeServingReportRow,
  ReportPagedResponse,
  PresentStatusByMotherOrgReportParams,
  PresentStatusByMotherOrgReportResponse,
  PresentStatusUnitWiseReportParams,
  PresentStatusUnitWiseReportResponse,
  UnitDurationNominalRollReportParams,
  UnitDurationNominalRollReportRow,
  LongStayNominalRollReportParams,
  LongStayNominalRollReportRow,
} from '@/models/report.model';
import type { PagedResponse } from '@/Core/Models/Pagination';

/** Normalize backend pages (Rows/TotalPages) to frontend PageInfo (rows/totalPages). */
function normalizePages<T>(res: ReportPagedResponse<T>): PagedResponse<T> {
  const p = res.pages || {};
  const rows = p.rows ?? p.Rows ?? 0;
  const totalPages = p.totalPages ?? p.TotalPages ?? 0;
  return {
    datalist: res.datalist ?? [],
    pages: { rows, totalPages },
  };
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly apiUrl = `${environment.apis.core}/EmployeeInfo`;

  constructor(private http: HttpClient) {}

  getMemberAppointmentReport(
    params: MemberAppointmentReportParams
  ): Observable<PagedResponse<MemberAppointmentReportRow>> {
    return this.http
      .post<ReportPagedResponse<MemberAppointmentReportRow>>(
        `${this.apiUrl}/GetMemberAppointmentReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getBatchCourseReport(
    params: BatchCourseReportParams
  ): Observable<PagedResponse<BatchCourseReportRow>> {
    return this.http
      .post<ReportPagedResponse<BatchCourseReportRow>>(
        `${this.apiUrl}/GetBatchCourseReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getEducationReport(
    params: EducationReportParams
  ): Observable<PagedResponse<EducationReportRow>> {
    return this.http
      .post<ReportPagedResponse<EducationReportRow>>(
        `${this.apiUrl}/GetEducationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getMotherOrgReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetMotherOrgReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getOfficerTypeReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetOfficerTypeReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getRabUnitReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetRabUnitReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getWingsReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetWingsReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getPersonalQualificationReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetPersonalQualificationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getProfessionalQualificationReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetProfessionalQualificationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getSpecialQualificationReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetSpecialQualificationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getRabRankReport(
    params: GenericReportParams
  ): Observable<PagedResponse<GenericReportRow>> {
    return this.http
      .post<ReportPagedResponse<GenericReportRow>>(
        `${this.apiUrl}/GetRabRankReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getBloodGroupReport(
    params: BloodGroupReportParams
  ): Observable<PagedResponse<BloodGroupReportRow>> {
    return this.http
      .post<ReportPagedResponse<BloodGroupReportRow>>(
        `${this.apiUrl}/GetBloodGroupReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getFamilyOccupationReport(
    params: FamilyOccupationReportParams
  ): Observable<PagedResponse<FamilyOccupationReportRow>> {
    return this.http
      .post<ReportPagedResponse<FamilyOccupationReportRow>>(
        `${this.apiUrl}/GetFamilyOccupationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getAddressLocationReport(
    params: AddressLocationReportParams
  ): Observable<PagedResponse<AddressLocationReportRow>> {
    return this.http
      .post<ReportPagedResponse<AddressLocationReportRow>>(
        `${this.apiUrl}/GetAddressLocationReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getMemberTypeServingReport(
    params: MemberTypeServingReportParams
  ): Observable<PagedResponse<MemberTypeServingReportRow>> {
    return this.http
      .post<ReportPagedResponse<MemberTypeServingReportRow>>(
        `${this.apiUrl}/GetMemberTypeServingReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getPresentStatusByMotherOrgReport(
    params: PresentStatusByMotherOrgReportParams
  ): Observable<PresentStatusByMotherOrgReportResponse> {
    return this.http.post<PresentStatusByMotherOrgReportResponse>(
      `${this.apiUrl}/GetPresentStatusByMotherOrgReport`,
      params
    );
  }

  getPresentStatusUnitWiseReport(
    params: PresentStatusUnitWiseReportParams
  ): Observable<PresentStatusUnitWiseReportResponse> {
    return this.http.post<PresentStatusUnitWiseReportResponse>(
      `${this.apiUrl}/GetPresentStatusUnitWiseReport`,
      params
    );
  }

  getUnitDurationNominalRollReport(
    params: UnitDurationNominalRollReportParams
  ): Observable<PagedResponse<UnitDurationNominalRollReportRow>> {
    return this.http
      .post<ReportPagedResponse<UnitDurationNominalRollReportRow>>(
        `${this.apiUrl}/GetUnitDurationNominalRollReport`,
        params
      )
      .pipe(map(normalizePages));
  }

  getLongStayNominalRollReport(
    params: LongStayNominalRollReportParams
  ): Observable<PagedResponse<LongStayNominalRollReportRow>> {
    return this.http
      .post<ReportPagedResponse<LongStayNominalRollReportRow>>(
        `${this.apiUrl}/GetLongStayNominalRollReport`,
        params
      )
      .pipe(map(normalizePages));
  }
}
