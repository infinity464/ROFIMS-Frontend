import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Packer } from 'docx';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import { OrgTreeFilterComponent } from '../shared/org-tree-filter/org-tree-filter.component';
import {
    StatisticsService,
    type ManpowerSummaryRow,
    type ManpowerSummaryTotals,
    type ManpowerSummaryResponse
} from '@/services/statistics.service';

type Lang = 'en' | 'bn';

interface ColDef {
    field: keyof ManpowerSummaryRow | 'ser';
    labelEn: string;
    labelBn: string;
}

const COLUMNS: ColDef[] = [
    { field: 'ser',        labelEn: 'Ser',          labelBn: 'ক্রমিক' },
    { field: 'orgName',    labelEn: 'Organization',  labelBn: 'বাহিনী' },
    { field: 'auth',       labelEn: 'Auth',          labelBn: 'প্রাধিকার' },
    { field: 'held',       labelEn: 'Held',          labelBn: 'বিদ্যমান' },
    { field: 'def',        labelEn: 'Def',           labelBn: 'ঘাটতি' },
    { field: 'sur',        labelEn: 'Sur',           labelBn: 'অতিরিক্ত' },
    { field: 'postingIn',  labelEn: 'Posting In',    labelBn: 'বদলী আদেশ প্রাপ্ত' },
    { field: 'postingOut', labelEn: 'Posting Out',   labelBn: 'প্রেষণাদেশ বাতিল' },
    { field: 'remark',     labelEn: 'Remark',        labelBn: 'মন্তব্য' }
];

/**
 * Equivalent-name variant of the Overall Manpower Summary. Identical to
 * ManpowerSummaryComponent except the Auth figure (and therefore Def/Sur) is
 * sourced from the equivalent-name man-power setup. Reuses the original
 * template/styles via relative paths so the base report stays untouched.
 */
