import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { ApprovedNoteSheetItem } from '@/models/posting.model';

const API = `${environment.apis.core}/ExBdLeaveClearance`;

export interface ExBdLeaveClearanceDto {
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

export interface ExBdLeaveClearanceWithDetailsDto {
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
    approvalStatus: string | null;
    approvalNote: string | null;
    cancelReason: string | null;
    approvalDate: string | null;
    approvalEmployeeName: string;
    approvalEmployeeRank: string;
    approvalEmployeeAppointment: string;
    approvalEmployeeRabUnit: string;
}

@Injectable({ providedIn: 'root' })
export class ExBdLeaveClearanceService {
    constructor(private http: HttpClient) {}

    getApprovedExBdLeaveNoteSheets(): Observable<ApprovedNoteSheetItem[]> {
        return this.http.get<ApprovedNoteSheetItem[]>(`${API}/GetApprovedExBdLeaveNoteSheetsForClearance`);
    }

    getClearanceMasters(): Observable<ExBdLeaveClearanceDto[]> {
        return this.http.get<ExBdLeaveClearanceDto[]>(`${API}/GetClearanceMasters`);
    }

    getClearanceById(id: number): Observable<ExBdLeaveClearanceWithDetailsDto> {
        return this.http.get<ExBdLeaveClearanceWithDetailsDto>(`${API}/GetClearanceById/${id}`);
    }

    createClearance(body: {
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
        return this.http.post<{ statusCode: number; description: string; data?: any }>(`${API}/CreateClearance`, body);
    }

    updateClearance(body: {
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
        return this.http.post<{ statusCode: number; description: string }>(`${API}/UpdateClearance`, body);
    }

    approveClearance(id: number, approvalNote: string, approvedBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/ApproveClearance`, { id, approvalNote, approvedBy });
    }

    cancelClearance(id: number, cancelReason: string, cancelledBy: string): Observable<{ statusCode: number; description: string }> {
        return this.http.post<{ statusCode: number; description: string }>(`${API}/CancelClearance`, { id, cancelReason, cancelledBy });
    }

    getApprovalEmployees(): Observable<{ value: number; label: string }[]> {
        return this.http.get<{ value: number; label: string }[]>(`${API}/GetApprovalEmployees`);
    }
}
