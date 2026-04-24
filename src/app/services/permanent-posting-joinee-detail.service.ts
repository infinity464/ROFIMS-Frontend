import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';

export interface PermanentPostingJoineeDetailModel {
    id: number;
    permanentPostingMORecordId: number;
    employeeId: number | null;
    serviceId: string | null;
    previousRabId: string | null;
    nameBangla: string | null;
    joiningOrderNo: string | null;
    joiningOrderDate: string | null;
    possibleJoiningDate: string | null;
    joiningOrderFilesReferences: string | null;
    createdBy: string;
    createdDate: string;
    lastUpdatedBy: string;
    lastupdate: string | null;
}

@Injectable({ providedIn: 'root' })
export class PermanentPostingJoineeDetailService {
    private baseUrl = `${environment.apis.core}/PermanentPostingJoineeDetail`;

    constructor(private http: HttpClient) {}

    getByRecordId(recordId: number): Observable<PermanentPostingJoineeDetailModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetByRecordIdAsyn/${recordId}`).pipe(
            map((r) => { const a = Array.isArray(r) ? r : r ? [r] : []; return a.length ? a[0] : null; })
        );
    }

    saveUpdate(model: Partial<PermanentPostingJoineeDetailModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, {
            id: model.id ?? 0,
            permanentPostingMORecordId: model.permanentPostingMORecordId ?? 0,
            employeeId: model.employeeId ?? null,
            serviceId: model.serviceId ?? null,
            previousRabId: model.previousRabId ?? null,
            nameBangla: model.nameBangla ?? null,
            joiningOrderNo: model.joiningOrderNo ?? null,
            joiningOrderDate: model.joiningOrderDate ?? null,
            possibleJoiningDate: model.possibleJoiningDate ?? null,
            joiningOrderFilesReferences: model.joiningOrderFilesReferences ?? null,
            createdBy: model.createdBy ?? 'system',
            lastUpdatedBy: model.lastUpdatedBy ?? 'system'
        });
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }
}
