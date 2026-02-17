import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Fluid } from 'primeng/fluid';
import { DataTable } from '../shared/componets/data-table/data-table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CommonModule } from '@angular/common';
import { TableConfig } from '../shared/models/dataTableConfig';
import { MotherOrgRankVacancyModel } from '../shared/models/mother-org-rank-vacancy';
import { MotherOrgRankVacancyDistributionModel } from '../shared/models/mother-org-rank-vacancy';
import { CommonCode } from '../shared/models/common-code';
import { forkJoin } from 'rxjs';
import { OrganizationModel } from '../organization-setup/models/organization';

@Component({
    selector: 'app-mother-org-rank-vacancy-distribution',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FormsModule,
        Fluid,
        DataTable,
        SelectModule,
        InputTextModule,
        ButtonModule,
        ToastModule,
        ConfirmDialogModule
    ],
    templateUrl: './mother-org-rank-vacancy-distribution.html',
    providers: [MessageService, ConfirmationService]
})
export class MotherOrgRankVacancyDistributionComponent implements OnInit {
    title = 'Distribute Vacancy to RAB';
    selectedVacancy: MotherOrgRankVacancyModel | null = null;
    vacancyList: (MotherOrgRankVacancyModel & { orgName?: string; rankName?: string })[] = [];
    distributionData: (MotherOrgRankVacancyDistributionModel & { rabName?: string })[] = [];
    totalVacancy = 0;
    distributedTotal = 0;

    rabOptions: { label: string; value: number }[] = [];
    rabNameById: Record<number, string> = {};
    orgById: Record<number, OrganizationModel> = {};
    rankNameByKey: Record<string, string> = {};

    distributionForm!: FormGroup;
    isSubmitting = false;
    loading = false;

