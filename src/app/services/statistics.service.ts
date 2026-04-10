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

export interface MotherUnitOrgOption {
    orgId: number;
    orgName: string;
    orgNameBN: string;
}

export interface MotherUnitRankColumn {
    rankId: number;
    rankName: string;
    rankNameBN: string;
}

export interface MotherUnitRow {
    unitId: number;
    unitName: string;
    unitNameBN: string;
    rankCounts: Record<number, number>;
    total: number;
}

export interface MotherUnitWiseManpowerResponse {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    ranks: MotherUnitRankColumn[];
    units: MotherUnitRow[];
    totals: Record<number, number>;
    grandTotal: number;
}

export interface CorpsRow {
    corpsId: number;
    corpsName: string;
    corpsNameBN: string;
    rankCounts: Record<number, number>;
    total: number;
}

export interface CorpsOption {
    corpsId: number;
    corpsName: string;
    corpsNameBN: string;
}

export interface TradeRow {
    tradeId: number;
    tradeName: string;
    tradeNameBN: string;
    rankCounts: Record<number, number>;
    total: number;
}

export interface TradeWiseManpowerResponse {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    ranks: MotherUnitRankColumn[];
    trades: TradeRow[];
    totals: Record<number, number>;
    grandTotal: number;
}

export interface CorpsWiseManpowerResponse {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    ranks: MotherUnitRankColumn[];
    corps: CorpsRow[];
    totals: Record<number, number>;
    grandTotal: number;
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

    getMotherOrgOptions(): Observable<MotherUnitOrgOption[]> {
        return this.http.get<MotherUnitOrgOption[]>(`${this.apiUrl}/GetMotherOrgOptions`);
    }

    getMotherUnitWiseManpower(orgId: number): Observable<MotherUnitWiseManpowerResponse> {
        return this.http.get<MotherUnitWiseManpowerResponse>(
            `${this.apiUrl}/GetMotherUnitWiseManpower`, { params: { orgId } }
        );
    }

    getCorpsWiseManpower(orgId: number): Observable<CorpsWiseManpowerResponse> {
        return this.http.get<CorpsWiseManpowerResponse>(
            `${this.apiUrl}/GetCorpsWiseManpower`, { params: { orgId } }
        );
    }

    getCorpsOptions(orgId: number): Observable<CorpsOption[]> {
        return this.http.get<CorpsOption[]>(
            `${this.apiUrl}/GetCorpsOptions`, { params: { orgId } }
        );
    }

    getTradeWiseManpower(orgId: number, corpsId?: number): Observable<TradeWiseManpowerResponse> {
        const params: any = { orgId };
        if (corpsId != null) params.corpsId = corpsId;
        return this.http.get<TradeWiseManpowerResponse>(
            `${this.apiUrl}/GetTradeWiseManpower`, { params }
        );
    }
}
