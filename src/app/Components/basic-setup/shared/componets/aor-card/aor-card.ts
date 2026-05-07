import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

export interface AorCardData {
    aorId: number;
    unitName: string;
    /** Identification color hex (e.g. "#8c3a1f"). Used for avatar tint and accent border. */
    color?: string | null;
    isActive: boolean;
    /** Battalion HQ — English. */
    locationEN?: string | null;
    /** Battalion HQ — Bangla. */
    locationBN?: string | null;
    divisions: string[];
    districts: string[];
    upazilas: string[];
    numberOfCamp?: number | null;
    /** Free-form camp names list (display as a comma-joined string for now). */
    nameOfCamps?: string | null;
}

@Component({
    selector: 'app-aor-card',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    templateUrl: './aor-card.html',
    styleUrls: ['./aor-card.scss']
})
export class AorCardComponent {
    @Input({ required: true }) data!: AorCardData;
    @Input() chipPreviewLimit = 8;
    @Input() canDelete = true;
    @Input() canUpdate = true;

    @Output() view = new EventEmitter<AorCardData>();
    @Output() edit = new EventEmitter<AorCardData>();
    @Output() menu = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() delete = new EventEmitter<{ data: AorCardData; event: MouseEvent }>();
    @Output() addCamp = new EventEmitter<AorCardData>();

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
    preview(items: string[]): { shown: string[]; more: number } {
        const list = items ?? [];
        if (list.length <= this.chipPreviewLimit) return { shown: list, more: 0 };
        return { shown: list.slice(0, this.chipPreviewLimit), more: list.length - this.chipPreviewLimit };
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
}
