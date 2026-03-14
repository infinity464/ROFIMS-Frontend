import { Component } from '@angular/core';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { OrganizationModel } from '../organization-setup/models/organization';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from "../shared/componets/dynamic-form-component/dynamic-form";

import { Fluid } from 'primeng/fluid';
import { DataTable } from "../shared/componets/data-table/data-table";
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
  selector: 'app-mother-org-rank',
  imports: [DynamicFormComponent,  Fluid, DataTable],
  providers: [],
  templateUrl: './mother-org-rank.html',
  styleUrl: './mother-org-rank.scss',
})
export class MotherOrgRank {

    codeType = "MotherOrgRank";
    title = "Mother Organization Rank";

    allData: any[] = [];
    commonData: any[] = [];
    motherOrgs: OrganizationModel[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;


    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: false,
                options: [] as { label: string; value: any }[]
            },
            {
                name: 'codeValueEN',
                label: 'Rank Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Rank Name (Bangla)',
                type: 'text',
                required: true
            },
            {
                name: 'sortOrder',
                label: 'Seniority',
                type: 'number',
                required: true
            },
            {
                name: 'status',
                label: 'Status',
                type: 'select',
                required: false,
                default: null,
                options: [
                    { label: 'Active', value: true },
                    { label: 'Inactive', value: false }
                ]
            }
        ]
    };

        tableConfig: TableConfig = {
        tableColumns: [
            { field: 'orgNameDisplay', header: 'Mother Organization' },
            { field: 'codeValueEN', header: 'Rank Name (EN)' },
            { field: 'codeValueBN', header: 'Rank Name (BN)' },
            { field: 'sortOrder', header: 'Seniority' },
            {
                field: 'status',
                header: 'Status',
                type: 'boolean',
                trueLabel: 'Active',
                falseLabel: 'Inactive'
            },
            { field: 'codeId', header: 'Code ID', hidden: true }
        ]
    };

        constructor(
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder,
        private shareService: SharedService
    ) { }

    ngOnInit(): void {
        this.initForm();
        this.setupFormFilterListeners();
        this.loadActiveMotherOrgs();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('orgId')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('status')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    initForm() {
        this.commonForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [null],
            codeId: [0],
            codeType: ['MotherOrgRank'],
            parentCodeId: [null], // Will store motherOrgId
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            sortOrder: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    // Load all motherOrgs for the dropdown
    loadActiveMotherOrgs() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (motherOrgs) => {
                this.motherOrgs = motherOrgs ?? [];
                const motherOrgOptions = this.motherOrgs.map(d => ({
                    label: d.orgNameEN,
                    value: d.orgId
                }));

                // Update form config with motherOrg options
                const motherOrgField = this.formConfig.formFields.find(f => f.name === 'orgId');
                if (motherOrgField) {
                    motherOrgField.options = motherOrgOptions;
                }
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading Mother org Rank:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load Mother org Rank'
                });
            }
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('MotherOrgRank').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load data' });
                this.loading = false;
            }
        });
    }

    private buildTableData() {
        const orgOpts = (this.formConfig.formFields.find(f => f.name === 'orgId')?.options as { label: string; value: any }[]) || [];
        const getOrgName = (id: number) => orgOpts.find((o: any) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r: any) => ({ ...r, orgNameDisplay: getOrgName(r.orgId) }));
        const orgId = this.commonForm?.get('orgId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (orgId != null && orgId !== '') {
            list = list.filter((r: any) => r.orgId === orgId);
        }
        if (status != null) {
            list = list.filter((r: any) => r.status === status);
        }
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter((r: any) =>
                r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q)
            );
        }
        // Sort by motherOrg seniority, then rank seniority
        const getOrgSortOrder = (orgId: number) =>
            this.motherOrgs.find(o => o.orgId === orgId)?.sortOrder ?? 999;
        list.sort((a: any, b: any) => {
            const orgOrderA = getOrgSortOrder(a.orgId);
            const orgOrderB = getOrgSortOrder(b.orgId);
            if (orgOrderA !== orgOrderB) return (orgOrderA ?? 999) - (orgOrderB ?? 999);
            return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
        });
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const orgId = this.commonForm.get('orgId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (orgId == null || orgId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Mother Organization' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status (Active or Inactive)' });
            return;
        }
        if (this.commonForm.invalid) {
            this.commonForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()


        // this.commonForm.patchValue({
        //     parentCodeId: this.commonForm.value.divisionId
        // });

        if (this.editingId) {
            this.updateDistrict(currentUser, currentDateTime);
        } else {
            this.createDistrict(currentUser, currentDateTime);
        }
    }

    private createDistrict(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = {
            ...this.commonForm.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: (res) => {
                console.log('Created:', res);
                this.resetForm();
                this.getAllData();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'MotherOrgRank created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create mother-org-rank'
                });

                this.isSubmitting = false;
            }
        });
    }

    private updateDistrict(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = {
            ...this.commonForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime,
            createdDate: currentDateTime,
            createdBy: currentUser,
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getAllData();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'MotherOrgRank updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update mother-org-rank'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonForm.patchValue({
            orgId: row.orgId, // parentCodeId contains divisionId
            codeValueEN: row.codeValueEN,
            codeValueBN: row.codeValueBN,
            status: row.status,
            sortOrder: row.sortOrder
        });
        console.log('Edit:', row);
    }

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: {
                label: 'Cancel',
                severity: 'secondary',
                outlined: true
            },
            acceptButtonProps: {
                label: 'Delete',
                severity: 'danger'
            },
            accept: () => {
                this.masterBasicSetupService.delete(row.codeId).subscribe({
                    next: () => {
                this.getAllData();
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'MotherOrgRank deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete mother-org-rank'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.commonForm.reset({
            orgId: '',
            codeId: 0,
            codeType: 'MotherOrgRank',
            status: true,
            parentCodeId: null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            sortOrder: null,
            level: null,
            createdBy: '',
            createdDate: '',
            lastUpdatedBy: '',
            lastupdate: ''
        });
    }

    onSearch(keyword: string) {
        this.searchValue = keyword ?? '';
        this.first = 0;
        this.buildTableData();
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return this.shareService.getCurrentUser()
    }


}
