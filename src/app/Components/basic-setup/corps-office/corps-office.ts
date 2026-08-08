import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { Fluid } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';

import { DataTable } from '../shared/componets/data-table/data-table';
import { TableConfig } from '../shared/models/dataTableConfig';
import { CommonCode } from '../shared/models/common-code';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { UserMenuService } from '@/services/user-menu.service';
import { CorpsOfficeService } from '@/services/corps-office.service';
import { CorpsOfficeModel } from '@/models/corps-office.model';

@Component({
    selector: 'app-corps-office',
    imports: [CommonModule, ReactiveFormsModule, Fluid, SelectModule, MultiSelectModule, InputNumberModule, InputTextModule, ButtonModule, DataTable],
    templateUrl: './corps-office.html',
    styleUrl: './corps-office.scss'
})
export class CorpsOffice implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'Corps Office';

    form!: FormGroup;
    editingId: number | null = null;
    isSubmitting = false;
    loading = false;

    // List
    allData: CorpsOfficeModel[] = [];
    tableData: any[] = [];
    totalRecords = 0;
    rows = 10;
    first = 0;
    searchValue = '';

    // Dropdown sources
    private allCorps: CommonCode[] = [];
    orgOptions: { label: string; value: number }[] = [];
    corpsOptions: { label: string; value: number }[] = [];
    statusOptions = [
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'orgNameDisplay', header: 'Mother Organization' },
            { field: 'officeNameEN', header: 'Office Name (EN)' },
            { field: 'officeNameBN', header: 'Office Name (BN)' },
            { field: 'corpsDisplay', header: 'Corps' },
            { field: 'authorization', header: 'Authorization' },
            { field: 'status', header: 'Status', type: 'boolean', trueLabel: 'Active', falseLabel: 'Inactive' },
            { field: 'corpsOfficeId', header: 'ID', hidden: true }
        ]
    };

    constructor(
        private corpsOfficeService: CorpsOfficeService,
        private masterBasicSetupService: MasterBasicSetupService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private fb: FormBuilder,
        private shareService: SharedService
    ) {}

    ngOnInit(): void {
        const perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = perms.canInsert;
        this.canUpdate = perms.canUpdate;
        this.canDelete = perms.canDelete;

        this.initForm();
        this.loadDropdowns();
    }

    private initForm() {
        this.form = this.fb.group({
            corpsOfficeId: [0],
            orgId: [null, Validators.required],
            corpsCodeIds: [[] as number[], Validators.required],
            authorization: [null, [Validators.required, Validators.min(1)]],
            officeNameEN: ['', Validators.required],
            officeNameBN: ['', Validators.required],
            status: [true, Validators.required]
        });

        // Cascade: choosing a Mother Organization narrows the Corps list to that org.
        this.form.get('orgId')?.valueChanges.subscribe((orgId: number | null) => {
            this.refreshCorpsOptions(orgId);
            const valid = new Set(this.corpsOptions.map((o) => o.value));
            const current: number[] = this.form.get('corpsCodeIds')?.value || [];
            const filtered = current.filter((id) => valid.has(id));
            if (filtered.length !== current.length) {
                this.form.get('corpsCodeIds')?.setValue(filtered);
            }
        });
    }

    private loadDropdowns() {
        this.masterBasicSetupService.getAllActiveMotherOrgs().subscribe({
            next: (orgs) => {
                this.orgOptions = (orgs || []).map((o) => ({ label: o.orgNameEN, value: o.orgId }));
            },
            error: () => this.toast('error', 'Error', 'Failed to load Mother Organizations')
        });

        this.masterBasicSetupService.getAllByType('Corps').subscribe({
            next: (list) => {
                this.allCorps = Array.isArray(list) ? list : [];
                this.refreshCorpsOptions(this.form.get('orgId')?.value);
                this.getAllData();
            },
            error: () => {
                this.toast('error', 'Error', 'Failed to load Corps');
                this.loading = false;
            }
        });
    }

    private refreshCorpsOptions(orgId: number | null) {
        let list = this.allCorps.filter((c) => c.status);
        if (orgId != null) list = list.filter((c) => c.orgId === orgId);
        this.corpsOptions = list.map((c) => ({ label: c.codeValueEN, value: c.codeId }));
    }

    getAllData() {
        this.loading = true;
        this.corpsOfficeService.getAll().subscribe({
            next: (res) => {
                this.allData = Array.isArray(res) ? res : [];
                this.buildTableData();
                this.loading = false;
            },
            error: () => {
                this.toast('error', 'Error', 'Failed to load Corps Offices');
                this.loading = false;
            }
        });
    }

    private corpsNameById(id: number): string {
        return this.allCorps.find((c) => c.codeId === id)?.codeValueEN ?? String(id);
    }

    private buildTableData() {
        const orgName = (id: number) => this.orgOptions.find((o) => o.value === id)?.label ?? '-';
        let list = this.allData.map((r) => ({
            ...r,
            orgNameDisplay: orgName(r.orgId as number),
            corpsDisplay: (r.assignedCorps || []).map((a) => this.corpsNameById(a.corpsCodeId)).join(', ')
        }));

        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter(
                (r) =>
                    r.officeNameEN?.toLowerCase().includes(q) ||
                    r.officeNameBN?.toLowerCase().includes(q) ||
                    r.orgNameDisplay?.toLowerCase().includes(q)
            );
        }

        this.tableData = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    submit() {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            const corpsIds: number[] = this.form.get('corpsCodeIds')?.value || [];
            if (!this.form.get('orgId')?.value) this.toast('warn', 'Validation', 'Please select Mother Organization');
            else if (!corpsIds.length) this.toast('warn', 'Validation', 'Please select at least one Corps');
            else if (this.form.get('authorization')?.invalid) this.toast('warn', 'Validation', 'Please enter a valid Authorization number');
            else this.toast('warn', 'Validation', 'Please fill all required fields');
            return;
        }

        const user = this.shareService.getCurrentUser();
        const now = this.shareService.getCurrentDateTime();
        const v = this.form.value;
        const corpsIds: number[] = v.corpsCodeIds || [];

        const payload: CorpsOfficeModel = {
            corpsOfficeId: this.editingId ?? 0,
            orgId: v.orgId,
            authorization: v.authorization,
            officeNameEN: v.officeNameEN,
            officeNameBN: v.officeNameBN,
            status: v.status,
            assignedCorps: corpsIds.map((id) => ({ corpsCodeId: id })),
            createdBy: user,
            createdDate: now,
            lastUpdatedBy: user,
            lastupdate: now
        };

        this.isSubmitting = true;
        const req = this.editingId ? this.corpsOfficeService.update(payload) : this.corpsOfficeService.create(payload);
        req.subscribe({
            next: (res: any) => {
                const code = res?.statusCode;
                if (code && code !== 200) {
                    this.toast('error', 'Error', res?.description || 'Operation failed');
                    this.isSubmitting = false;
                    return;
                }
                this.toast('success', 'Success', this.editingId ? 'Corps Office updated successfully' : 'Corps Office created successfully');
                this.resetForm();
                this.getAllData();
                this.isSubmitting = false;
            },
            error: (err) => {
                this.toast('error', 'Error', err?.error?.description || err?.error?.message || 'Operation failed');
                this.isSubmitting = false;
            }
        });
    }

    edit(row: CorpsOfficeModel) {
        this.editingId = row.corpsOfficeId;
        this.refreshCorpsOptions(row.orgId);
        this.form.patchValue(
            {
                corpsOfficeId: row.corpsOfficeId,
                orgId: row.orgId,
                corpsCodeIds: (row.assignedCorps || []).map((a) => a.corpsCodeId),
                authorization: row.authorization,
                officeNameEN: row.officeNameEN,
                officeNameBN: row.officeNameBN,
                status: row.status
            },
            { emitEvent: false }
        );
    }

    delete(row: CorpsOfficeModel, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this Corps Office?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.corpsOfficeService.delete(row.corpsOfficeId).subscribe({
                    next: () => {
                        this.toast('success', 'Success', 'Corps Office deleted successfully');
                        this.getAllData();
                    },
                    error: (err) => this.toast('error', 'Error', err?.error?.description || 'Failed to delete Corps Office')
                });
            }
        });
    }

    resetForm() {
        this.editingId = null;
        this.isSubmitting = false;
        this.form.reset({
            corpsOfficeId: 0,
            orgId: null,
            corpsCodeIds: [],
            authorization: null,
            officeNameEN: '',
            officeNameBN: '',
            status: true
        });
        this.refreshCorpsOptions(null);
    }

    onSearch(keyword: string) {
        this.searchValue = keyword ?? '';
        this.first = 0;
        this.buildTableData();
    }

    private toast(severity: string, summary: string, detail: string) {
        this.messageService.add({ severity, summary, detail });
    }
}
