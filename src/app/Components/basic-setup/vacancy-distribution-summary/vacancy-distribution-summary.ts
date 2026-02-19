import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { OrganizationModel } from '../organization-setup/models/organization';
import { MotherOrgRankVacancyDistributionModel } from '../shared/models/mother-org-rank-vacancy';

export interface RankColumn {
    field: string;
    header: string;
    motherOrgRankId: number;
}

/** One display row: office label, indent level, quantities per rank, and a row total */
export interface DisplayRow {
    rabCodeId: number;
    /** 0 = Unit (bold, no indent), 1 = Wing (one indent), 2 = Branch (two indents) */
    level: 0 | 1 | 2;
    officeName: string;
    qtyByField: Record<string, number>;
    total: number;
}

@Component({
    selector: 'app-vacancy-distribution-summary',
    standalone: true,
    imports: [CommonModule, FormsModule, FluidModule, SelectModule, ToastModule],
    providers: [MessageService],
    templateUrl: './vacancy-distribution-summary.html',
    styleUrl: './vacancy-distribution-summary.scss'
})
export class VacancyDistributionSummaryComponent implements OnInit {
    title = 'Vacancy Distribution Summary';
    orgList: OrganizationModel[] = [];
    selectedOrg: OrganizationModel | null = null;
    loading = false;

    dynamicColumns: RankColumn[] = [];
    displayRows: DisplayRow[] = [];

    /** column totals: field -> sum of all rows */
    columnTotals: Record<string, number> = {};
    grandTotal = 0;

    private rabNameById: Record<number, string> = {};
    private rabTreeLoaded = false;
    /** ordered list of all RAB codeIds: Unit > Wings under it > Branches under each wing */
    private orderedRabIds: { codeId: number; level: 0 | 1 | 2 }[] = [];

    constructor(
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadOrganizations();
        this.loadRabTree();
    }

    onOrgChange(): void {
        this.dynamicColumns = [];
        this.displayRows = [];
        this.columnTotals = {};
        this.grandTotal = 0;
        if (!this.selectedOrg) return;
        this.loadSummaryForOrg(this.selectedOrg.orgId);
    }

    cellDisplay(row: DisplayRow, field: string): string {
        const v = row.qtyByField[field] ?? 0;
        return v > 0 ? String(v) : '—';
    }

    colTotalDisplay(field: string): string {
        const v = this.columnTotals[field] ?? 0;
        return v > 0 ? String(v) : '—';
    }

