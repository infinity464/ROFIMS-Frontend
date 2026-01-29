import { Component } from '@angular/core';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from "../shared/componets/dynamic-form-component/dynamic-form";
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Fluid } from 'primeng/fluid';
import { DataTable } from "../shared/componets/data-table/data-table";
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
  selector: 'app-education-institution',
  imports: [DynamicFormComponent, Toast, ConfirmDialog, Fluid, DataTable],
  providers: [MessageService, ConfirmationService],
  templateUrl: './education-institution.html',
  styleUrl: './education-institution.scss',
})
export class EducationInstitution {

    codeType = "EducationInstitution";
    title = 'Education Institution';

    commonCodeData: any[] = [];
    editingId: number | null = null;
    commonCodeForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;


    formConfig: FormConfig = {
        formFields: [
            {
                name: 'educationInstitutionTypeId',
                label: 'Education Institution Type',
                type: 'select',
                required: true,
                options: [] // Will be populated in ngOnInit
            },
            {
                name: 'codeValueEN',
                label: 'EducationInstitution Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'EducationInstitution Name (Bangla)',
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
            // { field: 'employeeTypeName', header: 'Division' },
            { field: 'codeValueEN', header: 'Education Institution Type Name (EN)' },
            { field: 'codeValueBN', header: 'Education Institution Type Name (BN)' },
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
        this.loadEducationInstitutionType(); // Load employeeTypes for dropdown
        this.getOfficerTypeWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

      initForm() {
        this.commonCodeForm = this.fb.group({
            educationInstitutionTypeId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['EducationInstitution'],
            parentCodeId: [null], // Will store educationInstitutionTypeId
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

    // Load all employeeTypes for the dropdown
    loadEducationInstitutionType() {
        this.masterBasicSetupService.getAllByType('EducationInstitutionType').subscribe({
            next: (employeeTypes) => {
                const employeeTypeOptions = employeeTypes.map(d => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                // Update form config with rabUnit options
                const employeeTypeField = this.formConfig.formFields.find(f => f.name === 'educationInstitutionTypeId');
                if (employeeTypeField) {
                    employeeTypeField.options = employeeTypeOptions;
                }
            },
            error: (err) => {
                console.error('Error loading data:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load data'
                });
            }
        });
    }

    getOfficerTypeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue
            ? this.masterBasicSetupService.getByKeyordWithPaging('EducationInstitution', this.searchValue, pageNo, pageSize)
            : this.masterBasicSetupService.getAllWithPaging('EducationInstitution', pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.commonCodeData = res.datalist;
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
        if (this.commonCodeForm.invalid) {
            this.commonCodeForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()

        // Set parentCodeId to selected educationInstitutionTypeId
        this.commonCodeForm.patchValue({
            parentCodeId: this.commonCodeForm.value.educationInstitutionTypeId
        });

        if (this.editingId) {
            this.updateOfficerType(currentUser, currentDateTime);
        } else {
            this.createOfficerType(currentUser, currentDateTime);
        }
    }

    private createOfficerType(currentUser: string, currentDateTime: string) {
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
                this.getOfficerTypeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Education Institution Type created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create education-institution'
                });

                this.isSubmitting = false;
            }
        });
    }

    private updateOfficerType(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = {
            ...this.commonCodeForm.value,
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
                this.getOfficerTypeWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Education Institution Type updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update education-institution'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue({
            educationInstitutionTypeId: row.parentCodeId, // parentCodeId contains educationInstitutionTypeId
            codeValueEN: row.codeValueEN,
            codeValueBN: row.codeValueBN,
            status: row.status
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
                        this.getOfficerTypeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'EducationInstitution deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete education-institution'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.commonCodeForm.reset({
            educationInstitutionTypeId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'EducationInstitution',
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
        this.getOfficerTypeWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return this.shareService.getCurrentUser()
    }


}
