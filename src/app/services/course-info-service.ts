import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

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

@Injectable({
    providedIn: 'root'
})
export class CourseInfoService {
    private apiUrl = `${environment.apis.core}/CourseInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<CourseInfoModel[]> {
        return this.http.get<CourseInfoModel[]>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`);
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
}
