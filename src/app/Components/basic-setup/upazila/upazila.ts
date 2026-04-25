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
    selector: 'app-upazila',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './upazila.html',
    styleUrl: './upazila.scss',
    providers: []
})
export class Upazila {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allData: any[] = [];
    upazilaData: any[] = [];
    editingId: number | null = null;
    upazilaForm!: FormGroup;
    title = 'Thana Setup';
    codeType = 'Thana';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';

    divisionOptions: { label: string; value: any }[] = [];
    districtOptions: { label: string; value: any }[] = [];
    allDistricts: any[] = [];
    ancestors: CommonCode[] = [];

    formConfig: FormConfig = {
        formFields: [
            {
                name: 'divisionId',
                label: 'Division',
                type: 'select',
                required: false,
                default: null,
                options: []
            },
            {
                name: 'districtId',
                label: 'District',
                type: 'select',
                required: false,
                default: null,
                options: [],
                dependsOn: 'divisionId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'Upazila Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Upazila Name (Bangla)',
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
            { field: 'divisionNameDisplay', header: 'Division' },
            { field: 'districtNameDisplay', header: 'District' },
            { field: 'codeValueEN', header: 'Upazila Name (EN)' },
            { field: 'codeValueBN', header: 'Upazila Name (BN)' },
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
        this.loadDivisions();
    }

    private setupFormFilterListeners() {
        this.upazilaForm.get('divisionId')?.valueChanges.subscribe((divisionId) => {
            this.upazilaForm.patchValue({ districtId: null }, { emitEvent: false });
            const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
            if (districtField) districtField.options = [];
            if (divisionId) this.loadDistricts(divisionId);
            this.first = 0;
            this.buildTableData();
        });
        this.upazilaForm.get('districtId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.upazilaForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.upazilaForm = this.fb.group({
            divisionId: [null],
            districtId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['Upazila'],
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

    loadDivisions() {
        this.masterBasicSetupService.getAllByType('Division').subscribe({
            next: (divisions) => {
                this.divisionOptions = divisions.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const divisionField = this.formConfig.formFields.find((f) => f.name === 'divisionId');
                if (divisionField) divisionField.options = this.divisionOptions;
                this.masterBasicSetupService.getAllByType('District').subscribe({
                    next: (districts) => {
                        this.allDistricts = Array.isArray(districts) ? districts : [];
                        this.getAllData();
                    }
                });
            },
            error: (err) => {
                console.error('Error loading divisions:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load divisions' });
            }
        });
    }

    loadDistricts(divisionId: number) {
        this.masterBasicSetupService.getByParentId(divisionId).subscribe({
            next: (districts) => {
                this.districtOptions = districts.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
                if (districtField) districtField.options = this.districtOptions;
            },
            error: (err) => {
                console.error('Error loading districts:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load districts' });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        if (event.fieldName === 'districtId' && event.value?.parentField === 'divisionId') {
            const divisionId = event.value.parentValue;
            if (divisionId) this.loadDistricts(divisionId);
        }
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('Upazila').subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
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
        const divisionOpts = this.divisionOptions;
        const getDivisionName = (id: number) => divisionOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getDistrictName = (id: number) => {
            const d = this.allDistricts.find((x: any) => x.codeId === id);
            return d?.codeValueEN ?? this.districtOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const districtToDivisionId = (districtId: number) => this.allDistricts.find((d: any) => d.codeId === districtId)?.parentCodeId;
        let list = this.allData.map((r: any) => ({
            ...r,
            districtNameDisplay: getDistrictName(r.parentCodeId),
            divisionNameDisplay: getDivisionName(districtToDivisionId(r.parentCodeId) ?? 0)
        }));
        const divisionId = this.upazilaForm?.get('divisionId')?.value;
        const districtId = this.upazilaForm?.get('districtId')?.value;
        const status = this.upazilaForm?.get('status')?.value;
        if (districtId != null && districtId !== '') list = list.filter((r: any) => r.parentCodeId === districtId);
        else if (divisionId != null && divisionId !== '') {
            const districtIds = this.allDistricts.filter((d: any) => d.parentCodeId === divisionId).map((d: any) => d.codeId);
            list = list.filter((r: any) => districtIds.includes(r.parentCodeId));
        }
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.upazilaData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const divisionId = this.upazilaForm.get('divisionId')?.value;
        const districtId = this.upazilaForm.get('districtId')?.value;
        const status = this.upazilaForm.get('status')?.value;
        if (divisionId == null || divisionId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Division' });
            return;
        }
        if (districtId == null || districtId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select District' });
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
        this.upazilaForm.patchValue({ parentCodeId: this.upazilaForm.value.districtId });

        if (this.editingId) {
            this.updateUpazila(currentUser, currentDateTime);
        } else {
            this.createUpazila(currentUser, currentDateTime);
        }
    }

    private createUpazila(currentUser: string, currentDateTime: string) {
        const createPayload = { ...this.upazilaForm.value, createdBy: currentUser, createdDate: currentDateTime, lastUpdatedBy: currentUser, lastupdate: currentDateTime };
        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Upazila created successfully' });
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create upazila' });
            }
        });
    }

    private updateUpazila(currentUser: string, currentDateTime: string) {
        const updatePayload = { ...this.upazilaForm.value, codeId: this.editingId, lastUpdatedBy: currentUser, lastupdate: currentDateTime, createdDate: currentDateTime, createdBy: currentUser };
        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Upazila updated successfully' });
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update upazila' });
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                const divisionId = this.ancestors[0]?.codeId;
                if (divisionId) {
                    this.loadDistricts(divisionId);
                    setTimeout(() => {
                        this.upazilaForm.patchValue({
                            divisionId: divisionId,
                            districtId: row.parentCodeId,
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Upazila deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete upazila' });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.searchValue = '';
        const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
        if (districtField) districtField.options = [];
        this.upazilaForm.reset({
            divisionId: null,
            districtId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'Upazila',
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
