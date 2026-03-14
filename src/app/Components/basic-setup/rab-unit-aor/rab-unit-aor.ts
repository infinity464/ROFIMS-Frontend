import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';

import { FluidModule } from 'primeng/fluid';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
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
    rabUnitName: string;
    divisionNames: string;
    districtNames: string;
    upazilaNames: string;
    locationOfBattalionHQ?: string | null;
    numberOfCamp?: number | null;
    nameOfCamps?: string | null;
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
        InputNumberModule,
        InputTextModule,
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
            divisionIds: [[], Validators.required],
            districtIds: [[], Validators.required],
            upazilaIds: [[], Validators.required],
            locationOfBattalionHQ: [null],
            numberOfCamp: [null],
            nameOfCamps: [null]
        });
    }

    ngOnInit(): void {
        this.loadRabUnits();
        this.loadDivisions();

        this.form.get('divisionIds')?.valueChanges.subscribe((divisionIds: number[]) => {
            this.districtOptions = [];
            this.upazilaOptions = [];
            this.form.patchValue({ districtIds: [], upazilaIds: [] }, { emitEvent: false });
            if (divisionIds?.length) this.loadDistrictsForDivisions(divisionIds);
        });

        this.form.get('districtIds')?.valueChanges.subscribe((districtIds: number[]) => {
            this.upazilaOptions = [];
            this.form.patchValue({ upazilaIds: [] }, { emitEvent: false });
            if (districtIds?.length) this.loadUpazilasForDistricts(districtIds);
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

    private loadDistrictsForDivisions(divisionIds: number[]): void {
        const calls = divisionIds.map((id) => this.master.getByParentId(id));
        forkJoin(calls).subscribe({
            next: (districtLists) => {
                const seen = new Set<number>();
                const options: Option[] = [];
                (districtLists ?? []).forEach((list) => {
                    (list ?? []).forEach((d: CommonCode) => {
                        if (!seen.has(d.codeId)) {
                            seen.add(d.codeId);
                            options.push({ label: d.codeValueEN ?? '', value: d.codeId });
                        }
                    });
                });
                this.districtOptions = options.sort((a, b) => a.label.localeCompare(b.label));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load districts' });
            }
        });
    }

    private loadUpazilasForDistricts(districtIds: number[]): void {
        const calls = districtIds.map((id) => this.master.getByParentId(id));
        forkJoin(calls).subscribe({
            next: (upazilaLists) => {
                const seen = new Set<number>();
                const options: Option[] = [];
                (upazilaLists ?? []).forEach((list) => {
                    (list ?? []).forEach((u: CommonCode) => {
                        if (!seen.has(u.codeId)) {
                            seen.add(u.codeId);
                            options.push({ label: u.codeValueEN ?? '', value: u.codeId });
                        }
                    });
                });
                this.upazilaOptions = options.sort((a, b) => a.label.localeCompare(b.label));
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load upazilas' });
            }
        });
    }

    private toCsv(ids: number[]): string | null {
        if (!ids?.length) return null;
        return ids.join(',');
    }

    assignSelected(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const val = this.form.value;
        const rabUnitId = val.rabUnitId as number;
        const divisionIds = (val.divisionIds as number[]) ?? [];
        const districtIds = (val.districtIds as number[]) ?? [];
        const upazilaIds = (val.upazilaIds as number[]) ?? [];

        if (!divisionIds.length || !districtIds.length || !upazilaIds.length) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select at least one division, district, and upazila' });
            return;
        }

        const user = this.shareService.getCurrentUser() ?? 'System';
        const now = this.shareService.getCurrentDateTime();

        this.isSubmitting = true;

        const model: RABUnitAORModel = {
            rabUnitId,
            divisionIds: this.toCsv(divisionIds),
            districtIds: this.toCsv(districtIds),
            upazilaIds: this.toCsv(upazilaIds),
            locationOfBattalionHQ: val.locationOfBattalionHQ ?? null,
            numberOfCamp: val.numberOfCamp ?? null,
            nameOfCamps: val.nameOfCamps ?? null,
            status: true,
            createdBy: user,
            createdDate: now,
            lastUpdatedBy: user,
            lastupdate: now
        };

        this.master.saveRABUnitAOR(model).subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Saved successfully' });
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Save failed' });
                }
                this.loadAssigned(rabUnitId);
            },
            error: (err) => {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.description ?? err?.message ?? 'Failed to save'
                });
            },
            complete: () => {
                this.isSubmitting = false;
            }
        });
    }

    private csvToIds(csv: string | null | undefined): number[] {
        if (!csv?.trim()) return [];
        return csv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    }

    private idsToNames(ids: number[], map: Record<number, string>): string {
        if (!ids.length) return '-';
        return ids.map((id) => map[id] ?? String(id)).join(', ');
    }

    private loadAssigned(rabUnitId: number): void {
        this.assignedLoading = true;
        this.master.getRABUnitAORByRabUnit(rabUnitId).subscribe({
            next: (rows) => {
                const list = (rows ?? []) as any[];
                if (!list.length) {
                    this.assigned = [];
                    this.assignedLoading = false;
                    return;
                }

                const allDivisionIds = new Set<number>();
                const allDistrictIds = new Set<number>();
                const allUpazilaIds = new Set<number>();
                list.forEach((r) => {
                    this.csvToIds(r.divisionIds ?? r.DivisionIds).forEach((id) => allDivisionIds.add(id));
                    this.csvToIds(r.districtIds ?? r.DistrictIds).forEach((id) => allDistrictIds.add(id));
                    this.csvToIds(r.upazilaIds ?? r.UpazilaIds).forEach((id) => allUpazilaIds.add(id));
                });

                this.master.getAllByType('Division').subscribe({
                    next: (divs) => {
                        const divisionMap: Record<number, string> = Object.fromEntries((divs ?? []).map((d) => [d.codeId, d.codeValueEN ?? '']));
                        const districtCalls = [...allDivisionIds].map((id) => this.master.getByParentId(id));
                        forkJoin(districtCalls).subscribe({
                            next: (districtLists) => {
                                const districtMap: Record<number, string> = {};
                                (districtLists ?? []).forEach((dl) => {
                                    (dl ?? []).forEach((d: CommonCode) => {
                                        districtMap[d.codeId] = d.codeValueEN ?? '';
                                    });
                                });
                                const upazilaCalls = [...allDistrictIds].map((id) => this.master.getByParentId(id));
                                forkJoin(upazilaCalls).subscribe({
                                    next: (upazilaLists) => {
                                        const upazilaMap: Record<number, string> = {};
                                        (upazilaLists ?? []).forEach((ul) => {
                                            (ul ?? []).forEach((u: CommonCode) => {
                                                upazilaMap[u.codeId] = u.codeValueEN ?? '';
                                            });
                                        });
                                        const rabName = this.rabUnitOptions.find((o) => o.value === rabUnitId)?.label ?? String(rabUnitId);
                                        this.assigned = list.map((r) => {
                                            const divIds = this.csvToIds(r.divisionIds ?? r.DivisionIds);
                                            const distIds = this.csvToIds(r.districtIds ?? r.DistrictIds);
                                            const upaIds = this.csvToIds(r.upazilaIds ?? r.UpazilaIds);
                                            return {
                                                aorId: r.aorId ?? r.AORId,
                                                rabUnitName: rabName,
                                                divisionNames: this.idsToNames(divIds, divisionMap),
                                                districtNames: this.idsToNames(distIds, districtMap),
                                                upazilaNames: this.idsToNames(upaIds, upazilaMap),
                                                locationOfBattalionHQ: r.locationOfBattalionHQ ?? r.LocationOfBattalionHQ ?? null,
                                                numberOfCamp: r.numberOfCamp ?? r.NumberOfCamp ?? null,
                                                nameOfCamps: r.nameOfCamps ?? r.NameOfCamps ?? null
                                            };
                                        });
                                        // Populate form with first record for editing
                                        const first = list[0];
                                        if (first && this.form.value.rabUnitId === rabUnitId) {
                                            this.form.patchValue({
                                                divisionIds: this.csvToIds(first.divisionIds ?? first.DivisionIds),
                                                districtIds: this.csvToIds(first.districtIds ?? first.DistrictIds),
                                                upazilaIds: this.csvToIds(first.upazilaIds ?? first.UpazilaIds),
                                                locationOfBattalionHQ: first.locationOfBattalionHQ ?? first.LocationOfBattalionHQ ?? null,
                                                numberOfCamp: first.numberOfCamp ?? first.NumberOfCamp ?? null,
                                                nameOfCamps: first.nameOfCamps ?? first.NameOfCamps ?? null
                                            }, { emitEvent: false });
                                            this.loadDistrictsForDivisions(this.csvToIds(first.divisionIds ?? first.DivisionIds));
                                            this.loadUpazilasForDistricts(this.csvToIds(first.districtIds ?? first.DistrictIds));
                                        }
                                        this.assignedLoading = false;
                                    },
                                    error: () => {
                                        this.assigned = list.map((r) => ({
                                            aorId: r.aorId ?? r.AORId,
                                            rabUnitName: this.rabUnitOptions.find((o) => o.value === rabUnitId)?.label ?? String(rabUnitId),
                                            divisionNames: (r.divisionIds ?? r.DivisionIds) ?? '-',
                                            districtNames: (r.districtIds ?? r.DistrictIds) ?? '-',
                                            upazilaNames: (r.upazilaIds ?? r.UpazilaIds) ?? '-',
                                            locationOfBattalionHQ: r.locationOfBattalionHQ ?? r.LocationOfBattalionHQ ?? null,
                                            numberOfCamp: r.numberOfCamp ?? r.NumberOfCamp ?? null,
                                            nameOfCamps: r.nameOfCamps ?? r.NameOfCamps ?? null
                                        }));
                                        this.assignedLoading = false;
                                    }
                                });
                            },
                            error: () => {
                                this.assigned = list.map((r) => ({
                                    aorId: r.aorId ?? r.AORId,
                                    rabUnitName: this.rabUnitOptions.find((o) => o.value === rabUnitId)?.label ?? String(rabUnitId),
                                    divisionNames: (r.divisionIds ?? r.DivisionIds) ?? '-',
                                    districtNames: (r.districtIds ?? r.DistrictIds) ?? '-',
                                    upazilaNames: (r.upazilaIds ?? r.UpazilaIds) ?? '-',
                                    locationOfBattalionHQ: r.locationOfBattalionHQ ?? r.LocationOfBattalionHQ ?? null,
                                    numberOfCamp: r.numberOfCamp ?? r.NumberOfCamp ?? null,
                                    nameOfCamps: r.nameOfCamps ?? r.NameOfCamps ?? null
                                }));
                                this.assignedLoading = false;
                            }
                        });
                    },
                    error: () => {
                        this.assigned = list.map((r) => ({
                            aorId: r.aorId ?? r.AORId,
                            rabUnitName: this.rabUnitOptions.find((o) => o.value === rabUnitId)?.label ?? String(rabUnitId),
                            divisionNames: (r.divisionIds ?? r.DivisionIds) ?? '-',
                            districtNames: (r.districtIds ?? r.DistrictIds) ?? '-',
                            upazilaNames: (r.upazilaIds ?? r.UpazilaIds) ?? '-',
                            locationOfBattalionHQ: r.locationOfBattalionHQ ?? r.LocationOfBattalionHQ ?? null,
                            numberOfCamp: r.numberOfCamp ?? r.NumberOfCamp ?? null,
                            nameOfCamps: r.nameOfCamps ?? r.NameOfCamps ?? null
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
            message: `Remove this Area of Responsibility from ${row.rabUnitName}?`,
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
            divisionIds: [],
            districtIds: [],
            upazilaIds: [],
            locationOfBattalionHQ: null,
            numberOfCamp: null,
            nameOfCamps: null
        });
        this.districtOptions = [];
        this.upazilaOptions = [];
    }
}

