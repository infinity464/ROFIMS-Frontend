import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

/** Outcome for a single Excel row, mirrors backend EmployeeImportRowResult. */
export interface EmployeeImportRowResult {
    rowNumber: number;
    serviceId: string;
    rabid: string;
    fullNameEN: string;
    status: 'Inserted' | 'Skipped' | 'Failed' | string;
    employeeID: number | null;
    message: string;
}

/** Aggregate import result, mirrors backend EmployeeImportResult. */
export interface EmployeeImportResult {
    totalRows: number;
    insertedCount: number;
    skippedCount: number;
    failedCount: number;
    rows: EmployeeImportRowResult[];
}

@Injectable({ providedIn: 'root' })
export class BulkEmployeeImportService {
    private api = `${environment.apis.core}/BulkEmployeeImport`;

    constructor(private http: HttpClient) {}

    /** Download the .xlsx import template (with dropdowns) as a Blob. */
    downloadTemplate(): Observable<Blob> {
        return this.http.get(`${this.api}/DownloadTemplate`, { responseType: 'blob' });
    }

    /** Upload a completed template; returns the per-row result report. */
    upload(file: File): Observable<EmployeeImportResult> {
        const form = new FormData();
        form.append('file', file);
        return this.http.post<EmployeeImportResult>(`${this.api}/Upload`, form);
    }
}
