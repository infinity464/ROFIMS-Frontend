import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@/Core/Environments/environment';

export interface ManpowerSummaryRow {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    auth: number;
    held: number;
    def: number;
    sur: number;
    postingIn: number;
    postingOut: number;
    remark?: string;
}

export interface ManpowerSummaryTotals {
    auth: number;
    held: number;
    def: number;
    sur: number;
    postingIn: number;
    postingOut: number;
}

export interface ManpowerSummaryResponse {
    rows: ManpowerSummaryRow[];
    totals: ManpowerSummaryTotals;
}

@Injectable({ providedIn: 'root' })
export class StatisticsService {
    private readonly apiUrl = `${environment.apis.core}/Statistics`;

    constructor(private http: HttpClient) {}

    getManpowerSummary(): Observable<ManpowerSummaryResponse> {
        return this.http.get<ManpowerSummaryResponse>(`${this.apiUrl}/GetManpowerSummary`);
    }
}
