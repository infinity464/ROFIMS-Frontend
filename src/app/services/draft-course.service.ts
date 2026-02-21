import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { DraftCourseList, DraftCourseMemberRow, SendToCourseDetails } from '@/models/draft-course.model';

const API = `${environment.apis.core}/DraftCourse`;

@Injectable({ providedIn: 'root' })
export class DraftCourseService {
    constructor(private http: HttpClient) {}

    getDraftCourseLists(): Observable<DraftCourseList[]> {
        return this.http.get<any[]>(`${API}/GetDraftCourseLists`).pipe(
            map((list) =>
                (list ?? []).map((l) => ({
                    id: l.id ?? l.Id,
                    listNo: l.listNo ?? l.ListNo ?? '',
                    listDate: l.listDate ?? l.ListDate ?? '',
                    courseNameId: l.courseNameId ?? l.CourseNameId ?? 0,
                    courseName: l.courseName ?? l.CourseName ?? '',
                    members: (l.members ?? []).map((m: any) => ({
                        employeeId: m.employeeId ?? m.EmployeeId,
                        serviceId: m.serviceId ?? m.ServiceId ?? null,
                        rabId: m.rabId ?? m.RabId ?? null,
                        fullNameEN: m.fullNameEN ?? m.FullNameEN ?? null,
                        rankName: m.rankName ?? m.RankName ?? null,
                        corpsName: m.corpsName ?? m.CorpsName ?? null,
                        tradeName: m.tradeName ?? m.TradeName ?? null,
                        motherUnitName: m.motherUnitName ?? m.MotherUnitName ?? null
                    })),
                    createdBy: l.createdBy ?? l.CreatedBy ?? '',
                    createdDate: l.createdDate ?? l.CreatedDate ?? ''
                }))
            )
        );
    }

    getDraftCourseListById(id: number): Observable<DraftCourseList | null> {
        return this.http.get<any>(`${API}/GetDraftCourseListById/${id}`).pipe(
            map((l) => {
                if (!l) return null;
                return {
                    id: l.id ?? l.Id,
                    listNo: l.listNo ?? l.ListNo ?? '',
                    listDate: l.listDate ?? l.ListDate ?? '',
                    courseNameId: l.courseNameId ?? l.CourseNameId ?? 0,
                    courseName: l.courseName ?? l.CourseName ?? '',
                    members: (l.members ?? []).map((m: any) => ({
                        employeeId: m.employeeId ?? m.EmployeeId,
                        serviceId: m.serviceId ?? m.ServiceId ?? null,
                        rabId: m.rabId ?? m.RabId ?? null,
                        fullNameEN: m.fullNameEN ?? m.FullNameEN ?? null,
                        rankName: m.rankName ?? m.RankName ?? null,
                        corpsName: m.corpsName ?? m.CorpsName ?? null,
                        tradeName: m.tradeName ?? m.TradeName ?? null,
                        motherUnitName: m.motherUnitName ?? m.MotherUnitName ?? null
                    })),
                    createdBy: l.createdBy ?? l.CreatedBy ?? '',
                    createdDate: l.createdDate ?? l.CreatedDate ?? ''
                };
            })
        );
    }

    addToDraftCourseList(
        courseNo: string,
        courseNameId: number,
        members: DraftCourseMemberRow[],
        createdBy: string
    ): Observable<{ statusCode: number; description?: string; id: number; listNo: string }> {
        const body = {
            courseNo: courseNo?.trim() || '',
            courseNameId,
            members: members.map((m) => ({
                employeeId: m.employeeId,
                serviceId: m.serviceId ?? null,
                rabId: m.rabId ?? null,
                fullNameEN: m.fullNameEN ?? null,
                rankName: m.rankName ?? null,
                corpsName: m.corpsName ?? null,
                tradeName: m.tradeName ?? null,
                motherUnitName: m.motherUnitName ?? null
            })),
            createdBy
        };
        return this.http.post<any>(`${API}/AddToDraftCourseList`, body).pipe(
            map((r) => ({
                statusCode: r?.statusCode ?? 200,
                description: r?.description,
                id: r?.data?.id ?? r?.data?.Id ?? 0,
                listNo: r?.data?.listNo ?? r?.data?.ListNo ?? ''
            }))
        );
    }

    sendFromDraftToCourse(
        draftListId: number,
        createdBy: string,
        details?: SendToCourseDetails
    ): Observable<{ statusCode: number; description: string; recordsCreated: number }> {
        const body: Record<string, unknown> = {
            draftListId,
            createdBy
        };
        if (details) {
            if (details['courseType'] != null) body['courseType'] = details['courseType'];
            if (details['trainingInstituteId'] != null) body['trainingInstituteId'] = details['trainingInstituteId'];
            if (details['dateFrom'] != null && details['dateFrom'] !== '') body['dateFrom'] = details['dateFrom'];
            if (details['dateTo'] != null && details['dateTo'] !== '') body['dateTo'] = details['dateTo'];
            if (details['result'] != null && details['result'] !== '') body['result'] = details['result'];
            if (details['auth'] != null && details['auth'] !== '') body['auth'] = details['auth'];
            if (details['remarks'] != null && details['remarks'] !== '') body['remarks'] = details['remarks'];
        }
        return this.http
            .post<{ statusCode: number; description: string; recordsCreated: number }>(`${API}/SendFromDraftToCourse`, body)
            .pipe(
                map((r) => ({
                    statusCode: r?.statusCode ?? 500,
                    description: r?.description ?? 'Unknown error',
                    recordsCreated: r?.recordsCreated ?? 0
                }))
            );
    }

    removeMembersFromDraft(draftListId: number, employeeIds: number[]): Observable<{ statusCode: number; description: string }> {
        return this.http
            .post<{ statusCode: number; description: string }>(`${API}/RemoveMembersFromDraft`, { draftListId, employeeIds })
            .pipe(map((r) => ({ statusCode: r?.statusCode ?? 500, description: r?.description ?? 'Unknown error' })));
    }

    addMembersToDraft(draftListId: number, members: DraftCourseMemberRow[]): Observable<{ statusCode: number; description: string }> {
        const body = {
            draftListId,
            members: members.map((m) => ({
                employeeId: m.employeeId,
                serviceId: m.serviceId ?? null,
                rabId: m.rabId ?? null,
                fullNameEN: m.fullNameEN ?? null,
                rankName: m.rankName ?? null,
                corpsName: m.corpsName ?? null,
                tradeName: m.tradeName ?? null,
                motherUnitName: m.motherUnitName ?? null
            }))
        };
        return this.http
            .post<{ statusCode: number; description: string }>(`${API}/AddMembersToDraft`, body)
            .pipe(map((r) => ({ statusCode: r?.statusCode ?? 500, description: r?.description ?? 'Unknown error' })));
    }
}
