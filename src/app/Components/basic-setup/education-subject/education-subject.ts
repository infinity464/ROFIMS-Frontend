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
    selector: 'app-education-subject',
    imports: [DynamicFormComponent, DataTable, Fluid, ConfirmDialog, Toast],
    templateUrl: './education-subject.html',
    styleUrl: './education-subject.scss',
    providers: [MessageService, ConfirmationService]
})
export class EducationSubject {
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

    EducationInstitutionTypeOptions: { label: string; value: any }[] = [];
    institutionNameOptions: { label: string; value: any }[] = [];
    educationalDepartmentOptions: { label: string; value: any }[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'educationInstitutionTypeId',
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
                dependsOn: 'educationInstitutionTypeId',
                cascadeLoad: true
            },
            {
                name: 'educationalDepartmentId',
                label: 'Department',
                type: 'select',
                required: true,
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
        private fb: FormBuilder
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadInstitutionTypes();
        this.getCommonCodeWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.commonForm = this.fb.group({
            educationInstitutionTypeId: [null, Validators.required],
            institutionNameId: [null, Validators.required],
            educationalDepartmentId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['EducationSubject'],
            parentCodeId: [null], // Will store educationalDepartmentId
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
            next: (EducationInstitutionTypes) => {
                this.EducationInstitutionTypeOptions = EducationInstitutionTypes.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                const EducationInstitutionTypeField = this.formConfig.formFields.find((f) => f.name === 'educationInstitutionTypeId');
                if (EducationInstitutionTypeField) {
                    EducationInstitutionTypeField.options = this.EducationInstitutionTypeOptions;
                }
            },
            error: (err) => {
                console.error('Error loading EducationInstitutionTypes:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load EducationInstitutionTypes'
                });
            }
        });
    }

    loadInstitutionNames(educationInstitutionTypeId: number) {
        this.masterBasicSetupService.getByParentId(educationInstitutionTypeId).subscribe({
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
                console.error('Error loading institution Names:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load institution Names'
                });
            }
        });
    }

    loadDepartments(institutionNameId: number) {
        this.masterBasicSetupService.getByParentId(institutionNameId).subscribe({
            next: (educationalDepartments) => {
                this.educationalDepartmentOptions = educationalDepartments.map((u) => ({
                    label: u.codeValueEN,
                    value: u.codeId
                }));
                const educationalDepartmentField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
                if (educationalDepartmentField) {
                    educationalDepartmentField.options = this.educationalDepartmentOptions;
                }
            },
            error: (err) => {
                console.error('Error loading educationalDepartments:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load educationalDepartments'
                });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        if (event.fieldName === 'institutionNameId' && event.value.parentField === 'educationInstitutionTypeId' && event.value.parentValue) {
            const educationInstitutionTypeId = event.value.parentValue;
            this.loadInstitutionNames(educationInstitutionTypeId);
        }

        if (event.fieldName === 'educationalDepartmentId' && event.value.parentField === 'institutionNameId' && event.value.parentValue) {
            const institutionNameId = event.value.parentValue;
            this.loadDepartments(institutionNameId);
        }
    }

    getCommonCodeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue ? this.masterBasicSetupService.getByKeyordWithPaging('EducationSubject', this.searchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging('EducationSubject', pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.commonData = res.datalist; // Changed from educationalDepartmentData
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

        // Set parentCodeId to selected educationalDepartmentId (not institutionNameId!)
        this.commonForm.patchValue({
            parentCodeId: this.commonForm.value.educationalDepartmentId
        });

        if (this.editingId) {
            this.updatePostOffice(currentUser, currentDateTime);
        } else {
            this.createPostOffice(currentUser, currentDateTime);
        }
    }

    private createPostOffice(currentUser: string, currentDateTime: string) {
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
                this.getCommonCodeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'EducationSubject created successfully'
                });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create education-subject'
                });
            }
        });
    }

    private updatePostOffice(currentUser: string, currentDateTime: string) {
        const updatePayload = {
            ...this.commonForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getCommonCodeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'EducationSubject updated successfully'
                });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update education-subject'
                });
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;

        // Load ancestors and set form values in sequence
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                console.log('Ancestors:', this.ancestors);

                // ancestors[0] = Institution Type, ancestors[1] = Institution Name, ancestors[2] = Department
                const educationInstitutionTypeId = this.ancestors[0]?.codeId;
                const institutionNameId = this.ancestors[1]?.codeId;
                const educationalDepartmentId = row.parentCodeId; // The parent of EducationSubject is Department

                if (educationInstitutionTypeId && institutionNameId) {
                    // Load institutionNames first
                    this.masterBasicSetupService.getByParentId(educationInstitutionTypeId).subscribe({
                        next: (institutionNames) => {
                            this.institutionNameOptions = institutionNames.map((d) => ({
                                label: d.codeValueEN,
                                value: d.codeId
                            }));
                            const institutionNameField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
                            if (institutionNameField) {
                                institutionNameField.options = this.institutionNameOptions;
                            }

                            // Then load educationalDepartments
                            this.masterBasicSetupService.getByParentId(institutionNameId).subscribe({
                                next: (educationalDepartments) => {
                                    this.educationalDepartmentOptions = educationalDepartments.map((u) => ({
                                        label: u.codeValueEN,
                                        value: u.codeId
                                    }));
                                    const educationalDepartmentField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
                                    if (educationalDepartmentField) {
                                        educationalDepartmentField.options = this.educationalDepartmentOptions;
                                    }

                                    // Finally, patch the form with all values
                                    this.commonForm.patchValue({
                                        educationInstitutionTypeId: educationInstitutionTypeId,
                                        institutionNameId: institutionNameId,
                                        educationalDepartmentId: educationalDepartmentId,
                                        codeValueEN: row.codeValueEN,
                                        codeValueBN: row.codeValueBN,
                                        status: row.status
                                    });
                                },
                                error: (err) => {
                                    console.error('Error loading educationalDepartments:', err);
                                }
                            });
                        },
                        error: (err) => {
                            console.error('Error loading institutionNames:', err);
                        }
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
                        this.getCommonCodeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'EducationSubject deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete education-subject'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;

        // Clear all dependent dropdowns
        const institutionNameField = this.formConfig.formFields.find((f) => f.name === 'institutionNameId');
        if (institutionNameField) {
            institutionNameField.options = [];
        }

        const educationalDepartmentField = this.formConfig.formFields.find((f) => f.name === 'educationalDepartmentId');
        if (educationalDepartmentField) {
            educationalDepartmentField.options = [];
        }

        this.commonForm.reset({
            educationInstitutionTypeId: null,
            institutionNameId: null,
            educationalDepartmentId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'EducationSubject',
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
        this.getCommonCodeWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        return 'Admin';
    }
}
