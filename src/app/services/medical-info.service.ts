import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface MedicalInfoModel {
    medicalInfoId: number;
    employeeId: number;
    medicalCategoryId: number;
    fromDate: string;
    toDate: string;
    reason: string | null;
    auth: string | null;
    remarks: string | null;
    fileName: string | null;
    filesReferences?: string | null;
    createdBy?: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string;
}

@Injectable({
    providedIn: 'root'
})
export class MedicalInfoService {
    private apiUrl = `${environment.apis.core}/MedicalInfo`;

    constructor(private http: HttpClient) {}

    getByEmployeeId(employeeId: number): Observable<MedicalInfoModel[]> {
        return this.http.get<any>(`${this.apiUrl}/GetByEmployeeId/${employeeId}`).pipe(
            map((res) => {
                if (Array.isArray(res)) return res;
                if (res?.data != null && Array.isArray(res.data)) return res.data;
                return [];
            })
        );
    }

    getAll(): Observable<MedicalInfoModel[]> {
        return this.http.get<any>(`${this.apiUrl}/GetAll`).pipe(
            map((res) => {
                if (Array.isArray(res)) return res;
                if (res?.data != null && Array.isArray(res.data)) return res.data;
                return [];
            })
        );
    }

    save(payload: Partial<MedicalInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/SaveAsyn`, this.toApiPayload(payload));
    }

    update(payload: Partial<MedicalInfoModel>): Observable<any> {
        return this.http.post(`${this.apiUrl}/UpdateAsyn`, this.toApiPayload(payload));
    }

    delete(medicalInfoId: number, employeeId: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/DeleteAsyn/${medicalInfoId}/${employeeId}`);
    }

    private toApiPayload(p: Partial<MedicalInfoModel>): any {
        const now = new Date().toISOString();
        return {
            medicalInfoId: p.medicalInfoId ?? 0,
            employeeId: p.employeeId,
            medicalCategoryId: p.medicalCategoryId,
            fromDate: p.fromDate ?? now,
            toDate: p.toDate ?? now,
            reason: p.reason ?? null,
            auth: p.auth ?? null,
            remarks: p.remarks ?? null,
            fileName: p.fileName ?? null,
            filesReferences: p.filesReferences ?? null,
            createdBy: p.createdBy ?? 'user',
            createdDate: p.createdDate ?? now,
            lastUpdatedBy: p.lastUpdatedBy ?? 'user',
            lastupdate: p.lastupdate ?? now
        };
    }
}
