import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
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

export type RabNodeType = 'RabUnit' | 'RabWing' | 'RabBranch';

export interface PivotRow {
    rabCodeId: number;
    rabType: RabNodeType;
    unitName: string;
    wingName: string;
    branchName: string;
    [rankField: string]: number | string;
}

@Component({
    selector: 'app-vacancy-distribution-summary',
    standalone: true,
    imports: [CommonModule, FormsModule, FluidModule, SelectModule, TableModule, ToastModule],
    providers: [MessageService],
    templateUrl: './vacancy-distribution-summary.html',
    styleUrl: './vacancy-distribution-summary.scss'
})
export class VacancyDistributionSummaryComponent implements OnInit {
    title = 'Vacancy Distribution Summary';
    orgList: OrganizationModel[] = [];
    selectedOrg: OrganizationModel | null = null;
    loading = false;

    /** Rank columns (e.g. DC, OC, SP) for the selected org */
    dynamicColumns: RankColumn[] = [];
    /** Pivoted rows: one per RAB branch with quantities per rank */
    pivotedRows: PivotRow[] = [];
    /** RAB codeId -> display name (Unit, Wing, or Branch) */
    rabNameById: Record<number, string> = {};
    /** RAB codeId -> node type for separating Unit / Wing / Branch columns */
    rabTypeById: Record<number, RabNodeType> = {};

    constructor(
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadOrganizations();
        this.loadRabTreeForNames();
    }

    onOrgChange(): void {
        if (!this.selectedOrg) {
            this.dynamicColumns = [];
            this.pivotedRows = [];
            return;
        }
        this.loadSummaryForOrg(this.selectedOrg.orgId);
    }

    private loadOrganizations(): void {
        this.masterBasicSetup.getAllActiveMotherOrgs().subscribe({
            next: (list) => {
                this.orgList = list ?? [];
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load organizations' });
            }
        });
    }

    /** Load RAB tree and build codeId -> name and codeId -> type for Unit, Wing, and Branch. */
    private loadRabTreeForNames(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (units) => {
                if (!units?.length) return;
                (units as CommonCode[]).forEach((u) => {
                    this.rabNameById[u.codeId] = u.codeValueEN ?? '';
                    this.rabTypeById[u.codeId] = 'RabUnit';
                });
                const wingsRequests = units.map((u) => this.masterBasicSetup.getByParentId(u.codeId));
                forkJoin(wingsRequests).subscribe({
                    next: (wingsPerUnit) => {
                        const allWings = wingsPerUnit.flat() as CommonCode[];
                        allWings.forEach((w) => {
                            this.rabNameById[w.codeId] = w.codeValueEN ?? '';
                            this.rabTypeById[w.codeId] = 'RabWing';
                        });
                        if (allWings.length === 0) return;
                        const branchesRequests = allWings.map((w) => this.masterBasicSetup.getByParentId(w.codeId));
                        forkJoin(branchesRequests).subscribe({
                            next: (branchesPerWing) => {
                                (branchesPerWing as CommonCode[][]).forEach((branches) => {
                                    (branches ?? []).forEach((b) => {
                                        this.rabNameById[b.codeId] = b.codeValueEN ?? '';
                                        this.rabTypeById[b.codeId] = 'RabBranch';
                                    });
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    private loadSummaryForOrg(orgId: number): void {
        this.loading = true;
        this.dynamicColumns = [];
        this.pivotedRows = [];

        this.masterBasicSetup.getMotherOrgRankVacancyByOrgId(orgId).subscribe({
            next: (vacancies) => {
                const vacancyList = vacancies ?? [];
                if (vacancyList.length === 0) {
                    this.loading = false;
                    return;
                }
                this.masterBasicSetup.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                    next: (ranks) => {
                        const rankList = (ranks ?? []) as CommonCode[];
                        const rankNameById: Record<number, string> = {};
                        rankList.forEach((r) => {
                            rankNameById[r.codeId] = r.codeValueEN ?? '';
                        });
                        this.dynamicColumns = vacancyList.map((v) => ({
                            field: `rank_${v.motherOrgRankId}`,
                            header: rankNameById[v.motherOrgRankId] ?? String(v.motherOrgRankId),
                            motherOrgRankId: v.motherOrgRankId
                        }));

                        const distRequests = vacancyList.map((v) =>
                            this.masterBasicSetup.getMotherOrgRankVacancyDistributionByVacancy(orgId, v.motherOrgRankId)
                        );
                        forkJoin(distRequests).subscribe({
                            next: (distributionsPerRank) => {
                                const allDist: MotherOrgRankVacancyDistributionModel[] = [];
                                distributionsPerRank.forEach((list) => allDist.push(...(list ?? [])));
                                this.buildPivotRows(allDist);
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

    private buildPivotRows(distributionList: MotherOrgRankVacancyDistributionModel[]): void {
        const byRab = new Map<number, Record<number, number>>();
        distributionList.forEach((d) => {
            if (!byRab.has(d.rabCodeId)) {
                byRab.set(d.rabCodeId, {});
            }
            const row = byRab.get(d.rabCodeId)!;
            row[d.motherOrgRankId] = (row[d.motherOrgRankId] ?? 0) + (d.quantity ?? 0);
        });

        const type = this.rabTypeById;
        const name = this.rabNameById;
        this.pivotedRows = Array.from(byRab.entries()).map(([rabCodeId, qtyByRank]) => {
            const rabType = type[rabCodeId] ?? 'RabBranch';
            const rabName = name[rabCodeId] ?? String(rabCodeId);
            const row: PivotRow = {
                rabCodeId,
                rabType,
                unitName: rabType === 'RabUnit' ? rabName : '',
                wingName: rabType === 'RabWing' ? rabName : '',
                branchName: rabType === 'RabBranch' ? rabName : ''
            };
            this.dynamicColumns.forEach((col) => {
                row[col.field] = qtyByRank[col.motherOrgRankId] ?? 0;
            });
            return row;
        });
    }

    getCellValue(row: PivotRow, field: string): number {
        const v = row[field];
        return typeof v === 'number' ? v : 0;
    }
}
