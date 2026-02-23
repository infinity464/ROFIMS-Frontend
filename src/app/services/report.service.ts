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
  ReportPagedResponse,
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
}
