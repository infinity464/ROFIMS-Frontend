import { Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
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
        <div class="otf" (click)="$event.stopPropagation()">
            <!-- Toggle: More Filters / Hide Filters -->
            <button type="button" class="otf-toggle" [class.open]="expanded" [class.active]="resolvedCodeId != null"
                    (click)="toggle()">
                <i class="pi pi-sliders-h"></i>
                <span>{{ expanded ? 'Hide Filters' : 'More Filters' }}</span>
                @if (resolvedCodeId != null) { <span class="otf-badge">1</span> }
                <i class="pi pi-chevron-down otf-chev" [class.open]="expanded"></i>
            </button>

            <!-- Collapsible body (animated max-height) -->
            <div class="otf-body" [class.open]="expanded">
                <div class="otf-sep"></div>
                <div class="otf-row">
                    @for (lv of levels; track $index) {
                        @if ($index === 0 || lv.options.length > 0) {
                            <div class="otf-field">
                                <div class="otf-label">{{ lv.label }}</div>
                                <p-select
                                    [options]="lv.options"
                                    [(ngModel)]="lv.selectedId"
                                    optionLabel="label"
                                    optionValue="codeId"
                                    [showClear]="true"
                                    [filter]="true"
                                    filterBy="label"
                                    placeholder="All"
                                    appendTo="body"
                                    (ngModelChange)="onChange($index)"
                                    [style]="{ minWidth: '155px' }">
                                </p-select>
                            </div>
                        }
                    }
                </div>
                @if (resolvedCodeId != null) {
                    <div class="otf-sep"></div>
                    <div class="otf-controls">
                        <span class="otf-spacer"></span>
                        <button type="button" class="otf-clear" (click)="clear()">
                            <i class="pi pi-times"></i> Clear filters
                        </button>
                    </div>
                }
            </div>
        </div>
    `,
    styles: [`
        .otf { display: block; width: 100%; }

        .otf-toggle {
            display: inline-flex; align-items: center; gap: 0.4rem; height: 2.3rem; padding: 0 0.85rem;
            border: 1px solid var(--surface-border, #e2e8f0); border-radius: 8px;
            background: var(--surface-card, #fff); color: var(--text-color, #334155);
            cursor: pointer; font-size: 0.85rem; font-weight: 500; white-space: nowrap;
            transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .otf-toggle:hover { background: var(--surface-hover, #f1f5f9); }
        .otf-toggle.active,
        .otf-toggle.open { border-color: var(--primary-color, #3b82f6); color: var(--primary-color, #3b82f6); background: var(--highlight-bg, rgba(59,130,246,0.08)); }
        .otf-toggle .pi-sliders-h { font-size: 0.85rem; }
        .otf-chev { font-size: 0.7rem; transition: transform 0.2s; }
        .otf-chev.open { transform: rotate(180deg); }
        .otf-badge {
            display: inline-flex; align-items: center; justify-content: center; min-width: 1.1rem; height: 1.1rem;
            padding: 0 0.25rem; border-radius: 999px; background: var(--primary-color, #3b82f6); color: #fff;
            font-size: 0.68rem; font-weight: 700;
        }

        .otf-body {
            overflow: hidden; max-height: 0; opacity: 0; margin-top: 0;
            transition: max-height 0.28s ease, opacity 0.22s ease, margin-top 0.22s ease;
        }
        .otf-body.open { max-height: 500px; opacity: 1; margin-top: 0.25rem; }

        .otf-sep { height: 1px; background: var(--surface-border, #e2e8f0); margin: 0.7rem 0; }
        .otf-row { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 0.7rem; }
        .otf-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .otf-label {
            font-size: 0.68rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
            color: var(--text-color-secondary, #64748b);
        }

        .otf-controls { display: flex; align-items: center; gap: 0.75rem; }
        .otf-spacer { flex: 1; }
        .otf-clear {
            display: inline-flex; align-items: center; gap: 0.35rem; height: 2rem; padding: 0 0.8rem;
            border: 1px solid var(--surface-border, #e2e8f0); border-radius: 6px;
            background: var(--surface-card, #fff); color: var(--text-color-secondary, #64748b);
            cursor: pointer; font-size: 0.78rem; transition: color 0.12s, border-color 0.12s;
        }
        .otf-clear:hover { color: var(--text-color, #334155); border-color: var(--text-color-secondary, #94a3b8); }
        .otf-clear .pi-times { font-size: 0.72rem; }
    `]
})
export class OrgTreeFilterComponent implements OnInit {
    /** Emits the deepest selected node id + its label, or {null,null} when cleared. */
    @Output() filterChange = new EventEmitter<{ codeId: number | null; label: string | null }>();

    /** Panel open/closed — collapsed by default behind the "Add filter" button. */
    expanded = false;

    private masterBasicSetup = inject(MasterBasicSetupService);

    toggle(): void { this.expanded = !this.expanded; }

    /**
     * Close the panel when the user clicks outside it — but NOT when the click
     * lands inside a PrimeNG dropdown overlay (which is appended to <body>, so it
     * sits outside this component's DOM and would otherwise collapse the panel).
     */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('.p-select-overlay, .p-dropdown-panel, .p-overlay, .p-select-items-wrapper, .p-multiselect-overlay')) {
            return;
        }
        this.expanded = false;
    }

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

    /**
     * Full selected path joined with " › " (e.g. "RAB HQ › Admin & Finance Wing ›
     * General Br › General Br HQ"), so the print/scope line shows EVERY chosen
     * level — not just the deepest. Null when nothing is selected.
     */
    get resolvedLabel(): string | null {
        const parts = this.levels
            .filter(lv => lv.selectedId != null)
            .map(lv => lv.options.find(o => o.codeId === lv.selectedId)?.label ?? '')
            .filter(s => s.length > 0);
        return parts.length ? parts.join(' › ') : null;
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
