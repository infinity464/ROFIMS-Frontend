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

export interface RankWiseRankRow {
    rankId: number;
    rankName: string;
    rankNameBN: string;
    auth: number;
    held: number;
    def: number;
    sur: number;
    defPct: number;
}

export interface RankWiseOrgBlock {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    rows: RankWiseRankRow[];
    subtotal: RankWiseRankRow;
}

export interface RankWiseManpowerResponse {
    orgs: RankWiseOrgBlock[];
    grandTotal: RankWiseRankRow;
}

@Injectable({ providedIn: 'root' })
export class StatisticsService {
    private readonly apiUrl = `${environment.apis.core}/Statistics`;

    constructor(private http: HttpClient) {}

    getManpowerSummary(): Observable<ManpowerSummaryResponse> {
        return this.http.get<ManpowerSummaryResponse>(`${this.apiUrl}/GetManpowerSummary`);
    }

    getRankWiseManpower(): Observable<RankWiseManpowerResponse> {
        return this.http.get<RankWiseManpowerResponse>(`${this.apiUrl}/GetRankWiseManpower`);
    }
}
