import { Component, EventEmitter, Input, OnInit, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';

export interface MembersColumnDef {
    key: string;
    label: string;
    group?: string;
    mergedFrom?: { keys: string[]; separator: string };
    width?: number;
}

/** Bangla header text per column key (EN + BN variants map to one Bangla
 *  label). Falls back to the configured English label when not listed. */
const COL_HEADER_BN: Record<string, string> = {
    serviceId: 'সার্ভিস আইডি', rabId: 'এসআরবি আইডি', prefixWithServiceId: 'সার্ভিস আইডি', prefixWithServiceIdBN: 'সার্ভিস আইডি',
    nameEnglish: 'নাম', nameBN: 'নাম',
    armyRank: 'পদবি', armyRankBN: 'পদবি',
    corps: 'কোর', corpsBN: 'কোর',
    trade: 'ট্রেড', tradeBN: 'ট্রেড', tradeRemarks: 'ট্রেড মন্তব্য',
    motherOrganization: 'মূল সংস্থা', motherOrganizationBN: 'মূল সংস্থা',
    motherUnit: 'মাতৃ ইউনিট', motherUnitBN: 'মাতৃ ইউনিট',
    memberType: 'সদস্য ধরন', memberTypeBN: 'সদস্য ধরন',
    appointment: 'নিয়োগ', appointmentBN: 'নিয়োগ',
    joiningDate: 'যোগদানের তারিখ',
    rabUnit: 'এসআরবি ইউনিট', rabUnitBN: 'এসআরবি ইউনিট',
    gender: 'লিঙ্গ', genderBN: 'লিঙ্গ',
    batch: 'ব্যাচ', batchBN: 'ব্যাচ',
    postingStatus: 'পোস্টিং অবস্থা',
    permanentDistrictTypeName: 'স্থায়ী জেলা', permanentDistrictTypeNameBN: 'স্থায়ী জেলা',
    prefix: 'উপসর্গ', prefixBN: 'উপসর্গ',
};

/** Column header — Bangla when the document is Bangla, English label otherwise. */
export function membersColHeader(col: MembersColumnDef, isBangla: boolean): string {
    if (!isBangla) return col.label;
    return COL_HEADER_BN[col.key] ?? col.label;
}

/** A column's relative width: a width set on the page (by key) wins over the one saved
 *  with the column; neither → an even share of 90 (SL takes its own fixed 35px). */
export function membersColWidth(col: MembersColumnDef, colCount: number, overrides?: Record<string, number> | null): number {
    const override = overrides?.[col.key];
    if (override != null) return override;
    if (col.width) return col.width;
    if (colCount === 0) return 100;
    return Math.round(((100 - 10) / colCount) * 10) / 10;
}

@Component({
    selector: 'app-notesheet-members-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './notesheet-members-table.html',
    styleUrl: './notesheet-members-table.scss'
})
export class NotesheetMembersTableComponent implements OnInit, OnChanges, OnDestroy {
    private http = inject(HttpClient);

    @Input() noteSheetId: number | null = null;
    /** Office order generated without a note sheet — its members live on the order itself.
     *  Used only when noteSheetId is empty. */
    @Input() officeOrderId: number | null = null;
    @Input() isBangla = false;
    /** Column widths set by the host page, by column key — they win over the saved ones. */
    @Input() widthOverrides: Record<string, number> | null = null;
    /** Show a drag handle on each header's right edge; a drag emits columnResize. */
    @Input() resizable = false;

    /** The column set, once loaded (empty when there are no members). */
    @Output() columnsLoaded = new EventEmitter<MembersColumnDef[]>();
    /** New relative width for a column, while its header edge is being dragged. */
    @Output() columnResize = new EventEmitter<{ key: string; width: number }>();

    columns: MembersColumnDef[] = [];
    rows: Record<string, string>[] = [];
    loading = false;

    ngOnInit(): void {
        this.loadMembers();
    }

    ngOnChanges(changes: SimpleChanges): void {
        const changed = ['noteSheetId', 'officeOrderId'].some(k => changes[k] && !changes[k].firstChange);
        if (changed) {
            this.loadMembers();
        }
    }

    private loadMembers(): void {
        const api = this.noteSheetId
            ? `${environment.apis.core}/NoteSheetReferenceEmployee/GetByNoteSheetId/${this.noteSheetId}`
            : this.officeOrderId
                ? `${environment.apis.core}/OfficeOrder/GetOfficeOrderMembers/${this.officeOrderId}`
                : null;
        if (!api) return;
        this.loading = true;
        this.http.get<any[]>(api).subscribe({
            next: (list) => {
                const filtered = (Array.isArray(list) ? list : []).filter(r => r.informationJson || r.InformationJson);
                if (filtered.length > 0) {
                    try {
                        const firstParsed = JSON.parse(filtered[0].informationJson || filtered[0].InformationJson);
                        this.columns = Array.isArray(firstParsed.columns) ? firstParsed.columns : [];
                        this.rows = filtered.map(r => {
                            const parsed = JSON.parse(r.informationJson || r.InformationJson);
                            return parsed.values ?? {};
                        });
                    } catch {
                        this.columns = [];
                        this.rows = [];
                    }
                } else {
                    this.columns = [];
                    this.rows = [];
                }
                this.loading = false;
                this.columnsLoaded.emit(this.columns);
            },
            error: () => {
                this.loading = false;
                this.columns = [];
                this.rows = [];
                this.columnsLoaded.emit(this.columns);
            }
        });
    }

    ngOnDestroy(): void {
        this.endResize();
    }

    // ── Header drag-resize ────────────────────────────────
    // Widths are relative, so the drag is converted with the header's own px-per-unit
    // ratio taken at mousedown; that keeps the edge close to the cursor whatever the
    // widths add up to.
    private drag: { key: string; startX: number; startWidth: number; unitsPerPx: number } | null = null;
    private readonly onResizeMove = (event: MouseEvent): void => {
        if (!this.drag) return;
        const width = this.drag.startWidth + (event.clientX - this.drag.startX) * this.drag.unitsPerPx;
        this.columnResize.emit({ key: this.drag.key, width: Math.max(3, Math.min(80, Math.round(width * 10) / 10)) });
    };
    private readonly onResizeUp = (): void => this.endResize();

    startResize(col: MembersColumnDef, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        const th = (event.target as HTMLElement).closest('th');
        const startWidth = this.getColWidth(col);
        this.drag = { key: col.key, startX: event.clientX, startWidth, unitsPerPx: startWidth / (th?.offsetWidth || 1) };
        document.addEventListener('mousemove', this.onResizeMove);
        document.addEventListener('mouseup', this.onResizeUp);
    }

    private endResize(): void {
        this.drag = null;
        document.removeEventListener('mousemove', this.onResizeMove);
        document.removeEventListener('mouseup', this.onResizeUp);
    }

    memberSerial(index: number): string {
        const n = index + 1;
        if (!this.isBangla) return String(n);
        return this.toBanglaDigits(String(n));
    }

    formatCell(row: Record<string, string>, col: MembersColumnDef): string {
        let val: string;
        if (col.mergedFrom?.keys?.length) {
            val = col.mergedFrom.keys.map(k => row[k] || '').filter(Boolean).join(col.mergedFrom.separator ?? ' ');
        } else {
            val = row[col.key] || '';
        }
        if (!val) return '';
        if (this.isBangla && /\d/.test(val)) {
            val = this.toBanglaDigits(val);
        }
        return val;
    }

    getColHeader(col: MembersColumnDef): string {
        return membersColHeader(col, this.isBangla);
    }

    getColWidth(col: MembersColumnDef): number {
        return membersColWidth(col, this.columns.length, this.widthOverrides);
    }

    private toBanglaDigits(s: string): string {
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return s.replace(/\d/g, d => bn[+d]);
    }
}