    totalRecords = 0;
    rows = 10;
    first = 0;

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'rabName', header: 'RAB Unit / Wing / Branch' },
            { field: 'quantity', header: 'Quantity' },
            { field: 'id', header: 'Id', hidden: true }
        ]
    };

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadVacancyList();
        this.loadRabOptions();
    }

    initForm(): void {
        this.distributionForm = this.fb.group({
            rabCodeId: [null, Validators.required],
            quantity: [null, [Validators.required, Validators.min(0)]]
        });
    }

    loadVacancyList(): void {
        this.masterBasicSetupService.getAllMotherOrgRankVacancy().subscribe({
            next: (list) => {
                const items = list ?? [];
                this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
                    next: (orgs) => {
                        const oList = orgs ?? [];
                        this.orgById = Object.fromEntries(oList.map((o) => [o.orgId, o]));
                        this.masterBasicSetupService.getAllByType('MotherOrgRank').subscribe({
                            next: (ranks) => {
                                const rList = (ranks ?? []) as (CommonCode & { orgId?: number })[];
                                this.rankNameByKey = {};
                                rList.forEach((r) => {
                                    const orgId = r.orgId ?? 0;
                                    this.rankNameByKey[`${orgId}-${r.codeId}`] = r.codeValueEN ?? '';
                                });
                                this.vacancyList = items.map((v) => ({
                                    ...v,
                                    orgName: this.orgById[v.orgId]?.orgNameEN ?? String(v.orgId),
                                    rankName: this.rankNameByKey[`${v.orgId}-${v.motherOrgRankId}`] ?? String(v.motherOrgRankId)
                                }));
                            }
                        });
                    }
                });
            }
        });
    }

    loadRabOptions(): void {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (units) => {
                const uList = units ?? [];
                const options: { label: string; value: number }[] = uList.map((u) => {
                    this.rabNameById[u.codeId] = `${u.codeValueEN ?? ''} (Unit)`;
                    return { label: `${u.codeValueEN ?? ''} (Unit)`, value: u.codeId };
                });
                if (uList.length === 0) {
                    this.rabOptions = options;
                    return;
                }
                const wingReqs = uList.map((u) => this.masterBasicSetupService.getByParentId(u.codeId));
                forkJoin(wingReqs).subscribe({
                    next: (wingArrays) => {
                        const allWings = wingArrays.flat() as CommonCode[];
                        allWings.forEach((w) => {
                            options.push({ label: `${w.codeValueEN ?? ''} (Wing)`, value: w.codeId });
                            this.rabNameById[w.codeId] = `${w.codeValueEN ?? ''} (Wing)`;
                        });
                        if (allWings.length === 0) {
                            this.rabOptions = options;
                            this.buildRabNameById(options);
                            return;
                        }
                        const branchReqs = allWings.map((w) => this.masterBasicSetupService.getByParentId(w.codeId));
                        forkJoin(branchReqs).subscribe({
                            next: (branchArrays) => {
                                (branchArrays.flat() as CommonCode[]).forEach((b) => {
                                    options.push({ label: `${b.codeValueEN ?? ''} (Branch)`, value: b.codeId });
                                    this.rabNameById[b.codeId] = `${b.codeValueEN ?? ''} (Branch)`;
                                });
                                this.rabOptions = options;
                                this.buildRabNameById(options);
                                if (this.selectedVacancy) this.loadDistribution();
                            }
                        });
                    }
                });
            }
        });
    }

    onSelectVacancy(v: (MotherOrgRankVacancyModel & { orgName?: string; rankName?: string }) | null): void {
        this.selectedVacancy = v ?? null;
        if (!v) {
            this.totalVacancy = 0;
            this.distributedTotal = 0;
            this.distributionData = [];
            return;
        }
        this.totalVacancy = v.totalVacancy ?? 0;
        this.loadDistribution();
    }

    loadDistribution(): void {
        if (!this.selectedVacancy) return;
        this.loading = true;
        this.masterBasicSetupService
            .getMotherOrgRankVacancyDistributionByVacancy(this.selectedVacancy.orgId, this.selectedVacancy.motherOrgRankId)
            .subscribe({
                next: (list) => {
                    const items = list ?? [];
                    this.distributionData = items.map((d) => ({
                        ...d,
                        rabName: this.rabNameById[d.rabCodeId] ?? String(d.rabCodeId)
                    }));
                    this.distributedTotal = items.reduce((s, d) => s + (d.quantity ?? 0), 0);
                    this.loading = false;
                    this.totalRecords = this.distributionData.length;
                },
                error: () => {
                    this.loading = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load distribution' });
                }
            });
    }

    addDistribution(): void {
        if (!this.selectedVacancy || this.distributionForm.invalid) {
            this.distributionForm.markAllAsTouched();
            return;
        }
        const qty = this.distributionForm.value.quantity ?? 0;
        if (this.distributedTotal + qty > this.totalVacancy) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Validation',
                detail: `Total distributed (${this.distributedTotal + qty}) cannot exceed vacancy (${this.totalVacancy}).`
            });
            return;
        }
        this.isSubmitting = true;
        const payload: MotherOrgRankVacancyDistributionModel = {
            orgId: this.selectedVacancy.orgId,
            motherOrgRankId: this.selectedVacancy.motherOrgRankId,
            rabCodeId: this.distributionForm.value.rabCodeId,
            quantity: qty
        };
        this.masterBasicSetupService.saveMotherOrgRankVacancyDistribution(payload).subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Added' });
                    this.distributionForm.patchValue({ rabCodeId: null, quantity: null });
                    this.loadDistribution();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res.description ?? 'Save failed' });
                }
                this.isSubmitting = false;
            },
            error: () => {
                this.isSubmitting = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to add' });
            }
        });
    }

    deleteDistribution(row: MotherOrgRankVacancyDistributionModel, event: Event): void {
        if (row.id == null) return;
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Remove this distribution row?',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.masterBasicSetupService.deleteMotherOrgRankVacancyDistribution(row.id!).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Removed' });
                            this.loadDistribution();
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res.description ?? 'Delete failed' });
                        }
                    },
                    error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' })
                });
            }
        });
    }

    editDistribution(_row: MotherOrgRankVacancyDistributionModel): void {
        this.messageService.add({ severity: 'info', summary: 'Edit', detail: 'Change quantity by deleting and re-adding, or add an edit form as needed.' });
    }

    private buildRabNameById(options: { label: string; value: number }[]): void {
        options.forEach((o) => (this.rabNameById[o.value] = o.label));
    }
}
