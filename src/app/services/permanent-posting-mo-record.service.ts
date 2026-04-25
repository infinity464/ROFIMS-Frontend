import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PermanentPostingMORecordModel {
    id: number;
    recordNo: string | null;
    postedOutEmployeeId: number | null;
    postingUnitId: number | null;
    postingOrderNo: string | null;
    postingOrderDate: string | null;
    possibleReleaseDate: string | null;
    isReliever: boolean | null;
    relieverNotGivenReason: string | null;
    relieverEmployeeId: number | null;
    noteSheetClearance: boolean | null;
    nsClearanceDate: string | null;
    clearanceGiven: boolean | null;
    clearanceGivenDate: string | null;
    postingOrderFilesReferences: string | null;
    status: string;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string | null;
    serviceId: string | null;
}

@Injectable({ providedIn: 'root' })
export class PermanentPostingMORecordService {
    private baseUrl = `${environment.apis.core}/PermanentPostingMORecord`;

    constructor(private http: HttpClient) {}

    getAll(): Observable<PermanentPostingMORecordModel[]> {
        return this.http.get<any>(`${this.baseUrl}/GetAllWithEmployeeAsyn`).pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    getById(id: number): Observable<PermanentPostingMORecordModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetFilteredByKeysAsyn/${id}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    saveUpdate(model: Partial<PermanentPostingMORecordModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, {
            id: model.id ?? 0,
            recordNo: model.recordNo ?? null,
            postedOutEmployeeId: model.postedOutEmployeeId ?? null,
            postingUnitId: model.postingUnitId ?? null,
            postingOrderNo: model.postingOrderNo ?? null,
            postingOrderDate: model.postingOrderDate ?? null,
            possibleReleaseDate: model.possibleReleaseDate ?? null,
            isReliever: model.isReliever ?? null,
            relieverNotGivenReason: model.relieverNotGivenReason ?? null,
            relieverEmployeeId: model.relieverEmployeeId ?? null,
            noteSheetClearance: model.noteSheetClearance ?? null,
            nsClearanceDate: model.nsClearanceDate ?? null,
            clearanceGiven: model.clearanceGiven ?? null,
            clearanceGivenDate: model.clearanceGivenDate ?? null,
            postingOrderFilesReferences: model.postingOrderFilesReferences ?? null,
            status: model.status ?? 'Draft',
            createdBy: model.createdBy ?? 'system',
            lastUpdatedBy: model.lastUpdatedBy ?? 'system'
        });
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }
}
