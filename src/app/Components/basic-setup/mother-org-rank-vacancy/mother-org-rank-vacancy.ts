import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';
import { MotherOrgRankVacancyModel } from '../shared/models/mother-org-rank-vacancy';
import { OrganizationModel } from '../organization-setup/models/organization';
import { CommonCode } from '../shared/models/common-code';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-mother-org-rank-vacancy',
    standalone: true,
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './mother-org-rank-vacancy.html',
    styleUrl: './mother-org-rank-vacancy.scss'
})
export class MotherOrgRankVacancyComponent implements OnInit {
    title = 'Mother Org Rank Vacancy';
    vacancyData: (MotherOrgRankVacancyModel & { orgName?: string; rankName?: string })[] = [];
    editingKeys: { orgId: number; motherOrgRankId: number } | null = null;
    vacancyForm!: FormGroup;
    isSubmitting = false;

    motherOrgOptions: { label: string; value: number }[] = [];
    motherOrgRankOptions: { label: string; value: number }[] = [];
    rankNameByOrgAndRank: Record<string, string> = {};
    orgById: Record<number, OrganizationModel> = {};

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: true,
                options: []
            },
            {
                name: 'motherOrgRankId',
                label: 'Mother Org Rank',
                type: 'select',
                required: true,
                options: [],
                dependsOn: 'orgId',
                cascadeLoad: true
            },
            {
                name: 'totalVacancy',
                label: 'Total Vacancy',
                type: 'number',
                required: true
            },
            {
                name: 'status',
                label: 'Status',
                type: 'select',
                required: true,
                default: true,
                options: [
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false }
                ]
            }
        ]
    };

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'orgName', header: 'Mother Organization' },
            { field: 'rankName', header: 'Mother Org Rank' },
            { field: 'totalVacancy', header: 'Total Vacancy' },
            {
                field: 'status',
                header: 'Status',
                type: 'boolean',
                trueLabel: 'Active',
                falseLabel: 'Inactive'
            },
            { field: 'orgId', header: 'Org ID', hidden: true },
            { field: 'motherOrgRankId', header: 'Rank ID', hidden: true }
        ]
    };

    constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder,
        private shareService: SharedService
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadMotherOrgs();
        this.setupOrgChange();
        forkJoin({
            vacancies: this.masterBasicSetupService.getAllMotherOrgRankVacancy(),
            orgs: this.masterBasicSetupService.getAllActiveMotherOrgs(),
            ranks: this.masterBasicSetupService.getAllByType('MotherOrgRank')
        }).subscribe({
            next: ({ vacancies, orgs, ranks }) => {
                const oList = orgs ?? [];
                this.orgById = Object.fromEntries(oList.map((o) => [o.orgId, o]));
                this.motherOrgOptions = oList.map((o) => ({ label: o.orgNameEN ?? String(o.orgId), value: o.orgId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'orgId');
                if (field) field.options = this.motherOrgOptions;
                const rList = (ranks ?? []) as (CommonCode & { orgId?: number })[];
                this.rankNameByOrgAndRank = {};
                rList.forEach((r) => {
                    const orgId = r.orgId ?? 0;
                    this.rankNameByOrgAndRank[`${orgId}-${r.codeId}`] = r.codeValueEN ?? '';
                });
                const items = vacancies ?? [];
                this.vacancyData = items.map((v) => {
                    const org = this.orgById[v.orgId];
                    const rankName = this.rankNameByOrgAndRank[`${v.orgId}-${v.motherOrgRankId}`] ?? '';
                    return {
                        ...v,
                        orgName: org?.orgNameEN ?? String(v.orgId),
                        rankName: rankName || String(v.motherOrgRankId)
                    };
                });
                this.totalRecords = this.vacancyData.length;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load data' });
            }
        });
    }

    initForm(): void {
        this.vacancyForm = this.fb.group({
            orgId: [null, Validators.required],
            motherOrgRankId: [null, Validators.required],
            totalVacancy: [null, [Validators.required, Validators.min(1)]],
            status: [true, Validators.required]
        });
    }

    setupOrgChange(): void {
        this.vacancyForm.get('orgId')?.valueChanges.subscribe((orgId: number | null) => {
            this.vacancyForm.patchValue({ motherOrgRankId: null }, { emitEvent: false });
            this.motherOrgRankOptions = [];
            if (orgId != null) {
                this.masterBasicSetupService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                    next: (ranks) => {
                        this.motherOrgRankOptions = (ranks ?? []).map((r) => ({
                            label: r.codeValueEN ?? String(r.codeId),
                            value: r.codeId
                        }));
                        const field = this.formConfig.formFields.find((f) => f.name === 'motherOrgRankId');
                        if (field) field.options = this.motherOrgRankOptions;
                    }
                });
            }
        });
    }

    loadMotherOrgs(): void {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => {
                const list = orgs ?? [];
                this.motherOrgOptions = list.map((o) => ({ label: o.orgNameEN ?? String(o.orgId), value: o.orgId }));
                this.orgById = Object.fromEntries(list.map((o) => [o.orgId, o]));
                const field = this.formConfig.formFields.find((f) => f.name === 'orgId');
                if (field) field.options = this.motherOrgOptions;
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Mother Organizations' });
            }
        });
    }

    loadVacancyList(): void {
        this.loading = true;
        forkJoin({
            list: this.masterBasicSetupService.getAllMotherOrgRankVacancy(),
            orgs: this.masterBasicSetupService.getAllActiveMotherOrgs(),
            ranks: this.masterBasicSetupService.getAllByType('MotherOrgRank')
        }).subscribe({
            next: ({ list, orgs, ranks }) => {
                const oList = orgs ?? [];
                this.orgById = Object.fromEntries(oList.map((o) => [o.orgId, o]));
                const rList = (ranks ?? []) as (CommonCode & { orgId?: number })[];
                this.rankNameByOrgAndRank = {};
                rList.forEach((r) => {
                    const orgId = r.orgId ?? 0;
                    this.rankNameByOrgAndRank[`${orgId}-${r.codeId}`] = r.codeValueEN ?? '';
                });
                const items = list ?? [];
                this.vacancyData = items.map((v) => {
                    const org = this.orgById[v.orgId];
                    const rankName = this.rankNameByOrgAndRank[`${v.orgId}-${v.motherOrgRankId}`] ?? '';
                    return {
                        ...v,
                        orgName: org?.orgNameEN ?? String(v.orgId),
                        rankName: rankName || String(v.motherOrgRankId)
                    };
                });
                this.totalRecords = this.vacancyData.length;
                this.loading = false;
            },
            error: () => {
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load vacancy list' });
            }
        });
    }

    submit(data: unknown): void {
        if (this.vacancyForm.invalid) {
            this.vacancyForm.markAllAsTouched();
            return;
        }
        const currentUser = this.getCurrentUser();
        const payload: MotherOrgRankVacancyModel = {
            ...this.vacancyForm.value,
            status: this.vacancyForm.value.status ?? true,
            createdBy: currentUser,
            lastUpdatedBy: currentUser
        };
        this.isSubmitting = true;
        const obs = this.editingKeys
            ? this.masterBasicSetupService.updateMotherOrgRankVacancy(payload)
            : this.masterBasicSetupService.saveUpdateMotherOrgRankVacancy(payload);
        obs.subscribe({
            next: (res) => {
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Vacancy saved successfully' });
                    this.resetForm();
                    this.loadVacancyList();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res.description ?? 'Save failed' });
                }
                this.isSubmitting = false;
            },
            error: () => {
                this.isSubmitting = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save vacancy' });
            }
        });
    }

    resetForm(): void {
        this.editingKeys = null;
        this.vacancyForm.reset({ orgId: null, motherOrgRankId: null, totalVacancy: null, status: true });
    }

    update(event: { row: MotherOrgRankVacancyModel }): void {
        const row = event.row;
        this.editingKeys = { orgId: row.orgId, motherOrgRankId: row.motherOrgRankId };
        this.vacancyForm.patchValue({
            orgId: row.orgId,
            motherOrgRankId: row.motherOrgRankId,
            totalVacancy: row.totalVacancy,
            status: row.status ?? true
        });
        if (row.orgId) {
            this.masterBasicSetupService.getAllActiveCommonCodesByOrgIdAndType(row.orgId, 'MotherOrgRank').subscribe({
                next: (ranks) => {
                    this.motherOrgRankOptions = (ranks ?? []).map((r) => ({ label: r.codeValueEN ?? String(r.codeId), value: r.codeId }));
                    const field = this.formConfig.formFields.find((f) => f.name === 'motherOrgRankId');
                    if (field) field.options = this.motherOrgRankOptions;
                }
            });
        }
    }

    delete(row: MotherOrgRankVacancyModel, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Delete this vacancy definition?',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.masterBasicSetupService.deleteMotherOrgRankVacancy(row.orgId, row.motherOrgRankId).subscribe({
                    next: (res) => {
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Deleted' });
                            this.loadVacancyList();
                            if (this.editingKeys && this.editingKeys.orgId === row.orgId && this.editingKeys.motherOrgRankId === row.motherOrgRankId) {
                                this.resetForm();
                            }
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res.description ?? 'Delete failed' });
                        }
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete' });
                    }
                });
            }
        });
    }

    getCurrentUser(): string {
        return this.shareService.getCurrentUser?.() ?? 'System';
    }

    onLazyLoad(): void {
        this.loadVacancyList();
    }

    onSearch(value: string): void {
        if (!value?.trim()) {
            this.loadVacancyList();
            return;
        }
        const v = value.toLowerCase();
        this.vacancyData = this.vacancyData.filter(
            (r) =>
                (r.orgName ?? '').toLowerCase().includes(v) ||
                (r.rankName ?? '').toLowerCase().includes(v) ||
                String(r.totalVacancy).includes(v)
        );
        this.totalRecords = this.vacancyData.length;
    }
}
