import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { CommonCode } from '../shared/models/common-code';
import { OrganizationModel } from '../organization-setup/models/organization';
import { EquivalentRankModel } from '../shared/models/equivalent-rank';
import { SharedService } from '@/shared/services/shared-service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CommonModule } from '@angular/common';
import { DataTable } from '../shared/componets/data-table/data-table';
import { TableConfig } from '../shared/models/dataTableConfig';

@Component({
    selector: 'app-rank-equivalent',
    imports: [
        ReactiveFormsModule,
        CommonModule,
        FluidModule,
        SelectModule,
        ButtonModule,
        ToastModule,
        ConfirmDialogModule,
        DataTable
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './rank-equivalent.html',
    styleUrl: './rank-equivalent.scss'
})
export class RankEquivalent implements OnInit {
    title = 'Rank Equivalent';
    rankEquivalentForm!: FormGroup;
    isSubmitting = false;
    editingKeys: { equivalentNameID: number; motherOrgRankId: number } | null = null;

    equivalentNames: CommonCode[] = [];
    motherOrgs: OrganizationModel[] = [];
    motherOrgRanks: CommonCode[] = [];
    /** Cached ranks from all orgs in the list, for table display */
    allMotherOrgRanks: CommonCode[] = [];

    equivalentNameOptions: { label: string; value: number }[] = [];
    motherOrgOptions: { label: string; value: number }[] = [];
    motherOrgRankOptions: { label: string; value: number }[] = [];

    rankEquivalentData: EquivalentRankModel[] = [];
    totalRecords = 0;
    rows = 10;
    first = 0;
    loading = false;

    tableConfig: TableConfig = {
        tableColumns: [
            { field: 'equivalentNameDisplay', header: 'Equivalent Name' },
            { field: 'motherOrgDisplay', header: 'Mother Organization' },
            { field: 'motherOrgRankDisplay', header: 'Mother Organization Rank' }
        ]
    };

    constructor(
        private fb: FormBuilder,
        private rankEquivalentService: MasterBasicSetupService,
        private shareService: SharedService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        this.initForm();
        this.loadEquivalentName();
        this.loadActiveMotherOrg();
        this.loadRankEquivalentList();
        this.setupMotherOrgChange();
    }

    initForm(): void {
        this.rankEquivalentForm = this.fb.group({
            equivalentNameID: [null, Validators.required],
            motherOrgId: [null, Validators.required],
            motherOrgRankId: [null, Validators.required],
            createdBy: [''],
            createdDate: [null],
            lastUpdatedBy: [''],
            lastupdate: [null]
        });
    }

    setupMotherOrgChange(): void {
        this.rankEquivalentForm.get('motherOrgId')?.valueChanges.subscribe((orgId: number | null) => {
            this.rankEquivalentForm.patchValue({ motherOrgRankId: null }, { emitEvent: false });
            this.motherOrgRanks = [];
            if (orgId != null) {
                this.loadMotherOrgRank(orgId);
            }
        });
    }

    loadEquivalentName(): void {
        this.rankEquivalentService.getAllByType('EquivalentName').subscribe({
            next: (res) => {
                this.equivalentNames = Array.isArray(res) ? res : [];
                this.equivalentNameOptions = this.equivalentNames.map((c) => ({ label: c.codeValueEN ?? String(c.codeId), value: c.codeId }));
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Equivalent Names' });
            }
        });
    }

    loadActiveMotherOrg(): void {
        this.rankEquivalentService.getAllActiveMotherOrgs().subscribe({
            next: (res) => {
                this.motherOrgs = res ?? [];
                this.motherOrgOptions = this.motherOrgs.map((o) => ({ label: o.orgNameEN ?? String(o.orgId), value: o.orgId }));
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Mother Organizations' });
            }
        });
    }

    loadMotherOrgRank(orgId: number): void {
        this.rankEquivalentService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (res) => {
                this.motherOrgRanks = Array.isArray(res) ? res : [];
                this.motherOrgRankOptions = this.motherOrgRanks.map((c) => ({ label: c.codeValueEN ?? String(c.codeId), value: c.codeId }));
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Mother Org Ranks' });
            }
        });
    }

    loadRankEquivalentList(): void {
        this.loading = true;
        this.rankEquivalentService.getAllRankEquivalents().subscribe({
            next: (res) => {
                const list = Array.isArray(res) ? res : [];
                const uniqueOrgIds = [...new Set(list.map((r) => r.motherOrgId))];
                if (uniqueOrgIds.length === 0) {
                    this.allMotherOrgRanks = [];
                    this.rankEquivalentData = list.map((row) => this.toDisplayRow(row));
                    this.totalRecords = this.rankEquivalentData.length;
                    this.loading = false;
                    return;
                }
                let pending = uniqueOrgIds.length;
                const allRanks: CommonCode[] = [];
                uniqueOrgIds.forEach((orgId) => {
                    this.rankEquivalentService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                        next: (codes) => {
                            allRanks.push(...(Array.isArray(codes) ? codes : []));
                            pending--;
                            if (pending === 0) {
                                this.allMotherOrgRanks = allRanks;
                                this.rankEquivalentData = list.map((row) => this.toDisplayRow(row));
                                this.totalRecords = this.rankEquivalentData.length;
                                this.loading = false;
                            }
                        },
                        error: () => {
                            pending--;
                            if (pending === 0) {
                                this.allMotherOrgRanks = allRanks;
                                this.rankEquivalentData = list.map((row) => this.toDisplayRow(row));
                                this.totalRecords = this.rankEquivalentData.length;
                                this.loading = false;
                            }
                        }
                    });
                });
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load Rank Equivalents' });
                this.loading = false;
            }
        });
    }

    toDisplayRow(row: EquivalentRankModel): EquivalentRankModel & {
        equivalentNameDisplay: string;
        motherOrgDisplay: string;
        motherOrgRankDisplay: string;
    } {
        const equivalentNameDisplay = this.equivalentNames.find((c) => c.codeId === row.equivalentNameID)?.codeValueEN ?? String(row.equivalentNameID);
        const motherOrgDisplay = this.motherOrgs.find((o) => o.orgId === row.motherOrgId)?.orgNameEN ?? String(row.motherOrgId);
        const motherOrgRankDisplay = this.motherOrgRanks.find((c) => c.codeId === row.motherOrgRankId)?.codeValueEN
            ?? this.allMotherOrgRanks.find((c) => c.codeId === row.motherOrgRankId)?.codeValueEN ?? String(row.motherOrgRankId);
        return {
            ...row,
            equivalentNameDisplay,
            motherOrgDisplay,
            motherOrgRankDisplay
        };
    }

    onSubmit(): void {
        if (this.isSubmitting || this.rankEquivalentForm.invalid) {
            this.rankEquivalentForm.markAllAsTouched();
            return;
        }
        const user = this.shareService.getCurrentUser() ?? 'System';
        const now = this.shareService.getCurrentDateTime();
        const v = this.rankEquivalentForm.value;
        const model: EquivalentRankModel = {
            equivalentNameID: v.equivalentNameID,
            motherOrgRankId: v.motherOrgRankId,
            motherOrgId: v.motherOrgId,
            createdBy: user,
            createdDate: now,
            lastUpdatedBy: user,
            lastupdate: now
        };

        if (this.editingKeys) {
            this.isSubmitting = true;
            this.rankEquivalentService.updateRankEquivalent(model).subscribe({
                next: (res) => {
                    if (res?.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Rank Equivalent updated successfully' });
                        this.resetForm();
                        this.loadRankEquivalentList();
                    } else {
                        this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Update completed with warnings' });
                    }
                    this.isSubmitting = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to update Rank Equivalent' });
                    this.isSubmitting = false;
                }
            });
        } else {
            this.isSubmitting = true;
            this.rankEquivalentService.saveRankEquivalent(model).subscribe({
                next: (res) => {
                    if (res?.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Rank Equivalent saved successfully' });
                        this.resetForm();
                        this.loadRankEquivalentList();
                    } else {
                        this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save completed with warnings' });
                    }
                    this.isSubmitting = false;
                },
                error: (err) => {
                    console.error(err);
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to save Rank Equivalent' });
                    this.isSubmitting = false;
                }
            });
        }
    }

    resetForm(): void {
        this.editingKeys = null;
        this.rankEquivalentForm.reset({
            equivalentNameID: null,
            motherOrgId: null,
            motherOrgRankId: null,
            createdBy: '',
            createdDate: null,
            lastUpdatedBy: '',
            lastupdate: null
        });
        this.motherOrgRanks = [];
        this.motherOrgRankOptions = [];
    }

    update(row: EquivalentRankModel & { equivalentNameDisplay?: string; motherOrgDisplay?: string; motherOrgRankDisplay?: string }): void {
        this.editingKeys = { equivalentNameID: row.equivalentNameID, motherOrgRankId: row.motherOrgRankId };
        this.rankEquivalentForm.patchValue({
            equivalentNameID: row.equivalentNameID,
            motherOrgId: row.motherOrgId,
            motherOrgRankId: row.motherOrgRankId
        });
        this.loadMotherOrgRank(row.motherOrgId);
    }

    delete(row: EquivalentRankModel & { equivalentNameDisplay?: string; motherOrgDisplay?: string; motherOrgRankDisplay?: string }, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: 'Do you want to delete this Rank Equivalent?',
            header: 'Delete Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Delete', severity: 'danger' },
            accept: () => {
                this.rankEquivalentService.deleteRankEquivalent(row.equivalentNameID, row.motherOrgRankId).subscribe({
                    next: (res) => {
                        if (res?.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Rank Equivalent deleted successfully' });
                            this.loadRankEquivalentList();
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Delete completed with warnings' });
                        }
                    },
                    error: (err) => {
                        console.error(err);
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to delete Rank Equivalent' });
                    }
                });
            }
        });
    }

    onLazyLoad(event: unknown): void {
        this.loadRankEquivalentList();
    }

    onSearch(_keyword: string): void {
        this.loadRankEquivalentList();
    }
}
