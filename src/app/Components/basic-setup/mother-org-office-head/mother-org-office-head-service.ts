import { environment } from '@/Core/Environments/environment';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MotherOrgOfficeHead, OfficeHeadResult } from './mother-org-office-head.model';

@Injectable({
    providedIn: 'root'
})
export class MotherOrgOfficeHeadService {
    private http = inject(HttpClient);
    private apiUrl = `${environment.apis.core}/MotherOrgOfficeHead`;

    getAll(): Observable<MotherOrgOfficeHead[]> {
        return this.http.get<MotherOrgOfficeHead[]>(`${this.apiUrl}/GetAll`);
    }

    getByMotherOrgId(motherOrgId: number): Observable<MotherOrgOfficeHead[]> {
        return this.http.get<MotherOrgOfficeHead[]>(`${this.apiUrl}/GetByMotherOrgId/${motherOrgId}`);
    }

    post(data: MotherOrgOfficeHead): Observable<OfficeHeadResult> {
        return this.http.post<OfficeHeadResult>(`${this.apiUrl}/SaveAsyn`, data);
    }

    update(data: MotherOrgOfficeHead): Observable<OfficeHeadResult> {
        return this.http.post<OfficeHeadResult>(`${this.apiUrl}/UpdateAsyn`, data);
    }

    delete(orgHeadId: number): Observable<OfficeHeadResult> {
        return this.http.delete<OfficeHeadResult>(`${this.apiUrl}/DeleteAsyn/${orgHeadId}`);
    }
}
