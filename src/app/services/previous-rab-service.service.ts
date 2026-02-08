import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** View model with FK display names (from vw_PreviousRABServiceInfo). */
export interface VwPreviousRABServiceInfoModel {
    employeeID: number;
    previousRABServiceID: number;
    rabUnitCodeId?: number | null;
    serviceFrom?: string | null;
    serviceTo?: string | null;
    appointment?: number | null;
    postingAuth?: string | null;
    remarks?: string | null;
    documentPath?: string | null;
    filesReferences?: string | null;
    createdBy?: string | null;
    createdDate?: string;
    lastUpdatedBy?: string | null;
    lastupdate?: string;
    employeeServiceId?: string | null;
    employeeRABID?: string | null;
    employeeFullNameEN?: string | null;
    employeeFullNameBN?: string | null;
    rabUnitName?: string | null;
    rabUnitNameBN?: string | null;
    appointmentName?: string | null;
    appointmentNameBN?: string | null;
}

export interface PreviousRABServiceInfoModel {
    employeeID: number;
    previousRABServiceID: number;
    rabUnitCodeId?: number | null;
    serviceFrom?: string | null;
    serviceTo?: string | null;
    isCurrentlyActive?: boolean;
    appointment?: number | null;
    postingAuth?: string | null;
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
export class PreviousRABServiceService {
    private apiUrl = `${environment.apis.core}/PreviousRABServiceInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<PreviousRABServiceInfoModel[]> {
        return this.http.get<PreviousRABServiceInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Gets previous RAB service from view (with FK names) by employee ID. */
    getViewByEmployeeId(employeeId: number): Observable<VwPreviousRABServiceInfoModel[]> {
        const id = Number(employeeId);
        if (Number.isNaN(id) || id <= 0) {
            return of([]);
        }
        return this.http.get<VwPreviousRABServiceInfoModel[]>(`${this.apiUrl}/GetViewByEmployeeId/View/${id}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    save(payload: Partial<PreviousRABServiceInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    saveUpdate(payload: Partial<PreviousRABServiceInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, body);
    }

    delete(employeeId: number, previousRABServiceID: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${previousRABServiceID}`);
    }

    /** Get a single record by keys (returns entity including filesReferences). */
    getByKeys(employeeId: number, previousRABServiceID: number): Observable<PreviousRABServiceInfoModel | null> {
        return this.http.get<PreviousRABServiceInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`).pipe(
            map((list: any) => {
                const arr = Array.isArray(list) ? list : [];
                const item = arr.find((x: any) => (x.previousRABServiceID ?? x.PreviousRABServiceID) === previousRABServiceID);
                return item ?? null;
            })
        );
    }

    /** Send camelCase so ASP.NET Core JSON binder maps to C# model (default uses camelCase). */
    private toApiPayload(payload: Partial<PreviousRABServiceInfoModel>): any {
        const now = new Date().toISOString();
        return {
            employeeID: payload.employeeID,
            previousRABServiceID: payload.previousRABServiceID ?? 0,
            rabUnitCodeId: payload.rabUnitCodeId ?? null,
            serviceFrom: payload.serviceFrom ?? null,
            serviceTo: payload.serviceTo ?? null,
            isCurrentlyActive: payload.isCurrentlyActive === true,
            appointment: payload.appointment ?? null,
            postingAuth: payload.postingAuth ?? null,
            remarks: payload.remarks ?? null,
            filesReferences: payload.filesReferences ?? null,
            createdBy: payload.createdBy ?? 'user',
            createdDate: payload.createdDate ?? now,
            lastUpdatedBy: payload.lastUpdatedBy ?? 'user',
            lastupdate: payload.lastupdate ?? now
        };
    }
}
