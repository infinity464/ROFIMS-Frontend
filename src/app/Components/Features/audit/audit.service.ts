import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

const API_BASE = `${environment.apis.core}/audit`;

export type AuditAction = 'Created' | 'Updated' | 'Deleted';

/** Typed filter + pagination for the audit query. */
export interface AuditFilter {
    tableName?: string | null;
    action?: AuditAction | null;
    userName?: string | null;
    userId?: string | null;
    fromUtc?: string | null;   // ISO string
    toUtc?: string | null;     // ISO string
    page?: number;
    pageSize?: number;
}

/** One audit row, mirroring the backend AuditLogDto. JSON fields are raw strings. */
export interface AuditLogDto {
    id: number;
    tableName: string;
    action: AuditAction;
    keyValues: string | null;
    oldValues: string | null;
    newValues: string | null;
    changedColumns: string | null;
    userId: string | null;
    userName: string | null;
    timestampUtc: string;
}

export interface PagedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
    private http = inject(HttpClient);

    /** GET /rab/api/audit - filtered, paginated, newest first. */
    query(filter: AuditFilter): Observable<PagedResult<AuditLogDto>> {
        let params = new HttpParams()
            .set('page', String(filter.page ?? 1))
            .set('pageSize', String(filter.pageSize ?? 20));

        if (filter.tableName) params = params.set('tableName', filter.tableName);
        if (filter.action) params = params.set('action', filter.action);
        if (filter.userName) params = params.set('userName', filter.userName);
        if (filter.userId) params = params.set('userId', filter.userId);
        if (filter.fromUtc) params = params.set('fromUtc', filter.fromUtc);
        if (filter.toUtc) params = params.set('toUtc', filter.toUtc);

        return this.http.get<PagedResult<AuditLogDto>>(API_BASE, { params });
    }

    /** GET /rab/api/audit/tables - distinct table names for the filter dropdown. */
    tables(): Observable<string[]> {
        return this.http.get<string[]>(`${API_BASE}/tables`);
    }
}
