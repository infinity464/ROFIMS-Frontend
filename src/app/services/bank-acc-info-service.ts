import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface BankAccInfoModel {
    employeeId: number;
    bankInfoId: number;
    bankId: number;
    branchId: number;
    accountNumber: string;
    accountNameEN: string;
    accountNameBN: string;
    remarks: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class BankAccInfoService {
    private apiUrl = `${environment.apis.core}/BankAccInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<BankAccInfoModel[]> {
        return this.http.get<BankAccInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }

    getAll(): Observable<BankAccInfoModel[]> {
        return this.http.get<BankAccInfoModel[]>(`${this.apiUrl}/GetAll`);
    }

    save(payload: Partial<BankAccInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: Partial<BankAccInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(employeeId: number, bankInfoId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${bankInfoId}`);
    }
}
