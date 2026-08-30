import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface LeaveInfoModel {
    employeeId: number;
    leaveId: number;
    leaveTypeId: number;
    fromDate: string;
    toDate: string;
    auth: string | null;
    remarks: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class LeaveInfoService {
    private apiUrl = `${environment.apis.core}/LeaveInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<LeaveInfoModel[]> {
        return this.http.get<LeaveInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }

    getAll(): Observable<LeaveInfoModel[]> {
        return this.http.get<LeaveInfoModel[]>(`${this.apiUrl}/GetAll`);
    }

    save(payload: Partial<LeaveInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: Partial<LeaveInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(employeeId: number, leaveId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${leaveId}`);
    }
}
