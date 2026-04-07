import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { ExportService } from '@/services/export.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type RankWiseOrgBlock,
    type RankWiseRankRow,
    type RankWiseManpowerResponse
} from '@/services/statistics.service';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-rank-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './rank-wise-manpower.html',
    styleUrl: './rank-wise-manpower.scss'
})
export class RankWiseManpowerComponent implements OnInit {
    lang: Lang = 'en';
    loading = false;
    exportDropdownOpen = false;

    allOrgs: RankWiseOrgBlock[] = [];
    filteredOrgs: RankWiseOrgBlock[] = [];
    grandTotal: RankWiseRankRow = this.emptyRow();

    /** Options for p-multiselect */
    orgOptions: { label: string; value: number }[] = [];
    /** Currently selected org IDs (empty = show all) */
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
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void { this.loadData(); }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getRankWiseManpower().subscribe({
            next: (res: RankWiseManpowerResponse) => {
                this.allOrgs = res.orgs ?? [];
                this.filteredOrgs = [...this.allOrgs];
                this.grandTotal = res.grandTotal ?? this.emptyRow();
                this.orgOptions = this.allOrgs.map(o => ({
                    label: o.orgName,
                    value: o.orgId
                }));
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
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

    async exportAs(type: 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type === 'pdf') {
            this.exportPdfPopup();
            return;
        }
        const { columns, rows } = this.getFlatExportData();
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filename: 'rank-wise-manpower'
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
            ? 'ORGANIZATION & RANK WISE MANPOWER STATE'
            : 'বাহিনী এবং পদবী অনুযায়ী জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${RankWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${RankWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get colHeaders(): string[] {
        return this.lang === 'en'
            ? ['Ser', 'Rank', 'Auth', 'Held', 'Def', 'Sur', 'Def %']
            : ['ক্রমিক', 'পদবী', 'প্রাধিকার', 'বিদ্যমান', 'ঘাটতি', 'অতিরিক্ত', 'ঘাটতি %'];
    }

    get subtotalLabel(): string { return this.lang === 'en' ? 'Subtotal' : 'উপ-মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'Grand Total' : 'সর্ব মোট'; }

    orgLabel(org: RankWiseOrgBlock): string {
        return this.lang === 'en' ? org.orgName : (org.orgNameBN || org.orgName);
    }

    rankLabel(row: RankWiseRankRow): string {
        return this.lang === 'en' ? row.rankName : (row.rankNameBN || row.rankName);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    fmtPct(n: number | undefined | null): string {
        const val = n ?? 0;
        const s = val === 0 ? '0' : val.toFixed(1);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) + '%' : s + '%';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private emptyRow(): RankWiseRankRow {
        return { rankId: 0, rankName: '', rankNameBN: '', auth: 0, held: 0, def: 0, sur: 0, defPct: 0 };
    }

    private computeGrandTotal(orgs: RankWiseOrgBlock[]): RankWiseRankRow {
        const auth = orgs.reduce((s, o) => s + o.subtotal.auth, 0);
        const held = orgs.reduce((s, o) => s + o.subtotal.held, 0);
        const def  = orgs.reduce((s, o) => s + o.subtotal.def,  0);
        const sur  = orgs.reduce((s, o) => s + o.subtotal.sur,  0);
        return {
            rankId: 0, rankName: '', rankNameBN: '',
            auth, held, def, sur,
            defPct: auth > 0 ? Math.round(def / auth * 1000) / 10 : 0
        };
    }

    // ── Flat export data for Word / Excel ─────────────────────────────────────

    getFlatExportData(): { columns: string[]; rows: string[][] } {
        const cols = this.colHeaders;
        const empty = ['', '', '', '', '', '', ''];
        const dataRows: string[][] = [];

        this.filteredOrgs.forEach((org, orgIndex) => {
            // Org header row
            dataRows.push(['', this.orgLabel(org), '', '', '', '', '']);
            // Rank rows
            org.rows.forEach((row, i) => {
                dataRows.push([
                    this.fmt(i + 1),
                    this.rankLabel(row),
                    this.fmt(row.auth),
                    this.fmt(row.held),
                    this.fmt(row.def),
                    this.fmt(row.sur),
                    this.fmtPct(row.defPct)
                ]);
            });
            // Subtotal row
            dataRows.push([
                '',
                this.subtotalLabel,
                this.fmt(org.subtotal.auth),
                this.fmt(org.subtotal.held),
                this.fmt(org.subtotal.def),
                this.fmt(org.subtotal.sur),
                this.fmtPct(org.subtotal.defPct)
            ]);
            // Empty gap row between orgs (not after the last one)
            if (orgIndex < this.filteredOrgs.length - 1) {
                dataRows.push(empty);
            }
        });

        // Grand total
        dataRows.push([
            '',
            this.grandTotalLabel,
            this.fmt(this.grandTotal.auth),
            this.fmt(this.grandTotal.held),
            this.fmt(this.grandTotal.def),
            this.fmt(this.grandTotal.sur),
            this.fmtPct(this.grandTotal.defPct)
        ]);

        return { columns: cols, rows: dataRows };
    }

    // ── Custom PDF popup (multi-table layout) ─────────────────────────────────

    private exportPdfPopup(): void {
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
                    <td class="name">${esc(this.rankLabel(row))}</td>
                    <td class="num">${esc(this.fmt(row.auth))}</td>
                    <td class="num">${esc(this.fmt(row.held))}</td>
                    <td class="num def">${esc(this.fmt(row.def))}</td>
                    <td class="num sur">${esc(this.fmt(row.sur))}</td>
                    <td class="num def">${esc(this.fmtPct(row.defPct))}</td>
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
                            <td class="num">${esc(this.fmtPct(org.subtotal.defPct))}</td>
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
                            <td class="num">${esc(this.fmtPct(this.grandTotal.defPct))}</td>
                        </tr>
                    </tbody>
                </table>
            </div>`;

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>rank-wise-manpower_${this.lang}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${fontFamily}; font-size: 10pt; color: #000; background: #fff; padding: 15mm; }
        h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
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
        @page { size: A4; margin: 15mm; }
        @page { @bottom-center { content: "Page " counter(page) " of " counter(pages);
                font-family: ${fontFamily}; font-size: 8pt; } }
    </style>
</head>
<body>
    <h1>${esc(this.titleLabel)}</h1>
    <div class="date">${esc(dateStr)}</div>
    ${orgTables}
    ${grandRow}
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); win.close(); }, 800);
    }
}
