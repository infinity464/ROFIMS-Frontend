import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';

interface FilterLevel {
    /** English label shown above the dropdown (filter stays English regardless of report lang). */
    label: string;
    options: { codeId: number; label: string }[];
    selectedId: number | null;
}

/**
 * Reusable cascading RAB org-tree filter: Unit → Wing → Branch → Sub-Branch →
 * Section → Sub-Section. Emits the deepest selected node id (or null) whenever
 * the selection changes. Drop into any statistics report's filter bar.
 */
@Component({
    selector: 'app-org-tree-filter',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule],
    template: `
        <div class="org-tree-filter">
            @for (lv of levels; track $index) {
                @if ($index === 0 || lv.options.length > 0) {
                    <div class="otf-field">
                        <label class="otf-label">{{ lv.label }}</label>
                        <p-select
                            [options]="lv.options"
                            [(ngModel)]="lv.selectedId"
                            optionLabel="label"
                            optionValue="codeId"
                            [showClear]="true"
                            [filter]="true"
                            filterBy="label"
                            placeholder="All"
                            (ngModelChange)="onChange($index)"
                            [style]="{ minWidth: '160px' }">
                        </p-select>
                    </div>
                }
            }
            @if (resolvedCodeId != null) {
                <button type="button" class="otf-clear" (click)="clear()">
                    <i class="pi pi-times" style="font-size:0.7rem"></i> Clear
                </button>
            }
        </div>
    `,
    styles: [`
        .org-tree-filter { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.6rem; }
        .otf-field { display: flex; flex-direction: column; gap: 0.2rem; }
        .otf-label { font-size: 0.7rem; font-weight: 600; color: var(--text-color-secondary, #64748b); }
        .otf-clear {
            display: inline-flex; align-items: center; gap: 0.3rem; height: 2.1rem; padding: 0 0.7rem;
            border: 1px solid var(--surface-border, #e2e8f0); border-radius: 6px;
            background: var(--surface-card, #fff); color: var(--text-color-secondary, #64748b);
            cursor: pointer; font-size: 0.78rem;
        }
        .otf-clear:hover { background: var(--surface-hover, #f1f5f9); }
    `]
})
export class OrgTreeFilterComponent implements OnInit {
    /** Emits the deepest selected node id + its label, or {null,null} when cleared. */
    @Output() filterChange = new EventEmitter<{ codeId: number | null; label: string | null }>();

    private masterBasicSetup = inject(MasterBasicSetupService);

    levels: FilterLevel[] = [
        { label: 'Unit',        options: [], selectedId: null },
        { label: 'Wing',        options: [], selectedId: null },
        { label: 'Branch',      options: [], selectedId: null },
        { label: 'Sub-Branch',  options: [], selectedId: null },
        { label: 'Section',     options: [], selectedId: null },
        { label: 'Sub-Section', options: [], selectedId: null }
    ];

    get resolvedCodeId(): number | null {
        for (let i = this.levels.length - 1; i >= 0; i--) {
            if (this.levels[i].selectedId != null) return this.levels[i].selectedId;
        }
        return null;
    }

    /** Label of the deepest selected node (for the caller's print/scope line). */
    get resolvedLabel(): string | null {
        for (let i = this.levels.length - 1; i >= 0; i--) {
            const lv = this.levels[i];
            if (lv.selectedId != null) {
                return lv.options.find((o) => o.codeId === lv.selectedId)?.label ?? null;
            }
        }
        return null;
    }

    ngOnInit(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (items) => {
                this.levels[0].options = (items ?? []).map((c: CommonCode) => ({
                    codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId)
                }));
            }
        });
    }

    onChange(levelIndex: number): void {
        for (let i = levelIndex + 1; i < this.levels.length; i++) {
            this.levels[i].selectedId = null;
            this.levels[i].options = [];
        }
        const selectedId = this.levels[levelIndex].selectedId;
        const child = this.levels[levelIndex + 1];
        if (selectedId != null && child) {
            this.masterBasicSetup.getByParentId(selectedId).subscribe({
                next: (items) => {
                    child.options = (items ?? []).map((c: CommonCode) => ({
                        codeId: c.codeId, label: c.codeValueEN ?? String(c.codeId)
                    }));
                }
            });
        }
        this.filterChange.emit({ codeId: this.resolvedCodeId, label: this.resolvedLabel });
    }

    clear(): void {
        for (let i = 0; i < this.levels.length; i++) {
            this.levels[i].selectedId = null;
            if (i > 0) this.levels[i].options = [];
        }
        this.filterChange.emit({ codeId: null, label: null });
    }
}
