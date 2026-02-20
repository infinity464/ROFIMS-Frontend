import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** Leave application (system generated leave). Status: 1=Draft, 2=PendingApproval, 3=Approved, 4=Declined. */
export interface LeaveApplicationModel {
    leaveApplicationId: number;
    applicantEmployeeId: number;
    appliedByEmployeeId: number;
    leaveTypeId: number;
    fromDate: string;
    toDate: string;
    relieverEmployeeId?: number | null;
    addressDuringLeave?: string | null;
    remarks?: string | null;
    recommenderIdsJson?: string | null;
    finalApproverId?: number | null;
    leaveApplicationStatusId: number;
    currentApprovalStep?: number | null;
    approvedByEmployeeId?: number | null;
    approvedDate?: string | null;
    declinedByEmployeeId?: number | null;
    declinedDate?: string | null;
    remark?: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
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

    getByApplicant(applicantEmployeeId: number): Observable<LeaveApplicationModel[]> {
        return this.http.get<LeaveApplicationModel[]>(`${this.apiUrl}/GetByApplicant/${applicantEmployeeId}`).pipe(
            map((res: unknown) => (Array.isArray(res) ? res.map((r: any) => this.normalizeRow(r)) : []))
        );
    }

    /** Normalize API response (PascalCase or camelCase) to LeaveApplicationModel (camelCase). */
    private normalizeRow(r: any): LeaveApplicationModel {
        return {
            leaveApplicationId: r.leaveApplicationId ?? r.LeaveApplicationId ?? 0,
            applicantEmployeeId: r.applicantEmployeeId ?? r.ApplicantEmployeeId ?? 0,
            appliedByEmployeeId: r.appliedByEmployeeId ?? r.AppliedByEmployeeId ?? 0,
            leaveTypeId: r.leaveTypeId ?? r.LeaveTypeId ?? 0,
            fromDate: r.fromDate ?? r.FromDate ?? '',
            toDate: r.toDate ?? r.ToDate ?? '',
            relieverEmployeeId: r.relieverEmployeeId ?? r.RelieverEmployeeId ?? null,
            addressDuringLeave: r.addressDuringLeave ?? r.AddressDuringLeave ?? null,
            remarks: r.remarks ?? r.Remarks ?? null,
            recommenderIdsJson: r.recommenderIdsJson ?? r.RecommenderIdsJson ?? null,
            finalApproverId: r.finalApproverId ?? r.FinalApproverId ?? null,
            leaveApplicationStatusId: r.leaveApplicationStatusId ?? r.LeaveApplicationStatusId ?? 0,
            currentApprovalStep: r.currentApprovalStep ?? r.CurrentApprovalStep ?? null,
            approvedByEmployeeId: r.approvedByEmployeeId ?? r.ApprovedByEmployeeId ?? null,
            approvedDate: r.approvedDate ?? r.ApprovedDate ?? null,
            declinedByEmployeeId: r.declinedByEmployeeId ?? r.DeclinedByEmployeeId ?? null,
            declinedDate: r.declinedDate ?? r.DeclinedDate ?? null,
            remark: r.remark ?? r.Remark ?? null,
            createdBy: r.createdBy ?? r.CreatedBy,
            createdDate: r.createdDate ?? r.CreatedDate,
            lastUpdatedBy: r.lastUpdatedBy ?? r.LastUpdatedBy,
            lastupdate: r.lastupdate ?? r.Lastupdate
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

    delete(leaveApplicationId: number): Observable<ResultViewModel> {
        return this.http.delete<ResultViewModel>(`${this.apiUrl}/DeleteAsyn/${leaveApplicationId}`);
    }
}
