import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PopoverModule } from 'primeng/popover';
import { InputTextModule } from 'primeng/inputtext';

export interface AorChip {
    id: number;
    name: string;
}

export interface AorChipWithParent extends AorChip {
    /** Parent ID - divisionId for districts, districtId for upazilas. */
    parentId: number;
}

export interface AorCardData {
    aorId: number;
    unitName: string;
    /** Identification color hex (e.g. "#8c3a1f"). Used for avatar tint and accent border. */
    color?: string | null;
    isActive: boolean;
    /** Battalion HQ - English. */
    locationEN?: string | null;
    /** Battalion HQ - Bangla. */
    locationBN?: string | null;
    divisions: AorChip[];
    districts: AorChipWithParent[];
    upazilas: AorChipWithParent[];
    numberOfCamp?: number | null;
    /** Free-form camp names list (display as a comma-joined string for now). */
    nameOfCamps?: string | null;
}

export type AorAddPayload = { data: AorCardData; ids: number[] };

@Component({
    selector: 'app-aor-card',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, TagModule, PopoverModule, InputTextModule],
    templateUrl: './aor-card.html',
    styleUrls: ['./aor-card.scss']
})
export class AorCardComponent {
    @Input({ required: true }) data!: AorCardData;
    @Input() chipPreviewLimit = 8;
    @Input() canDelete = true;
    @Input() canUpdate = true;

    /** Full pool of divisions the user could pick from. */
    @Input() availableDivisions: AorChip[] = [];
    /** Full pool of districts (with their parent division id). */
    @Input() availableDistricts: AorChipWithParent[] = [];
    /** Full pool of upazilas (with their parent district id). */
    @Input() availableUpazilas: AorChipWithParent[] = [];
    /** Map: upazilaId -> reason ("Assigned to RAB-3"). Locked items render as un-toggleable. */
    @Input() lockedUpazilas: Record<number, string> = {};

    @Output() view = new EventEmitter<AorCardData>();
    @Output() edit = new EventEmitter<AorCardData>();
    @Output() menu = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() delete = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() addCamp = new EventEmitter<AorCardData>();
    /** Emitted with the final desired set of IDs for that group after the popover closes. */
    @Output() setDivisions = new EventEmitter<AorAddPayload>();
    @Output() setDistricts = new EventEmitter<AorAddPayload>();
    @Output() setUpazilas = new EventEmitter<AorAddPayload>();
    /** Fired when the user clicks a locked upazila row (already owned by another unit). */
    @Output() lockedUpazilaClick = new EventEmitter<{ id: number; name: string; reason: string }>();

    divFilter = '';
    distFilter = '';
    upaFilter = '';

    /** Items checked in each picker. Cleared after the popover closes (auto-save). */
    divPicked = new Set<number>();
    distPicked = new Set<number>();
    upaPicked = new Set<number>();

    /** Drill-down focus: when set, the districts/upazilas sections only show items under this parent. */
    focusedDivisionId: number | null = null;
    focusedDistrictId: number | null = null;

    /** First letters of the unit name; "RAB HQ" -> "HQ", "RAB-1" -> "R1". */
    get initials(): string {
        const raw = (this.data?.unitName || '').trim();
        if (!raw) return '?';
        // Try last whole word first ("RAB HQ" -> "HQ").
        const parts = raw.split(/\s+/);
        if (parts.length > 1) {
            const last = parts[parts.length - 1].replace(/[^A-Za-z0-9]/g, '');
            if (last.length >= 2) return last.slice(0, 2).toUpperCase();
        }
        // Fall back: drop common "RAB" prefix and take a couple of significant chars.
        const stripped = raw.replace(/^RAB[-_\s]*/i, '');
        if (stripped) {
            const compact = stripped.replace(/[^A-Za-z0-9]/g, '');
            if (compact) return compact.slice(0, 2).toUpperCase();
        }
        return raw.slice(0, 2).toUpperCase();
    }

    /** Returns the first N items + leftover count. */
    preview<T>(items: T[]): { shown: T[]; more: number } {
        const list = items ?? [];
        if (list.length <= this.chipPreviewLimit) return { shown: list, more: 0 };
        return { shown: list.slice(0, this.chipPreviewLimit), more: list.length - this.chipPreviewLimit };
    }

    /** All divisions shown in the picker (everything available). */
    divisionsForPicker(): AorChip[] {
        return this.availableDivisions ?? [];
    }

    /** Districts shown in the picker. Narrowed only when a division chip is focused (drill-down). */
    districtsForPicker(): AorChipWithParent[] {
        if (this.focusedDivisionId != null) {
            return (this.availableDistricts ?? []).filter((d) => d.parentId === this.focusedDivisionId);
        }
        return this.availableDistricts ?? [];
    }

    /** Upazilas shown in the picker. Narrowed only when a district chip is focused (drill-down). */
    upazilasForPicker(): AorChipWithParent[] {
        if (this.focusedDistrictId != null) {
            return (this.availableUpazilas ?? []).filter((u) => u.parentId === this.focusedDistrictId);
        }
        return this.availableUpazilas ?? [];
    }

    /**
     * Cascade-protection: only allow unchecking a parent when no child of it is currently
     * in the AOR (data, not the picker's in-flight selection — which is empty when only the
     * parent's popover is open).
     */
    canUncheckDivision(id: number): boolean {
        return !this.data.districts.some((d) => d.parentId === id);
    }
    canUncheckDistrict(id: number): boolean {
        return !this.data.upazilas.some((u) => u.parentId === id);
    }

