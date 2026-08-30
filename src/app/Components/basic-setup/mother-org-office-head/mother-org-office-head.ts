import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Fluid } from 'primeng/fluid';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { Button, ButtonModule } from 'primeng/button';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { SharedService } from '@/shared/services/shared-service';
import { OrganizationService } from '../organization-setup/services/organization-service';
import { OrganizationModel } from '../organization-setup/models/organization';
import { MotherOrgOfficeHeadService } from './mother-org-office-head-service';
import { MotherOrgOfficeHead } from './mother-org-office-head.model';

interface OfficeHeadRow extends MotherOrgOfficeHead {
    motherOrgDisplay?: string;
    unitsDisplay?: string;
}

@Component({
    selector: 'app-mother-org-office-head',
    imports: [
        Fluid,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        SelectModule,
        MultiSelectModule,
        Button,
        TableModule,
        IconField,
        InputIcon,
        ButtonModule,
        CommonModule,
        Toast,
        ConfirmDialog
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './mother-org-office-head.html',
    styleUrl: './mother-org-office-head.scss'
})
export class MotherOrgOfficeHeadComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    officeHeadForm!: FormGroup;
    isSubmitting = false;
    editingId: number | null = null;
    currentUser = '';

    motherOrgs: OrganizationModel[] = [];
    motherOrgOptions: { label: string; value: number }[] = [];

    /** Units for the currently selected mother org (drives the multi-select). */
    unitOptions: { label: string; value: number }[] = [];
    /** All units across every mother org, for resolving names in the table. */
    private unitNameById = new Map<number, string>();
    private unitNameBnById = new Map<number, string>();

    officeHeads: OfficeHeadRow[] = [];
    filteredOfficeHeads: OfficeHeadRow[] = [];

    // Pagination
    first = 0;
    rows = 10;
    totalRecords = 0;

    searchValue = '';

    statusOptions = [
        { label: 'Active', value: true },
        { label: 'Inactive', value: false }
    ];

    constructor(
        private fb: FormBuilder,
        private officeHeadService: MotherOrgOfficeHeadService,
        private organizationService: OrganizationService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private sharedService: SharedService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.currentUser = this.sharedService.getCurrentUser();
        this.initForm();
        this.setupMotherOrgChange();
        this.loadMotherOrgs();
        this.loadAllUnits();
        this.loadOfficeHeads();
    }

    initForm() {
        this.officeHeadForm = this.fb.group({
            orgHeadId: [0],
            motherOrgId: [null, Validators.required],
            unitOrgIds: [[], Validators.required],
            headNameEN: ['', Validators.required],
            headNameBN: ['', Validators.required],
            status: [true]
        });
    }

    setupMotherOrgChange() {
        this.officeHeadForm.get('motherOrgId')?.valueChanges.subscribe((orgId: number | null) => {
            // Clear the unit selection whenever the mother org changes (edit prefill re-sets it explicitly).
            this.officeHeadForm.patchValue({ unitOrgIds: [] }, { emitEvent: false });
            this.unitOptions = [];
            if (orgId != null) {
                this.loadUnits(orgId);
            }
        });
    }

    loadMotherOrgs() {
        this.organizationService.getAllActiveMotherOrgs().subscribe({
            next: (res: OrganizationModel[]) => {
                this.motherOrgs = res ?? [];
                this.motherOrgOptions = this.motherOrgs.map(o => ({ label: o.orgNameEN, value: o.orgId }));
                this.buildTableData();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load Mother Organizations' });
            }
        });
    }

    /** Load every unit once so the table can show unit names regardless of selected mother org. */
    loadAllUnits() {
        this.organizationService.GetAllOrgUnit().subscribe({
            next: (res: OrganizationModel[]) => {
                (res ?? []).forEach(u => {
                    this.unitNameById.set(u.orgId, u.orgNameEN);
                    if (u.orgNameBN) this.unitNameBnById.set(u.orgId, u.orgNameBN);
                });
                this.buildTableData();
            },
            error: () => { /* names fall back to the raw id if this fails */ }
        });
    }

    loadUnits(orgId: number) {
        this.organizationService.getAllActiveOrgUnitByOrgId(orgId).subscribe({
            next: (res: OrganizationModel[]) => {
                this.unitOptions = (res ?? []).map(u => ({ label: u.orgNameEN, value: u.orgId }));
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load units' });
            }
        });
    }

    loadOfficeHeads() {
        this.officeHeadService.getAll().subscribe({
            next: (res: MotherOrgOfficeHead[]) => {
                this.officeHeads = (res ?? []).map(h => this.toRow(h));
                this.buildTableData();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load office heads' });
            }
        });
    }

    private toRow(h: MotherOrgOfficeHead): OfficeHeadRow {
        const motherOrgDisplay = this.motherOrgs.find(o => o.orgId === h.motherOrgId)?.orgNameEN ?? String(h.motherOrgId ?? '');
        const unitsDisplay = (h.units ?? [])
            .map(u => {
                const en = this.unitNameById.get(u.unitOrgId) ?? String(u.unitOrgId);
                const bn = this.unitNameBnById.get(u.unitOrgId);
                return bn ? `${en} (${bn})` : en;
            })
            .join(', ');
        return { ...h, motherOrgDisplay, unitsDisplay };
    }

    onSearch() {
        this.first = 0;
        this.buildTableData();
    }

    private buildTableData() {
        // Re-resolve display fields (mother orgs / units may have loaded after the list).
        let list = this.officeHeads.map(h => this.toRow(h));

        const q = (this.searchValue ?? '').toLowerCase().trim();
        if (q) {
            list = list.filter(h =>
                h.headNameEN?.toLowerCase().includes(q) ||
                (h.headNameBN ?? '').toLowerCase().includes(q) ||
                (h.motherOrgDisplay ?? '').toLowerCase().includes(q) ||
                (h.unitsDisplay ?? '').toLowerCase().includes(q)
            );
        }

        this.filteredOfficeHeads = list;
        this.totalRecords = list.length;
        this.first = 0;
    }

    onSubmit() {
        if (this.isSubmitting) return;

        if (this.officeHeadForm.invalid) {
            this.officeHeadForm.markAllAsTouched();
            return;
        }

        const v = this.officeHeadForm.value;
        const unitOrgIds: number[] = v.unitOrgIds ?? [];
        if (unitOrgIds.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select at least one Mother Org Unit' });
            return;
        }

        const payload: MotherOrgOfficeHead = {
            orgHeadId: this.editingId ?? 0,
            motherOrgId: v.motherOrgId,
            headNameEN: v.headNameEN,
            headNameBN: v.headNameBN,
            status: v.status,
            units: unitOrgIds.map(id => ({ unitOrgId: id })),
            createdBy: this.currentUser,
            lastUpdatedBy: this.currentUser
        };

        if (this.editingId) {
            this.update(payload);
        } else {
            this.create(payload);
        }
    }

    create(payload: MotherOrgOfficeHead) {
        this.isSubmitting = true;
        this.officeHeadService.post(payload).subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Office head saved successfully' });
                    this.onReset();
                    this.loadOfficeHeads();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save completed with warnings' });
                }
                this.isSubmitting = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to save office head' });
                this.isSubmitting = false;
            }
        });
    }

    update(payload: MotherOrgOfficeHead) {
        this.isSubmitting = true;
        this.officeHeadService.update(payload).subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Office head updated successfully' });
                    this.onReset();
                    this.loadOfficeHeads();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Update completed with warnings' });
                }
                this.isSubmitting = false;
            },
            error: (err) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to update office head' });
                this.isSubmitting = false;
            }
        });
    }

    onEdit(row: OfficeHeadRow) {
        this.editingId = row.orgHeadId;
        // Load the units for this row's mother org first, then set the selected units.
        if (row.motherOrgId != null) {
            this.loadUnits(row.motherOrgId);
        }
        this.officeHeadForm.patchValue({
            orgHeadId: row.orgHeadId,
            motherOrgId: row.motherOrgId,
            unitOrgIds: (row.units ?? []).map(u => u.unitOrgId),
            headNameEN: row.headNameEN,
            headNameBN: row.headNameBN ?? '',
            status: row.status ?? true
        }, { emitEvent: false });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onDelete(row: OfficeHeadRow, event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this office head?',
            header: 'Delete Confirmation',
            icon: 'pi pi-exclamation-triangle',
            rejectLabel: 'Cancel',
            acceptLabel: 'Delete',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.officeHeadService.delete(row.orgHeadId).subscribe({
                    next: (res) => {
                        if (res?.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Office head deleted successfully' });
                            this.loadOfficeHeads();
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Delete completed with warnings' });
                        }
                    },
                    error: (err) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to delete office head' });
                    }
                });
            }
        });
    }

    onReset() {
        this.editingId = null;
        this.searchValue = '';
        this.unitOptions = [];
        this.officeHeadForm.reset({
            orgHeadId: 0,
            motherOrgId: null,
            unitOrgIds: [],
            headNameEN: '',
            headNameBN: '',
            status: true
        });
        this.buildTableData();
        this.isSubmitting = false;
    }
}
