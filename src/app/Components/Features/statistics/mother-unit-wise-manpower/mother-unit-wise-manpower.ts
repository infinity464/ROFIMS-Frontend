import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    StatisticsService,
    type MotherUnitOrgOption,
    type MotherUnitRankColumn,
    type MotherUnitRow,
    type MotherUnitWiseManpowerResponse
} from '@/services/statistics.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-mother-unit-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule],
    templateUrl: './mother-unit-wise-manpower.html',
    styleUrl: './mother-unit-wise-manpower.scss'
})
export class MotherUnitWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    loadingOrgs = false;
    exporting = false;
    exportDropdownOpen = false;

    orgOptions: MotherUnitOrgOption[] = [];
    selectedOrgId: number | null = null;

    ranks: MotherUnitRankColumn[] = [];
    units: MotherUnitRow[] = [];
    totals: Record<number, number> = {};
    grandTotal = 0;

    selectedOrgName = '';
    selectedOrgNameBN = '';

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

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

        this.loadOrgOptions();
    }

    loadOrgOptions(): void {
        this.loadingOrgs = true;
        this.statisticsService.getMotherOrgOptions().subscribe({
            next: (opts) => {
                this.orgOptions = opts;
                this.loadingOrgs = false;
            },
            error: () => { this.loadingOrgs = false; }
        });
    }

    onOrgChange(): void {
        if (!this.selectedOrgId) {
            this.clearData();
            return;
        }
        this.loading = true;
        this.statisticsService.getMotherUnitWiseManpower(this.selectedOrgId).subscribe({
            next: (res: MotherUnitWiseManpowerResponse) => {
                this.ranks = res.ranks ?? [];
                this.units = res.units ?? [];
                this.totals = res.totals ?? {};
                this.grandTotal = res.grandTotal ?? 0;
                this.selectedOrgName = res.orgName ?? '';
                this.selectedOrgNameBN = res.orgNameBN ?? '';
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

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportPdfPopup(); } finally { this.exporting = false; }
            return;
        }
        if (type === 'print') {
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
            filename: 'mother-unit-wise-manpower',
            filterLines: scope ? [scope] : undefined
        };
        if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    // ── Computed labels ──────────────────────────────────────────────────

    get titleLabel(): string {
        const orgName = this.lang === 'en'
            ? this.selectedOrgName.toUpperCase()
            : (this.selectedOrgNameBN || this.selectedOrgName);
        return this.lang === 'en'
            ? `MOTHER UNIT WISE MANPOWER STATE - ${orgName}`
            : `মাতৃ ইউনিট ভিত্তিক জনবলের সারাংশ - ${orgName}`;
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MotherUnitWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MotherUnitWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get serLabel(): string { return this.lang === 'en' ? 'Ser' : 'ক্রমিক'; }
    get unitLabel(): string { return this.lang === 'en' ? 'Mother Unit Name' : 'মাতৃ ইউনিটের নাম'; }
    get totalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'TOTAL' : 'সর্ব মোট'; }

    rankLabel(rank: MotherUnitRankColumn): string {
        return this.lang === 'en' ? rank.rankName : (rank.rankNameBN || rank.rankName);
    }

    unitNameLabel(unit: MotherUnitRow): string {
        return this.lang === 'en' ? unit.unitName : (unit.unitNameBN || unit.unitName);
    }

    orgDropdownLabel(opt: MotherUnitOrgOption): string {
        return this.lang === 'en' ? opt.orgName : (opt.orgNameBN || opt.orgName);
    }

    cellValue(unit: MotherUnitRow, rankId: number): number {
        return unit.rankCounts?.[rankId] ?? 0;
    }

    columnTotal(rankId: number): number {
        return this.totals?.[rankId] ?? 0;
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private clearData(): void {
        this.ranks = [];
        this.units = [];
        this.totals = {};
        this.grandTotal = 0;
        this.selectedOrgName = '';
        this.selectedOrgNameBN = '';
        this.accessibleRabUnitNames = null;
        this.accessibleRabUnitNamesBN = null;
    }

    // ── Flat export data for Word / Excel ────────────────────────────────

    getFlatExportData(): { columns: string[]; rows: string[][] } {
        const cols = [
            this.serLabel,
            this.unitLabel,
            ...this.ranks.map(r => this.rankLabel(r)),
            this.totalLabel
        ];
        const dataRows: string[][] = [];

        this.units.forEach((unit, i) => {
            dataRows.push([
                this.fmt(i + 1),
                this.unitNameLabel(unit),
                ...this.ranks.map(r => this.fmt(this.cellValue(unit, r.rankId))),
                this.fmt(unit.total)
            ]);
        });

        // Total row
        dataRows.push([
            '',
            this.grandTotalLabel,
            ...this.ranks.map(r => this.fmt(this.columnTotal(r.rankId))),
            this.fmt(this.grandTotal)
        ]);

        return { columns: cols, rows: dataRows };
    }

    // ── PDF export (html2canvas + jsPDF → opens in browser PDF viewer) ──

    private async exportPdfPopup(): Promise<void> {
        const fontFamily = this.lang === 'bn'
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
            : "'Times New Roman', serif";
        const now = new Date();
        const dateStr = now.toLocaleDateString(this.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        // Scale font size based on column count
        const colCount = this.ranks.length + 3;
        let baseFontPt = 8;
        let headFontPt = 8;
        let titleFontPt = 13;
        let cellPad = '4px 6px';
        if (colCount > 12) { baseFontPt = 7; headFontPt = 7; titleFontPt = 11; cellPad = '3px 4px'; }
        if (colCount > 16) { baseFontPt = 5; headFontPt = 5; titleFontPt = 10; cellPad = '2px 2px'; }
        if (colCount > 20) { baseFontPt = 4.5; headFontPt = 4.5; titleFontPt = 9; cellPad = '1px 2px'; }

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const rankHeaders = this.ranks
            .map(r => `<th>${esc(this.rankLabel(r))}</th>`).join('');

        const bodyRows = this.units.map((unit, i) => {
            const cells = this.ranks
                .map(r => `<td class="num">${esc(this.fmt(this.cellValue(unit, r.rankId)))}</td>`)
                .join('');
            return `<tr>
                <td class="num">${esc(this.fmt(i + 1))}</td>
                <td class="name">${esc(this.unitNameLabel(unit))}</td>
                ${cells}
                <td class="num total-col">${esc(this.fmt(unit.total))}</td>
            </tr>`;
        }).join('');

        const totalCells = this.ranks
            .map(r => `<td class="num">${esc(this.fmt(this.columnTotal(r.rankId)))}</td>`)
            .join('');

        const scope = this.scopeLine;
        const scopeHtml = scope
            ? `<div style="font-size:${baseFontPt + 1}pt;font-weight:600;text-align:center;margin:2px 0 6px 0;color:#1e3a5f">${esc(scope)}</div>`
            : '';
        // Offscreen container rendered at landscape A4 width (~1045px at 96dpi)
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:1045px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:${baseFontPt}pt;color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:${titleFontPt}pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(this.titleLabel)}</h1>
                ${scopeHtml}
                <div style="font-size:${baseFontPt}pt;text-align:center;margin-bottom:14px">${esc(dateStr)}</div>
                <table style="width:100%;border-collapse:collapse;font-family:${fontFamily}">
                    <thead><tr>${`<th>${esc(this.serLabel)}</th><th>${esc(this.unitLabel)}</th>${rankHeaders}<th>${esc(this.totalLabel)}</th>`}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                    <tfoot><tr class="total-row">
                        <td></td>
                        <td class="name" style="font-weight:700;text-align:right">${esc(this.grandTotalLabel)}</td>
                        ${totalCells}
                        <td class="num" style="font-weight:700">${esc(this.fmt(this.grandTotal))}</td>
                    </tr></tfoot>
                </table>
            </div>`;
        container.querySelectorAll('th').forEach((el: any) => {
            el.style.cssText = `padding:${cellPad};text-align:center;font-size:${headFontPt}pt;font-weight:700;border:1px solid #000;white-space:nowrap;background:#fff;color:#000`;
        });
        container.querySelectorAll('td').forEach((el: any) => {
            el.style.cssText += `;padding:${cellPad};border:1px solid #000;font-size:${baseFontPt}pt;color:#000`;
        });
        container.querySelectorAll('td.num').forEach((el: any) => { el.style.textAlign = 'center'; });
        container.querySelectorAll('td.name').forEach((el: any) => { el.style.textAlign = 'left'; el.style.whiteSpace = 'nowrap'; });
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

            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 16;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 16;
            const ratio = pdfWidth / imgWidth;

            // Capture thead region separately for repeating on each page
            const tableEl = container.querySelector('table')!;
            const theadEl = tableEl.querySelector('thead')!;
            const containerTop = container.getBoundingClientRect().top;
            const theadBottom = Math.round((theadEl.getBoundingClientRect().bottom - containerTop) * scale);

            // Extract header strip from canvas
            const headerCanvas = document.createElement('canvas');
            headerCanvas.width = imgWidth;
            headerCanvas.height = theadBottom;
            headerCanvas.getContext('2d')!.drawImage(canvas, 0, 0, imgWidth, theadBottom, 0, 0, imgWidth, theadBottom);
            const headerImgData = headerCanvas.toDataURL('image/jpeg', 0.92);
            const headerPdfH = theadBottom * ratio;

            // Collect body row bottom positions (in canvas pixels)
            const allRows = tableEl.querySelectorAll('tbody tr, tfoot tr');
            const rowBottoms: number[] = [];
            allRows.forEach((tr: Element) => {
                const rect = tr.getBoundingClientRect();
                rowBottoms.push(Math.round((rect.bottom - containerTop) * scale));
            });

            // Page 1: render full content from top
            const maxSlicePx = Math.floor(pdfPageHeight / ratio);
            let srcY = 0;
            let page = 0;

            while (srcY < canvas.height) {
                const isFirstPage = page === 0;
                const availableSlicePx = isFirstPage
                    ? maxSlicePx
                    : Math.floor((pdfPageHeight - headerPdfH) / ratio);

                // Find the last row that fits within this page
                let cutY = Math.min(srcY + availableSlicePx, canvas.height);
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

                let yOffset = 8;

                // Add repeated header on pages after the first
                if (!isFirstPage) {
                    pdf.addImage(headerImgData, 'JPEG', 8, yOffset, pdfWidth, headerPdfH);
                    yOffset += headerPdfH;
                }

                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgWidth;
                sliceCanvas.height = sliceH;
                const ctx = sliceCanvas.getContext('2d')!;
                ctx.drawImage(canvas, 0, srcY, imgWidth, sliceH, 0, 0, imgWidth, sliceH);
                const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
                pdf.addImage(sliceData, 'JPEG', 8, yOffset, pdfWidth, sliceH * ratio);

                srcY = cutY;
                page++;
            }

            // Open in browser PDF viewer (shows toolbar with download/print)
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

        const colCount = this.ranks.length + 3;
        let baseFontPt = 8;
        let headFontPt = 8;
        let titleFontPt = 13;
        let cellPad = '4px 6px';
        if (colCount > 12) { baseFontPt = 7; headFontPt = 7; titleFontPt = 11; cellPad = '3px 4px'; }
        if (colCount > 16) { baseFontPt = 5; headFontPt = 5; titleFontPt = 10; cellPad = '2px 2px'; }
        if (colCount > 20) { baseFontPt = 4.5; headFontPt = 4.5; titleFontPt = 9; cellPad = '1px 2px'; }

        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const rankHeaders = this.ranks
            .map(r => `<th>${esc(this.rankLabel(r))}</th>`).join('');

        const bodyRows = this.units.map((unit, i) => {
            const cells = this.ranks
                .map(r => `<td class="num">${esc(this.fmt(this.cellValue(unit, r.rankId)))}</td>`)
                .join('');
            return `<tr>
                <td class="num">${esc(this.fmt(i + 1))}</td>
                <td class="name">${esc(this.unitNameLabel(unit))}</td>
                ${cells}
                <td class="num total-col">${esc(this.fmt(unit.total))}</td>
            </tr>`;
        }).join('');

        const totalCells = this.ranks
            .map(r => `<td class="num">${esc(this.fmt(this.columnTotal(r.rankId)))}</td>`)
            .join('');

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(this.titleLabel)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontFamily}; font-size: ${baseFontPt}pt; color: #000; background: #fff; padding: 16px; }
    h1 { font-size: ${titleFontPt}pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
    .scope { font-size: ${baseFontPt + 1}pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
    .date { font-size: ${baseFontPt}pt; text-align: center; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; table-layout: auto; }
    th { padding: ${cellPad}; text-align: center; font-size: ${headFontPt}pt; font-weight: 700;
         border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
    td { padding: ${cellPad}; border: 1px solid #000; font-size: ${baseFontPt}pt;
         background: #fff; color: #000; }
    td.num { text-align: center; }
    td.name { text-align: left; white-space: nowrap; }
    td.total-col { font-weight: 600; }
    .total-row td { font-weight: 700; border-top: 2px solid #000; }
    @page { size: landscape; margin: 8mm 8mm 14mm 8mm;
        @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: ${fontFamily}; font-size: 7pt; color: #555; }
    }
    @media print {
        body { padding: 0; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
    }
</style></head><body>
    <h1>${esc(this.titleLabel)}</h1>
    ${this.scopeLine ? `<div class="scope">${esc(this.scopeLine)}</div>` : ''}
    <div class="date">${esc(dateStr)}</div>
    <table>
        <thead><tr>
            <th>${esc(this.serLabel)}</th>
            <th>${esc(this.unitLabel)}</th>
            ${rankHeaders}
            <th>${esc(this.totalLabel)}</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot><tr class="total-row">
            <td></td>
            <td class="name" style="font-weight:700;text-align:right">${esc(this.grandTotalLabel)}</td>
            ${totalCells}
            <td class="num" style="font-weight:700">${esc(this.fmt(this.grandTotal))}</td>
        </tr></tfoot>
    </table>
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
