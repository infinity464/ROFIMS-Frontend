import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type ManpowerSummaryRow,
    type ManpowerSummaryTotals,
    type ManpowerSummaryResponse
} from '@/services/statistics.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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

@Component({
    selector: 'app-manpower-summary',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './manpower-summary.html',
    styleUrl: './manpower-summary.scss'
})
export class ManpowerSummaryComponent implements OnInit {
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

    readonly columns = COLUMNS;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService
    ) {}

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
        this.statisticsService.getManpowerSummary().subscribe({
            next: (res: ManpowerSummaryResponse) => {
                this.rows   = res.rows ?? [];
                this.totals = res.totals ?? { auth: 0, held: 0, def: 0, sur: 0, postingIn: 0, postingOut: 0 };
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Returns the comma-separated unit-scope line shown under the report title, or null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
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
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportPdfDirect(); } finally { this.exporting = false; }
            return;
        }
        if (type === 'print') {
            this.exportPrintPopup();
            return;
        }
        const { columns, rows } = this.getExportData();
        const scope = this.scopeLine;
        const config = {
            title: this.titleLabel,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filename: 'manpower-summary',
            filterLines: scope ? [scope] : undefined
        };
        if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    getExportData(): { columns: string[]; rows: string[][] } {
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
        // Totals row
        const totalLabel = this.lang === 'en' ? 'Total' : 'মোট';
        dataRows.push([
            '',
            totalLabel,
            this.fmt(this.totals.auth),
            this.fmt(this.totals.held),
            this.fmt(this.totals.def),
            this.fmt(this.totals.sur),
            this.fmt(this.totals.postingIn),
            this.fmt(this.totals.postingOut),
            ''
        ]);
        return { columns, rows: dataRows };
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
            ? 'OVERALL MANPOWER SUMMARY'
            : 'জনবলের পরিসংখ্যান-র‌্যাব ফোর্সেস';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${ManpowerSummaryComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${ManpowerSummaryComponent.BN_MONTHS[mon]} ${yearBN}`;
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

    // ── PDF export (html2canvas + jsPDF → opens in browser PDF viewer) ──

    private async exportPdfDirect(): Promise<void> {
        const fontFamily = this.lang === 'bn'
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
            : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const headerCells = COLUMNS.map(c => `<th>${esc(this.colLabel(c))}</th>`).join('');

        const bodyRows = this.rows.map((row, i) => `<tr>
            <td class="num">${esc(this.fmt(i + 1))}</td>
            <td class="name">${esc(this.orgLabel(row))}</td>
            <td class="num">${esc(this.fmt(row.auth))}</td>
            <td class="num">${esc(this.fmt(row.held))}</td>
            <td class="num def">${esc(this.fmt(row.def))}</td>
            <td class="num sur">${esc(this.fmt(row.sur))}</td>
            <td class="num">${esc(this.fmt(row.postingIn))}</td>
            <td class="num">${esc(this.fmt(row.postingOut))}</td>
            <td>${esc(row.remark ?? '')}</td>
        </tr>`).join('');

        const totalRow = `<tr class="total-row">
            <td></td>
            <td class="name" style="font-weight:700;text-align:right">${esc(this.totalLabel)}</td>
            <td class="num">${esc(this.fmt(this.totals.auth))}</td>
            <td class="num">${esc(this.fmt(this.totals.held))}</td>
            <td class="num">${esc(this.fmt(this.totals.def))}</td>
            <td class="num">${esc(this.fmt(this.totals.sur))}</td>
            <td class="num">${esc(this.fmt(this.totals.postingIn))}</td>
            <td class="num">${esc(this.fmt(this.totals.postingOut))}</td>
            <td></td>
        </tr>`;

        const scope = this.scopeLine;
        const scopeHtml = scope
            ? `<div style="font-size:10pt;font-weight:600;text-align:center;margin:2px 0 6px 0;color:#1e3a5f">${esc(scope)}</div>`
            : '';
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:760px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:9pt;color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(this.titleLabel)}</h1>
                ${scopeHtml}
                <div style="font-size:9pt;text-align:center;margin-bottom:14px">${esc(dateStr)}</div>
                <table style="width:100%;border-collapse:collapse;font-family:${fontFamily}">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot>${totalRow}</tfoot>
                </table>
            </div>`;
        container.querySelectorAll('th').forEach((el: any) => {
            el.style.cssText = 'padding:4px 8px;text-align:center;font-size:9pt;font-weight:700;border:1px solid #000;white-space:nowrap;background:#fff;color:#000';
        });
        container.querySelectorAll('td').forEach((el: any) => {
            el.style.cssText += ';padding:4px 8px;border:1px solid #000;font-size:9pt;color:#000';
        });
        container.querySelectorAll('td.num').forEach((el: any) => { el.style.textAlign = 'center'; });
        container.querySelectorAll('td.name').forEach((el: any) => { el.style.textAlign = 'left'; });
        container.querySelectorAll('.total-row td').forEach((el: any) => { el.style.fontWeight = '700'; el.style.borderTop = '2px solid #000'; });
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const scale = 2;
            const canvas = await html2canvas(container, {
                scale, useCORS: true, backgroundColor: '#ffffff',
                logging: false, scrollY: -window.scrollY,
                height: container.scrollHeight, windowHeight: container.scrollHeight
            });
            const imgWidth = canvas.width;

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
            const ratio = pdfWidth / imgWidth;

            // Row-aware page splitting
            const tableEl = container.querySelector('table')!;
            const containerTop = container.getBoundingClientRect().top;
            const allRows = tableEl.querySelectorAll('tr');
            const rowBottoms: number[] = [];
            allRows.forEach((tr: Element) => {
                rowBottoms.push(Math.round((tr.getBoundingClientRect().bottom - containerTop) * scale));
            });

            const maxSlicePx = Math.floor(pdfPageHeight / ratio);
            let srcY = 0;
            let page = 0;

            while (srcY < canvas.height) {
                let cutY = Math.min(srcY + maxSlicePx, canvas.height);
                if (cutY < canvas.height) {
                    let bestCut = srcY;
                    for (const rb of rowBottoms) {
                        if (rb <= cutY && rb > srcY) bestCut = rb;
                    }
                    if (bestCut > srcY) cutY = bestCut;
                }
                const sliceH = cutY - srcY;
                if (sliceH <= 0) break;

                if (page > 0) pdf.addPage();
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgWidth;
                sliceCanvas.height = sliceH;
                const ctx = sliceCanvas.getContext('2d')!;
                ctx.drawImage(canvas, 0, srcY, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
                pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, pdfWidth, sliceH * ratio);
                srcY = cutY;
                page++;
            }

            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
        } finally {
            document.body.removeChild(container);
        }
    }

    // ── Print popup (window.open + window.print) ─────────────────────────

    private exportPrintPopup(): void {
        const fontFamily = this.lang === 'bn'
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
            : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const headerCells = COLUMNS.map(c => `<th>${esc(this.colLabel(c))}</th>`).join('');

        const bodyRows = this.rows.map((row, i) => `<tr>
            <td class="num">${esc(this.fmt(i + 1))}</td>
            <td class="name">${esc(this.orgLabel(row))}</td>
            <td class="num">${esc(this.fmt(row.auth))}</td>
            <td class="num">${esc(this.fmt(row.held))}</td>
            <td class="num">${esc(this.fmt(row.def))}</td>
            <td class="num">${esc(this.fmt(row.sur))}</td>
            <td class="num">${esc(this.fmt(row.postingIn))}</td>
            <td class="num">${esc(this.fmt(row.postingOut))}</td>
            <td>${esc(row.remark ?? '')}</td>
        </tr>`).join('');

        const totalRow = `<tr class="total-row">
            <td></td>
            <td class="name" style="font-weight:700;text-align:right">${esc(this.totalLabel)}</td>
            <td class="num">${esc(this.fmt(this.totals.auth))}</td>
            <td class="num">${esc(this.fmt(this.totals.held))}</td>
            <td class="num">${esc(this.fmt(this.totals.def))}</td>
            <td class="num">${esc(this.fmt(this.totals.sur))}</td>
            <td class="num">${esc(this.fmt(this.totals.postingIn))}</td>
            <td class="num">${esc(this.fmt(this.totals.postingOut))}</td>
            <td></td>
        </tr>`;

        const scope = this.scopeLine;
        const scopeHtml = scope ? `<div class="scope">${esc(scope)}</div>` : '';
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(this.titleLabel)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontFamily}; font-size: 9pt; color: #000; background: #fff; padding: 16px; }
    h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
    .scope { font-size: 10pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
    .date { font-size: 9pt; text-align: center; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; }
    th { padding: 5px 8px; text-align: center; font-size: 9pt; font-weight: 700;
         border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
    td { padding: 4px 8px; border: 1px solid #000; font-size: 9pt; background: #fff; color: #000; }
    td.num { text-align: center; }
    td.name { text-align: left; }
    .total-row td { font-weight: 700; border-top: 2px solid #000; }
    @page { size: A4; margin: 15mm 15mm 18mm 15mm;
        @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: ${fontFamily}; font-size: 8pt; color: #555; }
    }
    @media print {
        body { padding: 0; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
    }
</style></head><body>
    <h1>${esc(this.titleLabel)}</h1>
    ${scopeHtml}
    <div class="date">${esc(dateStr)}</div>
    <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>${totalRow}</tfoot>
    </table>
</body></html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
