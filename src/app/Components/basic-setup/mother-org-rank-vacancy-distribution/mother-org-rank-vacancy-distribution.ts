import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TreeNode } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TreeModule } from 'primeng/tree';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SharedService } from '@/shared/services/shared-service';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { DataTable } from '../shared/componets/data-table/data-table';
import { TableConfig } from '../shared/models/dataTableConfig';
import { CommonCode } from '../shared/models/common-code';
import { OrganizationModel } from '../organization-setup/models/organization';
import {
    MotherOrgRankVacancyModel,
    MotherOrgRankVacancyDistributionModel
} from '../shared/models/mother-org-rank-vacancy';

type VacancyOption = MotherOrgRankVacancyModel & { orgName: string; rankName: string };
type DistributionRow = MotherOrgRankVacancyDistributionModel & { rabName?: string };

@Component({
    selector: 'app-mother-org-rank-vacancy-distribution',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        FluidModule,
        SelectModule,
        ButtonModule,
        InputTextModule,
        TreeModule,
        ToastModule,
        ConfirmDialogModule,
        DataTable
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './mother-org-rank-vacancy-distribution.html',
    styleUrls: ['./mother-org-rank-vacancy-distribution.scss']
})
export class MotherOrgRankVacancyDistributionComponent implements OnInit {
    title = 'Vacancy Distribution (RAB)';
    vacancyList: VacancyOption[] = [];
    selectedVacancy: VacancyOption | null = null;
    distributionForm: FormGroup;
    isSubmitting = false;

    rabTreeNodes: TreeNode[] = [];
    selectedRabNode: TreeNode | null = null;
    rabTreeLoading = false;
    rabCodeId: number | null = null;
    rabNameById: Record<number, string> = {};

