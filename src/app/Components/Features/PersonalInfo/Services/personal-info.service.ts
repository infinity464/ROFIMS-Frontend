import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PersonalInfoModel {
    employeeID: number;
    bloodGroup: number | null;
    mobileNo: string | null;
    dob: string | null;
    religion: number | null;
    passportNo: string | null;
    identificationMark: string | null;
    maritalStatus: number | null;
    emergencyContact: string | null;
    joiningDate: string | null;
    commissionDate: string | null;
    batch: string | null;
    hasInvestigationExp: boolean | null;
    investigationExpDetails: string | null;
    professionalQualification: string | null;
    personalQualification: string | null;
    awards: string | null;
    lastEducationalQualification: string | null;
    medicalCategory: string | null;
    tribal: boolean | null;
    freedomFighter: boolean | null;
    height: string | null;
    weight: string | null;
    drivingLicenseNo: string | null;
    serviceIdCardNo: string | null;
    createdBy: string | null;
    createdDate: string;
    lastUpdatedBy: string | null;
    lastupdate: string;
}

@Injectable({
    providedIn: 'root'
})
export class PersonalInfoService {
    private apiUrl = `${environment.apis.core}`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<PersonalInfoModel[]> {
        return this.http.get<PersonalInfoModel[]>(`${this.apiUrl}/PersonalInfo/GetAll`);
    }

    getByEmployeeId(employeeId: number): Observable<PersonalInfoModel | null> {
        return this.http.get<PersonalInfoModel[]>(`${this.apiUrl}/PersonalInfo/GetFilteredByKeysAsyn/${employeeId}`).pipe(
            map(data => data && data.length > 0 ? data[0] : null)
        );
    }

    save(payload: PersonalInfoModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/PersonalInfo/SaveAsyn`, payload);
    }

    update(payload: PersonalInfoModel): Observable<any> {
        return this.http.post(`${this.apiUrl}/PersonalInfo/UpdateAsyn`, payload);
    }

    delete(employeeId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/PersonalInfo/Delete/${employeeId}`);
    }
}
