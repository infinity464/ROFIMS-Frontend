import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
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

@Component({
    selector: 'app-notesheet-members-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './notesheet-members-table.html',
    styleUrl: './notesheet-members-table.scss'
})
export class NotesheetMembersTableComponent implements OnInit, OnChanges {
    private http = inject(HttpClient);

    @Input() noteSheetId: number | null = null;
    @Input() isBangla = false;

    columns: MembersColumnDef[] = [];
    rows: Record<string, string>[] = [];
    loading = false;

    ngOnInit(): void {
        this.loadMembers();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['noteSheetId'] && !changes['noteSheetId'].firstChange) {
            this.loadMembers();
        }
    }

    private loadMembers(): void {
        if (!this.noteSheetId) return;
        this.loading = true;
        const api = `${environment.apis.core}/NoteSheetReferenceEmployee/GetByNoteSheetId/${this.noteSheetId}`;
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
            },
            error: () => {
                this.loading = false;
                this.columns = [];
                this.rows = [];
            }
        });
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

    getColWidth(col: MembersColumnDef): number {
        if (col.width) return col.width;
        if (this.columns.length === 0) return 100;
        return Math.round(((100 - 10) / this.columns.length) * 10) / 10;
    }

    private toBanglaDigits(s: string): string {
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return s.replace(/\d/g, d => bn[+d]);
    }
}
