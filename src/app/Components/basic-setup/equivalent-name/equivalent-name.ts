import { Component, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonCode } from '../shared/models/common-code';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';

import { Fluid } from 'primeng/fluid';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-equivalent-name',
    imports: [DynamicFormComponent, DataTable,   Fluid],
    templateUrl: './equivalent-name.html',
    providers: [],
    styleUrl: './equivalent-name.scss'
})
export class EquivalentName {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    isSubmitting = false;
    codeType: string = 'EquivalentName';
    title: string = 'Equivalent Name';
    allData: CommonCode[] = [];
    commonCodeData: CommonCode[] = [];
    editingId: number | null = null;
    commonCodeForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    // Form Configuration
    formConfig: FormConfig = {
        formFields: [
            {
                name: 'codeValueEN',
                label: 'Equivalent Name Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Equivalent Name Name (Bangla)',
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

    // Table Configuration
    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'codeValueEN', header: 'Equivalent Name (EN)' },
            { field: 'codeValueBN', header: 'Equivalent Name (BN)' },
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
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.setupFormFilterListeners();
        this.getAllData();
    }

    private setupFormFilterListeners() {
        this.commonCodeForm.get('status')?.valueChanges.subscribe(() => {
            this.first = 0;
            this.buildTableData();
        });
    }

    initForm() {
        this.commonCodeForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: [this.codeType],
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            parentCodeId: [null],
            sortOrder: [0, Validators.required],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType(this.codeType).subscribe({
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
        let list = [...this.allData];
        const status = this.commonCodeForm?.get('status')?.value;
        if (status != null) list = list.filter((r) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonCodeData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        if (this.isSubmitting) return;
        const status = this.commonCodeForm.get('status')?.value;
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status (Active or Inactive)' });
            return;
        }
        if (this.commonCodeForm.invalid) {
            this.commonCodeForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()

        if (this.editingId) {
            this.updateCommonCode(currentUser, currentDateTime);
        } else {
            this.createCommonCode(currentUser, currentDateTime);
        }
    }

    private createCommonCode(currentUser: string, currentDateTime: string) {
         this.isSubmitting = true;
        const createPayload = {
            ...this.commonCodeForm.value,
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
                    detail: 'Equivalent Name created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create equivalent-name'
                });
            }
        });
    }

    private updateCommonCode(currentUser: string, currentDateTime: string) {
         this.isSubmitting = true;
        const updatePayload = {
            ...this.commonCodeForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getAllData();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Equivalent Name updated successfully'

                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update equivalent-name'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue(row);
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
                            detail: 'Equivalent Name deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete equivalent-name'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.isSubmitting = false;
        this.editingId = null;
        this.searchValue = '';
        this.commonCodeForm.reset({
            orgId: 0,
            codeId: 0,
            codeType: this.codeType,
            status: null,
            commCode: null,
            displayCodeValueEN: null,
            displayCodeValueBN: null,
            parentCodeId: null,
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
        return this.shareService.getCurrentUser()
    }
}
