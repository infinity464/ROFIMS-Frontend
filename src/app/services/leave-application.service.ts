import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { PagedResponse } from '@/Core/Models/Pagination';

/** One leave-type row inside a multi-row leave application. */
export interface LeaveApplicationDetailModel {
    leaveApplicationDetailId?: number;
    leaveApplicationId?: number;
    leaveTypeId: number;
    fromDate: string; // yyyy-MM-dd
    toDate: string;   // yyyy-MM-dd
    days?: number;
    sequenceNo?: number;
}

/** Recommender step. Status: 1=Pending, 2=Approved, 3=Declined. */
export interface LeaveApplicationRecommenderModel {
    leaveApplicationRecommenderId?: number;
    leaveApplicationId?: number;
    employeeId: number;
    sequenceNo: number;
    status?: number;
    remarkText?: string | null;
    actionedDate?: string | null;
}

/** Attachment row (FileId points at FileInformation). For reads we also surface fileName for display. */
export interface LeaveApplicationAttachmentModel {
    leaveApplicationAttachmentId?: number;
    leaveApplicationId?: number;
    fileId: number;
    fileName?: string;
}

/** One audit row per "Return to applicant" event. Visible only to the applicant in the apply UI. */
export interface LeaveApplicationReturnHistoryModel {
    leaveApplicationReturnHistoryId?: number;
    leaveApplicationId?: number;
    returnedByEmployeeId: number;
    returnedDate: string;
    reason?: string | null;
}

/**
 * Frozen-at-action ids for the 6 volatile profile attributes (rank, RABUnit, corps, appointment,
 * decoration, profQual). Stored on the leave application so historical previews / leave cards keep
 * showing what was true on the day the actor signed, even after later transfer / promotion. Render
 * code resolves these ids to EN/BN strings via the existing CommonCode / MotherOrg lookup maps.
 */
export interface EmployeeSnapshotIds {
    rankId?: number | null;
    rabUnitId?: number | null;
    corpsId?: number | null;
    appointmentId?: number | null;
    /** May be a CSV of CommonCode ids (mirrors view shape); null when unset. */
    decorationId?: string | null;
    profQualId?: number | null;
}

/** Wraps applicant + appliedBy + reliever — the three "static actors" set at submit time. */
export interface ActorsSnapshotEnvelope {
    applicant?: EmployeeSnapshotIds | null;
    appliedBy?: EmployeeSnapshotIds | null;
    reliever?: EmployeeSnapshotIds | null;
}

/** One entry inside RecommendersSnapshotJson, keyed by sequenceNo (1-based, unique within an app). */
export interface RecommenderSnapshotEntry extends EmployeeSnapshotIds {
    sequenceNo: number;
    employeeId: number;
}

/** Leave application (system generated leave). Status: 1=Draft, 2=PendingApproval, 3=Approved, 4=Declined. */
export interface LeaveApplicationModel {
    leaveApplicationId: number;
    applicantEmployeeId: number;
    appliedByEmployeeId: number;
    /** 'automatic' or 'manual' — required from backend (mandatory selection). */
    processType: string;
    /** Summary leave type (first detail row); kept for backward compatibility with list views. */
    leaveTypeId?: number | null;
    /** Summary earliest from-date (min across detail rows). */
    fromDate?: string | null;
    /** Summary latest to-date (max across detail rows). */
    toDate?: string | null;
    relieverEmployeeId?: number | null;
    addressDuringLeave?: string | null;
    remarks?: string | null;
    finalApproverId?: number | null;
    leaveApplicationStatusId: number;
    approvedByEmployeeId?: number | null;
    approvedDate?: string | null;
    declinedByEmployeeId?: number | null;
    declinedDate?: string | null;
    remark?: string | null;
    /** Auto-generated on final approval from LeaveCardNumberConfig. Null on draft/pending/declined. */
    leaveCertificateNo?: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
    /** Per-row leave entries. At least one row is required on save. */
    leaveDetails?: LeaveApplicationDetailModel[];
    /** Recommender chain (0..N) walked between submit and FinalApprover. */
    recommenders?: LeaveApplicationRecommenderModel[];
    /** File attachments (0..N). */
    attachments?: LeaveApplicationAttachmentModel[];
    /** Audit log of every "Return to applicant" event on this application. */
    returnHistory?: LeaveApplicationReturnHistoryModel[];
    /** Raw JSON columns from the backend — kept for round-tripping. Prefer the parsed siblings below at render time. */
    actorsSnapshotJson?: string | null;
    recommendersSnapshotJson?: string | null;
    finalApproverSnapshotJson?: string | null;
    /** Pre-parsed snapshot envelopes (filled in by normalizeRow). Null when the row predates the snapshot feature. */
    actorsSnapshot?: ActorsSnapshotEnvelope | null;
    recommendersSnapshot?: RecommenderSnapshotEntry[] | null;
    finalApproverSnapshot?: EmployeeSnapshotIds | null;
}