    distributionData: DistributionRow[] = [];
    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'rabName', header: 'RAB Unit / Wing / Branch' },
            { field: 'quantity', header: 'Quantity' }
        ]
    };
    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;

    private orgById: Record<number, OrganizationModel> = {};
    private rankNameByKey: Record<string, string> = {};

    constructor(
        private fb: FormBuilder,
        private masterBasicSetup: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private shareService: SharedService
    ) {
        this.distributionForm = this.fb.group({
            quantity: [0, [Validators.required, Validators.min(0)]]
        });
    }

    get totalVacancy(): number {
        return this.selectedVacancy?.totalVacancy ?? 0;
    }

    get distributedTotal(): number {
        return this.distributionData.reduce((sum, r) => sum + (r.quantity ?? 0), 0);
    }

    ngOnInit(): void {
        this.loadVacancyList();
        this.loadRabTree();
    }

    loadVacancyList(): void {
        forkJoin({
            vacancies: this.masterBasicSetup.getAllMotherOrgRankVacancy(),
            orgs: this.masterBasicSetup.getAllActiveMotherOrgs(),
            ranks: this.masterBasicSetup.getAllByType('MotherOrgRank')
        }).subscribe({
            next: ({ vacancies, orgs, ranks }) => {
                const oList = orgs ?? [];
                this.orgById = Object.fromEntries(oList.map((o) => [o.orgId, o]));
                const rList = (ranks ?? []) as CommonCode[];
                this.rankNameByKey = {};
                rList.forEach((r) => {
                    const orgId = r.orgId ?? 0;
                    this.rankNameByKey[`${orgId}-${r.codeId}`] = r.codeValueEN ?? '';
                });
                const items = vacancies ?? [];
                this.vacancyList = items.map((v) => {
                    const org = this.orgById[v.orgId];
                    const rankName = this.rankNameByKey[`${v.orgId}-${v.motherOrgRankId}`] ?? '';
                    return {
                        ...v,
                        orgName: org?.orgNameEN ?? String(v.orgId),
                        rankName: rankName || String(v.motherOrgRankId)
                    };
                });
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vacancy list' });
            }
        });
    }

    loadRabTree(): void {
        this.rabTreeLoading = true;
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (units) => {
                if (!units?.length) {
                    this.rabTreeNodes = [];
                    this.rabNameById = {};
                    this.rabTreeLoading = false;
                    return;
                }
                const wingsRequests = units.map((u) => this.masterBasicSetup.getByParentId(u.codeId));
                forkJoin(wingsRequests).subscribe({
                    next: (wingsPerUnit) => {
                        const allWings = wingsPerUnit.flat();
                        if (allWings.length === 0) {
                            this.rabTreeNodes = units.map((u) => ({
                                label: `${u.codeValueEN || ''} (0)`,
                                data: { codeId: u.codeId, codeType: 'RabUnit' },
                                children: []
                            }));
                            this.rabNameById = {};
                            this.rabTreeLoading = false;
                            return;
                        }
                        const branchesRequests = allWings.map((w) => this.masterBasicSetup.getByParentId(w.codeId));
                        forkJoin(branchesRequests).subscribe({
                            next: (branchesPerWing) => {
                                this.rabNameById = {};
                                let wingIndex = 0;
                                this.rabTreeNodes = units.map((unit) => {
                                    const wings = wingsPerUnit[units.indexOf(unit)] || [];
                                    const children: TreeNode[] = wings.map((wing) => {
                                        const branches = branchesPerWing[wingIndex] || [];
                                        wingIndex += 1;
                                        const branchNodes: TreeNode[] = (branches as CommonCode[]).map((b) => {
                                            this.rabNameById[b.codeId] = b.codeValueEN ?? '';
                                            return {
                                                label: b.codeValueEN || '',
                                                data: { codeId: b.codeId, codeType: 'RabBranch' }
                                            };
                                        });
                                        return {
                                            label: `${wing.codeValueEN || ''} (${branches.length})`,
                                            data: { codeId: wing.codeId, codeType: 'RabWing' },
                                            children: branchNodes
                                        };
                                    });
                                    return {
                                        label: `${unit.codeValueEN || ''} (${wings.length})`,
                                        data: { codeId: unit.codeId, codeType: 'RabUnit' },
                                        children
                                    };
                                });
                                this.rabTreeLoading = false;
                            },
                            error: () => {
                                this.rabTreeLoading = false;
                            }
                        });
                    },
                    error: () => {
                        this.rabTreeLoading = false;
                    }
                });
            },
            error: () => {
                this.rabTreeLoading = false;
            }
        });
    }

    onSelectVacancy(_v: VacancyOption | null): void {
        this.loadDistribution();
    }

    onRabNodeSelect(node: TreeNode): void {
        const data = node?.data as { codeId: number; codeType: string } | undefined;
        if (data?.codeType === 'RabBranch') {
            this.rabCodeId = data.codeId;
        } else {
            this.rabCodeId = null;
        }
    }

    addDistribution(): void {
        if (!this.selectedVacancy || this.rabCodeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select a vacancy and a RAB branch' });
            return;
        }
        const qty = this.distributionForm.get('quantity')?.value ?? 0;
        if (qty < 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Quantity must be 0 or more' });
            return;
        }
        const user = this.shareService.getCurrentUser?.() ?? 'System';
        const existing = this.distributionData.find(
            (r) => r.orgId === this.selectedVacancy!.orgId && r.motherOrgRankId === this.selectedVacancy!.motherOrgRankId && r.rabCodeId === this.rabCodeId
        );
        const model: MotherOrgRankVacancyDistributionModel = {
            orgId: this.selectedVacancy.orgId,
            motherOrgRankId: this.selectedVacancy.motherOrgRankId,
            rabCodeId: this.rabCodeId,
            quantity: qty,
            createdBy: user,
            lastUpdatedBy: user
        };
        if (existing?.id) {
            model.id = existing.id;
        }
        this.isSubmitting = true;
        const obs = model.id
            ? this.masterBasicSetup.updateMotherOrgRankVacancyDistribution(model)
            : this.masterBasicSetup.saveMotherOrgRankVacancyDistribution(model);
        obs.subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Distribution saved' });
                    this.distributionForm.patchValue({ quantity: 0 });
                    this.loadDistribution();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save failed' });
                }
                this.isSubmitting = false;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save distribution' });
                this.isSubmitting = false;
            }
        });
    }

    loadDistribution(): void {
        if (!this.selectedVacancy) {
            this.distributionData = [];
            this.totalRecords = 0;
            return;
        }
        this.loading = true;
        this.masterBasicSetup
            .getMotherOrgRankVacancyDistributionByVacancy(this.selectedVacancy.orgId, this.selectedVacancy.motherOrgRankId)
            .subscribe({
                next: (list) => {
                    this.distributionData = (list ?? []).map((r) => ({
                        ...r,
                        rabName: this.rabNameById[r.rabCodeId] ?? String(r.rabCodeId)
                    }));
                    this.totalRecords = this.distributionData.length;
                    this.loading = false;
                },
                error: () => {
                    this.loading = false;
                }
            });
    }

    editDistribution(row: DistributionRow): void {
        this.distributionForm.patchValue({ quantity: row.quantity ?? 0 });
        this.rabCodeId = row.rabCodeId;
        const node = this.findNodeByCodeId(this.rabTreeNodes, row.rabCodeId);
        if (node) {
            this.selectedRabNode = node;
        }
    }

    private findNodeByCodeId(nodes: TreeNode[], codeId: number): TreeNode | null {
        for (const n of nodes) {
            const data = n.data as { codeId?: number } | undefined;
            if (data?.codeId === codeId) return n;
            if (n.children?.length) {
                const found = this.findNodeByCodeId(n.children, codeId);
                if (found) return found;
            }
        }
        return null;
    }

    deleteDistribution(row: DistributionRow, event: Event): void {
        if (row.id == null) return;
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Delete this distribution record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.masterBasicSetup.deleteMotherOrgRankVacancyDistribution(row.id!).subscribe({
                    next: (res) => {
                        if (res?.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                            this.loadDistribution();
                        }
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' });
                    }
                });
            }
        });
    }
}
