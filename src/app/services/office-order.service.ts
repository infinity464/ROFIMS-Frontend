import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { GeneralNotesheetOfficeOrderDto, GeneralNotesheetOfficeOrderWithDetailsDto } from '@/models/office-order.model';
import { ApprovedNoteSheetItem } from '@/models/posting.model';

const API = `${environment.apis.core}/OfficeOrder`;

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

    /** Create a new Office Order. */
    createOfficeOrder(body: {
        letterNo: string;
        letterDate: string;
        noteSheetId: number;
        subject?: string | null;
        addressTo?: string | null;
        referenceNo?: string | null;
        body?: string | null;
        attachment?: string | null;
        onulipi?: string | null;
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
        attachment?: string | null;
        onulipi?: string | null;
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
