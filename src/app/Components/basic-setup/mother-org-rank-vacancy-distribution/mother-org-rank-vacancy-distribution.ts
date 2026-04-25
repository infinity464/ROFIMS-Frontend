import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
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
import { MotherOrgRankVacancyDistributionModel } from '../shared/models/mother-org-rank-vacancy';

type DistributionRow = MotherOrgRankVacancyDistributionModel & { rabName?: string };

interface OrgRankSelection {
    orgId: number;
    motherOrgRankId: number;
}

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
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Vacancy Distribution (RAB)';
    orgList: OrganizationModel[] = [];
    rankOptions: { codeId: number; label: string }[] = [];
    selectedOrg: OrganizationModel | null = null;
    selectedRank: { codeId: number; label: string } | null = null;
    distributionForm: FormGroup;
    isSubmitting = false;

    rabTreeNodes: TreeNode[] = [];
    selectedRabNode: TreeNode | null = null;
    rabTreeLoading = false;
    rabCodeId: number | null = null;
    rabNameById: Record<number, string> = {};

    distributionData: DistributionRow[] = [];
    /** When set, we're in edit mode and Save performs update using this id */
    editingDistributionId: number | null = null;
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

    get selectedOrgRank(): OrgRankSelection | null {
        if (this.selectedOrg && this.selectedRank) {
            return { orgId: this.selectedOrg.orgId, motherOrgRankId: this.selectedRank.codeId };
        }
        return null;
    }

    get distributedTotal(): number {
        return this.distributionData.reduce((sum, r) => sum + (r.quantity ?? 0), 0);
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadOrgs();
        this.loadRabTree();
    }

    loadOrgs(): void {
        this.masterBasicSetup.getAllActiveMotherOrgs().subscribe({
            next: (list) => { this.orgList = list ?? []; },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load organizations' });
            }
        });
    }

    onOrgChange(): void {
        this.selectedRank = null;
        this.rankOptions = [];
        this.distributionData = [];
        this.totalRecords = 0;
        if (!this.selectedOrg) return;
        this.masterBasicSetup.getAllActiveCommonCodesByOrgIdAndType(this.selectedOrg.orgId, 'MotherOrgRank').subscribe({
            next: (ranks) => {
                const rList = (ranks ?? []) as CommonCode[];
                this.rankOptions = rList.map((r) => ({ codeId: r.codeId, label: r.codeValueEN ?? String(r.codeId) }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load ranks' });
            }
        });
    }

    onRankChange(): void {
        this.loadDistribution();
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
                        const allWings = wingsPerUnit.flat() as CommonCode[];
                        (units as CommonCode[]).forEach((u) => {
                            this.rabNameById[u.codeId] = u.codeValueEN ?? '';
                        });
                        allWings.forEach((w) => {
                            this.rabNameById[w.codeId] = w.codeValueEN ?? '';
                        });
                        if (allWings.length === 0) {
                            this.rabTreeNodes = units.map((u) => ({
                                label: `${u.codeValueEN || ''} (0)`,
                                data: { codeId: u.codeId, codeType: 'RabUnit' },
                                children: []
                            }));
                            this.rabTreeLoading = false;
                            return;
                        }
                        const branchesRequests = allWings.map((w) => this.masterBasicSetup.getByParentId(w.codeId));
                        forkJoin(branchesRequests).subscribe({
                            next: (branchesPerWing) => {
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


    onRabNodeSelect(node: TreeNode): void {
        const data = node?.data as { codeId: number; codeType: string } | undefined;
        if (data?.codeId != null && data?.codeType) {
            this.rabCodeId = data.codeId;
        } else {
            this.rabCodeId = null;
        }
    }

    addDistribution(): void {
        const ctx = this.selectedOrgRank;
        if (!ctx || this.rabCodeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select organization, rank, and a RAB unit, wing, or branch' });
            return;
        }
        const qty = this.distributionForm.get('quantity')?.value ?? 0;
        if (qty < 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Quantity must be 0 or more' });
            return;
        }
        const user = this.shareService.getCurrentUser?.() ?? 'System';
        const isUpdate = this.editingDistributionId != null;
        const model: MotherOrgRankVacancyDistributionModel = {
            orgId: ctx.orgId,
            motherOrgRankId: ctx.motherOrgRankId,
            rabCodeId: this.rabCodeId,
            quantity: qty,
            createdBy: user,
            lastUpdatedBy: user
        };
        if (isUpdate) {
            model.id = this.editingDistributionId!;
        } else {
            const existing = this.distributionData.find(
                (r) => r.orgId === ctx.orgId && r.motherOrgRankId === ctx.motherOrgRankId && r.rabCodeId === this.rabCodeId
            );
            if (existing?.id) {
                model.id = existing.id;
            }
        }
        this.isSubmitting = true;
        const obs = model.id != null
            ? this.masterBasicSetup.updateMotherOrgRankVacancyDistribution(model)
            : this.masterBasicSetup.saveMotherOrgRankVacancyDistribution(model);
        obs.subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: isUpdate ? 'Distribution updated' : 'Distribution saved' });
                    this.distributionForm.patchValue({ quantity: 0 });
                    this.editingDistributionId = null;
                    this.loadDistribution();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save failed' });
                }
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to save distribution'
                });
                this.isSubmitting = false;
            },
            complete: () => {
                this.isSubmitting = false;
            }
        });
    }

    loadDistribution(): void {
        const ctx = this.selectedOrgRank;
        if (!ctx) {
            this.distributionData = [];
            this.totalRecords = 0;
            return;
        }
        this.loading = true;
        this.masterBasicSetup
            .getMotherOrgRankVacancyDistributionByVacancy(ctx.orgId, ctx.motherOrgRankId)
            .subscribe({
                next: (list) => {
                    this.distributionData = (list ?? []).map((r: DistributionRow & { RABCodeId?: number }) => {
                        const codeId = r.rabCodeId ?? r.RABCodeId ?? 0;
                        return { ...r, rabCodeId: codeId, rabName: this.rabNameById[codeId] ?? String(codeId) };
                    });
                    this.totalRecords = this.distributionData.length;
                    this.loading = false;
                },
                error: () => {
                    this.loading = false;
                }
            });
    }

    editDistribution(row: DistributionRow | undefined): void {
        if (!row) return;
        this.editingDistributionId = row.id ?? null;
        this.distributionForm.patchValue({ quantity: row.quantity ?? 0 });
        this.rabCodeId = row.rabCodeId ?? null;
        if (this.rabCodeId != null) {
            const node = this.findNodeByCodeId(this.rabTreeNodes, this.rabCodeId);
            if (node) {
                this.selectedRabNode = node;
            }
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
