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
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
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
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
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
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
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
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
}

export interface MemberTypeOption {
    memberTypeId: number;
    memberTypeName: string;
    memberTypeNameBN: string;
}

export interface UnitWiseRankOption {
    rankId: number;
    rankName: string;
    rankNameBN: string;
    orgId: number;
    orgName: string;
    orgNameBN: string;
    memberTypeId: number | null;
}

export interface UnitWiseTradeOption {
    tradeId: number;
    tradeName: string;
    tradeNameBN: string;
}

export interface UnitBarItem {
    unitId: number;
    unitName: string;
    unitNameBN: string;
    count: number;
}

export interface UnitWiseBarChartResponse {
    orgs: MotherUnitOrgOption[];
    memberTypes: MemberTypeOption[];
    ranks: UnitWiseRankOption[];
    trades: UnitWiseTradeOption[];
    units: UnitBarItem[];
    total: number;
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
}

export interface MemberTypeWiseRow {
    memberTypeId: number;
    memberTypeName: string;
    memberTypeNameBN: string;
    auth: number;
    held: number;
    def: number;
    sur: number;
    postedOut: number;
    remarks?: string;
}

export interface MemberTypeWiseOrgBlock {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    rows: MemberTypeWiseRow[];
    subtotal: MemberTypeWiseRow;
}

export interface MemberTypeWiseManpowerResponse {
    orgs: MemberTypeWiseOrgBlock[];
    grandTotal: MemberTypeWiseRow;
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
}

export interface UnitRankColumn {
    equivalentNameId: number;
    equivalentNameEN: string;
    equivalentNameBN: string;
    /** Short abbreviation rendered as a pill under the rank name (e.g. "DG", "AD"). */
    abbreviation: string;
}

export interface UnitRankCell {
    auth: number;
    held: number;
}

export interface UnitRankRow {
    unitId: number;
    unitNameEN: string;
    unitNameBN: string;
    cells: Record<number, UnitRankCell>;
    total: UnitRankCell;
}

export interface UnitRankWiseManpowerResponse {
    ranks: UnitRankColumn[];
    units: UnitRankRow[];
    columnTotals: Record<number, UnitRankCell>;
    grandTotal: UnitRankCell;
    accessibleRabUnitNames?: string[] | null;
    accessibleRabUnitNamesBN?: string[] | null;
}

export interface CorpsWiseManpowerResponse {
    orgId: number;
    orgName: string;
    orgNameBN: string;
    ranks: MotherUnitRankColumn[];
    corps: CorpsRow[];
    totals: Record<number, number>;
    grandTotal: number;
    /** Names (EN) of the RAB Units the current user is restricted to. null = unrestricted. */
    accessibleRabUnitNames?: string[] | null;
    /** Bangla names paired with accessibleRabUnitNames. */
    accessibleRabUnitNamesBN?: string[] | null;
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

    getMemberTypeWiseManpower(): Observable<MemberTypeWiseManpowerResponse> {
        return this.http.get<MemberTypeWiseManpowerResponse>(`${this.apiUrl}/GetMemberTypeWiseManpower`);
    }

    getUnitRankWiseManpower(
        excludeEquivalentNames?: string,
        rabUnitId?: number | null,
        mergeMemberTypeIds?: number[] | null
    ): Observable<UnitRankWiseManpowerResponse> {
        const params: any = {};
        if (excludeEquivalentNames != null) params.excludeEquivalentNames = excludeEquivalentNames;
        if (rabUnitId != null) params.rabUnitId = rabUnitId;
        if (mergeMemberTypeIds && mergeMemberTypeIds.length > 0) {
            params.mergeMemberTypeIds = mergeMemberTypeIds.join(',');
        }
        return this.http.get<UnitRankWiseManpowerResponse>(
            `${this.apiUrl}/GetUnitRankWiseManpower`, { params }
        );
    }

    getUnitWiseBarChart(
        orgId?: number,
        memberTypeId?: number,
        rankId?: number,
        tradeId?: number
    ): Observable<UnitWiseBarChartResponse> {
        const params: any = {};
        if (orgId != null)        params.orgId        = orgId;
        if (memberTypeId != null) params.memberTypeId = memberTypeId;
        if (rankId != null)       params.rankId       = rankId;
        if (tradeId != null)      params.tradeId      = tradeId;
        return this.http.get<UnitWiseBarChartResponse>(
            `${this.apiUrl}/GetUnitWiseBarChart`, { params }
        );
    }
}
