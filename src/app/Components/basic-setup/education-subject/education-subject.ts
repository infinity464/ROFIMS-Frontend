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
    selector: 'app-education-subject',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './education-subject.html',
    styleUrl: './education-subject.scss',
    providers: []
})
export class EducationSubject {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allData: any[] = [];
    commonData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;
    title = 'Education Subject';
    codeType = 'EducationSubject';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    educationalDepartmentOptions: { label: string; value: any }[] = [];
    allDepartments: any[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'educationalDepartmentId',
                label: 'Department',
                type: 'select',
                required: false,
                default: null,
                options: []
            },
            {
                name: 'codeValueEN',
                label: 'EducationSubject Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'EducationSubject Name (Bangla)',
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
            { field: 'departmentNameDisplay', header: 'Department' },
            { field: 'codeValueEN', header: 'EducationSubject Name (EN)' },
            { field: 'codeValueBN', header: 'EducationSubject Name (BN)' },
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
        this.loadDepartments();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('educationalDepartmentId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            educationalDepartmentId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['EducationSubject'],
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

    /** Department is now an independent flat list — load all departments directly. */
    loadDepartments() {
        this.masterBasicSetupService.getAllByType('EducationalDepartment').subscribe({
            next: (depts) => {
                this.allDepartments = Array.isArray(depts) ? depts : [];
                this.educationalDepartmentOptions = this.allDepartments.map((u) => ({ label: u.codeValueEN, value: u.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
                if (field) field.options = this.educationalDepartmentOptions;
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading educationalDepartments:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load educationalDepartments' });
            }
        });
    }

    onFieldChange(_event: { fieldName: string; value: any }) {}

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('EducationSubject').subscribe({
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
        const getDeptName = (id: number) => {
            const d = this.allDepartments.find((x: any) => x.codeId === id);
            return d?.codeValueEN ?? this.educationalDepartmentOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        let list = this.allData.map((r: any) => ({
            ...r,
            departmentNameDisplay: getDeptName(r.parentCodeId)
        }));
        const deptId = this.commonForm?.get('educationalDepartmentId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (deptId != null && deptId !== '') list = list.filter((r: any) => r.parentCodeId === deptId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const deptId = this.commonForm.get('educationalDepartmentId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (deptId == null || deptId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Department' });
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
        this.commonForm.patchValue({ parentCodeId: this.commonForm.value.educationalDepartmentId });

        if (this.editingId) {
            this.updateSubject(currentUser, currentDateTime);
        } else {
            this.createSubject(currentUser, currentDateTime);
        }
    }

    private createSubject(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = { ...this.commonForm.value, createdBy: currentUser, createdDate: currentDateTime, lastUpdatedBy: currentUser, lastupdate: currentDateTime };
        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationSubject created successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create education-subject' });
                this.isSubmitting = false;
            }
        });
    }

    private updateSubject(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = { ...this.commonForm.value, codeId: this.editingId, lastUpdatedBy: currentUser, lastupdate: currentDateTime, createdDate: currentDateTime, createdBy: currentUser };
        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationSubject updated successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update education-subject' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonForm.patchValue({
            educationalDepartmentId: row.parentCodeId,
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationSubject deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete education-subject' });
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
            educationalDepartmentId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'EducationSubject',
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
