import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_MOServHistoryByEmployee. API: MOServHistory/ViewByEmployeeId/{employeeId} */
export interface MOServHistoryByEmployeeView {
    employeeID: number;
    ser: number;
    orgId?: number | null;
    organizationName: string | null;
    orgUnitId?: number | null;
    locationName: string | null;
    serviceFrom: string | null;
    serviceTo: string | null;
    auth: string | null;
    appointmentId?: number | null;
    appointment: string | null;
    remarks: string | null;
}

export interface MOServHistoryModel {
    servHisID: number;
    employeeID: number;
    orgId?: number | null;
    orgUnitId?: number | null;
    locationName?: string | null;
    serviceFrom?: string | null;
    serviceTo?: string | null;
    auth?: string | null;
    appointment?: number | null;
    remarks?: string | null;
    filesReferences?: string | null;
    createdBy?: string | null;
    createdDate?: string;
    lastUpdatedBy?: string | null;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class MOServHistoryService {
    private apiUrl = `${environment.apis.core}/MOServHistory`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<MOServHistoryModel[]> {
        return this.http.get<MOServHistoryModel[]>(`${this.apiUrl}/GetAll`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    getByOrgId(orgId: number): Observable<MOServHistoryModel[]> {
        return this.getAll().pipe(map((list) => list.filter((x) => (x.orgId ?? (x as any).OrgId) === orgId)));
    }

    getByEmployeeId(employeeId: number): Observable<MOServHistoryModel[]> {
        return this.http.get<MOServHistoryModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Gets list from vw_MOServHistoryByEmployee by employee ID (for profile display). */
    getViewByEmployeeId(employeeId: number): Observable<MOServHistoryByEmployeeView[]> {
        return this.http.get<MOServHistoryByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    save(payload: Partial<MOServHistoryModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    saveUpdate(payload: Partial<MOServHistoryModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, body);
    }

    delete(servHisID: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${servHisID}`);
    }

    private toApiPayload(payload: Partial<MOServHistoryModel>): any {
        const now = new Date().toISOString();
        return {
            servHisID: payload.servHisID ?? 0,
            employeeID: payload.employeeID ?? 0,
            orgId: payload.orgId ?? null,
            orgUnitId: payload.orgUnitId ?? null,
            locationName: payload.locationName ?? null,
            serviceFrom: payload.serviceFrom ?? null,
            serviceTo: payload.serviceTo ?? null,
            auth: payload.auth ?? null,
            appointment: payload.appointment ?? null,
            remarks: payload.remarks ?? '',
            filesReferences: payload.filesReferences ?? null,
            createdBy: payload.createdBy ?? 'user',
            createdDate: payload.createdDate ?? now,
            lastUpdatedBy: payload.lastUpdatedBy ?? 'user',
            lastupdate: payload.lastupdate ?? now
        };
    }
}