@Component({
    selector: 'app-manpower-summary-equivalent',
    standalone: true,
    imports: [CommonModule, FormsModule, OrgTreeFilterComponent],
    templateUrl: '../manpower-summary/manpower-summary.html',
    styleUrl: '../manpower-summary/manpower-summary.scss'
})
export class ManpowerSummaryEquivalentComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    rows: ManpowerSummaryRow[] = [];
    totals: ManpowerSummaryTotals = { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };

    /** Names of the RAB Units the user is restricted to. null/empty = full access (no scope line shown). */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;
    /** Names of the Member Types the user is restricted to. null/empty = full access on this axis. */
    accessibleMemberTypeNames: string[] | null = null;
    accessibleMemberTypeNamesBN: string[] | null = null;

    readonly columns = COLUMNS;

    /** Org-tree node filter (Unit/Wing/Branch/…) from the shared <app-org-tree-filter>. */
    filterRabCodeId: number | null = null;
    filterLabel: string | null = null;

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

    onOrgTreeFilter(e: { codeId: number | null; label: string | null }): void {
        this.filterRabCodeId = e.codeId;
        this.filterLabel = e.label;
        this.loadData();
    }

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getManpowerSummaryByEquivalentName(this.filterRabCodeId).subscribe({
            next: (res: ManpowerSummaryResponse) => {
                this.rows   = res.rows ?? [];
                this.totals = res.totals ?? { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };
                this.accessibleRabUnitNames      = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN    = res.accessibleRabUnitNamesBN ?? null;
                this.accessibleMemberTypeNames   = res.accessibleMemberTypeNames ?? null;
                this.accessibleMemberTypeNamesBN = res.accessibleMemberTypeNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /**
     * Combined scope line shown under the report title when EITHER axis is
     * restricted. Either side is omitted when that axis is unrestricted.
     * Returns null when the caller has no restrictions at all (full access).
     */
    get scopeLine(): string | null {
        const bn = this.lang === 'bn';
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames)
            ?? this.accessibleRabUnitNames;
        const memberTypeNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames)
            ?? this.accessibleMemberTypeNames;

        const parts: string[] = [];
        const filterLabel = this.filterLabel;
        if (filterLabel) {
            parts.push(filterLabel);
        }
        if (unitNames && unitNames.length > 0) {
            parts.push(unitNames.join(', '));
        }
        if (memberTypeNames && memberTypeNames.length > 0) {
            const label = bn ? 'সদস্য ধরণ' : 'Member Types';
            parts.push(`${label}: ${memberTypeNames.join(', ')}`);
        }
        return parts.length === 0 ? null : parts.join('  |  ');
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        if (type === 'print') {
            this.openRabPrintWindow();
            return;
        }

        const { columns, rows, subtotalRow } = this.getExportData();
        const scope = this.scopeLine;
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            subtotalRow,
            showPageNumbers: true,
            filename: 'manpower-summary-equivalent',
            filterLines: scope ? [scope] : undefined
        };
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            sections: [{ title: '', rows }],
            grandTotalRow: subtotalRow,
            showPageNumbers: true,
            filename: 'manpower-summary-equivalent',
            filterLines: scope ? [scope] : undefined,
            rabLetterhead: true,
            criteriaItems: this.rabCriteriaItems
        };

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordSectioned(sectionedConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcel(config);
                    break;
                case 'pdf': {
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    window.open(pdfUrl, '_blank');
                    break;
                }
            }
        } catch (err) {
            console.error(`${type} export failed`, err);
        } finally {
            this.exporting = false;
        }
    }

    private async convertDocxToPdf(docxBlob: Blob): Promise<Blob> {
        const form = new FormData();
        form.append('file', docxBlob, 'document.docx');
        return await firstValueFrom(
            this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
        );
    }

    // ── RAB letterhead print (frontend-only) ──────────────────────────────────
    private get rabOverlineText(): string {
        return this.lang === 'bn'
            ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার'
            : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    private get rabOrgTitle(): string {
        return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION';
    }
    private get rabOrgSubtitle(): string {
        return this.lang === 'bn'
            ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা'
            : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }
    private get rabCriteriaTitle(): string { return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA'; }
    private get rabGeneratedLabel(): string { return this.lang === 'bn' ? 'তারিখ' : 'GENERATED'; }
    private get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn'
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    private get rabConfidentialLabel(): string { return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL'; }
    private get rabWarningLabel(): string { return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED'; }

    private get rabCriteriaItems(): { label: string; value: string }[] {
        const items: { label: string; value: string }[] = [];
        const filterLabel = this.filterLabel;
        if (filterLabel) {
            items.push({ label: this.lang === 'bn' ? 'অফিস' : 'OFFICE', value: filterLabel });
        }
        const unitNames = (this.lang === 'bn' ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (unitNames && unitNames.length > 0) {
            items.push({ label: this.lang === 'bn' ? 'ইউনিট' : 'UNITS', value: unitNames.join(', ') });
        }
        const memberTypeNames = (this.lang === 'bn' ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames) ?? this.accessibleMemberTypeNames;
        if (memberTypeNames && memberTypeNames.length > 0) {
            items.push({ label: this.lang === 'bn' ? 'সদস্য ধরণ' : 'MEMBER TYPES', value: memberTypeNames.join(', ') });
        }
        if (items.length === 0) {
            items.push({ label: this.lang === 'bn' ? 'পরিসর' : 'SCOPE', value: this.lang === 'bn' ? 'সকল ইউনিট' : 'All Unit' });
        }
        return items;
    }

    private openRabPrintWindow(): void {
        if (this.rows.length === 0) return;
        const html = this.buildRabPrintHtml();
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ }
        }, 600);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: string) =>
            (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif"
            : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif"
            : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const cols = COLUMNS;
        const headerCells = cols.map(c => `<th>${esc(this.lang === 'en' ? c.labelEn : c.labelBn)}</th>`).join('');

        const bodyHtml = this.rows.map((row, i) => {
            const cells = cols.map(col => {
                if (col.field === 'ser') return `<td class="td-ser"><span class="ser">${esc(this.fmt(i + 1))}</span></td>`;
                if (col.field === 'orgName') return `<td class="td-org">${esc(this.orgLabel(row))}</td>`;
                if (col.field === 'remark') return `<td>${esc(row.remark ?? '')}</td>`;
                const v = (row as any)[col.field] as number;
                return `<td class="td-num">${esc(this.fmt(v))}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        const totalLabel = this.lang === 'en' ? 'Total' : 'মোট';
        const totalCells = cols.map(col => {
            if (col.field === 'ser') return `<td></td>`;
            if (col.field === 'orgName') return `<td class="td-total-label">${esc(totalLabel)}</td>`;
            if (col.field === 'remark') return `<td></td>`;
            const v = (this.totals as any)[col.field] as number;
            return `<td class="td-num">${esc(this.fmt(v))}</td>`;
        }).join('');

        const criteriaGridHtml = `<div class="criteria-grid">${this.rabCriteriaItems
            .map(it => `<div class="cell"><div class="cell-label">${esc(it.label)}</div><div class="cell-value">${esc(it.value)}</div></div>`)
            .join('')}</div>`;

        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const confidential = this.rabConfidentialLabel;
        const warning = this.rabWarningLabel;
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head>
<meta charset="UTF-8" />
<title>${esc(this.titleLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @page {
        margin: 12mm 8mm 22mm 8mm;
        @bottom-left {
            content: "● " "${cssStr(confidential)}";
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 0 0 8mm;
        }
        @bottom-center {
            content: "${cssStr(pageWord)} " counter(page) " ${cssStr(ofWord)} " counter(pages);
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm;
        }
        @bottom-right {
            content: "${cssStr(warning)}";
            font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
            letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 8mm 0 0;
        }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0b0b0b; font-family: ${sans}; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline { font-size: 7.5pt; letter-spacing: 0.3em; color: #555; text-transform: uppercase; margin-bottom: 3mm; font-weight: 500; ${isBn ? 'letter-spacing:0;text-transform:none;font-size:9pt;' : ''} }
    .paper-title { font-family: ${serif}; font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0; letter-spacing: 0.12em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; margin-bottom: 4mm; }
    .orn-divider { display: flex; justify-content: center; align-items: center; gap: 6mm; margin: 4mm auto; max-width: 65%; }
    .orn-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #b78b3b, transparent); }
    .orn-diamond { color: #b78b3b; font-size: 9pt; }
    .paper-section { font-family: ${serif}; font-size: 13pt; font-weight: 700; letter-spacing: 0.16em; color: #0b0b0b; margin: 0; text-transform: uppercase; ${isBn ? 'letter-spacing:0;' : ''} }

    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(45mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; ${isBn ? 'font-family:' + sans + ';' : ''} }

    table { width: 100%; border-collapse: collapse; font-family: ${sans}; font-size: 9pt; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 7pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; padding: 2mm; text-align: center; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm; font-size: 9pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.06); vertical-align: middle; background: #fff; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-num { text-align: center; font-family: ${mono}; }
    .td-ser { text-align: center; white-space: nowrap; }
    .ser { font-family: ${mono}; font-size: 9pt; font-weight: 600; color: #6b6b6b; }
    .td-org { font-weight: 600; }
    tfoot td { padding: 2mm; font-size: 9pt; font-weight: 700; border: 1px solid rgba(11,11,11,0.12); background: #f0efe9; }
    tfoot .td-num { text-align: center; font-family: ${mono}; }
    .td-total-label { text-transform: uppercase; letter-spacing: 0.06em; }
</style>
</head>
<body>
    <div class="paper">
        <header class="paper-head">
            <div class="overline">${esc(this.rabOverlineText)}</div>
            <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
            <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
            <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
            <h2 class="paper-section">${esc(this.titleLabel)}</h2>
        </header>
        <div class="criteria">
            <div class="criteria-strip">
                <span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span>
                <span class="criteria-strip-date">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span>
            </div>
            ${criteriaGridHtml}
        </div>
        <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyHtml}</tbody>
            <tfoot><tr>${totalCells}</tr></tfoot>
        </table>
    </div>
</body>
</html>`;
    }

    getExportData(): { columns: string[]; rows: string[][]; subtotalRow: string[] } {
        const columns = COLUMNS.map(c => this.lang === 'en' ? c.labelEn : c.labelBn);
        const dataRows = this.rows.map((row, i) => [
            this.fmt(i + 1),
            this.orgLabel(row),
            this.fmt(row.auth),
            this.fmt(row.held),
            this.fmt(row.def),
            this.fmt(row.sur),
            this.fmt(row.postingIn),
            this.fmt(row.postingOut),
            row.remark ?? ''
        ]);
        const totalLabel = this.lang === 'en' ? 'Total' : 'মোট';
        const subtotalRow = [
            '',
            totalLabel,
            this.fmt(this.totals.auth),
            this.fmt(this.totals.held),
            this.fmt(this.totals.def),
            this.fmt(this.totals.sur),
            this.fmt(this.totals.postingIn),
            this.fmt(this.totals.postingOut),
            ''
        ];
        return { columns, rows: dataRows, subtotalRow };
    }

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'OVERALL MANPOWER SUMMARY (EQUIVALENT NAME)'
            : 'জনবলের পরিসংখ্যান-র‌্যাব ফোর্সেস (সমতুল্য নাম)';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${ManpowerSummaryEquivalentComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${ManpowerSummaryEquivalentComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    get totalLabel(): string {
        return this.lang === 'en' ? 'Total' : 'মোট';
    }

    colLabel(col: ColDef): string {
        return this.lang === 'en' ? col.labelEn : col.labelBn;
    }

    orgLabel(row: ManpowerSummaryRow): string {
        return this.lang === 'en' ? row.orgName : (row.orgNameBN || row.orgName);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

}