/** Filter params for GetByStatusForUserPaginated (server-side). */
export interface LeaveApplicationFilterParams {
    rabId?: string;
    serviceId?: string;
    leaveTypeId?: number;
    fromDate?: string; // yyyy-MM-dd
    toDate?: string;
}

export interface ResultViewModel {
    statusCode?: number;
    StatusCode?: number;
    description?: string;
    Description?: string;
    data?: unknown;
}

@Injectable({
    providedIn: 'root'
})
export class LeaveApplicationService {
    private apiUrl = `${environment.apis.core}/LeaveApplication`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<LeaveApplicationModel[]> {
        return this.http.get<LeaveApplicationModel[]>(`${this.apiUrl}/GetAll`).pipe(
            map((res: unknown) => (Array.isArray(res) ? res : []))
        );
    }

    getById(id: number): Observable<LeaveApplicationModel | null> {
        return this.http.get<LeaveApplicationModel>(`${this.apiUrl}/GetById/${id}`).pipe(
            map((res: any) => (res ? this.normalizeRow(res) : null))
        );
    }

    getByStatus(leaveApplicationStatusId: number | null): Observable<LeaveApplicationModel[]> {
        const options = leaveApplicationStatusId != null
            ? { params: { leaveApplicationStatusId: String(leaveApplicationStatusId) } as Record<string, string> }
            : {};
        return this.http.get<LeaveApplicationModel[]>(`${this.apiUrl}/GetByStatus`, options).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r: any) => this.normalizeRow(r)) : []))
        );
    }

    /** Get applications by status, filtered to those visible to current user (applicant, appliedBy, or finalApprover). */
    getByStatusForUser(leaveApplicationStatusId: number | null, currentUserEmployeeId: number): Observable<LeaveApplicationModel[]> {
        const params: Record<string, string> = { currentUserEmployeeId: String(currentUserEmployeeId) };
        if (leaveApplicationStatusId != null) params['leaveApplicationStatusId'] = String(leaveApplicationStatusId);
        return this.http.get<LeaveApplicationModel[]>(`${this.apiUrl}/GetByStatusForUser`, { params }).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r: any) => this.normalizeRow(r)) : []))
        );
    }

    /** Get applications by status and type with server-side pagination. Optional filter. additionalStatusIds combines with leaveApplicationStatusId for multi-status views (e.g. "All Approved & Declined" → pass null for leaveApplicationStatusId and [3,4] here). myDecisionFilter ('approved' | 'declined') narrows actionTakenByMe results to the user's own action regardless of overall status. includeReturned=true also surfaces apps currently returned to the applicant (status=1 with return history). onlyReturned=true narrows to ONLY those returned apps. */
    getByStatusForUserPaginated(
        leaveApplicationStatusId: number | null,
        currentUserEmployeeId: number,
        typeFilter: string,
        pageNo: number,
        rowPerPage: number,
        filter?: LeaveApplicationFilterParams,
        additionalStatusIds?: number[],
        myDecisionFilter?: 'approved' | 'declined' | null,
        includeReturned?: boolean,
        onlyReturned?: boolean
    ): Observable<PagedResponse<LeaveApplicationModel>> {
        let params = new HttpParams()
            .set('currentUserEmployeeId', String(currentUserEmployeeId))
            .set('typeFilter', typeFilter)
            .set('page_no', String(pageNo))
            .set('row_per_page', String(rowPerPage));
        if (leaveApplicationStatusId != null) params = params.set('leaveApplicationStatusId', String(leaveApplicationStatusId));
        if (additionalStatusIds && additionalStatusIds.length > 0) {
            for (const s of additionalStatusIds) params = params.append('additionalStatusIds', String(s));
        }
        if (myDecisionFilter) params = params.set('myDecisionFilter', myDecisionFilter);
        if (includeReturned) params = params.set('includeReturned', 'true');
        if (onlyReturned) params = params.set('onlyReturned', 'true');
        if (filter) {
            if (filter.rabId?.trim()) params = params.set('rabId', filter.rabId.trim());
            if (filter.serviceId?.trim()) params = params.set('serviceId', filter.serviceId.trim());
            if (filter.leaveTypeId != null && filter.leaveTypeId > 0) params = params.set('leaveTypeId', String(filter.leaveTypeId));
            if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
            if (filter.toDate) params = params.set('toDate', filter.toDate);
        }
        return this.http.get<{ datalist: unknown; pages: { Rows?: number; rows?: number; TotalPages?: number; totalPages?: number } }>(`${this.apiUrl}/GetByStatusForUserPaginated`, { params }).pipe(
            map((res: any) => ({
                datalist: (Array.isArray(res?.datalist) ? res.datalist : []).map((r: any) => this.normalizeRow(r)),
                pages: {
                    // Backend returns camelCase (System.Text.Json default) but accept PascalCase too for safety.
                    rows: res?.pages?.rows ?? res?.pages?.Rows ?? 0,
                    totalPages: res?.pages?.totalPages ?? res?.pages?.TotalPages ?? 0
                }
            }))
        );
    }

    /** Admin-style "full history": every leave application with the full recommender chain attached. Optional filters. */
    getAllPaginated(
        pageNo: number,
        rowPerPage: number,
        filter?: LeaveApplicationFilterParams,
        statusIds?: number[]
    ): Observable<PagedResponse<LeaveApplicationModel>> {
        let params = new HttpParams()
            .set('page_no', String(pageNo))
            .set('row_per_page', String(rowPerPage));
        if (statusIds && statusIds.length > 0) {
            for (const s of statusIds) params = params.append('statusIds', String(s));
        }
        if (filter) {
            if (filter.rabId?.trim()) params = params.set('rabId', filter.rabId.trim());
            if (filter.serviceId?.trim()) params = params.set('serviceId', filter.serviceId.trim());
            if (filter.leaveTypeId != null && filter.leaveTypeId > 0) params = params.set('leaveTypeId', String(filter.leaveTypeId));
            if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
            if (filter.toDate) params = params.set('toDate', filter.toDate);
        }
        return this.http.get<{ datalist: unknown; pages: { Rows?: number; rows?: number; TotalPages?: number; totalPages?: number } }>(`${this.apiUrl}/GetAllPaginated`, { params }).pipe(
            map((res: any) => ({
                datalist: (Array.isArray(res?.datalist) ? res.datalist : []).map((r: any) => this.normalizeRow(r)),
                pages: {
                    rows: res?.pages?.rows ?? res?.pages?.Rows ?? 0,
                    totalPages: res?.pages?.totalPages ?? res?.pages?.TotalPages ?? 0
                }
            }))
        );
    }

    getByApplicant(applicantEmployeeId: number): Observable<LeaveApplicationModel[]> {
        return this.http.get<LeaveApplicationModel[]>(`${this.apiUrl}/GetByApplicant/${applicantEmployeeId}`).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r: any) => this.normalizeRow(r)) : []))
        );
    }

    /** Parses one of the snapshot JSON columns. Returns null on null/empty/invalid. */
    private parseJson<T>(raw: string | null | undefined): T | null {
        if (!raw) return null;
        try { return JSON.parse(raw) as T; } catch { return null; }
    }

    /** Normalize API response (PascalCase or camelCase) to LeaveApplicationModel (camelCase). */
    private normalizeRow(r: any): LeaveApplicationModel {
        const detailsRaw = r.leaveDetails ?? r.LeaveDetails ?? [];
        const recommendersRaw = r.recommenders ?? r.Recommenders ?? [];
        const attachmentsRaw = r.attachments ?? r.Attachments ?? [];
        const returnHistoryRaw = r.returnHistory ?? r.ReturnHistory ?? [];
        const actorsJson = r.actorsSnapshotJson ?? r.ActorsSnapshotJson ?? null;
        const recommendersJson = r.recommendersSnapshotJson ?? r.RecommendersSnapshotJson ?? null;
        const finalApproverJson = r.finalApproverSnapshotJson ?? r.FinalApproverSnapshotJson ?? null;
        return {
            leaveApplicationId: r.leaveApplicationId ?? r.LeaveApplicationId ?? 0,
            applicantEmployeeId: r.applicantEmployeeId ?? r.ApplicantEmployeeId ?? 0,
            appliedByEmployeeId: r.appliedByEmployeeId ?? r.AppliedByEmployeeId ?? 0,
            processType: r.processType ?? r.ProcessType ?? '',
            leaveTypeId: r.leaveTypeId ?? r.LeaveTypeId ?? null,
            fromDate: r.fromDate ?? r.FromDate ?? null,
            toDate: r.toDate ?? r.ToDate ?? null,
            relieverEmployeeId: r.relieverEmployeeId ?? r.RelieverEmployeeId ?? null,
            addressDuringLeave: r.addressDuringLeave ?? r.AddressDuringLeave ?? null,
            remarks: r.remarks ?? r.Remarks ?? null,
            finalApproverId: r.finalApproverId ?? r.FinalApproverId ?? null,
            leaveApplicationStatusId: r.leaveApplicationStatusId ?? r.LeaveApplicationStatusId ?? 0,
            approvedByEmployeeId: r.approvedByEmployeeId ?? r.ApprovedByEmployeeId ?? null,
            approvedDate: r.approvedDate ?? r.ApprovedDate ?? null,
            declinedByEmployeeId: r.declinedByEmployeeId ?? r.DeclinedByEmployeeId ?? null,
            declinedDate: r.declinedDate ?? r.DeclinedDate ?? null,
            remark: r.remark ?? r.Remark ?? null,
            leaveCertificateNo: r.leaveCertificateNo ?? r.LeaveCertificateNo ?? null,
            createdBy: r.createdBy ?? r.CreatedBy,
            createdDate: r.createdDate ?? r.CreatedDate,
            lastUpdatedBy: r.lastUpdatedBy ?? r.LastUpdatedBy,
            lastupdate: r.lastupdate ?? r.Lastupdate,
            leaveDetails: (Array.isArray(detailsRaw) ? detailsRaw : []).map((d: any) => ({
                leaveApplicationDetailId: d.leaveApplicationDetailId ?? d.LeaveApplicationDetailId,
                leaveApplicationId: d.leaveApplicationId ?? d.LeaveApplicationId,
                leaveTypeId: d.leaveTypeId ?? d.LeaveTypeId,
                fromDate: d.fromDate ?? d.FromDate ?? '',
                toDate: d.toDate ?? d.ToDate ?? '',
                days: d.days ?? d.Days,
                sequenceNo: d.sequenceNo ?? d.SequenceNo
            } as LeaveApplicationDetailModel)),
            recommenders: (Array.isArray(recommendersRaw) ? recommendersRaw : []).map((rc: any) => ({
                leaveApplicationRecommenderId: rc.leaveApplicationRecommenderId ?? rc.LeaveApplicationRecommenderId,
                leaveApplicationId: rc.leaveApplicationId ?? rc.LeaveApplicationId,
                employeeId: rc.employeeId ?? rc.EmployeeId,
                sequenceNo: rc.sequenceNo ?? rc.SequenceNo,
                status: rc.status ?? rc.Status,
                remarkText: rc.remarkText ?? rc.RemarkText ?? null,
                actionedDate: rc.actionedDate ?? rc.ActionedDate ?? null
            } as LeaveApplicationRecommenderModel)),
            attachments: (Array.isArray(attachmentsRaw) ? attachmentsRaw : []).map((a: any) => ({
                leaveApplicationAttachmentId: a.leaveApplicationAttachmentId ?? a.LeaveApplicationAttachmentId,
                leaveApplicationId: a.leaveApplicationId ?? a.LeaveApplicationId,
                fileId: a.fileId ?? a.FileId,
                fileName: a.file?.fileName ?? a.File?.FileName ?? a.fileName ?? a.FileName
            } as LeaveApplicationAttachmentModel)),
            returnHistory: (Array.isArray(returnHistoryRaw) ? returnHistoryRaw : []).map((h: any) => ({
                leaveApplicationReturnHistoryId: h.leaveApplicationReturnHistoryId ?? h.LeaveApplicationReturnHistoryId,
                leaveApplicationId: h.leaveApplicationId ?? h.LeaveApplicationId,
                returnedByEmployeeId: h.returnedByEmployeeId ?? h.ReturnedByEmployeeId,
                returnedDate: h.returnedDate ?? h.ReturnedDate ?? '',
                reason: h.reason ?? h.Reason ?? null
            } as LeaveApplicationReturnHistoryModel)),
            actorsSnapshotJson: actorsJson,
            recommendersSnapshotJson: recommendersJson,
            finalApproverSnapshotJson: finalApproverJson,
            actorsSnapshot: this.parseJson<ActorsSnapshotEnvelope>(actorsJson),
            recommendersSnapshot: this.parseJson<RecommenderSnapshotEntry[]>(recommendersJson),
            finalApproverSnapshot: this.parseJson<EmployeeSnapshotIds>(finalApproverJson)
        };
    }

    save(model: Partial<LeaveApplicationModel>): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/SaveAsyn`, model);
    }

    update(model: Partial<LeaveApplicationModel>): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/UpdateAsyn`, model);
    }

    submitForApproval(leaveApplicationId: number): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/SubmitForApproval`, { leaveApplicationId });
    }

    approve(leaveApplicationId: number, employeeId: number, remark: string): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/Approve`, {
            leaveApplicationId,
            employeeId,
            remark: remark || ''
        });
    }

    decline(leaveApplicationId: number, employeeId: number, remark: string): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/Decline`, {
            leaveApplicationId,
            employeeId,
            remark: remark || ''
        });
    }

    /** Sends a Pending application back to the applicant. The reason is required by the backend. */
    returnApplication(leaveApplicationId: number, employeeId: number, reason: string): Observable<ResultViewModel> {
        return this.http.post<ResultViewModel>(`${this.apiUrl}/Return`, {
            leaveApplicationId,
            employeeId,
            remark: reason || ''
        });
    }

    delete(leaveApplicationId: number): Observable<ResultViewModel> {
        return this.http.delete<ResultViewModel>(`${this.apiUrl}/DeleteAsyn/${leaveApplicationId}`);
    }
}
