import { Component, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-educational-department',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './educational-department.html',
    styleUrl: './educational-department.scss',
    providers: []
})
export class EducationalDepartment {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allData: any[] = [];
    commonData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;
    title = 'Educational Department';
    codeType = 'EducationalDepartment';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'codeValueEN',
                label: 'EducationalDepartment Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'EducationalDepartment Name (Bangla)',
                type: 'text',
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
            { field: 'codeValueEN', header: 'Educational Department Name (EN)' },
            { field: 'codeValueBN', header: 'Educational Department Name (BN)' },
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
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['EducationalDepartment'],
            parentCodeId: [null],
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

    onFieldChange(_event: { fieldName: string; value: any }) {}

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('EducationalDepartment').subscribe({
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
        let list = [...this.allData];
        const status = this.commonForm?.get('status')?.value;
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const status = this.commonForm.get('status')?.value;
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
        // Educational Department is an independent (flat) list — no parent institution.
        this.commonForm.patchValue({ parentCodeId: null });

        if (this.editingId) {
            this.updateDepartment(currentUser, currentDateTime);
        } else {
            this.createDepartment(currentUser, currentDateTime);
        }
    }

    private createDepartment(currentUser: string, currentDateTime: string) {
        const createPayload = { ...this.commonForm.value, createdBy: currentUser, createdDate: currentDateTime, lastUpdatedBy: currentUser, lastupdate: currentDateTime };
        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationalDepartment created successfully' });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create educational-department' });
            }
        });
    }

    private updateDepartment(currentUser: string, currentDateTime: string) {
        const updatePayload = { ...this.commonForm.value, codeId: this.editingId, lastUpdatedBy: currentUser, lastupdate: currentDateTime, createdDate: currentDateTime, createdBy: currentUser };
        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationalDepartment updated successfully' });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update educational-department' });
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonForm.patchValue({
            codeValueEN: row.codeValueEN,
            codeValueBN: row.codeValueBN,
            status: row.status
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationalDepartment deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete educational-department' });
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
            orgId: 0,
            codeId: 0,
            codeType: 'EducationalDepartment',
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
