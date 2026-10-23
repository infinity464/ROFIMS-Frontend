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
    selector: 'app-rab-branch',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './rab-branch.html',
    styleUrl: './rab-branch.scss',
    providers: []
})
export class RabBranch {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allData: any[] = [];
    rabBranchData: any[] = [];
    editingId: number | null = null;
    upazilaForm!: FormGroup;
    title = 'Rab Branch';
    codeType = 'Rab Branch';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    rabUnitOptions: { label: string; value: any }[] = [];
    rabWingOptions: { label: string; value: any }[] = [];
    allRabWings: any[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'rabUnitId',
                label: 'RabUnit',
                type: 'select',
                required: false,
                default: null,
                options: []
            },
            {
                name: 'rabWingId',
                label: 'RabWing',
                type: 'select',
                required: false,
                default: null,
                options: [],
                dependsOn: 'rabUnitId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'Rab Branch Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Rab Branch Name (Bangla)',
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
            { field: 'rabWingNameDisplay', header: 'RAB Wing' },
            { field: 'codeValueEN', header: 'Rab Branch (EN)' },
            { field: 'codeValueBN', header: 'Rab Branch (BN)' },
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
        this.loadRabUnits();
    }

    private setupFormFilterListeners() {
        this.upazilaForm.get('rabUnitId')?.valueChanges.subscribe((rabUnitId) => {
            this.upazilaForm.patchValue({ rabWingId: null }, { emitEvent: false });
            const rabWingField = this.formConfig.formFields.find((f) => f.name === 'rabWingId');
            if (rabWingField) rabWingField.options = [];
            if (rabUnitId) this.loadRabWings(rabUnitId);
            this.first = 0;
            this.buildTableData();
        });
        this.upazilaForm.get('rabWingId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.upazilaForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.upazilaForm = this.fb.group({
            rabUnitId: [null],
            rabWingId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['RabBranch'],
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

    loadRabUnits() {
        this.masterBasicSetupService.getAllByType('RabUnit').subscribe({
            next: (rabUnits) => {
                this.rabUnitOptions = rabUnits.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const rabUnitField = this.formConfig.formFields.find((f) => f.name === 'rabUnitId');
                if (rabUnitField) rabUnitField.options = this.rabUnitOptions;
                this.masterBasicSetupService.getAllByType('RabWing').subscribe({
                    next: (wings) => {
                        this.allRabWings = Array.isArray(wings) ? wings : [];
                        this.getAllData();
                    }
                });
            },
            error: (err) => {
                console.error('Error loading rabUnits:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load rabUnits' });
            }
        });
    }

    loadRabWings(rabUnitId: number) {
        this.masterBasicSetupService.getByParentId(rabUnitId).subscribe({
            next: (rabWings) => {
                this.rabWingOptions = rabWings.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const rabWingField = this.formConfig.formFields.find((f) => f.name === 'rabWingId');
                if (rabWingField) rabWingField.options = this.rabWingOptions;
            },
            error: (err) => {
                console.error('Error loading rabWings:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load rabWings' });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        if (event.fieldName === 'rabWingId' && event.value?.parentField === 'rabUnitId') {
            const rabUnitId = event.value.parentValue;
            if (rabUnitId) this.loadRabWings(rabUnitId);
        }
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('RabBranch').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
                this.loading = false;
            },
            error: (err) => {
                console.error('Error fetching data:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load data' });
                this.loading = false;
            }
        });
    }

    private buildTableData() {
        const rabUnitOpts = this.rabUnitOptions;
        const getRabUnitName = (id: number) => rabUnitOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getRabWingName = (id: number) => {
            const w = this.allRabWings.find((x: any) => x.codeId === id);
            return w?.codeValueEN ?? this.rabWingOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const wingToUnitId = (wingId: number) => this.allRabWings.find((w: any) => w.codeId === wingId)?.parentCodeId;
        let list = this.allData.map((r: any) => ({
            ...r,
            rabWingNameDisplay: getRabWingName(r.parentCodeId),
            rabUnitNameDisplay: getRabUnitName(wingToUnitId(r.parentCodeId) ?? 0)
        }));
        const rabUnitId = this.upazilaForm?.get('rabUnitId')?.value;
        const rabWingId = this.upazilaForm?.get('rabWingId')?.value;
        const status = this.upazilaForm?.get('status')?.value;
        if (rabWingId != null && rabWingId !== '') list = list.filter((r: any) => r.parentCodeId === rabWingId);
        else if (rabUnitId != null && rabUnitId !== '' && this.rabWingOptions.length) {
            const wingIds = this.rabWingOptions.map((o: any) => o.value);
            list = list.filter((r: any) => wingIds.includes(r.parentCodeId));
        } else if (rabUnitId != null && rabUnitId !== '') {
            const wingIds = this.allRabWings.filter((w: any) => w.parentCodeId === rabUnitId).map((w: any) => w.codeId);
            list = list.filter((r: any) => wingIds.includes(r.parentCodeId));
        }
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.rabBranchData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const rabUnitId = this.upazilaForm.get('rabUnitId')?.value;
        const rabWingId = this.upazilaForm.get('rabWingId')?.value;
        const status = this.upazilaForm.get('status')?.value;
        if (rabUnitId == null || rabUnitId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select RAB Unit' });
            return;
        }
        if (rabWingId == null || rabWingId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select RAB Wing' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status' });
            return;
        }
        if (this.upazilaForm.invalid) {
            this.upazilaForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime();
        this.upazilaForm.patchValue({ parentCodeId: this.upazilaForm.value.rabWingId });

        if (this.editingId) {
            this.updateUpazila(currentUser, currentDateTime);
        } else {
            this.createUpazila(currentUser, currentDateTime);
        }
    }

    private createUpazila(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = { ...this.upazilaForm.value, createdBy: currentUser, createdDate: currentDateTime, lastUpdatedBy: currentUser, lastupdate: currentDateTime };
        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'RabBranch created successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to create rab-branch' });
                this.isSubmitting = false;
            }
        });
    }

    private updateUpazila(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = { ...this.upazilaForm.value, codeId: this.editingId, lastUpdatedBy: currentUser, lastupdate: currentDateTime, createdDate: currentDateTime, createdBy: currentUser };
        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'RabBranch updated successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update rab-branch' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                const rabUnitId = this.ancestors[0]?.codeId;
                if (rabUnitId) {
                    this.loadRabWings(rabUnitId);
                    setTimeout(() => {
                        this.upazilaForm.patchValue({
                            rabUnitId: rabUnitId,
                            rabWingId: row.parentCodeId,
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'RabBranch deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to delete rab-branch' });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.searchValue = '';
        const rabWingField = this.formConfig.formFields.find((f) => f.name === 'rabWingId');
        if (rabWingField) rabWingField.options = [];
        this.upazilaForm.reset({
            rabUnitId: null,
            rabWingId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'RabBranch',
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
