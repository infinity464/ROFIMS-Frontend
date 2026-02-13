import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

/** Single row from vw_FamilyInfoByEmployee. API: GET FamilyInfo/GetFamilyInfoByEmployeeView/{employeeId} */
export interface FamilyInfoByEmployeeView {
    employeeID: number;
    ser: number;
    name: string | null;
    relationId: number | null;
    relation: string | null;
    dateOfBirth: string | null;
    occupationId: number | null;
    occupation: string | null;
    mobileNo: string | null;
}

export interface FamilyInfoModel {
    EmployeeId: number | null;
    FMID: number | null;
    Relation: number | null;
    NameEN: string | null;
    NameBN: string | null;
    DOB: string | null;
    MaritalStatus: number | null;
    Occupation: number | null;
    NID: string | null;
    MobileNo: string | null;
    PassportNo: string | null;
    Email: string | null;
    CreatedDate?: string;
    LastUpdatedBy?: string;
    Lastupdate?: string;
    StatusDate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class FamilyInfoService {
    private apiUrl = `${environment.apis.core}/FamilyInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<FamilyInfoModel[]> {
        return this.http.get<FamilyInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }

    /** Gets family list from vw_FamilyInfoByEmployee (Ser, Name, Relation, DateOfBirth, Occupation, MobileNo). */
    getFamilyInfoByEmployeeView(employeeId: number): Observable<FamilyInfoByEmployeeView[]> {
        return this.http.get<FamilyInfoByEmployeeView[]>(`${this.apiUrl}/GetFamilyInfoByEmployeeView/${employeeId}`);
    }

    getAll(): Observable<FamilyInfoModel[]> {
        return this.http.get<FamilyInfoModel[]>(`${this.apiUrl}/GetAll`);
    }

    getByKeys(employeeId: number, fmid: number): Observable<FamilyInfoModel> {
        return this.http.get<FamilyInfoModel>(`${this.apiUrl}/GetFilteredByKeysAsyn/${employeeId}/${fmid}`);
    }

    save(payload: Partial<FamilyInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: Partial<FamilyInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(employeeId: number, fmid: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/Delete/${employeeId}/${fmid}`);
    }
}
