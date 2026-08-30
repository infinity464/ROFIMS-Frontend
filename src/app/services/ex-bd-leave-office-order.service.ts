import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { ApprovedNoteSheetItem } from '@/models/posting.model';

const API = `${environment.apis.core}/ExBdLeaveOfficeOrder`;

export interface ExBdLeaveOfficeOrderDto {
    id: number;
    letterNo: string;
    letterDate: string;
    noteSheetId: number;
    noteSheetNo: string;
    /** Linked note-sheet's member-type ids — used to scope the list by user access. */
    employeeTypeIds?: string | null;
    subject: string;
    textType: string;
    status: string;
    remarks: string;
    createdBy: string;
    createdDate: string;
    approvalEmployeeId: number | null;
    approvalEmployeeName: string | null;
    approvalStatus: string | null;
    approvalNote: string | null;
    cancelReason: string | null;
    approvalDate: string | null;
    applicantName: string | null;
    applicantPrefix: string | null;
    applicantServiceId: string | null;
}

export interface ExBdLeaveOfficeOrderWithDetailsDto {
    id: number;
    letterNo: string;
    letterDate: string;
    noteSheetId: number;
    noteSheetNo: string;
    subject: string;
    addressTo: string;
    referenceNo: string;
    body: string;
    onulipi: string;
    attachments: string;
    textType: string;
    filesReferences: string;
    status: string;
    remarks: string;
    createdBy: string;
    createdDate: string;
    approvalEmployeeId: number | null;
    approvalEmployeeName: string | null;
    approvalStatus: string | null;
    approvalNote: string | null;
    cancelReason: string | null;
    approvalDate: string | null;
    nsMainText: string;
    nsNote: string;
    nsParagraphText: string;
    // Application info (from ExBdLeaveApplication via NoteSheet)
    appEmployeeName: string | null;
    appEmployeeNameBN: string | null;
    appEmployeeRabId: string | null;
    appEmployeeServiceId: string | null;
    appEmployeeRank: string | null;
    appEmployeeRankBN: string | null;
    appVisitTypeName: string | null;
    appVisitTypeNameBN: string | null;
    appFromDate: string | null;
    appToDate: string | null;
    appTotalDays: number | null;
    appCountriesDisplay: string | null;
    appCountriesDisplayBN: string | null;
    appFamilyMembersDisplay: string | null;
    appEmployeeRabUnit: string | null;
    appEmployeeRabUnitBN: string | null;
    approvalEmployeeNameBN: string;
    approvalEmployeeRank: string;
    approvalEmployeeRankBN: string;
    approvalEmployeeAppointment: string;
    approvalEmployeeAppointmentBN: string;
    approvalEmployeeRabUnit: string;
    approvalEmployeeRabUnitBN: string;
    approvalEmployeeEmail: string;
}

@Injectable({ providedIn: 'root' })
export class ExBdLeaveOfficeOrderService {
    constructor(private http: HttpClient) {}

    /** Get approved Ex-BD Leave notesheets that don't yet have a generated Office Order. */
    getApprovedExBdLeaveNoteSheets(): Observable<ApprovedNoteSheetItem[]> {
        return this.http.get<ApprovedNoteSheetItem[]>(`${API}/GetApprovedExBdLeaveNoteSheetsForOfficeOrder`);
    }

    /** List all Ex-BD Leave Office Orders. */
    getOfficeOrderMasters(): Observable<ExBdLeaveOfficeOrderDto[]> {
        return this.http.get<ExBdLeaveOfficeOrderDto[]>(`${API}/GetOfficeOrderMasters`);
    }

    /** Get single Office Order by id with full details. */
    getOfficeOrderById(id: number): Observable<ExBdLeaveOfficeOrderWithDetailsDto> {
        return this.http.get<ExBdLeaveOfficeOrderWithDetailsDto>(`${API}/GetOfficeOrderById/${id}`);
    }

    /** Create a new Office Order. */
    createOfficeOrder(body: {
        letterNo: string;
        letterDate: string;
        noteSheetId: number;
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
    updateOfficeOrder(body: {
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
