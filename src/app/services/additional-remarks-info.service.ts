import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** AdditionalRemarksInfo from API: AdditionalRemarksInfo/GetByEmployeeId/{employeeId} */
export interface AdditionalRemarksInfo {
    additionalRemarksId: number;
    employeeID: number;
    additionalRemarks: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AdditionalRemarksInfoService {
    private apiUrl = `${environment.apis.core}/AdditionalRemarksInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<AdditionalRemarksInfo[]> {
        return this.http
            .get<AdditionalRemarksInfo[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`)
            .pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }
}
