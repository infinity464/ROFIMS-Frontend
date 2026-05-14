import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type MemberTypeWiseOrgBlock,
    type MemberTypeWiseRow,
    type MemberTypeWiseManpowerResponse
} from '@/services/statistics.service';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-member-type-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './member-type-wise-manpower.html',
    styleUrl: './member-type-wise-manpower.scss'
})
export class MemberTypeWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exportDropdownOpen = false;

    allOrgs: MemberTypeWiseOrgBlock[] = [];
    filteredOrgs: MemberTypeWiseOrgBlock[] = [];
    grandTotal: MemberTypeWiseRow = this.emptyRow();

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Options for p-multiselect */
    orgOptions: { label: string; value: number }[] = [];
    selectedOrgIds: number[] = [];

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getMemberTypeWiseManpower().subscribe({
            next: (res: MemberTypeWiseManpowerResponse) => {
                this.allOrgs = res.orgs ?? [];
                this.filteredOrgs = [...this.allOrgs];
                this.grandTotal = res.grandTotal ?? this.emptyRow();
                this.orgOptions = this.allOrgs.map(o => ({
                    label: o.orgName,
                    value: o.orgId
                }));
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
    }

    onOrgFilterChange(): void {
        if (!this.selectedOrgIds || this.selectedOrgIds.length === 0) {
            this.filteredOrgs = [...this.allOrgs];
        } else {
            this.filteredOrgs = this.allOrgs.filter(o => this.selectedOrgIds.includes(o.orgId));
        }
        this.grandTotal = this.computeGrandTotal(this.filteredOrgs);
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type === 'pdf' || type === 'print') {
            this.exportPrintPopup();
            return;
        }
        const { columns, rows } = this.getFlatExportData();
        const scope = this.scopeLine;
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filename: 'org-employee-type-wise-manpower',
            filterLines: scope ? [scope] : undefined
        };
        if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    // ── Computed labels ───────────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'ORGANIZATION & MEMBER TYPE WISE MANPOWER STATE'
            : 'বাহিনী এবং সদস্য প্রকার অনুযায়ী জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MemberTypeWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MemberTypeWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get colHeaders(): string[] {
        return this.lang === 'en'
            ? ['Ser', 'Rank', 'Auth', 'Held', 'Def', 'Sur', 'Posted Out', 'Rmks']
            : ['ক্রমিক', 'পদবী', 'প্রাধিকার', 'বিদ্যমান', 'ঘাটতি', 'অতিরিক্ত', 'পোস্টিং আউট', 'মন্তব্য'];
    }

    get subtotalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'Grand Total' : 'সর্ব মোট'; }

    orgLabel(org: MemberTypeWiseOrgBlock): string {
        return this.lang === 'en' ? org.orgName : (org.orgNameBN || org.orgName);
    }

    memberTypeLabel(row: MemberTypeWiseRow): string {
        return this.lang === 'en' ? row.memberTypeName : (row.memberTypeNameBN || row.memberTypeName);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private emptyRow(): MemberTypeWiseRow {
        return {
            memberTypeId: 0, memberTypeName: '', memberTypeNameBN: '',
            auth: 0, held: 0, def: 0, sur: 0, postedOut: 0, remarks: ''
        };
    }

    private computeGrandTotal(orgs: MemberTypeWiseOrgBlock[]): MemberTypeWiseRow {
        const auth      = orgs.reduce((s, o) => s + o.subtotal.auth,      0);
        const held      = orgs.reduce((s, o) => s + o.subtotal.held,      0);
        const def       = orgs.reduce((s, o) => s + o.subtotal.def,       0);
        const sur       = orgs.reduce((s, o) => s + o.subtotal.sur,       0);
        const postedOut = orgs.reduce((s, o) => s + o.subtotal.postedOut, 0);
        return {
            memberTypeId: 0, memberTypeName: '', memberTypeNameBN: '',
            auth, held, def, sur, postedOut, remarks: ''
        };
    }

    // ── Flat export data for Word / Excel ─────────────────────────────────────

    getFlatExportData(): { columns: string[]; rows: string[][] } {
        const cols = this.colHeaders;
        const empty = ['', '', '', '', '', '', '', ''];
        const dataRows: string[][] = [];

        this.filteredOrgs.forEach((org, orgIndex) => {
            dataRows.push(['', this.orgLabel(org), '', '', '', '', '', '']);
            org.rows.forEach((row, i) => {
                dataRows.push([
                    this.fmt(i + 1),
                    this.memberTypeLabel(row),
                    this.fmt(row.auth),
                    this.fmt(row.held),
                    this.fmt(row.def),
                    this.fmt(row.sur),
                    this.fmt(row.postedOut),
                    row.remarks ?? ''
                ]);
            });
            dataRows.push([
                '',
                this.subtotalLabel,
                this.fmt(org.subtotal.auth),
                this.fmt(org.subtotal.held),
                this.fmt(org.subtotal.def),
                this.fmt(org.subtotal.sur),
                this.fmt(org.subtotal.postedOut),
                ''
            ]);
            if (orgIndex < this.filteredOrgs.length - 1) {
                dataRows.push(empty);
            }
        });

        dataRows.push([
            '',
            this.grandTotalLabel,
            this.fmt(this.grandTotal.auth),
            this.fmt(this.grandTotal.held),
            this.fmt(this.grandTotal.def),
            this.fmt(this.grandTotal.sur),
            this.fmt(this.grandTotal.postedOut),
            ''
        ]);

        return { columns: cols, rows: dataRows };
    }

    // ── Custom PDF popup (multi-table layout) ─────────────────────────────────

    private exportPrintPopup(): void {
        const fontFamily = this.lang === 'bn' ? "'Nirmala UI', serif" : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const headerCells = this.colHeaders
            .map(h => `<th>${esc(h)}</th>`).join('');

        const orgTables = this.filteredOrgs.map(org => {
            const rowsHtml = org.rows.map((row, i) => `
                <tr>
                    <td class="num">${esc(this.fmt(i + 1))}</td>
                    <td class="name">${esc(this.memberTypeLabel(row))}</td>
                    <td class="num">${esc(this.fmt(row.auth))}</td>
                    <td class="num">${esc(this.fmt(row.held))}</td>
                    <td class="num def">${esc(this.fmt(row.def))}</td>
                    <td class="num sur">${esc(this.fmt(row.sur))}</td>
                    <td class="num">${esc(this.fmt(row.postedOut))}</td>
                    <td class="name">${esc(row.remarks ?? '')}</td>
                </tr>`).join('');

            return `
            <div class="org-block">
                <div class="org-title">${esc(this.orgLabel(org))}</div>
                <table>
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr class="subtotal-row">
                            <td></td>
                            <td class="total-label">${esc(this.subtotalLabel)}</td>
                            <td class="num">${esc(this.fmt(org.subtotal.auth))}</td>
                            <td class="num">${esc(this.fmt(org.subtotal.held))}</td>
                            <td class="num">${esc(this.fmt(org.subtotal.def))}</td>
                            <td class="num">${esc(this.fmt(org.subtotal.sur))}</td>
                            <td class="num">${esc(this.fmt(org.subtotal.postedOut))}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
        }).join('');

        const grandRow = `
            <div class="grand-total-block">
                <table>
                    <tbody>
                        <tr class="grand-row">
                            <td></td>
                            <td class="total-label">${esc(this.grandTotalLabel)}</td>
                            <td class="num">${esc(this.fmt(this.grandTotal.auth))}</td>
                            <td class="num">${esc(this.fmt(this.grandTotal.held))}</td>
                            <td class="num">${esc(this.fmt(this.grandTotal.def))}</td>
                            <td class="num">${esc(this.fmt(this.grandTotal.sur))}</td>
                            <td class="num">${esc(this.fmt(this.grandTotal.postedOut))}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>org-employee-type-wise-manpower_${this.lang}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${fontFamily}; font-size: 10pt; color: #000; background: #fff; padding: 15mm; }
        h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
        .scope { font-size: 10pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
        .date { font-size: 10pt; text-align: center; margin-bottom: 18px; }
        .org-block { margin-bottom: 18px; page-break-inside: avoid; }
        .org-title { font-size: 11pt; font-weight: 700; padding: 4px 0; border-bottom: 2px solid #000; margin-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; }
        th { padding: 5px 8px; text-align: center; font-size: 9pt; font-weight: 700;
             border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
        td { padding: 4px 8px; border: 1px solid #000; font-size: 9pt;
             background: #fff; color: #000; }
        td.num { text-align: center; }
        td.name { text-align: left; }
        td.total-label { text-align: right; font-weight: 700; }
        td.def { font-weight: 600; }
        td.sur { font-weight: 600; }
        .subtotal-row td { font-weight: 700; border-top: 2px solid #000; }
        .grand-total-block { margin-top: 8px; }
        .grand-row td { font-weight: 700; border: 2px solid #000; font-size: 10pt; }
        @page { size: A4; margin: 15mm 15mm 18mm 15mm;
            @bottom-center { content: "Page " counter(page) " of " counter(pages);
                font-family: ${fontFamily}; font-size: 8pt; color: #555; }
        }
        @media print {
            body { padding: 0; }
            .org-block { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>${esc(this.titleLabel)}</h1>
    ${this.scopeLine ? `<div class="scope">${esc(this.scopeLine)}</div>` : ''}
    <div class="date">${esc(dateStr)}</div>
    ${orgTables}
    ${grandRow}
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
