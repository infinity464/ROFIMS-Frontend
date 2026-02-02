import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PreviousRABServiceInfoModel {
    employeeID: number;
    previousRABServiceID: number;
    rabUnitCodeId?: number | null;
    serviceFrom?: string | null;
    serviceTo?: string | null;
    appointment?: number | null;
    postingAuth?: string | null;
    remarks?: string | null;
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
        return this.http
            .get<PreviousRABServiceInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
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

    /** Send camelCase so ASP.NET Core JSON binder maps to C# model (default uses camelCase). */
    private toApiPayload(payload: Partial<PreviousRABServiceInfoModel>): any {
        const now = new Date().toISOString();
        return {
            employeeID: payload.employeeID,
            previousRABServiceID: payload.previousRABServiceID ?? 0,
            rabUnitCodeId: payload.rabUnitCodeId ?? null,
            serviceFrom: payload.serviceFrom ?? null,
            serviceTo: payload.serviceTo ?? null,
            appointment: payload.appointment ?? null,
            postingAuth: payload.postingAuth ?? null,
            remarks: payload.remarks ?? null,
            createdBy: payload.createdBy ?? 'user',
            createdDate: payload.createdDate ?? now,
            lastUpdatedBy: payload.lastUpdatedBy ?? 'user',
            lastupdate: payload.lastupdate ?? now
        };
    }
}
