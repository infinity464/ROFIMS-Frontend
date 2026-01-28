import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormConfig } from '../shared/models/formConfig';
import { TableConfig } from '../shared/models/dataTableConfig';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { DataTable } from '../shared/componets/data-table/data-table';
import { Fluid } from 'primeng/fluid';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { CommonCode } from '../shared/models/common-code';

@Component({
    selector: 'app-educational-department',
    imports: [DynamicFormComponent, DataTable, Fluid, ConfirmDialog, Toast],
    templateUrl: './educational-department.html',
    styleUrl: './educational-department.scss',
    providers: [MessageService, ConfirmationService]
})
export class EducationalDepartment {
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

    InstitutionTypeOptions: { label: string; value: any }[] = [];
    institutionNameOptions: { label: string; value: any }[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'InstitutionTypeId',
                label: 'Institution Type',
                type: 'select',
                required: true,
                options: []
            },
            {
                name: 'institutionNameId',
                label: 'Institution Name',
                type: 'select',
                required: true,
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
            // { field: 'InstitutionTypeName', header: 'InstitutionType' },
            // { field: 'institutionNameName', header: 'InstitutionName' },
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
        private fb: FormBuilder
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadInstitutionTypes(); // Load InstitutionTypes on init
        this.getUpazilaWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.commonForm = this.fb.group({
            InstitutionTypeId: [null, Validators.required],
            institutionNameId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['EducationalDepartment'],
            parentCodeId: [null], // Will store institutionNameId
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
            next: (InstitutionTypes) => {
                this.InstitutionTypeOptions = InstitutionTypes.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));
                const InstitutionTypeField = this.formConfig.formFields.find((f) => f.name === 'InstitutionTypeId');
                if (InstitutionTypeField) {
                    InstitutionTypeField.options = this.InstitutionTypeOptions;
                }
            },
            error: (err) => {
                console.error('Error loading InstitutionTypes:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load InstitutionTypes'
                });
            }
        });
    }

    loadInstitutionNames(InstitutionTypeId: number) {
        this.masterBasicSetupService.getByParentId(InstitutionTypeId).subscribe({
            next: (institutionNames) => {
                this.institutionNameOptions = institutionNames.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));
                const institutionNameField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
                if (institutionNameField) {
                    institutionNameField.options = this.institutionNameOptions;
                }
            },
            error: (err) => {
                console.error('Error loading institutionNames:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load institutionNames'
                });
            }
        });
    }

    // Handle field changes (for cascading dropdowns)
    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        // When institutionNameId field needs to be updated (because InstitutionTypeId changed)
        if (event.fieldName === 'institutionNameId' && event.value.parentField === 'InstitutionTypeId') {
            const InstitutionTypeId = event.value.parentValue;
            this.loadInstitutionNames(InstitutionTypeId);
        }
    }

    loadAnscestors(codeId: number) {
        this.masterBasicSetupService.getAncestorsOfCommonCode(codeId).subscribe({
            next: (res) => {
                this.ancestors = res;
                console.log('Ancestors:', this.ancestors);
            },
            error: (err) => {
                console.error('Error loading ancestors:');
            }
        });
    }

    getUpazilaWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue ? this.masterBasicSetupService.getByKeyordWithPaging('EducationalDepartment', this.searchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging('EducationalDepartment', pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.commonData = res.datalist;
                this.totalRecords = res.pages.rows;
                this.rows = pageSize;
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load data'
                });
                this.loading = false;
            }
        });
    }

    submit(data: any) {
        if (this.commonForm.invalid) {
            this.commonForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = new Date().toISOString();

        // Set parentCodeId to selected institutionNameId
        this.commonForm.patchValue({
            parentCodeId: this.commonForm.value.institutionNameId
        });

        if (this.editingId) {
            this.updateUpazila(currentUser, currentDateTime);
        } else {
            this.createUpazila(currentUser, currentDateTime);
        }
    }

    private createUpazila(currentUser: string, currentDateTime: string) {
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
                this.getUpazilaWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'EducationalDepartment created successfully'
                });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create educational-department'
                });
            }
        });
    }

    private updateUpazila(currentUser: string, currentDateTime: string) {
        const updatePayload = {
            ...this.commonForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime,
            createdDate: currentDateTime,
            createdBy: currentUser
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getUpazilaWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'EducationalDepartment updated successfully'
                });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update educational-department'
                });
            }
        });
    }

    update(row: any) {
    this.editingId = row.codeId;

    this.loadAnscestors(row.codeId);

    // Move the logic inside the loadAnscestors subscribe callback
    this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
        next: (ancestors) => {
            this.ancestors = ancestors;
            console.log('Ancestors:', this.ancestors);

            const InstitutionTypeId = this.ancestors[0]?.codeId;

            if (InstitutionTypeId) {
                console.log('Loading institutionNames for InstitutionTypeId:', InstitutionTypeId);
                this.loadInstitutionNames(InstitutionTypeId);

                // Patch the form after institutionNames are loaded
                // Use setTimeout or subscribe to loadInstitutionNames completion

                    this.commonForm.patchValue({
                        InstitutionTypeId: InstitutionTypeId,
                        institutionNameId: row.parentCodeId,
                        codeValueEN: row.codeValueEN,
                        codeValueBN: row.codeValueBN,
                        status: row.status
                    });

            }
        },
        error: (err) => {
            console.error('Error loading ancestors:', err);
        }
    });

    console.log('Edit:', row);
}

    delete(row: any, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this record?',
            header: 'Danger Zone',
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
                        this.getUpazilaWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'EducationalDepartment deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete educational-department'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;

        // Clear institutionName options when resetting
        const institutionNameField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
        if (institutionNameField) {
            institutionNameField.options = [];
        }

        this.commonForm.reset({
            InstitutionTypeId: null,
            institutionNameId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'EducationalDepartment',
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
        this.searchValue = keyword;
        this.first = 0;
        this.getUpazilaWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return 'Admin';
    }
}
