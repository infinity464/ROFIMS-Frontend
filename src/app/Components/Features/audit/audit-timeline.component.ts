import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuditService, AuditLogDto, AuditAction, AuditFilter } from './audit.service';
import { friendlyField, friendlyTable } from './audit.mappings';

interface DiffEntry {
    field: string;
    oldVal: string;
    newVal: string;
}

/** A single timeline row enriched with parsed, display-ready data. */
interface AuditRow extends AuditLogDto {
    expanded: boolean;
    friendlyTableName: string;
    summary: string;
    diffs: DiffEntry[];
}

const EMPTY = '—'; // em dash

@Component({
    selector: 'app-audit-timeline',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        SelectModule,
        InputTextModule,
        DatePickerModule,
        ButtonModule,
        PaginatorModule,
        TooltipModule,
        ProgressSpinnerModule,
    ],
    templateUrl: './audit-timeline.component.html',
    styleUrls: ['./audit-timeline.component.scss'],
})
export class AuditTimelineComponent implements OnInit {
    private audit = inject(AuditService);

    // ── State ────────────────────────────────────────────────────────
    rows = signal<AuditRow[]>([]);
    total = signal(0);
    loading = signal(false);
    error = signal<string | null>(null);

    // ── Filters ──────────────────────────────────────────────────────
    tableOptions = signal<{ label: string; value: string | null }[]>([{ label: 'All tables', value: null }]);
    actionOptions = [
        { label: 'All actions', value: null },
        { label: 'Created', value: 'Created' },
        { label: 'Updated', value: 'Updated' },
        { label: 'Deleted', value: 'Deleted' },
    ];

    selectedTable: string | null = null;
    selectedAction: AuditAction | null = null;
    userText = '';
    dateRange: Date[] | null = null;

    // ── Pagination ───────────────────────────────────────────────────
    page = 1;
    pageSize = 20;
    first = 0;

    hasRows = computed(() => this.rows().length > 0);

    ngOnInit(): void {
        this.loadTables();
        this.load();
    }

    private loadTables(): void {
        this.audit.tables().subscribe({
            next: (names) => {
                this.tableOptions.set([
                    { label: 'All tables', value: null },
                    ...names.map((n) => ({ label: friendlyTable(n), value: n })),
                ]);
            },
            error: () => { /* dropdown stays at "All tables" - non-fatal */ },
        });
    }

    load(): void {
        this.loading.set(true);
        this.error.set(null);

        const [from, to] = this.dateRange ?? [];
        const filter: AuditFilter = {
            tableName: this.selectedTable,
            action: this.selectedAction,
            userName: this.userText?.trim() || null,
            fromUtc: from ? new Date(from).toISOString() : null,
            toUtc: to ? this.endOfDay(to).toISOString() : null,
            page: this.page,
            pageSize: this.pageSize,
        };

        this.audit.query(filter).subscribe({
            next: (res) => {
                this.rows.set(res.items.map((i) => this.toRow(i)));
                this.total.set(res.total);
                this.loading.set(false);
            },
            error: () => {
                this.error.set('Could not load the audit log. Please try again.');
                this.loading.set(false);
            },
        });
    }

    applyFilters(): void {
        this.page = 1;
        this.first = 0;
        this.load();
    }

    resetFilters(): void {
        this.selectedTable = null;
        this.selectedAction = null;
        this.userText = '';
        this.dateRange = null;
        this.applyFilters();
    }

    onPage(e: PaginatorState): void {
        this.first = e.first ?? 0;
        this.pageSize = e.rows ?? this.pageSize;
        this.page = Math.floor(this.first / this.pageSize) + 1;
        this.load();
    }

    toggle(row: AuditRow): void {
        row.expanded = !row.expanded;
    }

    badgeClass(action: AuditAction): string {
        switch (action) {
            case 'Created': return 'audit-badge audit-badge--created';
            case 'Updated': return 'audit-badge audit-badge--updated';
            case 'Deleted': return 'audit-badge audit-badge--deleted';
            default: return 'audit-badge';
        }
    }

    /**
     * Parses a backend timestamp as UTC. TimestampUtc is stored as DateTime.UtcNow but is
     * serialized without a 'Z'/offset, so a bare `new Date(s)` would (wrongly) read it as local
     * time and shift it by the local UTC offset (e.g. +6h in Asia/Dhaka). Append 'Z' when the
     * string carries no timezone designator so it is interpreted as UTC.
     */
    private toUtcDate(iso: string): Date {
        if (!iso) return new Date(NaN);
        const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
        return new Date(hasTz ? iso : `${iso}Z`);
    }

    relativeTime(iso: string): string {
        const then = this.toUtcDate(iso).getTime();
        const diff = Date.now() - then;
        if (Number.isNaN(then)) return '';
        const sec = Math.round(diff / 1000);
        if (sec < 45) return 'just now';
        const min = Math.round(sec / 60);
        if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
        const hr = Math.round(min / 60);
        if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
        const day = Math.round(hr / 24);
        if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
        const mon = Math.round(day / 30);
        if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`;
        const yr = Math.round(mon / 12);
        return `${yr} year${yr === 1 ? '' : 's'} ago`;
    }

    exactTime(iso: string): string {
        const d = this.toUtcDate(iso);
        return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
    }

    // ── Parsing / formatting ─────────────────────────────────────────

    private toRow(dto: AuditLogDto): AuditRow {
        const diffs = this.buildDiffs(dto);
        return {
            ...dto,
            expanded: false,
            friendlyTableName: friendlyTable(dto.tableName),
            summary: this.buildSummary(dto, diffs),
            diffs,
        };
    }

    private buildDiffs(dto: AuditLogDto): DiffEntry[] {
        const oldObj = this.parse(dto.oldValues);
        const newObj = this.parse(dto.newValues);
        const changed = this.parseArray(dto.changedColumns);

        // Column set: explicit changedColumns if present, else union of old/new keys.
        const cols = changed.length
            ? changed
            : Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})]));

        return cols.map((col) => ({
            field: friendlyField(col),
            oldVal: this.format(oldObj?.[col]),
            newVal: this.format(newObj?.[col]),
        }));
    }

    private buildSummary(dto: AuditLogDto, diffs: DiffEntry[]): string {
        const who = dto.userName?.trim() || 'Someone';
        const what = friendlyTable(dto.tableName);

        if (dto.action === 'Created') return `${who} created ${what}`;
        if (dto.action === 'Deleted') return `${who} deleted ${what}`;

        // Updated
        if (diffs.length === 1) {
            const d = diffs[0];
            return `${who} updated ${d.field} from ${d.oldVal} to ${d.newVal}`;
        }
        return `${who} updated ${diffs.length} field${diffs.length === 1 ? '' : 's'}`;
    }

    private parse(json: string | null): Record<string, any> | null {
        if (!json) return null;
        try { return JSON.parse(json); } catch { return null; }
    }

    private parseArray(json: string | null): string[] {
        if (!json) return [];
        try {
            const v = JSON.parse(json);
            return Array.isArray(v) ? v.map(String) : [];
        } catch { return []; }
    }

    private format(value: any): string {
        if (value === null || value === undefined || value === '') return EMPTY;
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (typeof value === 'object') {
            // Never surface raw JSON; collapse to a neutral marker.
            return Array.isArray(value) ? `${value.length} item(s)` : '(details)';
        }
        return String(value);
    }

    private endOfDay(d: Date): Date {
        const e = new Date(d);
        e.setHours(23, 59, 59, 999);
        return e;
    }
}
