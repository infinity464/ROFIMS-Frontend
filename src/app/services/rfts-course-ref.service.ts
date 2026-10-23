import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { PagedResponse } from '@/Core/Models/Pagination';
import { RftsCourseRefMember, RftsCourseRefModel, RftsCourseRefPayload } from '@/models/rfts-course-ref.model';
import { RftsNominalRoll } from '@/models/rfts-course-ref-report.model';

const API = `${environment.apis.core}/RftsCourseRef`;

@Injectable({ providedIn: 'root' })
export class RftsCourseRefService {
    private http = inject(HttpClient);

    /** The API serialises PascalCase on some paths — normalise to one shape. */
    private mapMember(m: any): RftsCourseRefMember {
        return {
            id: m.id ?? m.Id,
            employeeId: m.employeeId ?? m.EmployeeId ?? 0,
            serviceId: m.serviceId ?? m.ServiceId ?? null,
            rabId: m.rabId ?? m.RabId ?? m.rabID ?? m.RABID ?? null,
            fullNameEN: m.fullNameEN ?? m.FullNameEN ?? null,
            rankName: m.rankName ?? m.RankName ?? null,
            corpsName: m.corpsName ?? m.CorpsName ?? null,
            tradeName: m.tradeName ?? m.TradeName ?? null,
            motherUnitName: m.motherUnitName ?? m.MotherUnitName ?? null,
            isRftsCompleted: m.isRftsCompleted ?? m.IsRftsCompleted ?? false
        };
    }

    private mapRow(r: any): RftsCourseRefModel {
        return {
            id: r.id ?? r.Id ?? 0,
            courseRefNo: r.courseRefNo ?? r.CourseRefNo ?? '',
            courseDate: r.courseDate ?? r.CourseDate ?? '',
            remarks: r.remarks ?? r.Remarks ?? null,
            status: r.status ?? r.Status ?? false,
            memberCount: r.memberCount ?? r.MemberCount ?? 0,
            members: (r.members ?? r.Members ?? []).map((m: any) => this.mapMember(m))
        };
    }

    /** Paged grid (member counts only). */
    getPaged(search: string, pageNo: number, pageSize: number): Observable<PagedResponse<RftsCourseRefModel>> {
        let params = `page_no=${pageNo}&row_per_page=${pageSize}`;
        if (search) params += `&searchValue=${encodeURIComponent(search)}`;
        return this.http.get<PagedResponse<any>>(`${API}/GetPaginated?${params}`).pipe(
            map((res) => ({
                datalist: (res?.datalist ?? []).map((r) => this.mapRow(r)),
                pages: res?.pages ?? { rows: 0, totalPages: 0 }
            }))
        );
    }

    /** Active rows only — for the Course No dropdown on the other RFTS screens. */
    getActive(): Observable<RftsCourseRefModel[]> {
        return this.http.get<any[]>(`${API}/GetActive`).pipe(map((list) => (list ?? []).map((r) => this.mapRow(r))));
    }

    /** Full row including its members — what the edit flow loads. */
    getById(id: number): Observable<RftsCourseRefModel> {
        return this.http.get<any>(`${API}/GetById/${id}`).pipe(map((r) => this.mapRow(r)));
    }

    /** Rows for the nominal-roll export (Print / Word / Excel). */
    getReport(id: number): Observable<RftsNominalRoll> {
        return this.http.get<any>(`${API}/GetReport/${id}`).pipe(
            map((r) => ({
                id: r?.id ?? r?.Id ?? 0,
                courseRefNo: r?.courseRefNo ?? r?.CourseRefNo ?? '',
                courseDate: r?.courseDate ?? r?.CourseDate ?? '',
                remarks: r?.remarks ?? r?.Remarks ?? null,
                rows: (r?.rows ?? r?.Rows ?? []).map((x: any) => ({
                    employeeId: x.employeeId ?? x.EmployeeId ?? 0,
                    groupNameEN: x.groupNameEN ?? x.GroupNameEN ?? null,
                    groupNameBN: x.groupNameBN ?? x.GroupNameBN ?? null,
                    groupSortOrder: x.groupSortOrder ?? x.GroupSortOrder ?? null,
                    motherUnitNameEN: x.motherUnitNameEN ?? x.MotherUnitNameEN ?? null,
                    motherUnitNameBN: x.motherUnitNameBN ?? x.MotherUnitNameBN ?? null,
                    serviceId: x.serviceId ?? x.ServiceId ?? null,
                    rabId: x.rabId ?? x.RabId ?? null,
                    rankNameEN: x.rankNameEN ?? x.RankNameEN ?? null,
                    rankNameBN: x.rankNameBN ?? x.RankNameBN ?? null,
                    rankSortOrder: x.rankSortOrder ?? x.RankSortOrder ?? null,
                    fullNameEN: x.fullNameEN ?? x.FullNameEN ?? null,
                    fullNameBN: x.fullNameBN ?? x.FullNameBN ?? null
                }))
            }))
        );
    }

    create(payload: RftsCourseRefPayload): Observable<{ statusCode: number; description?: string; data?: any }> {
        return this.http.post<any>(`${API}/Save`, payload);
    }

    update(payload: RftsCourseRefPayload): Observable<{ statusCode: number; description?: string; data?: any }> {
        return this.http.put<any>(`${API}/Update`, payload);
    }

    delete(id: number): Observable<{ statusCode: number; description?: string }> {
        return this.http.delete<any>(`${API}/Delete/${id}`);
    }

    /** Drop members from a saved course without touching the header. */
    removeMembers(rftsCourseRefId: number, employeeIds: number[]): Observable<{ statusCode: number; description?: string }> {
        return this.http.post<any>(`${API}/RemoveMembers`, { rftsCourseRefId, employeeIds });
    }
}
