import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '@/Core/Environments/environment';
import { TemporaryMovementOnMovement } from '@/models/temporary-movement-history.model';

@Injectable({ providedIn: 'root' })
export class TemporaryMovementHistoryService {
    private http = inject(HttpClient);
    private baseUrl = `${environment.apis.core}/TemporaryMovementHistory`;

    /** Everyone currently out on a Temporary movement (not yet returned). */
    getOnMovement(): Observable<TemporaryMovementOnMovement[]> {
        return this.http
            .get<any>(`${this.baseUrl}/GetOnMovementAsyn`)
            .pipe(map((r) => (Array.isArray(r) ? r : [])));
    }

    /** Open Temporary-movement rows for one employee (profile banner). */
    getCurrentByEmployee(employeeId: number): Observable<TemporaryMovementOnMovement[]> {
        return this.http
            .get<any>(`${this.baseUrl}/GetCurrentByEmployeeAsyn/${employeeId}`)
            .pipe(map((r) => (Array.isArray(r) ? r : [])));
    }
}
