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

    @Output() view = new EventEmitter<AorCardData>();
    @Output() edit = new EventEmitter<AorCardData>();
    @Output() menu = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() delete = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() addCamp = new EventEmitter<AorCardData>();
    @Output() addDivision = new EventEmitter<AorAddPayload>();
    @Output() addDistrict = new EventEmitter<AorAddPayload>();
    @Output() addUpazila = new EventEmitter<AorAddPayload>();

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

    /** Divisions still addable to this AOR. */
    divisionsToAdd(): AorChip[] {
        const taken = new Set(this.data.divisions.map((d) => d.id));
        return (this.availableDivisions ?? []).filter((d) => !taken.has(d.id));
    }

    /**
     * Districts addable: parent division must be in this AOR (or matches the focused division
     * when one is selected via chip click), and not already added.
     */
    districtsToAdd(): AorChipWithParent[] {
        const allowedParents = this.focusedDivisionId != null
            ? new Set([this.focusedDivisionId])
            : new Set(this.data.divisions.map((d) => d.id));
        const taken = new Set(this.data.districts.map((d) => d.id));
        return (this.availableDistricts ?? []).filter((d) => allowedParents.has(d.parentId) && !taken.has(d.id));
    }

    /** Upazilas addable: parent district must be in this AOR (or focused), and not already added. */
    upazilasToAdd(): AorChipWithParent[] {
        const allowedParents = this.focusedDistrictId != null
            ? new Set([this.focusedDistrictId])
            : new Set(this.data.districts.map((d) => d.id));
        const taken = new Set(this.data.upazilas.map((u) => u.id));
        return (this.availableUpazilas ?? []).filter((u) => allowedParents.has(u.parentId) && !taken.has(u.id));
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

    toggleDivPick(id: number): void {
        if (this.divPicked.has(id)) this.divPicked.delete(id);
        else this.divPicked.add(id);
    }
    toggleDistPick(id: number): void {
        if (this.distPicked.has(id)) this.distPicked.delete(id);
        else this.distPicked.add(id);
    }
    toggleUpaPick(id: number): void {
        if (this.upaPicked.has(id)) this.upaPicked.delete(id);
        else this.upaPicked.add(id);
    }

    /** Popover (onHide) handlers: commit any picked items, then clear local state. */
    commitDivPicks(): void {
        const ids = Array.from(this.divPicked);
        this.divPicked.clear();
        this.divFilter = '';
        if (ids.length) this.addDivision.emit({ data: this.data, ids });
    }
    commitDistPicks(): void {
        const ids = Array.from(this.distPicked);
        this.distPicked.clear();
        this.distFilter = '';
        if (ids.length) this.addDistrict.emit({ data: this.data, ids });
    }
    commitUpaPicks(): void {
        const ids = Array.from(this.upaPicked);
        this.upaPicked.clear();
        this.upaFilter = '';
        if (ids.length) this.addUpazila.emit({ data: this.data, ids });
    }
}
