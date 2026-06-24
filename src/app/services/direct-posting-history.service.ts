import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface DirectPostingHistoryModel {
    directPostingHistoryId?: number;
    employeeID: number;
    rabid?: string | null;
    /** 'DirectJoin' | 'DirectTransfer' */
    actionType: 'DirectJoin' | 'DirectTransfer';
    rabUnitCodeId?: number | null;
    serviceFrom?: string | null;
    appointment?: number | null;
    performedBy?: string | null;
    performedDate?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DirectPostingHistoryService {
    private apiUrl = `${environment.apis.core}/DirectPostingHistory`;

    constructor(private http: HttpClient) {}

    save(payload: DirectPostingHistoryModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    getByEmployeeId(employeeId: number): Observable<DirectPostingHistoryModel[]> {
        return this.http.get<DirectPostingHistoryModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }
}
