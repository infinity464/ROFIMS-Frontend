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

@Component({
  selector: 'app-officer-type',
  imports: [DynamicFormComponent, Toast, ConfirmDialog, Fluid, DataTable],
  providers: [MessageService, ConfirmationService],
  templateUrl: './officer-type.html',
  styleUrl: './officer-type.scss',
})
export class OfficerType {

    codeType = "OfficerType";
    title = 'Officer Type';

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
                name: 'employeeTypeId',
                label: 'Employee Type',
                type: 'select',
                required: true,
                options: [] // Will be populated in ngOnInit
            },
            {
                name: 'codeValueEN',
                label: 'OfficerType Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'OfficerType Name (Bangla)',
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
            { field: 'codeValueEN', header: 'OfficerType Name (EN)' },
            { field: 'codeValueBN', header: 'OfficerType Name (BN)' },
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
    ) { }

    ngOnInit(): void {
        this.initForm();
        this.loadEmployeeType(); // Load employeeTypes for dropdown
        this.getOfficerTypeWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

      initForm() {
        this.commonCodeForm = this.fb.group({
            employeeTypeId: [null, Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: ['OfficerType'],
            parentCodeId: [null], // Will store employeeTypeId
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
    loadEmployeeType() {
        this.masterBasicSetupService.getAllByType('EmployeeType').subscribe({
            next: (employeeTypes) => {
                const employeeTypeOptions = employeeTypes.map(d => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                // Update form config with employeeType options
                const employeeTypeField = this.formConfig.formFields.find(f => f.name === 'employeeTypeId');
                if (employeeTypeField) {
                    employeeTypeField.options = employeeTypeOptions;
                }
            },
            error: (err) => {
                console.error('Error loading employeeTypes:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load employeeTypes'
                });
            }
        });
    }

    getOfficerTypeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue
            ? this.masterBasicSetupService.getByKeyordWithPaging('OfficerType', this.searchValue, pageNo, pageSize)
            : this.masterBasicSetupService.getAllWithPaging('OfficerType', pageNo, pageSize);

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
        const currentDateTime = new Date().toISOString();

        // Set parentCodeId to selected employeeTypeId
        this.commonCodeForm.patchValue({
            parentCodeId: this.commonCodeForm.value.employeeTypeId
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
                    detail: 'OfficerType created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create officer-type'
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
                    detail: 'OfficerType updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update officer-type'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue({
            employeeTypeId: row.parentCodeId, // parentCodeId contains employeeTypeId
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
                        this.getOfficerTypeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'OfficerType deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete officer-type'
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
            employeeTypeId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'OfficerType',
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
        return 'Admin';
    }


}
