import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface ExBdLeaveApplicationModel {
    exBdLeaveApplicationId: number;
    applicationDate: string;
    applicantEmployeeId: number;
    visitTypeId: number | null;
    destinationCountriesJson: string | null;
    fromDate: string;
    toDate: string;
    totalDays: number;
    familyMembersJson: string | null;
    filesReferencesJson: string | null;
    applicationStatus: string;
    availStatus: string | null;
    availStartDate: string | null;
    availEndDate: string | null;
    noteSheetId: number | null;
    remarks: string | null;
    createdBy: string | null;
    createdDate: string | null;
    lastUpdatedBy: string | null;
    lastupdate: string | null;
    isDeleted: boolean;
    deletedBy: string | null;
}

export interface DestinationCountryItem {
    countryId: number;
    countryName: string;
}

export interface FamilyMemberItem {
    employeeId: number;
    fmid: number;
    nameEN: string;
    relation: string;
}

export interface FileReferenceItem {
    fileId: number;
    fileName: string;
}

export interface ExBdLeaveApplicationListViewModel {
    exBdLeaveApplicationId: number;
    applicationDate: string;
    applicantEmployeeId: number;
    applicantServiceId: string | null;
    rabid: string | null;
    applicantPrefix: string | null;
    applicantName: string | null;
    applicantRank: string | null;
    applicantPlacement: string | null;
    visitTypeId: number | null;
    visitTypeName: string | null;
    destinationCountriesJson: string | null;
    destinationCountriesDisplay: string | null;
    fromDate: string;
    toDate: string;
    totalDays: number;
    familyMembersJson: string | null;
    familyMembersDisplay: string | null;
    filesReferencesJson: string | null;
    applicationStatus: string;
    noteSheetId: number | null;
    remarks: string | null;
    isDeleted: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ExBdLeaveApplicationService {
    private baseUrl = `${environment.apis.core}/ExBdLeaveApplication`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<ExBdLeaveApplicationModel[]> {
        return this.http.get<ExBdLeaveApplicationModel[]>(`${this.baseUrl}/GetAll`).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }

    getById(id: number): Observable<ExBdLeaveApplicationModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetById/${id}`).pipe(
            map((res: any) => {
                const arr = Array.isArray(res) ? res : res ? [res] : [];
                return arr.length ? arr[0] : null;
            })
        );
    }

    getByNoteSheetId(noteSheetId: number): Observable<ExBdLeaveApplicationModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetByNoteSheetId/${noteSheetId}`).pipe(
            map((res: any) => {
                const arr = Array.isArray(res) ? res : res ? [res] : [];
                return arr.length ? arr[0] : null;
            })
        );
    }

    getByApplicant(employeeId: number): Observable<ExBdLeaveApplicationModel[]> {
        return this.http.get<ExBdLeaveApplicationModel[]>(`${this.baseUrl}/GetByApplicant/${employeeId}`).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }

    getByStatus(status: string): Observable<ExBdLeaveApplicationModel[]> {
        return this.http.get<ExBdLeaveApplicationModel[]>(`${this.baseUrl}/GetByStatus`, {
            params: { applicationStatus: status }
        }).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }

    getListView(fromDate?: string, toDate?: string, noteSheetStatus?: string): Observable<ExBdLeaveApplicationListViewModel[]> {
        const params: any = {};
        if (fromDate) params.fromDate = fromDate;
        if (toDate) params.toDate = toDate;
        if (noteSheetStatus) params.noteSheetStatus = noteSheetStatus;
        return this.http.get<ExBdLeaveApplicationListViewModel[]>(`${this.baseUrl}/GetListView`, { params }).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }

    save(model: Partial<ExBdLeaveApplicationModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveAsyn`, model);
    }

    update(model: Partial<ExBdLeaveApplicationModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/UpdateAsyn`, model);
    }

    saveUpdate(model: Partial<ExBdLeaveApplicationModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, model);
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }

    checkEligibility(employeeId: number, fromDate?: string, toDate?: string): Observable<any> {
        const params: any = {};
        if (fromDate) params.fromDate = fromDate;
        if (toDate) params.toDate = toDate;
        return this.http.get<any>(`${this.baseUrl}/CheckEligibility/${employeeId}`, { params });
    }

    availLeave(payload: { exBdLeaveApplicationId: number; availStatus: string; availStartDate?: string; availEndDate?: string; remarks?: string; currentUser?: string }): Observable<any> {
        return this.http.post(`${this.baseUrl}/AvailLeave`, payload);
    }

    // ── JSON helpers ───────────────────────────────────────────────────

    static parseCountries(json: string | null): DestinationCountryItem[] {
        if (!json) return [];
        try { return JSON.parse(json); } catch { return []; }
    }

    static parseFamilyMembers(json: string | null): FamilyMemberItem[] {
        if (!json) return [];
        try { return JSON.parse(json); } catch { return []; }
    }

    static parseFiles(json: string | null): FileReferenceItem[] {
        if (!json) return [];
        try { return JSON.parse(json); } catch { return []; }
    }

    // ── Progress view ────────────────────────────────────────────────

    getProgressByEmployee(employeeId: number): Observable<ExBdLeaveApplicationProgressView[]> {
        return this.http.get<ExBdLeaveApplicationProgressView[]>(`${this.baseUrl}/GetProgressByEmployee/${employeeId}`).pipe(
            map((res: any) => (Array.isArray(res) ? res : []))
        );
    }
}

export interface ExBdLeaveApplicationProgressView {
    exBdLeaveApplicationId: number;
    applicationDate: string;
    applicantEmployeeId: number;
    visitTypeId: number | null;
    visitTypeName: string | null;
    visitTypeNameBN: string | null;
    destinationCountriesJson: string | null;
    countriesDisplay: string | null;
    countriesDisplayBN: string | null;
    fromDate: string;
    toDate: string;
    totalDays: number;
    familyMembersJson: string | null;
    familyMembersDisplay: string | null;
    familyMembersDisplayBN: string | null;
    applicationStatus: string;
    availStatus: string | null;
    noteSheetId: number | null;
    noteSheetNo: string | null;
    noteSheetCurrentStatus: string | null;
    nsInitiatorStatus: string | null;
    nsFinalApprovalStatus: string | null;
    officeOrderId: number | null;
    officeOrderLetterNo: string | null;
    officeOrderStatus: string | null;
    officeOrderApprovalStatus: string | null;
    progressStatus: string;
    isDeleted: boolean;
}
