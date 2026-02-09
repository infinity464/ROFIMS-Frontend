import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface EducationInfoModel {
    employeeId: number;
    educationId: number;
    examName: number | null;
    instituteType: number | null;
    instituteName: number | null;
    departmentName: number | null;
    subjectName: number | null;
    dateFrom: string | null;
    dateTo: string | null;
    passingYear: number | null;
    grade: number | null;
    gradePoint: string | null;
    remarks: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
    filesReferences?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class EducationInfoService {
    private apiUrl = `${environment.apis.core}/EducationInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<EducationInfoModel[]> {
        return this.http.get<EducationInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }

    save(payload: Partial<EducationInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: Partial<EducationInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(employeeId: number, educationId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${educationId}`);
    }
}
