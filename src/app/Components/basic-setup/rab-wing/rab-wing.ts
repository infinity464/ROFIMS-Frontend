import { Component } from '@angular/core';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from "../shared/componets/dynamic-form-component/dynamic-form";

import { Fluid } from 'primeng/fluid';
import { DataTable } from "../shared/componets/data-table/data-table";
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
  selector: 'app-rab-wing',
  imports: [DynamicFormComponent,  Fluid, DataTable],
  providers: [],
  templateUrl: './rab-wing.html',
  styleUrl: './rab-wing.scss',
})
export class RabWing {

    codeType = "RabWing";
    title = 'Rab Wing';

    allData: any[] = [];
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
                name: 'rabUnitId',
                label: 'RAB Unit',
                type: 'select',
                required: false,
                options: [] as { label: string; value: any }[]
            },
            {
                name: 'codeValueEN',
                label: 'RabWing Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'RabWing Name (Bangla)',
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
            { field: 'rabUnitNameDisplay', header: 'RAB Unit' },
            { field: 'codeValueEN', header: 'RAB Wing Name (EN)' },
            { field: 'codeValueBN', header: 'RAB Wing Name (BN)' },
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
        this.setupFormFilterListeners();
        this.loadRabUnit();
    }

    private setupFormFilterListeners() {
        this.commonCodeForm.get('rabUnitId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonCodeForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

      initForm() {
        this.commonCodeForm = this.fb.group({
            rabUnitId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['RabWing'],
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

    loadRabUnit() {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (rabUnits) => {
                const rabUnitOptions = rabUnits.map(d => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                const rabUnitField = this.formConfig.formFields.find(f => f.name === 'rabUnitId');
                if (rabUnitField) {
                    rabUnitField.options = rabUnitOptions;
                }
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading RAB Unit:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load RAB Unit'
                });
            }
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('RabWing').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
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

    private buildTableData() {
        const rabUnitOpts = (this.formConfig.formFields.find(f => f.name === 'rabUnitId')?.options as { label: string; value: any }[]) || [];
        const getRabUnitName = (id: number) => rabUnitOpts.find((o: any) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r: any) => ({ ...r, rabUnitNameDisplay: getRabUnitName(r.parentCodeId) }));
        const rabUnitId = this.commonCodeForm?.get('rabUnitId')?.value;
        const status = this.commonCodeForm?.get('status')?.value;
        if (rabUnitId != null && rabUnitId !== '') list = list.filter((r: any) => r.parentCodeId === rabUnitId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonCodeData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const rabUnitId = this.commonCodeForm.get('rabUnitId')?.value;
        const status = this.commonCodeForm.get('status')?.value;
        if (rabUnitId == null || rabUnitId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select RAB Unit' });
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

        this.commonCodeForm.patchValue({
            parentCodeId: this.commonCodeForm.value.rabUnitId
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
                this.resetForm();
                this.getAllData();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'RAB Wing created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create rab-wing'
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
                this.resetForm();
                this.getAllData();
                this.messageService.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'RAB Wing updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update rab-wing'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue({
            rabUnitId: row.parentCodeId,
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
                        this.getAllData();
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'RabWing deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete rab-wing'
                        });
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
            rabUnitId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'RabWing',
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
