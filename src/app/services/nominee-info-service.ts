import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface NomineeInfoModel {
    employeeID: number;
    fmid: number;
    sharePercent?: number | null;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
    statusDate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class NomineeInfoService {
    private apiUrl = `${environment.apis.core}/NomineeInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<NomineeInfoModel[]> {
        return this.http.get<NomineeInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/ByEmployee/${employeeId}`);
    }

    save(payload: Partial<NomineeInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveAsyn`, body);
    }

    saveUpdate(payload: Partial<NomineeInfoModel>): Observable<any> {
        const body = this.toApiPayload(payload);
        return this.http.post(`${this.apiUrl}/SaveUpdateAsyn`, body);
    }

    delete(employeeId: number, fmid: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${fmid}`);
    }

    private toApiPayload(payload: Partial<NomineeInfoModel>): any {
        return {
            EmployeeID: payload.employeeID,
            FMID: payload.fmid,
            SharePercent: payload.sharePercent ?? null,
            LastUpdatedBy: payload.lastUpdatedBy ?? 'user'
        };
    }
}
