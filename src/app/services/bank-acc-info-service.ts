import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_BankAccInfoByEmployee. API: BankAccInfo/ViewByEmployeeId/{employeeId} */
export interface BankAccInfoByEmployeeView {
    employeeID: number;
    ser: number;
    bankName: string | null;
    bankNameBN?: string | null;
    branchName: string | null;
    branchNameBN?: string | null;
    accountName: string | null;
    accountNameBN?: string | null;
    accountNumber: string | null;
    remarks: string | null;
}

export interface BankAccInfoModel {
    employeeId: number;
    bankInfoId: number;
    bankId: number;
    branchId: number;
    accountNumber: string;
    accountNameEN: string;
    accountNameBN: string;
    remarks: string | null;
    filesReferences?: string | null;
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

    /** Gets list from vw_BankAccInfoByEmployee (Ser, Bank, Branch, Account Name, Account Number, Remarks). */
    getViewByEmployeeId(employeeId: number): Observable<BankAccInfoByEmployeeView[]> {
        return this.http.get<BankAccInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`);
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
