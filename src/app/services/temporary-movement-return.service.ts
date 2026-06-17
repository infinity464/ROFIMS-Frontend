import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import {
    TemporaryMovementReturnModel,
    TemporaryMovementEligiblePersonnel
} from '@/models/temporary-movement-return.model';

@Injectable({ providedIn: 'root' })
export class TemporaryMovementReturnService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apis.core}/TemporaryMovementReturn`;

    /** All recorded returns (enriched with employee + destination display fields). */
    getAll(): Observable<TemporaryMovementReturnModel[]> {
        return this.http
            .get<any>(`${this.baseUrl}/GetAllWithEmployeeAsyn`)
            .pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    /** Personnel out on a Temporary movement to a Mother Unit who have not returned yet. */
    getEligiblePersonnel(): Observable<TemporaryMovementEligiblePersonnel[]> {
        return this.http
            .get<any>(`${this.baseUrl}/GetEligiblePersonnelAsyn`)
            .pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    getById(id: number): Observable<TemporaryMovementReturnModel | null> {
        return this.http.get<any>(`${this.baseUrl}/GetFilteredByKeysAsyn/${id}`).pipe(
            map((r) => {
                const a = Array.isArray(r) ? r : r ? [r] : [];
                return a.length ? a[0] : null;
            })
        );
    }

    saveUpdate(model: Partial<TemporaryMovementReturnModel>): Observable<any> {
        return this.http.post(`${this.baseUrl}/SaveUpdateAsyn`, {
            id: model.id ?? 0,
            movementId: model.movementId ?? null,
            employeeId: model.employeeId,
            destinedMotherUnitId: model.destinedMotherUnitId ?? null,
            destinedRABUnitId: model.destinedRABUnitId ?? null,
            letterNo: model.letterNo ?? null,
            letterIssueDate: model.letterIssueDate ?? null,
            auth: model.auth ?? null,
            detailsInformation: model.detailsInformation ?? null,
            returnDate: model.returnDate ?? null,
            remarks: model.remarks ?? null,
            filesReferences: model.filesReferences ?? null,
            status: model.status ?? true,
            createdBy: model.createdBy ?? 'system',
            lastUpdatedBy: model.lastUpdatedBy ?? 'system'
        });
    }

    delete(id: number): Observable<any> {
        return this.http.delete(`${this.baseUrl}/DeleteAsyn/${id}`);
    }
}
