import { Component } from '@angular/core';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { Fluid } from 'primeng/fluid';
import { DataTable } from '../shared/componets/data-table/data-table';
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-trade',
    imports: [DynamicFormComponent, Toast, ConfirmDialog, Fluid, DataTable],
    providers: [MessageService, ConfirmationService],
    templateUrl: './trade.html',
    styleUrl: './trade.scss'
})
export class Trade {
    codeType = 'Trade';
    title = 'Trade';

    commonData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    corpsOptions: { label: string; value: any }[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: true,
                options: []
            },
            {
                name: 'corpsId',
                label: 'Corps',
                type: 'select',
                required: true,
                options: [],
                dependsOn: 'orgId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'Trade Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Trade Name (Bangla)',
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
            { field: 'codeValueEN', header: 'Trade Name (EN)' },
            { field: 'codeValueBN', header: 'Trade Name (BN)' },
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
        this.loadActiveMotherOrgs();
        this.setupFormValueChanges(); // ADD THIS LINE
        this.getCommonCodeWithPaging({
            first: this.first,
            rows: this.rows
        });
    }

    initForm() {
        this.commonForm = this.fb.group({
            orgId: ['', Validators.required],
            corpsId: ['', Validators.required],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            sortOrder: [null],
            status: [true, Validators.required],
            codeId: [0],
            codeType: ['Trade'],
            parentCodeId: [null],
            commCode: [null],
            displayCodeValueEN: [null],
            displayCodeValueBN: [null],
            level: [null],
            createdBy: [''],
            createdDate: [''],
            lastUpdatedBy: [''],
            lastupdate: ['']
        });
    }

    setupFormValueChanges() {
        this.commonForm.get('orgId')?.valueChanges.subscribe((orgId) => {
            console.log('OrgId changed:', orgId);
            if (orgId) {
                // Reset corpsId when orgId changes
                this.commonForm.patchValue({ corpsId: '' }, { emitEvent: false });

                // Clear existing corps options
                const corpsField = this.formConfig.formFields.find((f) => f.name === 'corpsId');
                if (corpsField) {
                    corpsField.options = [];
                }
                this.corpsOptions = [];

                // Load new corps for selected org
                this.loadCorps(orgId);
            } else {
                // If orgId is cleared, clear corps options
                this.corpsOptions = [];
                const corpsField = this.formConfig.formFields.find((f) => f.name === 'corpsId');
                if (corpsField) {
                    corpsField.options = [];
                }
                this.commonForm.patchValue({ corpsId: '' }, { emitEvent: false });
            }
        });
    }

    loadActiveMotherOrgs() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (motherOrgRanks) => {
                const motherOrgOptions = motherOrgRanks.map((d) => ({
                    label: d.orgNameEN,
                    value: d.orgId
                }));

                const motherOrgField = this.formConfig.formFields.find((f) => f.name === 'orgId');
                if (motherOrgField) {
                    motherOrgField.options = motherOrgOptions;
                }
            },
            error: (err) => {
                console.error('Error loading mother organizations:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load mother organizations'
                });
            }
        });
    }

    loadCorps(orgId?: number) {
        const apiCall = orgId
            ? this.masterBasicSetupService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps')
            : this.masterBasicSetupService.getAllByType('Corps');

        apiCall.subscribe({
            next: (corps) => {
                this.corpsOptions = corps.map((d) => ({
                    label: d.codeValueEN,
                    value: d.codeId
                }));

                const corpsField = this.formConfig.formFields.find((f) => f.name === 'corpsId');
                if (corpsField) {
                    corpsField.options = this.corpsOptions;
                }

                console.log('Corps loaded:', this.corpsOptions);
            },
            error: (err) => {
                console.error('Error loading corps:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to load corps'
                });
            }
        });
    }

    // Keep this for compatibility with form component
    onFieldChange(event: { fieldName: string; value: any }) {
        console.log('Field changed:', event);

        if (event.fieldName === 'corpsId' && event.value.parentField === 'orgId' && event.value.parentValue) {
            const orgId = event.value.parentValue;
            this.loadCorps(orgId);
        }
    }

    getCommonCodeWithPaging(event?: any) {
        this.loading = true;
        const pageNo = event ? event.first / event.rows + 1 : 1;
        const pageSize = event?.rows ?? this.rows;

        const apiCall = this.searchValue
            ? this.masterBasicSetupService.getByKeyordWithPaging('Trade', this.searchValue, pageNo, pageSize)
            : this.masterBasicSetupService.getAllWithPaging('Trade', pageNo, pageSize);

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
        const currentDateTime = this.shareService.getCurrentDateTime()

        this.commonForm.patchValue({
            parentCodeId: this.commonForm.value.corpsId
        });

        if (this.editingId) {
            this.updateTrade(currentUser, currentDateTime);
        } else {
            this.createTrade(currentUser, currentDateTime);
        }
    }

    private createTrade(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
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
                    detail: 'Trade created successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to create trade'
                });
                this.isSubmitting = false;
            }
        });
    }

    private updateTrade(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = {
            ...this.commonForm.value,
            codeId: this.editingId,
            lastUpdatedBy: currentUser,
            lastupdate: currentDateTime,
            createdBy: this.getCurrentUser(),
            createdDate: currentDateTime
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
                    detail: 'Trade updated successfully'
                });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to update trade'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;

        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                console.log('Ancestors:', ancestors);

                const corpsData = ancestors[0];
                const orgId = corpsData?.orgId;
                const corpsId = row.parentCodeId;

                if (orgId) {
                    this.masterBasicSetupService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').subscribe({
                        next: (corps) => {
                            this.corpsOptions = corps.map((d) => ({
                                label: d.codeValueEN,
                                value: d.codeId
                            }));

                            const corpsField = this.formConfig.formFields.find((f) => f.name === 'corpsId');
                            if (corpsField) {
                                corpsField.options = this.corpsOptions;
                            }

                            // Use emitEvent: false to prevent triggering valueChanges
                            this.commonForm.patchValue({
                                orgId: orgId,
                                corpsId: corpsId,
                                codeValueEN: row.codeValueEN,
                                codeValueBN: row.codeValueBN,
                                status: row.status,
                                sortOrder: row.sortOrder
                            }, { emitEvent: false });
                        },
                        error: (err) => {
                            console.error('Error loading corps:', err);
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
                        this.getCommonCodeWithPaging({
                            first: this.first,
                            rows: this.rows
                        });
                        this.messageService.add({
                            severity: 'success',
                            summary: 'Success',
                            detail: 'Trade deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: 'Failed to delete trade'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;

        const corpsField = this.formConfig.formFields.find((f) => f.name === 'corpsId');
        if (corpsField) {
            corpsField.options = [];
        }
        this.corpsOptions = [];

        this.commonForm.reset({
            orgId: '',
            corpsId: '',
            codeId: 0,
            codeType: 'Trade',
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
        return this.shareService.getCurrentUser()
    }
}
