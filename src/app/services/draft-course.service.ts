import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { DraftCourseList, DraftCourseMemberRow, RftsCourseSummary, RftsTrainingRow, SendToCourseDetails } from '@/models/draft-course.model';
import { RftsNominalRoll } from '@/models/rfts-course-ref-report.model';

const API = `${environment.apis.core}/DraftCourse`;

@Injectable({ providedIn: 'root' })
export class DraftCourseService {
    constructor(private http: HttpClient) {}

    private mapList(l: any): DraftCourseList {
        return {
            id: l.id ?? l.Id,
            listNo: l.listNo ?? l.ListNo ?? '',
            listDate: l.listDate ?? l.ListDate ?? '',
            courseNameId: l.courseNameId ?? l.CourseNameId ?? null,
            courseName: l.courseName ?? l.CourseName ?? null,
            dateFrom: l.dateFrom ?? l.DateFrom ?? null,
            dateTo: l.dateTo ?? l.DateTo ?? null,
            members: (l.members ?? []).map((m: any) => ({
                employeeId: m.employeeId ?? m.EmployeeId,
                serviceId: m.serviceId ?? m.ServiceId ?? null,
                rabId: m.rabid ?? m.rabId ?? m.RabId ?? m.rabID ?? m.RABID ?? null,
                fullNameEN: m.fullNameEN ?? m.FullNameEN ?? null,
                rankName: m.rankName ?? m.RankName ?? null,
                corpsName: m.corpsName ?? m.CorpsName ?? null,
                tradeName: m.tradeName ?? m.TradeName ?? null,
                motherUnitName: m.motherUnitName ?? m.MotherUnitName ?? null
            })),
            createdBy: l.createdBy ?? l.CreatedBy ?? '',
            createdDate: l.createdDate ?? l.CreatedDate ?? ''
        };
    }

    getDraftCourseLists(): Observable<DraftCourseList[]> {
        return this.http.get<any[]>(`${API}/GetDraftCourseLists`).pipe(
            map((list) => (list ?? []).map((l) => this.mapList(l)))
        );
    }

    /** Lists that passed first approval and await final approval. */
    getPendingApprovalLists(): Observable<DraftCourseList[]> {
        return this.http.get<any[]>(`${API}/GetPendingApprovalLists`).pipe(
            map((list) => (list ?? []).map((l) => this.mapList(l)))
        );
    }

    /** First approval: move a Draft list to "Pending for Final Approval". */
    moveDraftToPending(draftListId: number, updatedBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http
            .post<{ statusCode: number; description: string }>(`${API}/MoveDraftToPending`, { draftListId, updatedBy })
            .pipe(map((r) => ({ statusCode: r?.statusCode ?? 500, description: r?.description ?? 'Unknown error' })));
    }

