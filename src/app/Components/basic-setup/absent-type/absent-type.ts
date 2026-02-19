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
    selector: 'app-absent-type',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './absent-type.html',
    providers: [],
    styleUrl: './absent-type.scss'
})
export class AbsentType {
    codeType: string = 'AbsentType';
    dataList: CommonCode[] = [];
    editingId: number | null = null;
    form!: FormGroup;
    isSubmitting = false;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    serchValue: string = '';

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'codeValueEN',
                label: 'Absent Type (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Absent Type (Bangla)',
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
            { field: 'codeValueEN', header: 'Absent Type (EN)' },
            { field: 'codeValueBN', header: 'Absent Type (BN)' },
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
        this.loadData({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.form = this.fb.group({
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

    loadData(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.serchValue
            ? this.masterBasicSetupService.getByKeyordWithPaging(this.codeType, this.serchValue, pageNo, pageSize)
            : this.masterBasicSetupService.getAllWithPaging(this.codeType, pageNo, pageSize);

        apiCall.subscribe({
            next: (res) => {
                this.dataList = res.datalist;
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
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime();

        if (this.editingId) {
            this.updateRecord(currentUser, currentDateTime);
        } else {
            this.createRecord(currentUser, currentDateTime);
        }
    }

    private createRecord(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const payload = {
            ...this.form.value,
            createdBy: currentUser,
            createdDate: currentDateTime,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.create(payload).subscribe({
            next: () => {
                this.resetForm();
                this.loadData({ first: this.first, rows: this.rows });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Absent Type created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create Absent Type'
                });
                this.isSubmitting = false;
            }
        });
    }

    private updateRecord(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const payload = {
            ...this.form.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime
        };

        this.masterBasicSetupService.update(payload).subscribe({
            next: () => {
                this.resetForm();
                this.loadData({ first: this.first, rows: this.rows });
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Absent Type updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update Absent Type'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.form.patchValue(row);
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
                        this.loadData({ first: this.first, rows: this.rows });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Absent Type deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete Absent Type'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.form.reset({
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
        this.loadData({ first: 0, rows: this.rows });
    }

    private getCurrentUser(): string {
        return this.shareService.getCurrentUser();
    }
}
