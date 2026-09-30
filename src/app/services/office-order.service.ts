import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { GeneralNotesheetOfficeOrderDto, GeneralNotesheetOfficeOrderWithDetailsDto, OfficeOrderMember, OfficeOrderOwnFields } from '@/models/office-order.model';
import { ApprovedNoteSheetItem } from '@/models/posting.model';

const API = `${environment.apis.core}/OfficeOrder`;

/** Member remarks from vw_MemberAllRemarks (same text as the member-type report's Remarks column). */
export interface MemberOfficeOrderRemark {
    remark: string | null;
    remarkBN: string | null;
    rtuRemark?: string | null;
    rtuRemarkBN?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OfficeOrderService {
    constructor(private http: HttpClient) {}

    /** Get approved General notesheets that don't yet have a generated Office Order. */
    getApprovedGeneralNoteSheets(): Observable<ApprovedNoteSheetItem[]> {
        return this.http.get<ApprovedNoteSheetItem[]>(`${API}/GetApprovedGeneralNoteSheetsForOfficeOrder`);
    }

    /** List all Office Orders. */
    getOfficeOrderMasters(): Observable<GeneralNotesheetOfficeOrderDto[]> {
        return this.http.get<GeneralNotesheetOfficeOrderDto[]>(`${API}/GetOfficeOrderMasters`);
    }

    /** Get single Office Order by id with full details. */
    getOfficeOrderById(id: number): Observable<GeneralNotesheetOfficeOrderWithDetailsDto> {
        return this.http.get<GeneralNotesheetOfficeOrderWithDetailsDto>(`${API}/GetOfficeOrderById/${id}`);
    }

    /** A member's "Formal / Clearance is given (subject)" remark and "RTU (subject, date)" remark (null when none). */
    getMemberOfficeOrderRemark(employeeId: number): Observable<MemberOfficeOrderRemark> {
        return this.http.get<MemberOfficeOrderRemark>(`${API}/GetMemberOfficeOrderRemark/${employeeId}`);
    }

    /** Members of an office order generated without a note sheet. */
    getOfficeOrderMembers(id: number): Observable<OfficeOrderMember[]> {
        return this.http.get<OfficeOrderMember[]>(`${API}/GetOfficeOrderMembers/${id}`);
    }

    /** Create a new Office Order. noteSheetId null → without a note sheet (own fields required). */
    createOfficeOrder(body: OfficeOrderOwnFields & {
        letterNo: string;
        letterDate: string;
        noteSheetId: number | null;
        subject?: string | null;
        addressTo?: string | null;
        referenceNo?: string | null;
        body?: string | null;
        onulipi?: string | null;
        attachments?: string | null;
        textType?: string | null;
        filesReferences?: string | null;
        remarks?: string | null;
        createdBy: string;
        postingOrderNumberConfigId?: number | null;
        approvalEmployeeId?: number | null;
    }): Observable<{ statusCode: number; description: string; data?: any }> {
        return this.http.post<{ statusCode: number; description: string; data?: any }>(`${API}/CreateOfficeOrder`, body);
    }

    /** Update an existing Office Order (blocked if already approved). */
    updateOfficeOrder(body: OfficeOrderOwnFields & {
        id: number;
        letterNo: string;
        letterDate: string;
        subject?: string | null;
        addressTo?: string | null;
        referenceNo?: string | null;
        body?: string | null;
        onulipi?: string | null;
        attachments?: string | null;
        textType?: string | null;
        filesReferences?: string | null;
        status?: string | null;
        remarks?: string | null;
        updatedBy: string;
        approvalEmployeeId?: number | null;
    }): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateOfficeOrder`, body);
    }

    /** Approve an Office Order. */
    approveOfficeOrder(id: number, approvalNote: string, approvedBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/ApproveOfficeOrder`, { id, approvalNote, approvedBy });
    }

    /** Cancel an Office Order. */
    cancelOfficeOrder(id: number, cancelReason: string, cancelledBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/CancelOfficeOrder`, { id, cancelReason, cancelledBy });
    }

    /** Get employees for approval person dropdown. */
    getApprovalEmployees(): Observable<{ value: number; label: string }[]> {
        return this.http.get<{ value: number; label: string }[]>(`${API}/GetApprovalEmployees`);
    }
}
