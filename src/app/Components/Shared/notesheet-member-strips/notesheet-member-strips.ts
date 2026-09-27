import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import type { MemberRow } from '@/Components/Features/notesheet-generate/notesheet-generate';

interface StripField {
    label: string;
    value: string;
}

/**
 * Compact list of note-sheet members — one strip per member, styled like the employee-search result
 * chip (Name · Rank · Mother Org · Mother Unit · RAB Unit). Shown instead of the editable members table
 * when a General note sheet hides its table, so it stays clear which members are linked.
 */
@Component({
    selector: 'app-notesheet-member-strips',
    standalone: true,
    imports: [ButtonModule, TooltipModule],
    template: `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            @for (m of members; track m.employeeId; let i = $index) {
                <div class="flex align-items-center gap-2">
                    <div
                        class="flex align-items-stretch flex-wrap flex-1"
                        style="min-width: 0; border: 1px solid var(--primary-color); border-radius: 0.85rem; background: var(--primary-50, rgba(16,185,129,0.06)); overflow: hidden;">
                        <div
                            class="flex align-items-center px-3 py-2 text-sm font-semibold"
                            style="color: var(--primary-color); border-right: 1px solid var(--surface-border, rgba(0,0,0,0.08));">
                            {{ i + 1 }}
                        </div>
                        @for (f of fieldsFor(m); track f.label; let first = $first) {
                            <div
                                class="flex align-items-center gap-2 px-3 py-2"
                                [style.border-left]="first ? 'none' : '1px solid var(--surface-border, rgba(0,0,0,0.08))'">
                                <span class="text-sm" style="color: var(--text-color-secondary, #6b7280);">{{ f.label }}:</span>
                                <span class="text-sm font-semibold text-900">{{ f.value }}</span>
                            </div>
                        }
                    </div>
                    @if (removable) {
                        <p-button
                            icon="pi pi-trash"
                            [rounded]="true"
                            [text]="true"
                            severity="danger"
                            size="small"
                            pTooltip="Remove member"
                            tooltipPosition="top"
                            (onClick)="removeMember.emit(i)" />
                    }
                </div>
            }
        </div>
    `
})
export class NotesheetMemberStripsComponent {
    @Input() members: MemberRow[] = [];
    /** Show values in Bangla (falls back to English when the Bangla value is empty). */
    @Input() bangla = false;
    @Input() removable = true;
    /** Emits the index of the member to remove. */
    @Output() removeMember = new EventEmitter<number>();

    fieldsFor(m: MemberRow): StripField[] {
        const v = m.values ?? {};
        const pick = (en: string, bn: string) => (this.bangla ? v[bn] || v[en] : v[en] || v[bn]) || 'N/A';
        // Prefer the full present-unit path (generate page) over the short unit name (older rows / preview adds).
        const rabUnit = this.bangla
            ? v['presentRabUnitBN'] || v['rabUnitBN'] || v['presentRabUnit'] || v['rabUnit']
            : v['presentRabUnit'] || v['rabUnit'] || v['presentRabUnitBN'] || v['rabUnitBN'];
        return [
            { label: 'Name', value: pick('nameEnglish', 'nameBN') },
            { label: 'Rank', value: pick('armyRank', 'armyRankBN') },
            { label: 'Mother Org', value: pick('motherOrganization', 'motherOrganizationBN') },
            { label: 'Mother Unit', value: pick('motherUnit', 'motherUnitBN') },
            { label: 'SRB Unit', value: rabUnit || 'N/A' }
        ];
    }
}
