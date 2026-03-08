import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';

import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { CommonCode } from '../shared/models/common-code';
import { RABUnitAORModel } from '../shared/models/rab-unit-aor';

type Option = { label: string; value: number };
type AssignedRow = {
    aorId: number;
    divisionId: number;
    divisionName: string;
    districtId: number;
    districtName: string;
    upazilaId: number;
    upazilaName: string;
};

@Component({
    selector: 'app-rab-unit-aor',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        FluidModule,
        SelectModule,
        MultiSelectModule,
        ButtonModule,
        ToastModule,
        ConfirmDialogModule,
        TableModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './rab-unit-aor.html',
    styleUrls: ['./rab-unit-aor.scss']
})
export class RabUnitAor implements OnInit {
    title = 'RAB Unit Area of Responsibility';

    form: FormGroup;
    isSubmitting = false;

    rabUnitOptions: Option[] = [];
    divisionOptions: Option[] = [];
    districtOptions: Option[] = [];
    upazilaOptions: Option[] = [];

    assigned: AssignedRow[] = [];
    assignedLoading = false;

    constructor(
        private fb: FormBuilder,
        private master: MasterBasicSetupService,
        private shareService: SharedService,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {
        this.form = this.fb.group({
            rabUnitId: [null, Validators.required],
            divisionId: [null, Validators.required],
            districtId: [null, Validators.required],
            upazilaIds: [[], Validators.required]
        });
    }

    ngOnInit(): void {
        this.loadRabUnits();
        this.loadDivisions();

        this.form.get('divisionId')?.valueChanges.subscribe((divisionId) => {
            this.districtOptions = [];
            this.upazilaOptions = [];
            this.form.patchValue({ districtId: null, upazilaIds: [] }, { emitEvent: false });
            if (divisionId) this.loadDistricts(divisionId);
        });

        this.form.get('districtId')?.valueChanges.subscribe((districtId) => {
            this.upazilaOptions = [];
            this.form.patchValue({ upazilaIds: [] }, { emitEvent: false });
            if (districtId) this.loadUpazilas(districtId);
        });

        this.form.get('rabUnitId')?.valueChanges.subscribe((rabUnitId) => {
            if (rabUnitId) this.loadAssigned(rabUnitId);
            else this.assigned = [];
        });
    }

    private loadRabUnits(): void {
        this.master.getAllByType('RabUnit').subscribe({
            next: (units) => {
                this.rabUnitOptions = (units ?? []).map((u) => ({ label: u.codeValueEN, value: u.codeId }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load RAB units' });
            }
        });
    }

    private loadDivisions(): void {
        this.master.getAllByType('Division').subscribe({
            next: (divs) => {
                this.divisionOptions = (divs ?? []).map((d) => ({ label: d.codeValueEN, value: d.codeId }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load divisions' });
            }
        });
    }

    private loadDistricts(divisionId: number): void {
        this.master.getByParentId(divisionId).subscribe({
            next: (districts) => {
                this.districtOptions = (districts ?? []).map((d) => ({ label: d.codeValueEN, value: d.codeId }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load districts' });
            }
        });
    }

    private loadUpazilas(districtId: number): void {
        this.master.getByParentId(districtId).subscribe({
            next: (upazilas) => {
                this.upazilaOptions = (upazilas ?? []).map((u) => ({ label: u.codeValueEN, value: u.codeId }));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load upazilas' });
            }
        });
    }

    assignSelected(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const rabUnitId = this.form.value.rabUnitId as number;
        const divisionId = this.form.value.divisionId as number;
        const districtId = this.form.value.districtId as number;
        const upazilaIds = (this.form.value.upazilaIds as number[]) ?? [];

        if (!upazilaIds.length) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select at least one upazila' });
            return;
        }

        const user = this.shareService.getCurrentUser() ?? 'System';
        const now = this.shareService.getCurrentDateTime();

        this.isSubmitting = true;

        const calls = upazilaIds.map((upazilaId) => {
            const model: RABUnitAORModel = {
                rabUnitId,
                divisionId,
                districtId,
                upazilaId,
                status: true,
                createdBy: user,
                createdDate: now,
                lastUpdatedBy: user,
                lastupdate: now
            };
            return this.master.saveRABUnitAOR(model);
        });

        forkJoin(calls).subscribe({
            next: (results) => {
                const failed = (results ?? []).filter((r) => (r?.statusCode ?? 500) !== 200);
                if (failed.length) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Warning',
                        detail: `${failed.length} assignment(s) may have failed`
                    });
                } else {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Assigned successfully' });
                }
                this.loadAssigned(rabUnitId);
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to assign upazilas'
                });
            },
            complete: () => {
                this.isSubmitting = false;
            }
        });
    }

    private loadAssigned(rabUnitId: number): void {
        this.assignedLoading = true;
        this.master.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows) => {
                const normalized = (rows ?? [])
                    .map((r: any) => ({
                        aorId: (r.aorId ?? r.AORId) as number | undefined,
                        divisionId: (r.divisionId ?? r.DivisionId) as number | undefined,
                        districtId: (r.districtId ?? r.DistrictId) as number | undefined,
                        upazilaId: (r.upazilaId ?? r.UpazilaId) as number | undefined
                    }))
                    .filter((r) => r.aorId != null && r.divisionId != null && r.districtId != null && r.upazilaId != null) as Array<{
                    aorId: number;
                    divisionId: number;
                    districtId: number;
                    upazilaId: number;
                }>;

                if (!normalized.length) {
                    this.assigned = [];
                    this.assignedLoading = false;
                    return;
                }

                const divisionIds = [...new Set(normalized.map((r) => r.divisionId))];
                const districtIds = [...new Set(normalized.map((r) => r.districtId))];

                this.master.getAllByType('Division').subscribe({
                    next: (divs) => {
                        const divisionMap = Object.fromEntries((divs ?? []).map((d) => [d.codeId, d.codeValueEN ?? '']));
                        const districtCalls = divisionIds.map((id) => this.master.getByParentId(id));
                        forkJoin(districtCalls).subscribe({
                            next: (districtLists) => {
                                const districtMap: Record<number, string> = {};
                                districtLists.forEach((dl) => {
                                    (dl ?? []).forEach((d: CommonCode) => {
                                        districtMap[d.codeId] = d.codeValueEN ?? '';
                                    });
                                });

                                const upazilaCalls = districtIds.map((id) => this.master.getByParentId(id));
                                forkJoin(upazilaCalls).subscribe({
                                    next: (upazilaLists) => {
                                        const upazilaMap: Record<number, string> = {};
                                        upazilaLists.forEach((ul) => {
                                            (ul ?? []).forEach((u: CommonCode) => {
                                                upazilaMap[u.codeId] = u.codeValueEN ?? '';
                                            });
                                        });

                                        this.assigned = normalized.map((r) => ({
                                            aorId: r.aorId,
                                            divisionId: r.divisionId,
                                            divisionName: divisionMap[r.divisionId] ?? String(r.divisionId),
                                            districtId: r.districtId,
                                            districtName: districtMap[r.districtId] ?? String(r.districtId),
                                            upazilaId: r.upazilaId,
                                            upazilaName: upazilaMap[r.upazilaId] ?? String(r.upazilaId)
                                        }));
                                        this.assignedLoading = false;
                                    },
                                    error: () => {
                                        this.assigned = normalized.map((r) => ({
                                            aorId: r.aorId,
                                            divisionId: r.divisionId,
                                            divisionName: String(r.divisionId),
                                            districtId: r.districtId,
                                            districtName: String(r.districtId),
                                            upazilaId: r.upazilaId,
                                            upazilaName: String(r.upazilaId)
                                        }));
                                        this.assignedLoading = false;
                                    }
                                });
                            },
                            error: () => {
                                this.assigned = normalized.map((r) => ({
                                    aorId: r.aorId,
                                    divisionId: r.divisionId,
                                    divisionName: String(r.divisionId),
                                    districtId: r.districtId,
                                    districtName: String(r.districtId),
                                    upazilaId: r.upazilaId,
                                    upazilaName: String(r.upazilaId)
                                }));
                                this.assignedLoading = false;
                            }
                        });
                    },
                    error: () => {
                        this.assigned = normalized.map((r) => ({
                            aorId: r.aorId,
                            divisionId: r.divisionId,
                            divisionName: String(r.divisionId),
                            districtId: r.districtId,
                            districtName: String(r.districtId),
                            upazilaId: r.upazilaId,
                            upazilaName: String(r.upazilaId)
                        }));
                        this.assignedLoading = false;
                    }
                });
            },
            error: () => {
                this.assigned = [];
                this.assignedLoading = false;
            }
        });
    }

    removeAssignment(row: AssignedRow, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Remove ${row.upazilaName} from this RAB Unit?`,
            header: 'Remove Confirmation',
            icon: 'pi pi-info-circle',
            rejectLabel: 'Cancel',
            rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Remove', severity: 'danger' },
            accept: () => {
                this.master.deleteRABUnitAOR(row.aorId).subscribe({
                    next: (res) => {
                        if (res?.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Removed' });
                            const rabUnitId = this.form.value.rabUnitId as number;
                            if (rabUnitId) this.loadAssigned(rabUnitId);
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Remove failed' });
                        }
                    },
                    error: () => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove assignment' });
                    }
                });
            }
        });
    }

    resetForm(): void {
        this.form.patchValue({
            divisionId: null,
            districtId: null,
            upazilaIds: []
        });
        this.districtOptions = [];
        this.upazilaOptions = [];
    }
}

