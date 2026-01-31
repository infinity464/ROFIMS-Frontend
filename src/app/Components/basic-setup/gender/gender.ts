import { Component } from '@angular/core';
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
    selector: 'app-gender',
    imports: [DynamicFormComponent, DataTable,   Fluid],
    templateUrl: './gender.html',
    providers: [],
    styleUrl: './gender.scss'
})
export class Gender {
    codeType: string = 'Gender';
    genderDate: CommonCode[] = [];
    editingId: number | null = null;
    genderForm!: FormGroup;
    isSubmitting = false;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    serchValue: string = '';

    // Form Configuration
    formConfig: FormConfig = {
        formFields: [
            {
                name: 'codeValueEN',
                label: 'Gender Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Gender Name (Bangla)',
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

    // Table Configuration
    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'codeValueEN', header: 'Gender Name (EN)' },
            { field: 'codeValueBN', header: 'Gender Name (BN)' },
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
        this.initForm();
        this.getGenderWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.genderForm = this.fb.group({
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [true, Validators.required],
            orgId: [0],
            codeId: [0],
            codeType: [this.codeType],
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            parentCodeId: [null],
            sortOrder: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    getGenderWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.serchValue ? this.masterBasicSetupService.getByKeyordWithPaging(this.codeType, this.serchValue, pageNo, pageSize) : this.masterBasicSetupService.getAllWithPaging(this.codeType, pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.genderDate = res.datalist;
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
        if (this.genderForm.invalid) {
            this.genderForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()

        if (this.editingId) {
            this.updateGender(currentUser, currentDateTime);
        } else {
            this.createGender(currentUser, currentDateTime);
        }
    }

    private createGender(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = {
            ...this.genderForm.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(createPayload).subscribe({
            next: (res) => {
                console.log('Created:', res);
                this.resetForm();
                this.getGenderWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Gender created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create gender'
                });
                this.isSubmitting = false;
            }
        });
    }

    private updateGender(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = {
            ...this.genderForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: (res) => {
                console.log('Updated:', res);
                this.resetForm();
                this.getGenderWithPaging({
                    first: this.first,
                    rows: this.rows
                });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Gender updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update gender'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.genderForm.patchValue(row);
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
                        this.getGenderWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Gender deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete gender'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.genderForm.reset({
            orgId: 0,
            codeId: 0,
            codeType: this.codeType,
            status: true,
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
    }

    onSearch(keyword: string) {
        this.serchValue = keyword;
        this.first = 0;
        this.getGenderWithPaging({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        // TODO: Get from authentication service
        return this.shareService.getCurrentUser()
    }
}