    /** Districts shown in the chip list - filtered by focused division when set. */
    visibleDistricts(): AorChipWithParent[] {
        if (this.focusedDivisionId == null) return this.data.districts;
        return this.data.districts.filter((d) => d.parentId === this.focusedDivisionId);
    }

    /** Upazilas shown - by district when focused, else by division (transitive), else all. */
    visibleUpazilas(): AorChipWithParent[] {
        if (this.focusedDistrictId != null) {
            return this.data.upazilas.filter((u) => u.parentId === this.focusedDistrictId);
        }
        if (this.focusedDivisionId != null) {
            const distIdsInDiv = new Set(
                this.data.districts.filter((d) => d.parentId === this.focusedDivisionId).map((d) => d.id)
            );
            return this.data.upazilas.filter((u) => distIdsInDiv.has(u.parentId));
        }
        return this.data.upazilas;
    }

    /** Click a Division chip: toggle focus to filter the districts/upazilas below. */
    onDivisionClick(id: number): void {
        this.focusedDivisionId = this.focusedDivisionId === id ? null : id;
        // Reset deeper focus when changing the division.
        this.focusedDistrictId = null;
    }

    /** Click a District chip: toggle focus to filter the upazilas below. */
    onDistrictClick(id: number): void {
        this.focusedDistrictId = this.focusedDistrictId === id ? null : id;
    }

    filtered<T extends { name: string }>(list: T[], q: string): T[] {
        const term = (q || '').toLowerCase().trim();
        if (!term) return list;
        return list.filter((x) => x.name.toLowerCase().includes(term));
    }

    get hasCamps(): boolean {
        const n = this.data?.numberOfCamp ?? 0;
        const names = (this.data?.nameOfCamps ?? '').trim();
        return (n != null && n > 0) || names.length > 0;
    }

    /** Avatar background — translucent tint of the identification color so text stays readable. */
    get avatarBg(): string {
        const c = (this.data?.color || '').trim();
        if (!c) return 'var(--p-surface-200, #e5e7eb)';
        return c;
    }

    onView(): void {
        this.view.emit(this.data);
    }
    onEdit(): void {
        this.edit.emit(this.data);
    }
    onMenu(event: MouseEvent): void {
        this.menu.emit({ data: this.data, event });
    }
    onDelete(event: MouseEvent): void {
        this.delete.emit({ data: this.data, event });
    }
    onAddCamp(): void {
        this.addCamp.emit(this.data);
    }

    /** Toggle requested in the picker; blocks unchecking parents that still have children. */
    toggleDivPick(id: number): void {
        if (this.divPicked.has(id)) {
            if (!this.canUncheckDivision(id)) return; // has districts under it
            this.divPicked.delete(id);
        } else {
            this.divPicked.add(id);
        }
    }
    toggleDistPick(id: number): void {
        if (this.distPicked.has(id)) {
            if (!this.canUncheckDistrict(id)) return; // has upazilas under it
            this.distPicked.delete(id);
        } else {
            this.distPicked.add(id);
        }
    }
    isUpaLocked(id: number): boolean {
        // An upazila that's already part of THIS AOR can never be "locked" - it must be removable
        // even if the parent's ownership map mistakenly listed it (e.g. duplicate AOR rows).
        if (this.data.upazilas.some((u) => u.id === id)) return false;
        return !!this.lockedUpazilas?.[id];
    }
    upaLockReason(id: number): string {
        if (this.data.upazilas.some((u) => u.id === id)) return '';
        return this.lockedUpazilas?.[id] ?? '';
    }

    toggleUpaPick(id: number): void {
        // Locked upazilas (owned by another unit) cannot be toggled - emit a signal so the parent
        // can show the user a toast naming the owning unit.
        if (this.isUpaLocked(id)) {
            const opt = (this.availableUpazilas ?? []).find((u) => u.id === id);
            this.lockedUpazilaClick.emit({ id, name: opt?.name ?? String(id), reason: this.upaLockReason(id) });
            return;
        }
        if (this.upaPicked.has(id)) this.upaPicked.delete(id);
        else this.upaPicked.add(id);
    }

    /** Popover onShow: hydrate the picker state from the current AOR. */
    initDivPicks(): void {
        this.divPicked = new Set(this.data.divisions.map((d) => d.id));
        this.divFilter = '';
    }
    initDistPicks(): void {
        this.distPicked = new Set(this.data.districts.map((d) => d.id));
        this.distFilter = '';
    }
    initUpaPicks(): void {
        this.upaPicked = new Set(this.data.upazilas.map((u) => u.id));
        this.upaFilter = '';
    }

    /** Popover onHide: emit the final desired set if anything changed. */
    commitDivPicks(): void {
        const next = Array.from(this.divPicked).sort((a, b) => a - b);
        const prev = this.data.divisions.map((d) => d.id).sort((a, b) => a - b);
        if (next.length !== prev.length || next.some((v, i) => v !== prev[i])) {
            this.setDivisions.emit({ data: this.data, ids: next });
        }
    }
    commitDistPicks(): void {
        const next = Array.from(this.distPicked).sort((a, b) => a - b);
        const prev = this.data.districts.map((d) => d.id).sort((a, b) => a - b);
        if (next.length !== prev.length || next.some((v, i) => v !== prev[i])) {
            this.setDistricts.emit({ data: this.data, ids: next });
        }
    }
    commitUpaPicks(): void {
        const next = Array.from(this.upaPicked).sort((a, b) => a - b);
        const prev = this.data.upazilas.map((u) => u.id).sort((a, b) => a - b);
        if (next.length !== prev.length || next.some((v, i) => v !== prev[i])) {
            this.setUpazilas.emit({ data: this.data, ids: next });
        }
    }
}
