import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_LeaveInfoByEmployee. API: LeaveInfo/ViewByEmployeeIdAndYear/{employeeId}/{year} */
export interface LeaveInfoByEmployeeView {
    employeeID: number;
    ser: number;
    typeOfLeaveId: number;
    typeOfLeave: string | null;
    typeOfLeaveBN?: string | null;
    durationFrom: string | null;
    durationTo: string | null;
}

/** Summary: Type of Leave and count for a year. API: LeaveInfo/SummaryByEmployeeAndYear/{employeeId}/{year} */
export interface LeaveInfoSummaryItem {
    typeOfLeave: string;
    count: number;
}

@Injectable({
    providedIn: 'root'
})
export class LeaveInfoService {
    private apiUrl = `${environment.apis.core}/LeaveInfo`;

    constructor(private http: HttpClient) {}

    /** Gets list from vw_LeaveInfoByEmployee for the given employee and year (e.g. current year). */
    getViewByEmployeeIdAndYear(employeeId: number, year: number): Observable<LeaveInfoByEmployeeView[]> {
        return this.http.get<LeaveInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeIdAndYear/${employeeId}/${year}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Gets leave summary (Type of Leave, Count) for the given employee and year (e.g. previous year). */
    getSummaryByEmployeeAndYear(employeeId: number, year: number): Observable<LeaveInfoSummaryItem[]> {
        return this.http.get<LeaveInfoSummaryItem[]>(`${this.apiUrl}/GetSummaryByEmployeeAndYear/${employeeId}/${year}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }
}
