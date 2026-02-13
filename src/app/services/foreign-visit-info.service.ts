import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

/** Row from vw_ForeignVisitInfoByEmployee. API: ForeignVisitInfo/ViewByEmployeeId/{employeeId} */
export interface ForeignVisitInfoByEmployeeView {
    employeeID: number;
    ser: number;
    nameOfCountry: string | null;
    durationFrom: string | null;
    durationTo: string | null;
    reasonForVisiting: string | null;
    relatedDocuments: string | null;
}

export interface ForeignVisitInfoModel {
    employeeId: number;
    foreignVisitId: number;
    subjectId: number | null;
    destinationCountryId: number | null;
    visitId: number | null;
    fromDate: string | null;
    toDate: string | null;
    withFamily: boolean | null;
    auth: string | null;
    remarks: string | null;
    fileName: string | null;
    filesReferences?: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

export interface ForeignVisitFamilyInfoModel {
    employeeId: number;
    foreignVisitFamilyId: number;
    foreignVisitId: number;
    familyId: number;
    remarks: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string;
}

@Injectable({
    providedIn: 'root'
})
export class ForeignVisitInfoService {
    private baseUrl = environment.apis.core;
    private visitUrl = `${this.baseUrl}/ForeignVisitInfo`;
    private familyUrl = `${this.baseUrl}/ForeignVisitFamilyInfo`;

    constructor(private http: HttpClient) {}

    getVisitsByEmployeeId(employeeId: number): Observable<ForeignVisitInfoModel[]> {
        return this.http.get<ForeignVisitInfoModel[]>(`${this.visitUrl}/GetByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    /** Gets list from vw_ForeignVisitInfoByEmployee (Ser, Country, Duration, Reason, Documents). */
    getViewByEmployeeId(employeeId: number): Observable<ForeignVisitInfoByEmployeeView[]> {
        return this.http.get<ForeignVisitInfoByEmployeeView[]>(`${this.visitUrl}/GetViewByEmployeeId/${employeeId}`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    getVisitByKeys(employeeId: number, foreignVisitId: number): Observable<ForeignVisitInfoModel | null> {
        return this.http.get<any>(`${this.visitUrl}/GetFilteredByKeysAsyn/${employeeId}/${foreignVisitId}`).pipe(
            map((res: any) => {
                const arr = Array.isArray(res) ? res : res ? [res] : [];
                return arr.length ? arr[0] : null;
            })
        );
    }

    saveVisit(payload: Partial<ForeignVisitInfoModel>): Observable<any> {
        return this.http.post(`${this.visitUrl}/SaveAsyn`, this.toVisitPayload(payload));
    }

    updateVisit(payload: Partial<ForeignVisitInfoModel>): Observable<any> {
        return this.http.post(`${this.visitUrl}/UpdateAsyn`, this.toVisitPayload(payload));
    }

    saveUpdateVisit(payload: Partial<ForeignVisitInfoModel>): Observable<any> {
        return this.http.post(`${this.visitUrl}/SaveUpdateAsyn`, this.toVisitPayload(payload));
    }

    deleteVisit(employeeId: number, foreignVisitId: number): Observable<any> {
        return this.http.delete(`${this.visitUrl}/DeleteAsyn/${employeeId}/${foreignVisitId}`);
    }

    private toVisitPayload(p: Partial<ForeignVisitInfoModel>): any {
        return {
            employeeId: p.employeeId,
            foreignVisitId: p.foreignVisitId ?? 0,
            subjectId: p.subjectId ?? null,
            destinationCountryId: p.destinationCountryId ?? null,
            visitId: p.visitId ?? null,
            fromDate: p.fromDate ?? null,
            toDate: p.toDate ?? null,
            withFamily: p.withFamily ?? null,
            auth: p.auth ?? null,
            remarks: p.remarks ?? null,
            fileName: p.fileName ?? null,
            filesReferences: p.filesReferences ?? null,
            createdBy: p.createdBy ?? 'system',
            lastUpdatedBy: p.lastUpdatedBy ?? 'system'
        };
    }

    getAllFamilyRecords(): Observable<ForeignVisitFamilyInfoModel[]> {
        return this.http.get<ForeignVisitFamilyInfoModel[]>(`${this.familyUrl}/GetAll`).pipe(map((res: any) => (Array.isArray(res) ? res : [])));
    }

    getFamilyByEmployeeAndVisit(employeeId: number, foreignVisitId: number): Observable<ForeignVisitFamilyInfoModel[]> {
        return this.getAllFamilyRecords().pipe(map((list) => list.filter((x) => x.employeeId === employeeId && x.foreignVisitId === foreignVisitId)));
    }

    saveFamilyMember(payload: Partial<ForeignVisitFamilyInfoModel>): Observable<any> {
        return this.http.post(`${this.familyUrl}/SaveAsyn`, this.toFamilyPayload(payload));
    }

    deleteFamilyMember(employeeId: number, foreignVisitFamilyId: number): Observable<any> {
        return this.http.delete(`${this.familyUrl}/DeleteAsyn/${employeeId}/${foreignVisitFamilyId}`);
    }

    private toFamilyPayload(p: Partial<ForeignVisitFamilyInfoModel>): any {
        return {
            employeeId: p.employeeId,
            foreignVisitFamilyId: p.foreignVisitFamilyId ?? 0,
            foreignVisitId: p.foreignVisitId,
            familyId: p.familyId,
            remarks: p.remarks ?? null,
            createdBy: p.createdBy ?? 'system',
            lastUpdatedBy: p.lastUpdatedBy ?? 'system'
        };
    }
}
