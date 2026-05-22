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
    countryId?: number | null;
    country: string | null;
    countryBN?: string | null;
    address: string | null;
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
    country: number | null;
    address: string | null;
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

/** Filter params for the Select Employee RFTS autocomplete (server-side search). */
export interface EmployeeCourseFilterParams {
    /** Free-text — matched against Name / Service ID / RAB ID server-side. */
    query?: string;
    /** Hard cap on rows returned. Server default 50, max 200. */
    take?: number;
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

    /**
     * Server-side autocomplete search for employees. Backend returns up to
     * `take` rows (default 50) whose Name / ServiceId / RAB ID contains
     * `query`. Empty query returns an empty list — the dropdown only fires
     * once the user types at least one character (the table has ~50k rows).
     * Ex-members are always excluded; the caller's member-type access scope
     * is applied server-side.
     */
    getEmployeesNotCompletedByCourseName(courseNameId: number, filter?: EmployeeCourseFilterParams): Observable<EmployeeSearchInfoModel[]> {
        let url = `${this.apiUrl}/GetEmployeesNotCompletedByCourseName/${courseNameId}`;
        if (filter) {
            const p = new URLSearchParams();
            if (filter.query?.trim()) p.set('query', filter.query.trim());
            if (filter.take != null) p.set('take', String(filter.take));
            const qs = p.toString();
            if (qs) url += '?' + qs;
        }
        return this.http
            .get<EmployeeSearchInfoModel[]>(url)
            .pipe(map((res) => (Array.isArray(res) ? res : [])));
    }
}
