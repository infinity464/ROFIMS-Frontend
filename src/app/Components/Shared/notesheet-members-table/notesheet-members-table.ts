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

    /** Bangla header text per column key (EN + BN variants map to one Bangla
     *  label). Falls back to the configured English label when not listed. */
    private readonly colHeaderBN: Record<string, string> = {
        serviceId: 'সার্ভিস আইডি', rabId: 'র‍্যাব আইডি', prefixWithServiceId: 'সার্ভিস আইডি', prefixWithServiceIdBN: 'সার্ভিস আইডি',
        nameEnglish: 'নাম', nameBN: 'নাম',
        armyRank: 'পদবি', armyRankBN: 'পদবি',
        corps: 'কোর', corpsBN: 'কোর',
        trade: 'ট্রেড', tradeBN: 'ট্রেড', tradeRemarks: 'ট্রেড মন্তব্য',
        motherOrganization: 'মূল সংস্থা', motherOrganizationBN: 'মূল সংস্থা',
        motherUnit: 'মাতৃ ইউনিট', motherUnitBN: 'মাতৃ ইউনিট',
        memberType: 'সদস্য ধরন', memberTypeBN: 'সদস্য ধরন',
        appointment: 'নিয়োগ', appointmentBN: 'নিয়োগ',
        joiningDate: 'যোগদানের তারিখ',
        rabUnit: 'র‍্যাব ইউনিট', rabUnitBN: 'র‍্যাব ইউনিট',
        gender: 'লিঙ্গ', genderBN: 'লিঙ্গ',
        batch: 'ব্যাচ', batchBN: 'ব্যাচ',
        postingStatus: 'পোস্টিং অবস্থা',
        permanentDistrictTypeName: 'স্থায়ী জেলা', permanentDistrictTypeNameBN: 'স্থায়ী জেলা',
        prefix: 'উপসর্গ', prefixBN: 'উপসর্গ',
    };

    /** Column header — Bangla when the document is Bangla, English label otherwise. */
    getColHeader(col: MembersColumnDef): string {
        if (!this.isBangla) return col.label;
        return this.colHeaderBN[col.key] ?? col.label;
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
