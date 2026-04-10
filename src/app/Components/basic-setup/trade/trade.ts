import { Component } from '@angular/core';
import { FormConfig } from '../shared/models/formConfig';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicFormComponent } from '../shared/componets/dynamic-form-component/dynamic-form';

import { Fluid } from 'primeng/fluid';
import { DataTable } from '../shared/componets/data-table/data-table';
import { TableConfig } from '../shared/models/dataTableConfig';
import { SharedService } from '@/shared/services/shared-service';

@Component({
    selector: 'app-trade',
    imports: [DynamicFormComponent, Fluid, DataTable],
    providers: [],
    templateUrl: './trade.html',
    styleUrl: './trade.scss'
})
export class Trade {
    codeType = 'Trade';
    title = 'Trade';

    allData: any[] = [];
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
    allCorpsMap: Map<number, string> = new Map();

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: false,
                options: [] as { label: string; value: any }[]
            },
            {
                name: 'corpsId',
                label: 'Corps',
                type: 'select',
                required: false,
                options: [] as { label: string; value: any }[],
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
            { field: 'orgNameDisplay', header: 'Mother Organization' },
            { field: 'corpsNameDisplay', header: 'Corps' },
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
        this.setupFormValueChanges();
        this.setupFormFilterListeners();
        this.loadActiveMotherOrgs();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('orgId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('corpsId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            orgId: [null],
            corpsId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            sortOrder: [null],
            status: [null],
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
                this.getAllData();
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

    loadAllCorpsForDisplay() {
        this.masterBasicSetupService.getAllByType('Corps').subscribe({
            next: (corps) => {
                this.allCorpsMap = new Map(corps.map((d: any) => [d.codeId, d.codeValueEN]));
                this.buildTableData();
            },
            error: (err) => {
                console.error('Error loading all corps for display:', err);
            }
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('Trade').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.loadAllCorpsForDisplay();
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
        const orgOpts = (this.formConfig.formFields.find(f => f.name === 'orgId')?.options as { label: string; value: any }[]) || [];
        const getOrgName = (id: number) => orgOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getCorpsName = (id: number) => this.allCorpsMap.get(id) ?? '-';
        let list = this.allData.map((r: any) => ({ ...r, orgNameDisplay: getOrgName(r.orgId), corpsNameDisplay: getCorpsName(r.parentCodeId) }));
        const orgId = this.commonForm?.get('orgId')?.value;
        const corpsId = this.commonForm?.get('corpsId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (orgId != null && orgId !== '') list = list.filter((r: any) => r.orgId === orgId);
        if (corpsId != null && corpsId !== '') list = list.filter((r: any) => r.parentCodeId === corpsId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const orgId = this.commonForm.get('orgId')?.value;
        const corpsId = this.commonForm.get('corpsId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (orgId == null || orgId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Mother Organization' });
            return;
        }
        if (corpsId == null || corpsId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Corps' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status (Active or Inactive)' });
            return;
        }
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
                this.getAllData();
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
                this.getAllData();
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
                        this.getAllData();
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

        this.searchValue = '';
        this.commonForm.reset({
            orgId: null,
            corpsId: null,
            codeId: 0,
            codeType: 'Trade',
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
        return this.shareService.getCurrentUser()
    }
}
