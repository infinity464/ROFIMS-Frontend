import { Component, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
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
  selector: 'app-officer-type',
  imports: [DynamicFormComponent,  Fluid, DataTable],
  providers: [],
  templateUrl: './officer-type.html',
  styleUrl: './officer-type.scss',
})
export class OfficerType {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;


    codeType = "OfficerType";
    title = 'Officer Type';

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
                name: 'orgId',
                label: 'Mother Organization',
                type: 'select',
                required: true,
                options: [] as { label: string; value: any }[]
            },
            {
                name: 'employeeTypeId',
                label: 'Employee Type',
                type: 'select',
                required: false,
                options: [] as { label: string; value: any }[]
            },
            {
                name: 'codeValueEN',
                label: 'Officer Type Name (English)',
                type: 'text',
                required: true
            },
            {
                name: 'codeValueBN',
                label: 'Officer Type Name (Bangla)',
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
            { field: 'employeeTypeNameDisplay', header: 'Employee Type' },
            { field: 'codeValueEN', header: 'Officer Type Name (EN)' },
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
        private fb: FormBuilder,
        private shareService: SharedService
    ) { }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initForm();
        this.setupFormFilterListeners();
        this.loadActiveMotherOrgs();
    }

    private setupFormFilterListeners() {
        this.commonCodeForm.get('orgId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonCodeForm.get('employeeTypeId')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
        this.commonCodeForm.get('status')?.valueChanges.subscribe(() => { this.first = 0; this.buildTableData(); });
    }

      initForm() {
        this.commonCodeForm = this.fb.group({
            orgId: [null, Validators.required],
            employeeTypeId: [null],
            codeValueEN: ['', Validators.required],
            codeValueBN: ['', Validators.required],
            status: [null],
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

    loadActiveMotherOrgs() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (motherOrgs) => {
                const motherOrgOptions = motherOrgs.map(d => ({
                    label: d.orgNameEN,
                    value: d.orgId
                }));
                const motherOrgField = this.formConfig.formFields.find(f => f.name === 'orgId');
                if (motherOrgField) {
                    motherOrgField.options = motherOrgOptions;
                }
                this.loadEmployeeType();
            },
            error: (err) => {
                console.error('Error loading Mother orgs:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load Mother orgs'
                });
            }
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
                    employeeTypeField.options = [{ label: 'All', value: null }, ...employeeTypeOptions];
                }
                this.getAllData();
            },
            error: (err) => {
                console.error('Error loading employeeTypes:', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load employeeTypes'
                });
            }
        });
    }

    getAllData() {
        this.loading = true;
        this.masterBasicSetupService.getAllByType('OfficerType').subscribe({
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
        const orgOpts = (this.formConfig.formFields.find(f => f.name === 'orgId')?.options as { label: string; value: any }[]) || [];
        const empTypeOpts = (this.formConfig.formFields.find(f => f.name === 'employeeTypeId')?.options as { label: string; value: any }[]) || [];
        const getOrgName = (id: number) => orgOpts.find((o: any) => o.value === id)?.label ?? '-';
        const getEmpTypeName = (id: number) => empTypeOpts.find((o: any) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r: any) => ({
            ...r,
            orgNameDisplay: getOrgName(r.orgId),
            employeeTypeNameDisplay: getEmpTypeName(r.parentCodeId)
        }));
        const orgId = this.commonCodeForm?.get('orgId')?.value;
        const parentId = this.commonCodeForm?.get('employeeTypeId')?.value;
        const status = this.commonCodeForm?.get('status')?.value;
        if (orgId != null) list = list.filter((r: any) => r.orgId === orgId);
        if (parentId != null) list = list.filter((r: any) => r.parentCodeId === parentId);
        if (status != null) list = list.filter((r: any) => r.status === status);
        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) list = list.filter((r: any) => r.codeValueEN?.toLowerCase().includes(q) || r.codeValueBN?.toLowerCase().includes(q));
        this.commonCodeData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit(data: any) {
        const orgId = this.commonCodeForm.get('orgId')?.value;
        const empTypeId = this.commonCodeForm.get('employeeTypeId')?.value;
        const status = this.commonCodeForm.get('status')?.value;
        if (orgId == null || orgId === '') {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Mother Organization' });
            return;
        }
        if (empTypeId == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Employee Type' });
            return;
        }
        if (status == null) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select Status (Active or Inactive)' });
            return;
        }
        if (this.commonCodeForm.invalid) {
            this.commonCodeForm.markAllAsTouched();
            return;
        }

        const currentUser = this.getCurrentUser();
        const currentDateTime = this.shareService.getCurrentDateTime()

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
                this.getAllData();
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
                    detail: err?.error?.message || 'Failed to create officer-type'
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
                this.getAllData();
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
                    detail: err?.error?.message || 'Failed to update officer-type'
                });
                this.isSubmitting = false;
            }
        });
    }

    update(row: any) {
        this.editingId = row.codeId;
        this.commonCodeForm.patchValue({
            orgId: row.orgId,
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
                            detail: 'OfficerType deleted successfully'
                        });
                    },
                    error: (err) => {
                        console.error('Error deleting:', err);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'Error',
                            detail: err?.error?.message || 'Failed to delete officer-type'
                        });
                    }
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.searchValue = '';
        this.isSubmitting = false;
        this.commonCodeForm.reset({
            orgId: null,
            employeeTypeId: null,
            codeId: 0,
            codeType: 'OfficerType',
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
        // TODO: Get from authentication service
        return this.shareService.getCurrentUser()
    }


}
