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

import { CommonCode } from '../shared/models/common-code';
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

    InstitutionTypeOptions: { label: string; value: any }[] = [];
    institutionNameOptions: { label: string; value: any }[] = [];
    allInstitutions: any[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'InstitutionTypeId',
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
                dependsOn: 'InstitutionTypeId',
                cascadeLoad: true
            },
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
            { field: 'institutionTypeNameDisplay', header: 'Institution Type' },
            { field: 'institutionNameDisplay', header: 'Institution Name' },
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
        this.loadInstitutionTypes();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('InstitutionTypeId')?.valueChanges.subscribe((typeId) => {
            this.commonForm.patchValue({ institutionNameId: null }, { emitEvent: false });
            const instField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
            if (instField) instField.options = [];
            if (typeId) this.loadInstitutionNames(typeId);
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('institutionNameId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            InstitutionTypeId: [null],
            institutionNameId: [null],
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

    loadInstitutionTypes() {
        this.masterBasicSetupService.getAllByType('EducationInstitutionType').subscribe({
            next: (types) => {
                this.InstitutionTypeOptions = types.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'InstitutionTypeId');
                if (field) field.options = this.InstitutionTypeOptions;
                this.masterBasicSetupService.getAllByType('EducationInstitution').subscribe({
                    next: (insts) => {
                        this.allInstitutions = Array.isArray(insts) ? insts : [];
                        this.getAllData();
                    }
                });
            },
            error: (err) => {
                console.error('Error loading InstitutionTypes:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load InstitutionTypes' });
            }
        });
    }

    loadInstitutionNames(InstitutionTypeId: number) {
        this.masterBasicSetupService.getByParentId(InstitutionTypeId).subscribe({
            next: (insts) => {
                this.institutionNameOptions = insts.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const field = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
                if (field) field.options = this.institutionNameOptions;
            },
            error: (err) => {
                console.error('Error loading institutionNames:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load institutionNames' });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        if (event.fieldName === 'institutionNameId' && event.value?.parentField === 'InstitutionTypeId') {
            const typeId = event.value.parentValue;
            if (typeId) this.loadInstitutionNames(typeId);
        }
    }

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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load data' });
                this.loading = false;
            }
        });
    }

    private buildTableData() {
        const typeOpts = this.InstitutionTypeOptions;
        const getTypeName = (id: number) => typeOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getInstName = (id: number) => {
            const i = this.allInstitutions.find((x: any) => x.codeId === id);
            return i?.codeValueEN ?? this.institutionNameOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const instToTypeId = (instId: number) => this.allInstitutions.find((i: any) => i.codeId === instId)?.parentCodeId;
        let list = this.allData.map((r: any) => ({
            ...r,
            institutionNameDisplay: getInstName(r.parentCodeId),
            institutionTypeNameDisplay: getTypeName(instToTypeId(r.parentCodeId) ?? 0)
        }));
        const typeId = this.commonForm?.get('InstitutionTypeId')?.value;
        const institutionNameId = this.commonForm?.get('institutionNameId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (institutionNameId != null && institutionNameId !== '') list = list.filter((r: any) => r.parentCodeId === institutionNameId);
        else if (typeId != null && typeId !== '') {
            const instIds = this.allInstitutions.filter((i: any) => i.parentCodeId === typeId).map((i: any) => i.codeId);
            list = list.filter((r: any) => instIds.includes(r.parentCodeId));
        }
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const typeId = this.commonForm.get('InstitutionTypeId')?.value;
        const institutionNameId = this.commonForm.get('institutionNameId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (typeId == null || typeId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Institution Type' });
            return;
        }
        if (institutionNameId == null || institutionNameId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Institution Name' });
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
        this.commonForm.patchValue({ parentCodeId: this.commonForm.value.institutionNameId });

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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create educational-department' });
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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update educational-department' });
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                const InstitutionTypeId = this.ancestors[0]?.codeId;
                if (InstitutionTypeId) {
                    this.loadInstitutionNames(InstitutionTypeId);
                    setTimeout(() => {
                        this.commonForm.patchValue({
                            InstitutionTypeId: InstitutionTypeId,
                            institutionNameId: row.parentCodeId,
                            codeValueEN: row.codeValueEN,
                            codeValueBN: row.codeValueBN,
                            status: row.status
                        });
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'EducationalDepartment deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete educational-department' });
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
        if (instField) instField.options = [];
        this.commonForm.reset({
            InstitutionTypeId: null,
            institutionNameId: null,
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
