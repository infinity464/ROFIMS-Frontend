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
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-course-name',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './course-name.html',
    providers: [],
    styleUrl: './course-name.scss'
})
export class CourseName {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    codeType: string = 'CourseName';
    title: string = 'Course Name';

    allData: any[] = [];
    commonCodeData: CommonCode[] = [];
    editingId: number | null = null;
    commonCodeForm!: FormGroup;

    isSubmitting = false;
    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    orgOptions: { label: string; value: any }[] = [];
    courseTypeOptions: { label: string; value: any }[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Organization (English)',
                type: 'select',
                options: [],
                required: false,
                default: null
            },
            {
                name: 'parentCodeId',
                label: 'Course Type',
                type: 'select',
                options: [],
                required: false,
                default: null
            },
            {
                name: 'codeValueEN',
                label: 'Course Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Course Name (Bangla)',
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
            { field: 'orgNameDisplay', header: 'Organization' },
            { field: 'courseTypeNameDisplay', header: 'Course Type' },
            { field: 'codeValueEN', header: 'Course Name (EN)' },
            { field: 'codeValueBN', header: 'Course Name (BN)' },
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
        forkJoin({
            orgs: this.masterBasicSetupService.getAllActiveMotherOrgs(),
            courseTypes: this.masterBasicSetupService.getAllByType('CourseType')
        }).subscribe({
            next: ({ orgs, courseTypes }) => {
                this.orgOptions = orgs.map((d: any) => ({ label: d.orgNameEN, value: d.orgId }));
                this.courseTypeOptions = courseTypes.map((d: any) => ({ label: d.codeValueEN, value: d.codeId }));
                const orgField = this.formConfig.formFields.find((f) => f.name === 'orgId');
                const courseTypeField = this.formConfig.formFields.find((f) => f.name === 'parentCodeId');
                if (orgField) orgField.options = this.orgOptions;
                if (courseTypeField) courseTypeField.options = this.courseTypeOptions;
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading data:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load data' });
            }
        });
    }

    private setupFormFilterListeners() {
        this.commonCodeForm.get('orgId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonCodeForm.get('parentCodeId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonCodeForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonCodeForm = this.fb.group({
            orgId: [null],
            parentCodeId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            codeId: [0],
            codeType: [this.codeType],
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
        const getOrgName = (id: number) => this.orgOptions.find((o: any) => o.value === id)?.label ?? '-';
        const getCourseTypeName = (id: number) => this.courseTypeOptions.find((o: any) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r: any) => ({
            ...r,
            orgNameDisplay: getOrgName(r.orgId ?? 0),
            courseTypeNameDisplay: getCourseTypeName(r.parentCodeId ?? 0)
        }));
        const orgId = this.commonCodeForm?.get('orgId')?.value;
        const parentCodeId = this.commonCodeForm?.get('parentCodeId')?.value;
        const status = this.commonCodeForm?.get('status')?.value;
        if (orgId != null && orgId !== '') list = list.filter((r: any) => r.orgId === orgId);
        if (parentCodeId != null && parentCodeId !== '') list = list.filter((r: any) => r.parentCodeId === parentCodeId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonCodeData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const orgId = this.commonCodeForm.get('orgId')?.value;
        const parentCodeId = this.commonCodeForm.get('parentCodeId')?.value;
        const status = this.commonCodeForm.get('status')?.value;
        if (orgId == null || orgId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Organization' });
            return;
        }
        if (parentCodeId == null || parentCodeId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Course Type' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status' });
            return;
        }
        if (this.commonCodeForm.invalid) {
            this.commonCodeForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime();

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
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course Name created successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create course name' });
                this.isSubmitting = false;
            }
        });
    }

    private updateCommonCode(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = {
            ...this.commonCodeForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime,
            createdDate: currentDateTime,
            createdBy: currentUser
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course Name updated successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update course name' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue({
            orgId: row.orgId,
            parentCodeId: row.parentCodeId,
            codeValueEN: row.codeValueEN,
            codeValueBN: row.codeValueBN,
            status: row.status,
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course Name deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete course name' });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.searchValue = '';
        this.commonCodeForm.reset({
            orgId: null,
            parentCodeId: null,
            codeId: 0,
            codeType: this.codeType,
            status: null,
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