    private loadOrganizations(): void {
        this.masterBasicSetup.getAllActiveMotherOrgs().subscribe({
            next: (list) => { this.orgList = list ?? []; },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load organizations' });
            }
        });
    }

    /** Load full RAB tree once, build name map and ordered id list (Unit → Wing → Branch) */
    private loadRabTree(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (units) => {
                if (!units?.length) { this.rabTreeLoaded = true; return; }
                (units as CommonCode[]).forEach((u) => { this.rabNameById[u.codeId] = u.codeValueEN ?? ''; });
                const wingsRequests = units.map((u) => this.masterBasicSetup.getByParentId(u.codeId));
                forkJoin(wingsRequests).subscribe({
                    next: (wingsPerUnit) => {
                        const allWings = wingsPerUnit.flat() as CommonCode[];
                        allWings.forEach((w) => { this.rabNameById[w.codeId] = w.codeValueEN ?? ''; });
                        if (allWings.length === 0) {
                            this.orderedRabIds = (units as CommonCode[]).map((u) => ({ codeId: u.codeId, level: 0 as const }));
                            this.rabTreeLoaded = true;
                            return;
                        }
                        const branchesRequests = allWings.map((w) => this.masterBasicSetup.getByParentId(w.codeId));
                        forkJoin(branchesRequests).subscribe({
                            next: (branchesPerWing) => {
                                const ordered: { codeId: number; level: 0 | 1 | 2 }[] = [];
                                let wingIdx = 0;
                                (units as CommonCode[]).forEach((unit) => {
                                    ordered.push({ codeId: unit.codeId, level: 0 });
                                    const wings = wingsPerUnit[units.indexOf(unit)] ?? [];
                                    (wings as CommonCode[]).forEach((wing) => {
                                        ordered.push({ codeId: wing.codeId, level: 1 });
                                        const branches = (branchesPerWing[wingIdx] ?? []) as CommonCode[];
                                        branches.forEach((b) => {
                                            this.rabNameById[b.codeId] = b.codeValueEN ?? '';
                                            ordered.push({ codeId: b.codeId, level: 2 });
                                        });
                                        wingIdx++;
                                    });
                                });
                                this.orderedRabIds = ordered;
                                this.rabTreeLoaded = true;
                            },
                            error: () => { this.rabTreeLoaded = true; }
                        });
                    },
                    error: () => { this.rabTreeLoaded = true; }
                });
            },
            error: () => { this.rabTreeLoaded = true; }
        });
    }

    private loadSummaryForOrg(orgId: number): void {
        this.loading = true;
        this.masterBasicSetup.getMotherOrgRankVacancyByOrgId(orgId).subscribe({
            next: (vacancies) => {
                const vacancyList = vacancies ?? [];
                if (vacancyList.length === 0) { this.loading = false; return; }
                this.masterBasicSetup.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                    next: (ranks) => {
                        const rankNameById: Record<number, string> = {};
                        (ranks ?? [] as CommonCode[]).forEach((r) => { rankNameById[r.codeId] = r.codeValueEN ?? ''; });
                        this.dynamicColumns = vacancyList.map((v) => ({
                            field: `rank_${v.motherOrgRankId}`,
                            header: rankNameById[v.motherOrgRankId] ?? String(v.motherOrgRankId),
                            motherOrgRankId: v.motherOrgRankId
                        }));
                        forkJoin(
                            vacancyList.map((v) =>
                                this.masterBasicSetup.getMotherOrgRankVacancyDistributionByVacancy(orgId, v.motherOrgRankId)
                            )
                        ).subscribe({
                            next: (distPerRank) => {
                                const allDist: MotherOrgRankVacancyDistributionModel[] = [];
                                distPerRank.forEach((list) => allDist.push(...(list ?? [])));
                                this.buildDisplayRows(allDist);
                                this.loading = false;
                            },
                            error: () => {
                                this.loading = false;
                                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load distribution data' });
                            }
                        });
                    },
                    error: () => {
                        this.loading = false;
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load ranks' });
                    }
                });
            },
            error: () => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vacancies' });
            }
        });
    }

    private buildDisplayRows(distributionList: MotherOrgRankVacancyDistributionModel[]): void {
        /* map: rabCodeId -> { motherOrgRankId -> quantity } */
        const byRab = new Map<number, Record<number, number>>();
        distributionList.forEach((d) => {
            const codeId = d.rabCodeId;
            if (!byRab.has(codeId)) byRab.set(codeId, {});
            const entry = byRab.get(codeId)!;
            entry[d.motherOrgRankId] = (entry[d.motherOrgRankId] ?? 0) + (d.quantity ?? 0);
        });

        /* Build rows in tree order; include all Units/Wings/Branches (show 0 as —) */
        this.columnTotals = {};
        this.grandTotal = 0;
        this.dynamicColumns.forEach((c) => { this.columnTotals[c.field] = 0; });

        const rows: DisplayRow[] = [];
        const source = this.orderedRabIds.length
            ? this.orderedRabIds
            : Array.from(byRab.keys()).map((id) => ({ codeId: id, level: 0 as const }));

        source.forEach(({ codeId, level }) => {
            const qtyByRankId = byRab.get(codeId) ?? {};
            const qtyByField: Record<string, number> = {};
            let rowTotal = 0;
            this.dynamicColumns.forEach((col) => {
                const qty = qtyByRankId[col.motherOrgRankId] ?? 0;
                qtyByField[col.field] = qty;
                rowTotal += qty;
                this.columnTotals[col.field] = (this.columnTotals[col.field] ?? 0) + qty;
            });
            this.grandTotal += rowTotal;
            rows.push({
                rabCodeId: codeId,
                level,
                officeName: this.rabNameById[codeId] ?? String(codeId),
                qtyByField,
                total: rowTotal
            });
        });

        this.displayRows = rows;
    }
}
