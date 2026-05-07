import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
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
import { ColorPickerModule } from 'primeng/colorpicker';

import { MasterBasicSetupService } from '../shared/services/MasterBasicSetupService';
import { SharedService } from '@/shared/services/shared-service';
import { CommonCode } from '../shared/models/common-code';
import { RABUnitAORModel } from '../shared/models/rab-unit-aor';
import { AorAddPayload, AorCardComponent, AorCardData, AorChip, AorChipWithParent } from '../shared/componets/aor-card/aor-card';

type Option = { label: string; value: number };
type AssignedRow = AorCardData;

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
        TableModule,
        ColorPickerModule,
        AorCardComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './rab-unit-aor.html',
    styleUrls: ['./rab-unit-aor.scss']
})
export class RabUnitAor implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    title = 'RAB Unit Area of Responsibility';

    form: FormGroup;
    isSubmitting = false;

    rabUnitOptions: Option[] = [];
    divisionOptions: Option[] = [];
    districtOptions: Option[] = [];
    upazilaOptions: Option[] = [];

    /** Pool of every division/district/upazila — used by AOR cards' inline pickers. */
    allDivisionsPool: AorChip[] = [];
    allDistrictsPool: AorChipWithParent[] = [];
    allUpazilasPool: AorChipWithParent[] = [];

    /** Every AOR across all units — used to detect upazila ownership conflicts. */
    private allAors: RABUnitAORModel[] = [];

    /** Pool minus upazilas owned by other units; recomputed when unit/AORs change. */
    upazilasPoolForCard: AorChipWithParent[] = [];
    /** Map of upazilaId -> "Assigned to RAB-X" string passed to cards as the lock reasons. */
    lockedUpazilas: Record<number, string> = {};

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
            searchUpazilaId: [null],
            rabUnitId: [null, Validators.required],
            divisionIds: [[]],
            districtIds: [[]],
            upazilaIds: [[]],
            locationOfBattalionHQ: [null],
            locationOfBattalionHQBangla: [null],
            numberOfCamp: [null],
            nameOfCamps: [null],
            identificationColor: [null]
        });
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadRabUnits();
        this.loadDivisions();
        this.loadAllPools();
        this.loadAllAors();

        this.form.get('divisionIds')?.valueChanges.subscribe((divisionIds: number[]) => {
            if (!divisionIds?.length) {
                this.districtOptions = [];
                this.upazilaOptions = [];
                this.form.patchValue({ districtIds: [], upazilaIds: [] }, { emitEvent: false });
                return;
            }
            this.loadDistrictsForDivisions(divisionIds);
        });

        this.form.get('districtIds')?.valueChanges.subscribe((districtIds: number[]) => {
            if (!districtIds?.length) {
                this.upazilaOptions = [];
                this.form.patchValue({ upazilaIds: [] }, { emitEvent: false });
                return;
            }
            this.loadUpazilasForDistricts(districtIds);
        });

        this.form.get('rabUnitId')?.valueChanges.subscribe((rabUnitId) => {
            this.recomputeUpazilaPoolForCard();
            if (rabUnitId) this.loadAssigned(rabUnitId);
            else this.assigned = [];
        });

        // Search by upazila: jump to the unit that owns it.
        this.form.get('searchUpazilaId')?.valueChanges.subscribe((upaId: number | null) => {
            if (!upaId) return;
            const aor = this.allAors.find((a) => {
                const csv = (a as any).upazilaIds ?? (a as any).UpazilaIds ?? '';
                return String(csv)
                    .split(',')
                    .map((s) => parseInt(s.trim(), 10))
                    .includes(upaId);
            });
            if (aor) {
                const unitId = (aor as any).rabUnitId ?? (aor as any).RABUnitId;
                if (unitId && unitId !== this.form.value.rabUnitId) {
                    this.form.patchValue({ rabUnitId: unitId });
                }
            } else {
                const upaName = this.allUpazilasPool.find((u) => u.id === upaId)?.name ?? 'This upazila';
                this.messageService.add({
                    severity: 'info',
                    summary: 'Not assigned',
                    detail: `${upaName} is not assigned to any unit yet`,
                    life: 4000
                });
            }
        });
    }

    private loadRabUnits(): void {
        this.master.getAllByType('RabUnit').subscribe({
            next: (units) => {
                this.rabUnitOptions = (units ?? []).map((u) => ({ label: u.codeValueEN, value: u.codeId }));
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load RAB units' });
            }
        });
    }

    private loadDivisions(): void {
        this.master.getAllByType('Division').subscribe({
            next: (divs) => {
                this.divisionOptions = (divs ?? []).map((d) => ({ label: d.codeValueEN, value: d.codeId }));
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load divisions' });
            }
        });
    }

    private loadAllPools(): void {
        forkJoin({
            divisions: this.master.getAllByType('Division'),
            districts: this.master.getAllByType('District'),
            upazilas: this.master.getAllByType('Upazila')
        }).subscribe({
            next: ({ divisions, districts, upazilas }) => {
                this.allDivisionsPool = (divisions ?? [])
                    .map((d) => ({ id: d.codeId, name: d.codeValueEN ?? '' }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                this.allDistrictsPool = (districts ?? [])
                    .map((d) => ({ id: d.codeId, name: d.codeValueEN ?? '', parentId: d.parentCodeId ?? 0 }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                this.allUpazilasPool = (upazilas ?? [])
                    .map((u) => ({ id: u.codeId, name: u.codeValueEN ?? '', parentId: u.parentCodeId ?? 0 }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                this.recomputeUpazilaPoolForCard();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to load pools' });
            }
        });
    }

    private loadAllAors(): void {
        this.master.getAllRABUnitAOR().subscribe({
            next: (rows) => {
                this.allAors = rows ?? [];
                this.recomputeUpazilaPoolForCard();
            },
            error: () => {
                // Non-fatal; ownership filtering will degrade to "no exclusions".
                this.allAors = [];
            }
        });
    }

    /** Map of upazilaId -> { unitId, unitName } owned by another unit (not the currently-picked one). */
    private upazilaOwnership(): Map<number, { unitId: number; unitName: string }> {
        const currentUnit = this.form?.value?.rabUnitId as number | null | undefined;
        const map = new Map<number, { unitId: number; unitName: string }>();
        for (const aor of this.allAors) {
            const ownerUnit = (aor as any).rabUnitId ?? (aor as any).RABUnitId;
            if (!ownerUnit || ownerUnit === currentUnit) continue;
            const csv = (aor as any).upazilaIds ?? (aor as any).UpazilaIds ?? '';
            for (const id of String(csv).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))) {
                if (!map.has(id)) {
                    const unitName = this.rabUnitOptions.find((o) => o.value === ownerUnit)?.label ?? `Unit ${ownerUnit}`;
                    map.set(id, { unitId: ownerUnit, unitName });
                }
            }
        }
        return map;
    }

    /** Pass the full pool to the card and surface the conflict-owned ones as a "locked" map. */
    private recomputeUpazilaPoolForCard(): void {
        this.upazilasPoolForCard = this.allUpazilasPool;
        const owned = this.upazilaOwnership();
        const map: Record<number, string> = {};
        owned.forEach((info, id) => (map[id] = `Assigned to ${info.unitName}`));
        this.lockedUpazilas = map;
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

                const validIds = new Set(this.districtOptions.map((o) => o.value));
                const current = (this.form.value.districtIds as number[]) ?? [];
                const pruned = current.filter((id) => validIds.has(id));
                if (pruned.length !== current.length) {
                    this.form.patchValue({ districtIds: pruned }, { emitEvent: false });
                }
                if (pruned.length) {
                    this.loadUpazilasForDistricts(pruned);
                } else {
                    this.upazilaOptions = [];
                    this.form.patchValue({ upazilaIds: [] }, { emitEvent: false });
                }
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load districts' });
            }
        });
    }

    private loadUpazilasForDistricts(districtIds: number[]): void {
        const calls = districtIds.map((id) => this.master.getByParentId(id));
        forkJoin(calls).subscribe({
            next: (upazilaLists) => {
                const owned = this.upazilaOwnership();
                const seen = new Set<number>();
                const options: Option[] = [];
                (upazilaLists ?? []).forEach((list) => {
                    (list ?? []).forEach((u: CommonCode) => {
                        if (seen.has(u.codeId) || owned.has(u.codeId)) return;
                        seen.add(u.codeId);
                        options.push({ label: u.codeValueEN ?? '', value: u.codeId });
                    });
                });
                this.upazilaOptions = options.sort((a, b) => a.label.localeCompare(b.label));

                const validIds = new Set(this.upazilaOptions.map((o) => o.value));
                const current = (this.form.value.upazilaIds as number[]) ?? [];
                const pruned = current.filter((id) => validIds.has(id));
                if (pruned.length !== current.length) {
                    this.form.patchValue({ upazilaIds: pruned }, { emitEvent: false });
                }
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load upazilas' });
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

        // Block save if any upazila is already owned by a different unit (race-condition safety net).
        const owned = this.upazilaOwnership();
        const conflicts = upazilaIds.filter((id) => owned.has(id));
        if (conflicts.length) {
            const namesByUnit = new Map<string, string[]>();
            for (const id of conflicts) {
                const owner = owned.get(id)!;
                const upaName = this.allUpazilasPool.find((u) => u.id === id)?.name ?? String(id);
                if (!namesByUnit.has(owner.unitName)) namesByUnit.set(owner.unitName, []);
                namesByUnit.get(owner.unitName)!.push(upaName);
            }
            const detail = Array.from(namesByUnit.entries())
                .map(([unit, ups]) => `${ups.join(', ')} → ${unit}`)
                .join('; ');
            this.messageService.add({
                severity: 'error',
                summary: 'Upazila already assigned',
                detail: `These upazilas are already assigned to another unit: ${detail}`,
                life: 8000
            });
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
            locationOfBattalionHQBangla: val.locationOfBattalionHQBangla ?? null,
            numberOfCamp: val.numberOfCamp ?? null,
            nameOfCamps: val.nameOfCamps ?? null,
            identificationColor: val.identificationColor ?? null,
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
                this.loadAllAors();
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

    private idsToList(ids: number[], map: Record<number, string>): string[] {
        return ids.map((id) => map[id] ?? String(id)).filter((s) => s);
    }

    private resolveDivisions(ids: number[]): AorChip[] {
        const byId = new Map(this.allDivisionsPool.map((d) => [d.id, d]));
        return ids.map((id) => byId.get(id) ?? { id, name: String(id) });
    }

    private resolveDistricts(ids: number[]): AorChipWithParent[] {
        const byId = new Map(this.allDistrictsPool.map((d) => [d.id, d]));
        return ids.map((id) => byId.get(id) ?? { id, name: String(id), parentId: 0 });
    }

    private resolveUpazilas(ids: number[]): AorChipWithParent[] {
        const byId = new Map(this.allUpazilasPool.map((u) => [u.id, u]));
        return ids.map((id) => byId.get(id) ?? { id, name: String(id), parentId: 0 });
    }

    private buildAssignedRow(
        r: any,
        rabUnitId: number,
        _divisionMap: Record<number, string>,
        _districtMap: Record<number, string>,
        _upazilaMap: Record<number, string>
    ): AssignedRow {
        const divIds = this.csvToIds(r.divisionIds ?? r.DivisionIds);
        const distIds = this.csvToIds(r.districtIds ?? r.DistrictIds);
        const upaIds = this.csvToIds(r.upazilaIds ?? r.UpazilaIds);
        return {
            aorId: r.aorId ?? r.AORId,
            unitName: this.rabUnitOptions.find((o) => o.value === rabUnitId)?.label ?? String(rabUnitId),
            color: r.identificationColor ?? r.IdentificationColor ?? null,
            isActive: r.status ?? r.Status ?? true,
            locationEN: r.locationOfBattalionHQ ?? r.LocationOfBattalionHQ ?? null,
            locationBN: r.locationOfBattalionHQBangla ?? r.LocationOfBattalionHQBangla ?? null,
            divisions: this.resolveDivisions(divIds),
            districts: this.resolveDistricts(distIds),
            upazilas: this.resolveUpazilas(upaIds),
            numberOfCamp: r.numberOfCamp ?? r.NumberOfCamp ?? null,
            nameOfCamps: r.nameOfCamps ?? r.NameOfCamps ?? null
        };
    }

    /** Replace one of the AOR's lists (divisions/districts/upazilas) with the picker's final set. */
    private setOnAor(payload: AorAddPayload, kind: 'division' | 'district' | 'upazila'): void {
        const row = this.assigned.find((r) => r.aorId === payload.data.aorId);
        if (!row) return;

        // Race-condition guard: refuse to add an upazila already owned by another unit.
        if (kind === 'upazila') {
            const owned = this.upazilaOwnership();
            const previous = new Set(row.upazilas.map((u) => u.id));
            const newlyAdded = payload.ids.filter((id) => !previous.has(id));
            const conflicts = newlyAdded.filter((id) => owned.has(id));
            if (conflicts.length) {
                const names = conflicts.map((id) => this.allUpazilasPool.find((u) => u.id === id)?.name ?? String(id));
                this.messageService.add({
                    severity: 'error',
                    summary: 'Upazila already assigned',
                    detail: `${names.join(', ')} ${conflicts.length === 1 ? 'is' : 'are'} already assigned to another unit`,
                    life: 6000
                });
                this.loadAssigned(this.form.value.rabUnitId as number);
                return;
            }
        }

        let divIds = row.divisions.map((d) => d.id);
        let distIds = row.districts.map((d) => d.id);
        let upaIds = row.upazilas.map((u) => u.id);

        if (kind === 'division') divIds = [...payload.ids];
        else if (kind === 'district') distIds = [...payload.ids];
        else upaIds = [...payload.ids];

        const user = this.shareService.getCurrentUser() ?? 'System';
        const now = this.shareService.getCurrentDateTime();
        const rabUnitId = this.form.value.rabUnitId as number;

        this.master
            .updateRABUnitAOR({
                aorId: row.aorId,
                rabUnitId,
                divisionIds: this.toCsv(divIds),
                districtIds: this.toCsv(distIds),
                upazilaIds: this.toCsv(upaIds),
                locationOfBattalionHQ: row.locationEN ?? null,
                locationOfBattalionHQBangla: row.locationBN ?? null,
                numberOfCamp: row.numberOfCamp ?? null,
                nameOfCamps: row.nameOfCamps ?? null,
                identificationColor: row.color ?? null,
                status: row.isActive,
                createdBy: user,
                createdDate: now,
                lastUpdatedBy: user,
                lastupdate: now
            })
            .subscribe({
                next: (res) => {
                    if (res?.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Saved', detail: `${kind}s updated` });
                        this.loadAssigned(rabUnitId);
                        this.loadAllAors();
                    } else {
                        this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Update failed' });
                    }
                },
                error: (err) => {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.description ?? err?.message ?? 'Failed to update'
                    });
                }
            });
    }

    onCardView(): void {
        this._router.navigate(['/basic-setup/rab-unit-aor-map']);
    }

    /** Populate the form with the clicked AOR's values and scroll to the top. */
    onCardEdit(row: AorCardData): void {
        const divisionIds = row.divisions.map((d) => d.id);
        const districtIds = row.districts.map((d) => d.id);
        const upazilaIds = row.upazilas.map((u) => u.id);

        // Refresh dependent option lists so the multiselects render with selections.
        if (divisionIds.length) this.loadDistrictsForDivisions(divisionIds);
        if (districtIds.length) this.loadUpazilasForDistricts(districtIds);

        this.form.patchValue(
            {
                divisionIds,
                districtIds,
                upazilaIds,
                locationOfBattalionHQ: row.locationEN ?? null,
                locationOfBattalionHQBangla: row.locationBN ?? null,
                numberOfCamp: row.numberOfCamp ?? null,
                nameOfCamps: row.nameOfCamps ?? null,
                identificationColor: row.color ?? null
            },
            { emitEvent: false }
        );

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    onCardSetDivisions(payload: AorAddPayload): void {
        this.setOnAor(payload, 'division');
    }
    onCardSetDistricts(payload: AorAddPayload): void {
        this.setOnAor(payload, 'district');
    }
    onCardSetUpazilas(payload: AorAddPayload): void {
        this.setOnAor(payload, 'upazila');
    }

    onLockedUpazilaClick(evt: { id: number; name: string; reason: string }): void {
        this.messageService.add({
            severity: 'info',
            summary: 'Already assigned',
            detail: `${evt.name}: ${evt.reason}`,
            life: 4000
        });
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
                                        this.assigned = list.map((r) => this.buildAssignedRow(r, rabUnitId, divisionMap, districtMap, upazilaMap));
                                        // Populate form with first record for editing
                                        const first = list[0];
                                        if (first && this.form.value.rabUnitId === rabUnitId) {
                                            this.form.patchValue({
                                                divisionIds: this.csvToIds(first.divisionIds ?? first.DivisionIds),
                                                districtIds: this.csvToIds(first.districtIds ?? first.DistrictIds),
                                                upazilaIds: this.csvToIds(first.upazilaIds ?? first.UpazilaIds),
                                                locationOfBattalionHQ: first.locationOfBattalionHQ ?? first.LocationOfBattalionHQ ?? null,
                                                locationOfBattalionHQBangla: first.locationOfBattalionHQBangla ?? first.LocationOfBattalionHQBangla ?? null,
                                                numberOfCamp: first.numberOfCamp ?? first.NumberOfCamp ?? null,
                                                nameOfCamps: first.nameOfCamps ?? first.NameOfCamps ?? null,
                                                identificationColor: first.identificationColor ?? first.IdentificationColor ?? null
                                            }, { emitEvent: false });
                                            this.loadDistrictsForDivisions(this.csvToIds(first.divisionIds ?? first.DivisionIds));
                                            this.loadUpazilasForDistricts(this.csvToIds(first.districtIds ?? first.DistrictIds));
                                        }
                                        this.assignedLoading = false;
                                    },
                                    error: (err: any) => {
                                        this.assigned = list.map((r) => this.buildAssignedRow(r, rabUnitId, {}, {}, {}));
                                        this.assignedLoading = false;
                                    }
                                });
                            },
                            error: (err: any) => {
                                this.assigned = list.map((r) => this.buildAssignedRow(r, rabUnitId, {}, {}, {}));
                                this.assignedLoading = false;
                            }
                        });
                    },
                    error: (err: any) => {
                        this.assigned = list.map((r) => this.buildAssignedRow(r, rabUnitId, {}, {}, {}));
                        this.assignedLoading = false;
                    }
                });
            },
            error: (err: any) => {
                this.assigned = [];
                this.assignedLoading = false;
            }
        });
    }

    removeAssignment(row: AssignedRow, event: Event): void {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: `Remove this Area of Responsibility from ${row.unitName}?`,
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
                            this.loadAllAors();
                        } else {
                            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: res?.description ?? 'Remove failed' });
                        }
                    },
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to remove assignment' });
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
            locationOfBattalionHQBangla: null,
            numberOfCamp: null,
            nameOfCamps: null,
            identificationColor: null
        });
        this.districtOptions = [];
        this.upazilaOptions = [];
    }
}

