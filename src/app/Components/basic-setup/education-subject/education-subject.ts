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
import { forkJoin } from 'rxjs';

import { CommonCode } from '../shared/models/common-code';
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

    EducationInstitutionTypeOptions: { label: string; value: any }[] = [];
    institutionNameOptions: { label: string; value: any }[] = [];
    educationalDepartmentOptions: { label: string; value: any }[] = [];
    allInstitutions: any[] = [];
    allDepartments: any[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'educationInstitutionTypeId',
                label: 'Institution Type',
                type: 'select',
                required: false,
                default: null,
                options: []
            },
            {
                name: 'institutionNameId',
                label: 'Institution Name',
                type: 'select',
                required: false,
                default: null,
                options: [],
                dependsOn: 'educationInstitutionTypeId',
                cascadeLoad: true
            },
            {
                name: 'educationalDepartmentId',
                label: 'Department',
                type: 'select',
                required: false,
                default: null,
                options: [],
                dependsOn: 'institutionNameId',
                cascadeLoad: true
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
            { field: 'institutionTypeNameDisplay', header: 'Institution Type' },
            { field: 'institutionNameDisplay', header: 'Institution Name' },
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
        this.loadInstitutionTypes();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('educationInstitutionTypeId')?.valueChanges.subscribe((typeId) => {
            this.commonForm.patchValue({ institutionNameId: null, educationalDepartmentId: null }, { emitEvent: false });
            const instField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
            const deptField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
            if (instField) instField.options = [];
            if (deptField) deptField.options = [];
            if (typeId) this.loadInstitutionNames(typeId);
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('institutionNameId')?.valueChanges.subscribe((instId) => {
            this.commonForm.patchValue({ educationalDepartmentId: null }, { emitEvent: false });
            const deptField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
            if (deptField) deptField.options = [];
            if (instId) this.loadDepartments(instId);
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('educationalDepartmentId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            educationInstitutionTypeId: [null],
            institutionNameId: [null],
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

    loadInstitutionTypes() {
        this.masterBasicSetupService.getAllByType('EducationInstitutionType').subscribe({
            next: (types) => {
                this.EducationInstitutionTypeOptions = types.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'educationInstitutionTypeId');
                if (field) field.options = this.EducationInstitutionTypeOptions;
                forkJoin({
                    institutions: this.masterBasicSetupService.getAllByType('EducationInstitution'),
                    departments: this.masterBasicSetupService.getAllByType('EducationalDepartment')
                }).subscribe(({ institutions, departments }) => {
                    this.allInstitutions = Array.isArray(institutions) ? institutions : [];
                    this.allDepartments = Array.isArray(departments) ? departments : [];
                    this.getAllData();
                });
            },
            error: (err) => {
                console.error('Error loading EducationInstitutionTypes:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load EducationInstitutionTypes' });
            }
        });
    }

    loadInstitutionNames(educationInstitutionTypeId: number) {
        this.masterBasicSetupService.getByParentId(educationInstitutionTypeId).subscribe({
            next: (insts) => {
                this.institutionNameOptions = insts.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
                if (field) field.options = this.institutionNameOptions;
            },
            error: (err) => {
                console.error('Error loading institution Names:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load institution Names' });
            }
        });
    }

    loadDepartments(institutionNameId: number) {
        this.masterBasicSetupService.getByParentId(institutionNameId).subscribe({
            next: (depts) => {
                this.educationalDepartmentOptions = depts.map((u) => ({ label: u.codeValueEN, value: u.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
                if (field) field.options = this.educationalDepartmentOptions;
            },
            error: (err) => {
                console.error('Error loading educationalDepartments:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load educationalDepartments' });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        if (event.fieldName === 'institutionNameId' && event.value?.parentField === 'educationInstitutionTypeId' && event.value?.parentValue) {
            this.loadInstitutionNames(event.value.parentValue);
        }
        if (event.fieldName === 'educationalDepartmentId' && event.value?.parentField === 'institutionNameId' && event.value?.parentValue) {
            this.loadDepartments(event.value.parentValue);
        }
    }

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
        const typeOpts = this.EducationInstitutionTypeOptions;
        const getTypeName = (id: number) => typeOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getInstName = (id: number) => {
            const i = this.allInstitutions.find((x: any) => x.codeId === id);
            return i?.codeValueEN ?? this.institutionNameOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const getDeptName = (id: number) => {
            const d = this.allDepartments.find((x: any) => x.codeId === id);
            return d?.codeValueEN ?? this.educationalDepartmentOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const deptToInstId = (deptId: number) => this.allDepartments.find((d: any) => d.codeId === deptId)?.parentCodeId;
        const instToTypeId = (instId: number) => this.allInstitutions.find((i: any) => i.codeId === instId)?.parentCodeId;
        let list = this.allData.map((r: any) => {
            const deptId = r.parentCodeId;
            const instId = deptToInstId(deptId);
            const typeId = instToTypeId(instId ?? 0);
            return {
                ...r,
                departmentNameDisplay: getDeptName(deptId),
                institutionNameDisplay: getInstName(instId ?? 0),
                institutionTypeNameDisplay: getTypeName(typeId ?? 0)
            };
        });
        const typeId = this.commonForm?.get('educationInstitutionTypeId')?.value;
        const instId = this.commonForm?.get('institutionNameId')?.value;
        const deptId = this.commonForm?.get('educationalDepartmentId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (deptId != null && deptId !== '') list = list.filter((r: any) => r.parentCodeId === deptId);
        else if (instId != null && instId !== '') {
            const deptIds = this.allDepartments.filter((d: any) => d.parentCodeId === instId).map((d: any) => d.codeId);
            list = list.filter((r: any) => deptIds.includes(r.parentCodeId));
        } else if (typeId != null && typeId !== '') {
            const instIds = this.allInstitutions.filter((i: any) => i.parentCodeId === typeId).map((i: any) => i.codeId);
            const deptIds = this.allDepartments.filter((d: any) => instIds.includes(d.parentCodeId)).map((d: any) => d.codeId);
            list = list.filter((r: any) => deptIds.includes(r.parentCodeId));
        }
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const typeId = this.commonForm.get('educationInstitutionTypeId')?.value;
        const instId = this.commonForm.get('institutionNameId')?.value;
        const deptId = this.commonForm.get('educationalDepartmentId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (typeId == null || typeId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Institution Type' });
            return;
        }
        if (instId == null || instId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Institution Name' });
            return;
        }
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
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                const educationInstitutionTypeId = this.ancestors[0]?.codeId;
                const institutionNameId = this.ancestors[1]?.codeId;
                const educationalDepartmentId = row.parentCodeId;
                if (educationInstitutionTypeId && institutionNameId) {
                    this.loadInstitutionNames(educationInstitutionTypeId);
                    setTimeout(() => {
                        this.loadDepartments(institutionNameId);
                        setTimeout(() => {
                            this.commonForm.patchValue({
                                educationInstitutionTypeId,
                                institutionNameId,
                                educationalDepartmentId,
                                codeValueEN: row.codeValueEN,
                                codeValueBN: row.codeValueBN,
                                status: row.status
                            });
                        }, 100);
                    }, 100);
                }
            },
            error: (err) => console.error('Error loading ancestors:', err)
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
        const instField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
        const deptField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
        if (instField) instField.options = [];
        if (deptField) deptField.options = [];
        this.commonForm.reset({
            educationInstitutionTypeId: null,
            institutionNameId: null,
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
