import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import {
    StatisticsService,
    type UnitRankColumn,
    type UnitRankRow,
    type UnitRankCell,
    type UnitRankWiseManpowerResponse
} from '@/services/statistics.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Lang = 'en' | 'bn';

const EMPTY_CELL: UnitRankCell = { auth: 0, held: 0 };

@Component({
    selector: 'app-unit-rank-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, SelectModule],
    templateUrl: './unit-rank-wise-manpower.html',
    styleUrl: './unit-rank-wise-manpower.scss'
})
export class UnitRankWiseManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    ranks: UnitRankColumn[] = [];
    units: UnitRankRow[] = [];
    columnTotals: Record<number, UnitRankCell> = {};
    grandTotal: UnitRankCell = { auth: 0, held: 0 };

    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;

    /** Comma-separated EquivalentName.codeValueEN list to drop from the columns. */
    private readonly excludeRanks = 'Officer,DAD';

    /** RAB Unit drill-down: null = top-level RAB Units; a CodeId = wings under that unit. */
    selectedRabUnitId: number | null = null;
    rabUnitOptions: { label: string; value: number | null }[] = [];
    private rabUnits: CommonCode[] = [];

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private masterBasicSetup: MasterBasicSetupService
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

        this.loadRabUnitOptions();
        this.loadData();
    }

    private loadRabUnitOptions(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (res) => {
                this.rabUnits = (Array.isArray(res) ? res : [])
                    .filter(u => u.status !== false && u.parentCodeId == null);
                this.rabUnits.sort((a, b) =>
                    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
                );
                this.rebuildRabUnitOptions();
            },
            error: () => { this.rabUnits = []; this.rebuildRabUnitOptions(); }
        });
    }

    private rebuildRabUnitOptions(): void {
        const allLabel = this.lang === 'en' ? 'All RAB Units' : 'সকল র‍্যাব ইউনিট';
        this.rabUnitOptions = [
            { label: allLabel, value: null },
            ...this.rabUnits.map(u => ({
                label: this.lang === 'en' ? (u.codeValueEN ?? '') : (u.codeValueBN || u.codeValueEN || ''),
                value: u.codeId
            }))
        ];
    }

    onRabUnitChange(): void {
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getUnitRankWiseManpower(this.excludeRanks, this.selectedRabUnitId).subscribe({
            next: (res: UnitRankWiseManpowerResponse) => {
                this.ranks        = res.ranks ?? [];
                this.units        = res.units ?? [];
                this.columnTotals = res.columnTotals ?? {};
                this.grandTotal   = res.grandTotal ?? { auth: 0, held: 0 };
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
        this.rebuildRabUnitOptions();
    }

    private get selectedRabUnit(): CommonCode | undefined {
        return this.selectedRabUnitId == null
            ? undefined
            : this.rabUnits.find(u => u.codeId === this.selectedRabUnitId);
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    cell(row: UnitRankRow, eqId: number): UnitRankCell {
        return row.cells?.[eqId] ?? EMPTY_CELL;
    }

    colTotal(eqId: number): UnitRankCell {
        return this.columnTotals?.[eqId] ?? EMPTY_CELL;
    }

    unitLabel(row: UnitRankRow): string {
        return this.lang === 'en' ? row.unitNameEN : (row.unitNameBN || row.unitNameEN);
    }

    rankLabel(col: UnitRankColumn): string {
        return this.lang === 'en' ? col.equivalentNameEN : (col.equivalentNameBN || col.equivalentNameEN);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
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
        const sel = this.selectedRabUnit;
        if (sel) {
            const name = this.lang === 'en' ? (sel.codeValueEN ?? '') : (sel.codeValueBN || sel.codeValueEN || '');
            return this.lang === 'en'
                ? `WING-WISE MANPOWER STATE BY RAB RANK — ${name.toUpperCase()}`
                : `উইং অনুযায়ী র‍্যাব পদবী ভিত্তিক জনবলের পরিসংখ্যান — ${name}`;
        }
        return this.lang === 'en'
            ? 'UNIT-WISE MANPOWER STATE BY RAB RANK'
            : 'ইউনিট অনুযায়ী র‍্যাব পদবী ভিত্তিক জনবলের পরিসংখ্যান';
    }

    get unitHeader(): string {
        if (this.selectedRabUnit) return this.lang === 'en' ? 'Wing' : 'উইং';
        return this.lang === 'en' ? 'Unit' : 'ইউনিট';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${UnitRankWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        const dayBN  = BanglaNumerals.toBangla(String(day));
        const yearBN = BanglaNumerals.toBangla(String(year));
        return `${dayBN} ${UnitRankWiseManpowerComponent.BN_MONTHS[mon]} ${yearBN}`;
    }

    get authHeader(): string { return this.lang === 'en' ? 'Auth' : 'প্রাধিকার'; }
    get heldHeader(): string { return this.lang === 'en' ? 'Held' : 'বিদ্যমান'; }
    get totalHeader(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }

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
            filename: 'unit-rank-wise-manpower',
            filterLines: scope ? [scope] : undefined
        };
        if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    /**
     * Flat-column dump for the Word/Excel exporters which expect a single header row.
     * Each rank becomes two columns (Auth / Held) — the rank name is folded into the column label.
     */
    getExportData(): { columns: string[]; rows: string[][] } {
        const columns: string[] = [this.unitHeader];
        for (const col of this.ranks) {
            const label = this.rankLabel(col);
            columns.push(`${label} - ${this.authHeader}`);
            columns.push(`${label} - ${this.heldHeader}`);
        }
        columns.push(`${this.totalHeader} - ${this.authHeader}`);
        columns.push(`${this.totalHeader} - ${this.heldHeader}`);

        const dataRows: string[][] = this.units.map(row => {
            const cells: string[] = [this.unitLabel(row)];
            for (const col of this.ranks) {
                const c = this.cell(row, col.equivalentNameId);
                cells.push(this.fmt(c.auth));
                cells.push(this.fmt(c.held));
            }
            cells.push(this.fmt(row.total.auth));
            cells.push(this.fmt(row.total.held));
            return cells;
        });

        // Totals row
        const totalRow: string[] = [this.totalHeader];
        for (const col of this.ranks) {
            const t = this.colTotal(col.equivalentNameId);
            totalRow.push(this.fmt(t.auth));
            totalRow.push(this.fmt(t.held));
        }
        totalRow.push(this.fmt(this.grandTotal.auth));
        totalRow.push(this.fmt(this.grandTotal.held));
        dataRows.push(totalRow);

        return { columns, rows: dataRows };
    }

    /** Common renderer for the PDF + Print HTML — keeps the two paths in sync. */
    private buildReportHtml(fontFamily: string): { headerHtml: string; bodyHtml: string; totalHtml: string } {
        const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Header has two rows: rank labels in row 1, Auth/Held splits in row 2.
        const rankHeaderCells = this.ranks
            .map(c => {
                const abbr = c.abbreviation
                    ? `<div style="display:inline-block;margin-top:3px;padding:1px 6px;background:#d4dee0;color:#1e293b;border-radius:99px;font-size:8pt;font-weight:700">${esc(c.abbreviation)}</div>`
                    : '';
                return `<th colspan="2" class="rank-h"><div style="line-height:1.25">${esc(this.rankLabel(c))}${abbr}</div></th>`;
            })
            .join('');
        const headerRow1 =
            `<th rowspan="2" class="unit-h">${esc(this.unitHeader)}</th>` +
            rankHeaderCells +
            `<th colspan="2" class="rank-h">${esc(this.totalHeader)}</th>`;
        const headerRow2 = this.ranks
            .map(() => `<th class="sub-h">${esc(this.authHeader)}</th><th class="sub-h">${esc(this.heldHeader)}</th>`)
            .join('') +
            `<th class="sub-h">${esc(this.authHeader)}</th><th class="sub-h">${esc(this.heldHeader)}</th>`;
        const headerHtml = `<tr>${headerRow1}</tr><tr>${headerRow2}</tr>`;

        const bodyHtml = this.units.map(row => {
            const cells = this.ranks.map(col => {
                const c = this.cell(row, col.equivalentNameId);
                return `<td class="num">${esc(this.fmt(c.auth))}</td><td class="num">${esc(this.fmt(c.held))}</td>`;
            }).join('');
            return `<tr>
                <td class="name">${esc(this.unitLabel(row))}</td>
                ${cells}
                <td class="num total">${esc(this.fmt(row.total.auth))}</td>
                <td class="num total">${esc(this.fmt(row.total.held))}</td>
            </tr>`;
        }).join('');

        const totalCells = this.ranks.map(col => {
            const t = this.colTotal(col.equivalentNameId);
            return `<td class="num">${esc(this.fmt(t.auth))}</td><td class="num">${esc(this.fmt(t.held))}</td>`;
        }).join('');
        const totalHtml = `<tr class="total-row">
            <td class="name" style="font-weight:700;text-align:right">${esc(this.totalHeader)}</td>
            ${totalCells}
            <td class="num total">${esc(this.fmt(this.grandTotal.auth))}</td>
            <td class="num total">${esc(this.fmt(this.grandTotal.held))}</td>
        </tr>`;

        // Hint to suppress unused-var warning in some build configs
        void fontFamily;

        return { headerHtml, bodyHtml, totalHtml };
    }

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

        const { headerHtml, bodyHtml, totalHtml } = this.buildReportHtml(fontFamily);

        const scope = this.scopeLine;
        const scopeHtml = scope
            ? `<div style="font-size:10pt;font-weight:600;text-align:center;margin:2px 0 6px 0;color:#1e3a5f">${esc(scope)}</div>`
            : '';

        // Width grows with column count; jsPDF picks the orientation later based on aspect ratio.
        const tableWidthPx = 220 + this.ranks.length * 100 + 110;
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:-9999px;top:0;width:${tableWidthPx}px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box`;
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:8.5pt;color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(this.titleLabel)}</h1>
                ${scopeHtml}
                <div style="font-size:9pt;text-align:center;margin-bottom:14px">${esc(dateStr)}</div>
                <table style="width:100%;border-collapse:collapse;font-family:${fontFamily}">
                    <thead>${headerHtml}</thead>
                    <tbody>${bodyHtml}</tbody>
                    <tfoot>${totalHtml}</tfoot>
                </table>
            </div>`;
        container.querySelectorAll('th').forEach((el: any) => {
            el.style.cssText = 'padding:4px 6px;text-align:center;font-size:8.5pt;font-weight:700;border:1px solid #000;white-space:nowrap;background:#fff;color:#000';
        });
        container.querySelectorAll('td').forEach((el: any) => {
            el.style.cssText += ';padding:4px 6px;border:1px solid #000;font-size:8.5pt;color:#000';
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
            const imgHeight = canvas.height;

            // Landscape when the table is wider than it is tall — keeps wide pivots legible.
            const isLandscape = imgWidth > imgHeight;
            const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
            const ratio = pdfWidth / imgWidth;

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

            while (srcY < imgHeight) {
                let cutY = Math.min(srcY + maxSlicePx, imgHeight);
                if (cutY < imgHeight) {
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

        const { headerHtml, bodyHtml, totalHtml } = this.buildReportHtml(fontFamily);

        const scope = this.scopeLine;
        const scopeHtml = scope ? `<div class="scope">${esc(scope)}</div>` : '';
        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(this.titleLabel)}</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontFamily}; font-size: 8.5pt; color: #000; background: #fff; padding: 16px; }
    h1 { font-size: 14pt; font-weight: 700; text-align: center; margin-bottom: 3px; }
    .scope { font-size: 10pt; font-weight: 600; text-align: center; margin: 2px 0 6px 0; color: #1e3a5f; }
    .date { font-size: 9pt; text-align: center; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; }
    th { padding: 5px 6px; text-align: center; font-size: 8.5pt; font-weight: 700;
         border: 1px solid #000; white-space: nowrap; background: #fff; color: #000; }
    td { padding: 4px 6px; border: 1px solid #000; font-size: 8.5pt; background: #fff; color: #000; }
    td.num { text-align: center; }
    td.name { text-align: left; }
    .total-row td { font-weight: 700; border-top: 2px solid #000; }
    @page { size: A4 landscape; margin: 10mm 10mm 14mm 10mm;
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
        <thead>${headerHtml}</thead>
        <tbody>${bodyHtml}</tbody>
        <tfoot>${totalHtml}</tfoot>
    </table>
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }
}
