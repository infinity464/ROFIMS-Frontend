import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';

/** Row from vw_CourseInfoByEmployee. API: CourseInfo/ViewByEmployeeId/{employeeId} */
export interface CourseInfoByEmployeeView {
    employeeID: number;
    ser: number;
    courseTypeId?: number | null;
    courseType: string | null;
    courseTypeBN?: string | null;
    courseNameId?: number | null;
    courseName: string | null;
    courseNameBN?: string | null;
    trainingInstituteId?: number | null;
    trainingInstituteName: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    result: string | null;
    auth: string | null;
    remarks: string | null;
}

export interface CourseInfoModel {
    employeeId: number;
    courseId: number;
    courseType: number | null;
    courseName: number | null;
    trainingInstitueName: number | null;
    dateFrom: string | null;
    dateTo: string | null;
    result: string | null;
    auth: string | null;
    remarks: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
    filesReferences?: string | null;
}

/** Filter params for GetEmployeesNotCompletedByCourseName (server-side). */
export interface EmployeeCourseFilterParams {
    serviceId?: string;
    rabId?: string;
    motherOrganization?: string;
    rank?: string;
    corps?: string;
    trade?: string;
    joiningDateFrom?: string; // yyyy-MM-dd
    joiningDateTo?: string;
}

@Injectable({
    providedIn: 'root'
})
export class CourseInfoService {
    private apiUrl = `${environment.apis.core}/CourseInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<CourseInfoModel[]> {
        return this.http.get<CourseInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
    }

    /** Gets list from vw_CourseInfoByEmployee by employee ID (for profile display). */
    getViewByEmployeeId(employeeId: number): Observable<CourseInfoByEmployeeView[]> {
        return this.http.get<CourseInfoByEmployeeView[]>(`${this.apiUrl}/GetViewByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    save(payload: Partial<CourseInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, payload);
    }

    update(payload: Partial<CourseInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, payload);
    }

    delete(employeeId: number, courseId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${employeeId}/${courseId}`);
    }

    /** Gets employees who have NOT completed the specified course (by CourseName CommonCode id). Server-side filter optional. */
    getEmployeesNotCompletedByCourseName(courseNameId: number, filter?: EmployeeCourseFilterParams): Observable<EmployeeSearchInfoModel[]> {
        let url = `${this.apiUrl}/GetEmployeesNotCompletedByCourseName/${courseNameId}`;
        if (filter) {
            const p = new URLSearchParams();
            if (filter.serviceId?.trim()) p.set('serviceId', filter.serviceId.trim());
            if (filter.rabId?.trim()) p.set('rabId', filter.rabId.trim());
            if (filter.motherOrganization?.trim()) p.set('motherOrganization', filter.motherOrganization.trim());
            if (filter.rank?.trim()) p.set('rank', filter.rank.trim());
            if (filter.corps?.trim()) p.set('corps', filter.corps.trim());
            if (filter.trade?.trim()) p.set('trade', filter.trade.trim());
            if (filter.joiningDateFrom) p.set('joiningDateFrom', filter.joiningDateFrom);
            if (filter.joiningDateTo) p.set('joiningDateTo', filter.joiningDateTo);
            const qs = p.toString();
            if (qs) url += '?' + qs;
        }
        return this.http
            .get<EmployeeSearchInfoModel[]>(url)
            .pipe(map((res) => (Array.isArray(res) ? res : [])));
    }
}
