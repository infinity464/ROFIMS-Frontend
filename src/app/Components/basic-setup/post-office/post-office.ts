import { Component } from '@angular/core';
import { forkJoin } from 'rxjs';
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
    selector: 'app-post-office',
    imports: [DynamicFormComponent, DataTable, Fluid],
    templateUrl: './post-office.html',
    styleUrl: './post-office.scss',
    providers: []
})
export class PostOffice {
    allData: any[] = [];
    postOfficeData: any[] = [];
    editingId: number | null = null;
    commonForm!: FormGroup;
    title = 'Post Office';
    codeType = 'PostOffice';

    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;
    searchValue: string = '';
    isSubmitting = false;

    divisionOptions: { label: string; value: any }[] = [];
    districtOptions: { label: string; value: any }[] = [];
    upazilaOptions: { label: string; value: any }[] = [];
    allDistricts: any[] = [];
    allUpazilas: any[] = [];
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
                name: 'upazilaId',
                label: 'Upazila',
                type: 'select',
                required: false,
                default: null,
                options: [],
                dependsOn: 'districtId',
                cascadeLoad: true
            },
            {
                name: 'codeValueEN',
                label: 'PostOffice Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'PostOffice Name (Bangla)',
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
            { field: 'upazilaNameDisplay', header: 'Upazila' },
            { field: 'codeValueEN', header: 'PostOffice Name (EN)' },
            { field: 'codeValueBN', header: 'PostOffice Name (BN)' },
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
        this.setupFormFilterListeners();
        this.loadDivisions();
    }

    private setupFormFilterListeners() {
        this.commonForm.get('divisionId')?.valueChanges.subscribe((divisionId) => {
            this.commonForm.patchValue({ districtId: null, upazilaId: null }, { emitEvent: false });
            const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
            const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
            if (districtField) districtField.options = [];
            if (upazilaField) upazilaField.options = [];
            if (divisionId) this.loadDistricts(divisionId);
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('districtId')?.valueChanges.subscribe((districtId) => {
            this.commonForm.patchValue({ upazilaId: null }, { emitEvent: false });
            const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
            if (upazilaField) upazilaField.options = [];
            if (districtId) this.loadUpazilas(districtId);
            this.first = 0;
            this.buildTableData();
        });
        this.commonForm.get('upazilaId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

    initForm() {
        this.commonForm = this.fb.group({
            divisionId: [null],
            districtId: [null],
            upazilaId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
            orgId: [0],
            codeId: [0],
            codeType: ['PostOffice'],
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
                forkJoin({
                    districts: this.masterBasicSetupService.getAllByType('District'),
                    upazilas: this.masterBasicSetupService.getAllByType('Upazila')
                }).subscribe(({ districts, upazilas }) => {
                    this.allDistricts = Array.isArray(districts) ? districts : [];
                    this.allUpazilas = Array.isArray(upazilas) ? upazilas : [];
                    this.getAllData();
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

    loadUpazilas(districtId: number) {
        this.masterBasicSetupService.getByParentId(districtId).subscribe({
            next: (upazilas) => {
                this.upazilaOptions = upazilas.map((u) => ({ label: u.codeValueEN, value: u.codeId }));
                const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
                if (upazilaField) upazilaField.options = this.upazilaOptions;
            },
            error: (err) => {
                console.error('Error loading upazilas:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load upazilas' });
            }
        });
    }

    onFieldChange(event: { fieldName: string; value: any }) {
        if (event.fieldName === 'districtId' && event.value?.parentField === 'divisionId' && event.value?.parentValue) {
            this.loadDistricts(event.value.parentValue);
        }
        if (event.fieldName === 'upazilaId' && event.value?.parentField === 'districtId' && event.value?.parentValue) {
            this.loadUpazilas(event.value.parentValue);
        }
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('PostOffice').subscribe({
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
        const getUpazilaName = (id: number) => {
            const u = this.allUpazilas.find((x: any) => x.codeId === id);
            return u?.codeValueEN ?? this.upazilaOptions.find((o: any) => o.value === id)?.label ?? '-';
        };
        const upazilaToDistrictId = (upazilaId: number) => this.allUpazilas.find((u: any) => u.codeId === upazilaId)?.parentCodeId;
        const districtToDivisionId = (districtId: number) => this.allDistricts.find((d: any) => d.codeId === districtId)?.parentCodeId;
        let list = this.allData.map((r: any) => {
            const upazilaId = r.parentCodeId;
            const districtId = upazilaToDistrictId(upazilaId);
            const divisionId = districtToDivisionId(districtId ?? 0);
            return {
                ...r,
                upazilaNameDisplay: getUpazilaName(upazilaId),
                districtNameDisplay: getDistrictName(districtId ?? 0),
                divisionNameDisplay: getDivisionName(divisionId ?? 0)
            };
        });
        const divisionId = this.commonForm?.get('divisionId')?.value;
        const districtId = this.commonForm?.get('districtId')?.value;
        const upazilaId = this.commonForm?.get('upazilaId')?.value;
        const status = this.commonForm?.get('status')?.value;
        if (upazilaId != null && upazilaId !== '') list = list.filter((r: any) => r.parentCodeId === upazilaId);
        else if (districtId != null && districtId !== '') {
            const upazilaIds = this.allUpazilas.filter((u: any) => u.parentCodeId === districtId).map((u: any) => u.codeId);
            list = list.filter((r: any) => upazilaIds.includes(r.parentCodeId));
        } else if (divisionId != null && divisionId !== '') {
            const districtIds = this.allDistricts.filter((d: any) => d.parentCodeId === divisionId).map((d: any) => d.codeId);
            const upazilaIds = this.allUpazilas.filter((u: any) => districtIds.includes(u.parentCodeId)).map((u: any) => u.codeId);
            list = list.filter((r: any) => upazilaIds.includes(r.parentCodeId));
        }
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.postOfficeData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const divisionId = this.commonForm.get('divisionId')?.value;
        const districtId = this.commonForm.get('districtId')?.value;
        const upazilaId = this.commonForm.get('upazilaId')?.value;
        const status = this.commonForm.get('status')?.value;
        if (divisionId == null || divisionId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Division' });
            return;
        }
        if (districtId == null || districtId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select District' });
            return;
        }
        if (upazilaId == null || upazilaId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Upazila' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status' });
            return;
        }
        if (this.commonForm.invalid) {
            this.commonForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime();
        this.commonForm.patchValue({ parentCodeId: this.commonForm.value.upazilaId });

        if (this.editingId) {
            this.updatePostOffice(currentUser, currentDateTime);
        } else {
            this.createPostOffice(currentUser, currentDateTime);
        }
    }

    private createPostOffice(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const createPayload = { ...this.commonForm.value, createdBy: currentUser, createdDate: currentDateTime, lastUpdatedBy: currentUser, lastupdate: currentDateTime };
        this.masterBasicSetupService.create(createPayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'PostOffice created successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error creating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to create post-office' });
                this.isSubmitting = false;
            }
        });
    }

    private updatePostOffice(currentUser: string, currentDateTime: string) {
        this.isSubmitting = true;
        const updatePayload = { ...this.commonForm.value, codeId: this.editingId, lastUpdatedBy: currentUser, lastupdate: currentDateTime, createdDate: currentDateTime, createdBy: currentUser };
        this.masterBasicSetupService.update(updatePayload).subscribe({
            next: () => {
                this.resetForm();
                this.getAllData();
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'PostOffice updated successfully' });
                this.isSubmitting = false;
            },
            error: (err) => {
                console.error('Error updating:', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update post-office' });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.masterBasicSetupService.getAncestorsOfCommonCode(row.codeId).subscribe({
            next: (ancestors) => {
                this.ancestors = ancestors;
                const divisionId = this.ancestors[0]?.codeId;
                const districtId = this.ancestors[1]?.codeId;
                const upazilaId = row.parentCodeId;
                if (divisionId && districtId) {
                    this.loadDistricts(divisionId);
                    setTimeout(() => {
                        this.loadUpazilas(districtId);
                        setTimeout(() => {
                            this.commonForm.patchValue({
                                divisionId, districtId, upazilaId,
                                codeValueEN: row.codeValueEN,
                                codeValueBN: row.codeValueBN,
                                status: row.status
                            });
                        }, 100);
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'PostOffice deleted successfully' });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete post-office' });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.searchValue = '';
        const districtField = this.formConfig.formFields.find((f) => f.name === 'districtId');
        const upazilaField = this.formConfig.formFields.find((f) => f.name === 'upazilaId');
        if (districtField) districtField.options = [];
        if (upazilaField) upazilaField.options = [];
        this.commonForm.reset({
            divisionId: null,
            districtId: null,
            upazilaId: null,
            orgId: 0,
            codeId: 0,
            codeType: 'PostOffice',
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
