import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_EducationInfoByEmployee. API: EducationInfo/ViewByEmployeeId/{employeeId} */
export interface EducationInfoByEmployeeView {
    employeeID: number;
    ser: number;
    durationFrom: string | null;
    durationTo: string | null;
    schoolCollegeUniversity: string | null;
    schoolCollegeUniversityBN?: string | null;
    instituteType: string | null;
    instituteTypeBN?: string | null;
    nameOfExamDegree: string | null;
    nameOfExamDegreeBN?: string | null;
    subjectsDepartments: string | null;
    subjectsDepartmentsBN?: string | null;
    subject: string | null;
    subjectBN?: string | null;
    result: string | null;
    resultBN?: string | null;
    gradePoint: string | null;
    passingYear: number | null;
    remarks: string | null;
}

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

    /** Gets list from vw_EducationInfoByEmployee. */
    getViewByEmployeeId(employeeId: number): Observable<EducationInfoByEmployeeView[]> {
        return this.http.get<EducationInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`);
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