    getDraftCourseListById(id: number): Observable<DraftCourseList | null> {
        return this.http.get<any>(`${API}/GetDraftCourseListById/${id}`).pipe(
            map((l) => {
                if (!l) return null;
                return {
                    id: l.id ?? l.Id,
                    listNo: l.listNo ?? l.ListNo ?? '',
                    listDate: l.listDate ?? l.ListDate ?? '',
                    courseNameId: l.courseNameId ?? l.CourseNameId ?? null,
                    courseName: l.courseName ?? l.CourseName ?? null,
                    dateFrom: l.dateFrom ?? l.DateFrom ?? null,
                    dateTo: l.dateTo ?? l.DateTo ?? null,
                    members: (l.members ?? []).map((m: any) => ({
                        employeeId: m.employeeId ?? m.EmployeeId,
                        serviceId: m.serviceId ?? m.ServiceId ?? null,
                        rabId: m.rabid ?? m.rabId ?? m.RabId ?? m.rabID ?? m.RABID ?? null,
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

    /** Shared shape for every nominal-roll endpoint (draft, completed course). */
    private mapNominalRoll(r: any): RftsNominalRoll {
        return {
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
        };
    }

    /**
     * Rows for the draft's nominal-roll export. Shares the RFTS roll shape —
     * ListNo maps to courseRefNo, ListDate to courseDate — so every page renders
     * through the same RftsNominalRollService.
     */
    getNominalRoll(draftListId: number): Observable<RftsNominalRoll> {
        return this.http.get<any>(`${API}/GetNominalRoll/${draftListId}`).pipe(map((r) => this.mapNominalRoll(r)));
    }

    /** Rows for a completed course's nominal-roll export, keyed by course no. */
    getRftsTrainingNominalRoll(courseNo: string | null): Observable<RftsNominalRoll> {
        const qs = courseNo ? `?courseNo=${encodeURIComponent(courseNo)}` : '';
        return this.http.get<any>(`${API}/GetRftsTrainingNominalRoll${qs}`).pipe(map((r) => this.mapNominalRoll(r)));
    }

    addToDraftCourseList(
        courseNo: string,
        courseNameId: number | null,
        members: DraftCourseMemberRow[],
        createdBy: string,
        dateFrom?: string | null,
        dateTo?: string | null
    ): Observable<{ statusCode: number; description?: string; id: number; listNo: string }> {
        const body: Record<string, unknown> = {
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
        if (dateFrom) body['dateFrom'] = dateFrom;
        if (dateTo) body['dateTo'] = dateTo;
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
        details?: SendToCourseDetails,
        memberRemarks?: { employeeId: number; remarks: string }[]
    ): Observable<{ statusCode: number; description: string; recordsCreated: number }> {
        const body: Record<string, unknown> = {
            draftListId,
            createdBy
        };
        if (details) {
            if (details['courseNo'] != null && details['courseNo'] !== '') body['courseNo'] = details['courseNo'];
            if (details['courseType'] != null) body['courseType'] = details['courseType'];
            if (details['courseName'] != null) body['courseName'] = details['courseName'];
            if (details['trainingInstituteId'] != null) body['trainingInstituteId'] = details['trainingInstituteId'];
            if (details['dateFrom'] != null && details['dateFrom'] !== '') body['dateFrom'] = details['dateFrom'];
            if (details['dateTo'] != null && details['dateTo'] !== '') body['dateTo'] = details['dateTo'];
            if (details['result'] != null && details['result'] !== '') body['result'] = details['result'];
            if (details['auth'] != null && details['auth'] !== '') body['auth'] = details['auth'];
            if (details['remarks'] != null && details['remarks'] !== '') body['remarks'] = details['remarks'];
        }
        if (memberRemarks?.length) body['memberRemarks'] = memberRemarks;
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

    deleteDraft(draftListId: number): Observable<{ statusCode: number; description: string }> {
        return this.http
            .post<{ statusCode: number; description: string }>(`${API}/DeleteDraft`, { draftListId })
            .pipe(map((r) => ({ statusCode: r?.statusCode ?? 500, description: r?.description ?? 'Unknown error' })));
    }

    getAllRftsTraining(): Observable<RftsTrainingRow[]> {
        return this.http.get<any[]>(`${API}/GetAllRftsTraining`).pipe(
            map((list) =>
                (list ?? []).map((r) => ({
                    id: r.id ?? r.Id,
                    employeeId: r.employeeId ?? r.EmployeeId,
                    fullNameEN: r.fullNameEN ?? r.FullNameEN ?? null,
                    rabId: r.rabId ?? r.RabId ?? null,
                    serviceId: r.serviceId ?? r.ServiceId ?? null,
                    rankName: r.rankName ?? r.RankName ?? null,
                    corpsName: r.corpsName ?? r.CorpsName ?? null,
                    tradeName: r.tradeName ?? r.TradeName ?? null,
                    motherUnitName: r.motherUnitName ?? r.MotherUnitName ?? null,
                    courseTypeName: r.courseTypeName ?? r.CourseTypeName ?? null,
                    courseNameDisplay: r.courseNameDisplay ?? r.CourseNameDisplay ?? null,
                    courseNo: r.courseNo ?? r.CourseNo ?? null,
                    dateFrom: r.dateFrom ?? r.DateFrom ?? null,
                    dateTo: r.dateTo ?? r.DateTo ?? null,
                    result: r.result ?? r.Result ?? null,
                    auth: r.auth ?? r.Auth ?? null,
                    remarks: r.remarks ?? r.Remarks ?? null,
                    createdBy: r.createdBy ?? r.CreatedBy ?? null,
                    createdDate: r.createdDate ?? r.CreatedDate ?? null
                }))
            )
        );
    }

    /** Course-group headers for /emp-rfts-completed (one row per courseNo, count only). */
    getRftsCourseSummaries(): Observable<RftsCourseSummary[]> {
        return this.http.get<any[]>(`${API}/GetRftsCourseSummaries`).pipe(
            map((list) =>
                (list ?? []).map((r) => ({
                    courseNo: r.courseNo ?? r.CourseNo ?? null,
                    courseTypeName: r.courseTypeName ?? r.CourseTypeName ?? null,
                    courseNameDisplay: r.courseNameDisplay ?? r.CourseNameDisplay ?? null,
                    dateFrom: r.dateFrom ?? r.DateFrom ?? null,
                    dateTo: r.dateTo ?? r.DateTo ?? null,
                    memberCount: r.memberCount ?? r.MemberCount ?? 0
                }))
            )
        );
    }

    /** Members of one RFTS course group, loaded lazily when a course is clicked. */
    getRftsTrainingByCourseNo(courseNo: string | null): Observable<RftsTrainingRow[]> {
        const qs = courseNo ? `?courseNo=${encodeURIComponent(courseNo)}` : '';
        return this.http.get<any[]>(`${API}/GetRftsTrainingByCourseNo${qs}`).pipe(
            map((list) =>
                (list ?? []).map((r) => ({
                    id: r.id ?? r.Id,
                    employeeId: r.employeeId ?? r.EmployeeId,
                    fullNameEN: r.fullNameEN ?? r.FullNameEN ?? null,
                    rabId: r.rabId ?? r.RabId ?? null,
                    serviceId: r.serviceId ?? r.ServiceId ?? null,
                    rankName: r.rankName ?? r.RankName ?? null,
                    corpsName: r.corpsName ?? r.CorpsName ?? null,
                    tradeName: r.tradeName ?? r.TradeName ?? null,
                    motherUnitName: r.motherUnitName ?? r.MotherUnitName ?? null,
                    courseTypeName: r.courseTypeName ?? r.CourseTypeName ?? null,
                    courseNameDisplay: r.courseNameDisplay ?? r.CourseNameDisplay ?? null,
                    courseNo: r.courseNo ?? r.CourseNo ?? null,
                    dateFrom: r.dateFrom ?? r.DateFrom ?? null,
                    dateTo: r.dateTo ?? r.DateTo ?? null,
                    result: r.result ?? r.Result ?? null,
                    auth: r.auth ?? r.Auth ?? null,
                    remarks: r.remarks ?? r.Remarks ?? null,
                    createdBy: r.createdBy ?? r.CreatedBy ?? null,
                    createdDate: r.createdDate ?? r.CreatedDate ?? null
                }))
            )
        );
    }

    getRftsTrainingByEmployeeId(employeeId: number): Observable<RftsTrainingRow[]> {
        return this.http.get<any[]>(`${API}/GetRftsTrainingByEmployeeId/${employeeId}`).pipe(
            map((list) =>
                (list ?? []).map((r) => ({
                    id: r.id ?? r.Id,
                    employeeId: r.employeeId ?? r.EmployeeId,
                    fullNameEN: r.fullNameEN ?? r.FullNameEN ?? null,
                    rabId: r.rabId ?? r.RabId ?? null,
                    serviceId: r.serviceId ?? r.ServiceId ?? null,
                    rankName: r.rankName ?? r.RankName ?? null,
                    corpsName: r.corpsName ?? r.CorpsName ?? null,
                    tradeName: r.tradeName ?? r.TradeName ?? null,
                    motherUnitName: r.motherUnitName ?? r.MotherUnitName ?? null,
                    courseTypeName: r.courseTypeName ?? r.CourseTypeName ?? null,
                    courseNameDisplay: r.courseNameDisplay ?? r.CourseNameDisplay ?? null,
                    courseNo: r.courseNo ?? r.CourseNo ?? null,
                    dateFrom: r.dateFrom ?? r.DateFrom ?? null,
                    dateTo: r.dateTo ?? r.DateTo ?? null,
                    result: r.result ?? r.Result ?? null,
                    auth: r.auth ?? r.Auth ?? null,
                    remarks: r.remarks ?? r.Remarks ?? null,
                    createdBy: r.createdBy ?? r.CreatedBy ?? null,
                    createdDate: r.createdDate ?? r.CreatedDate ?? null
                }))
            )
        );
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
