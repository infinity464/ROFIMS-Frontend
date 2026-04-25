import { Component, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from "../shared/componets/dynamic-form-component/dynamic-form";

import { Fluid } from 'primeng/fluid';
import { DataTable } from "../shared/componets/data-table/data-table";
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
  selector: 'app-prefix',
  imports: [DynamicFormComponent, Fluid, DataTable],
  providers: [],
  templateUrl: './prefix.html',
  styleUrl: './prefix.scss',
})
export class Prefix {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;


    codeType = "Prefix";
    title = "Prefix";

    allData: any[] = [];
    commonData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    orgOptions: { label: string; value: any }[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: false,
                default: null,
                options: []
            },
            {
                name: 'codeValueEN',
                label: 'Prefix Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Prefix Name (Bangla)',
                type: 'text',
                required: true
            },
            {
                name: 'sortOrder',
                label: 'Seniority',
                type: 'number',
                required: false
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
            { field: 'codeValueEN', header: 'Prefix Name (EN)' },
            { field: 'codeValueBN', header: 'Prefix Name (BN)' },
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
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.setupFormFilterListeners();
        this.loadActiveMotherOrgs();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('orgId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            orgId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            sortOrder: [null],
            status: [null],
            codeId: [0],
            codeType: ['Prefix'],
            parentCodeId: [null],
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    loadActiveMotherOrgs() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (motherOrgRanks) => {
                this.orgOptions = motherOrgRanks.map(d => ({ label: d.orgNameEN, value: d.orgId }));
                const orgField = this.formConfig.formFields.find(f => f.name === 'orgId');
                if (orgField) orgField.options = this.orgOptions;
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading prefix:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load organizations' });
            }
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('Prefix').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load data' });
                this.loading = false;
            }
        });
    }

    private buildTableData() {
        const getOrgName = (id: number) => this.orgOptions.find((o: any) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r: any) => ({ ...r, orgNameDisplay: getOrgName(r.orgId ?? 0) }));
        const orgId = this.commonForm?.get('orgId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (orgId != null && orgId !== '') list = list.filter((r: any) => r.orgId === orgId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
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
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status' });
            return;
        }
        if (this.commonForm.invalid) {
            this.commonForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime();

        if (this.editingId) {
            this.updatePrefix(currentUser, currentDateTime);
        } else {
            this.createPrefix(currentUser, currentDateTime);
        }
    }

    private createPrefix(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = {
            ...this.commonForm.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Prefix created successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create prefix' });
                this.isSubmitting = false;
            }
        });
    }

    private updatePrefix(currentUser: string, currentDateTime: string) {
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
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Prefix updated successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update prefix' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonForm.patchValue({
            orgId: row.orgId,
            codeValueEN: row.codeValueEN,
            codeValueBN: row.codeValueBN,
            status: row.status,
            sortOrder: row.sortOrder
        });
    }

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.masterBasicSetupService.delete(row.codeId).subscribe({
                    next: () => {
                        this.getAllData();
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Prefix deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete prefix' });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.searchValue = '';
        this.commonForm.reset({
            orgId: null,
            codeId: 0,
            codeType: 'Prefix',
            status: null,
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
        this.buildTableData();
    }

    onSearch(keyword: string) {
        this.searchValue = keyword ?? '';
        this.first = 0;
        this.buildTableData();
    }

    private getCurrentUser(): string {
        return this.shareService.getCurrentUser();
    }
}
