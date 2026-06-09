import { Injectable } from '@angular/core';

export type CellAlign = 'left' | 'center' | 'right';

export interface RabPrintColumn {
    label: string;
    align?: CellAlign;
    /** Render this column's cells in monospace (numeric look). */
    mono?: boolean;
}

export interface RabPrintSection {
    /** Optional band title rendered above the section's rows (e.g. an org name). */
    title?: string;
    rows: string[][];
    /** Optional bold subtotal row for this section. */
    totalRow?: string[];
    /**
     * Per-section columns. Set this for MATRIX reports where each section (org)
     * has its own column set (e.g. ranks differ per org). When present, each
     * section renders as its own standalone table with this header.
     */
    columns?: RabPrintColumn[];
}

/**
 * Two-row grouped header (e.g. unit × rank pivot): leading column(s) span both
 * rows; each group spans its sub-headers. Applied to every section's table.
 */
export interface RabPrintGroupedHeader {
    leading: RabPrintColumn[];
    groups: string[];
    subHeaders: string[];
}

export interface RabPrintConfig {
    lang: 'en' | 'bn';
    /** Section title under the letterhead (e.g. "RANK WISE MANPOWER"). */
    reportTitle: string;
    subtitle?: string;
    criteriaItems: { label: string; value: string }[];
    columns: RabPrintColumn[];
    sections: RabPrintSection[];
    /** Optional grand-total row rendered in a tfoot after all sections. */
    grandTotalRow?: string[];
    /** Two-row grouped header shared across sections (Auth/Held-style pivots). */
    groupedHeader?: RabPrintGroupedHeader;
    /** Landscape page orientation (default portrait). */
    landscape?: boolean;
}

/**
 * Builds the shared RAB letterhead print document (Government header, org title,
 * ornamental divider, SELECTION CRITERIA grid, then one or more tables) and prints
 * it in a new window. Pure frontend — no Word/backend round-trip. Used by every
 * statistics table report so the print view is identical across them.
 */
@Injectable({ providedIn: 'root' })
export class RabReportPrintService {
    print(config: RabPrintConfig): void {
        if (!config.sections?.some(s => s.rows.length > 0)) return;
        const html = this.buildHtml(config);
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ }
        }, 600);
    }

    private esc(s: string): string {
        return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    private buildHtml(cfg: RabPrintConfig): string {
        const esc = (s: string) => this.esc(s);
        const isBn = cfg.lang === 'bn';
        const serif = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif"
            : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif"
            : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const overline = isBn ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
        const orgTitle = isBn ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION';
        const orgSubtitle = isBn ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা' : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
        const criteriaTitle = isBn ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA';
        const generatedLabel = isBn ? 'তারিখ' : 'GENERATED';
        const confidential = isBn ? 'গোপনীয়' : 'CONFIDENTIAL';
        const warning = isBn ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED';
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const now = new Date();
        const formattedDate = (isBn
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })).toUpperCase();

        const colCount = cfg.columns.length;
        const alignCss = (a?: CellAlign) => `text-align:${a ?? 'left'};`;
        const headerHtml = `<tr>${cfg.columns.map(c => `<th style="${alignCss(c.align ?? 'center')}">${esc(c.label)}</th>`).join('')}</tr>`;

        const renderRow = (cells: string[], cls = ''): string =>
            `<tr class="${cls}">${cfg.columns.map((c, i) =>
                `<td style="${alignCss(c.align)}${c.mono ? `font-family:${mono};` : ''}">${esc(cells[i] ?? '')}</td>`).join('')}</tr>`;

        const sectionsHtml = cfg.sections.filter(s => s.rows.length > 0).map(sec => {
            const bandHtml = sec.title
                ? `<tr class="band"><td colspan="${colCount}">${esc(sec.title)}</td></tr>`
                : '';
            const rowsHtml = sec.rows.map(r => renderRow(r)).join('');
            const totalHtml = sec.totalRow ? renderRow(sec.totalRow, 'subtotal') : '';
            return `${bandHtml}${rowsHtml}${totalHtml}`;
        }).join('');

        const grandTotalHtml = cfg.grandTotalRow
            ? `<tfoot><tr class="grand">${cfg.columns.map((c, i) =>
                  `<td style="${alignCss(c.align)}${c.mono ? `font-family:${mono};` : ''}">${esc(cfg.grandTotalRow![i] ?? '')}</td>`).join('')}</tr></tfoot>`
            : '';

        // Matrix mode: each section carries its own columns → render one table per section.
        const isMatrix = cfg.sections.some(s => s.columns && s.columns.length > 0);
        const renderRowCols = (cols: RabPrintColumn[], cells: string[], cls = ''): string =>
            `<tr class="${cls}">${cols.map((c, i) =>
                `<td style="${alignCss(c.align)}${c.mono ? `font-family:${mono};` : ''}">${esc(cells[i] ?? '')}</td>`).join('')}</tr>`;
        const matrixHtml = cfg.sections.filter(s => s.rows.length > 0).map(sec => {
            const cols = sec.columns ?? cfg.columns;
            const head = `<tr>${cols.map(c => `<th style="${alignCss(c.align ?? 'center')}">${esc(c.label)}</th>`).join('')}</tr>`;
            const rowsHtml = sec.rows.map(r => renderRowCols(cols, r)).join('');
            const totalHtml = sec.totalRow ? renderRowCols(cols, sec.totalRow, 'subtotal') : '';
            const titleHtml = sec.title ? `<div class="matrix-title">${esc(sec.title)}</div>` : '';
            return `<div class="matrix-section">${titleHtml}<table><thead>${head}</thead><tbody>${rowsHtml}${totalHtml}</tbody></table></div>`;
        }).join('');
        const matrixGrandHtml = (isMatrix && cfg.grandTotalRow)
            ? `<div class="matrix-section"><table><tbody>${renderRowCols(cfg.columns.length ? cfg.columns : (cfg.sections[0]?.columns ?? []), cfg.grandTotalRow, 'grand')}</tbody></table></div>`
            : '';

        // Grouped two-row header mode (Auth/Held-style pivot) — one table per section.
        const gh = cfg.groupedHeader;
        const groupedHeadHtml = gh
            ? `<tr>${gh.leading.map(c => `<th rowspan="2" style="${alignCss(c.align ?? 'left')}">${esc(c.label)}</th>`).join('')}`
              + `${gh.groups.map(g => `<th colspan="${gh.subHeaders.length}" style="text-align:center">${esc(g)}</th>`).join('')}</tr>`
              + `<tr>${gh.groups.map(() => gh.subHeaders.map(s => `<th style="text-align:center">${esc(s)}</th>`).join('')).join('')}</tr>`
            : '';
        const renderGroupedRow = (cells: string[], cls = ''): string =>
            `<tr class="${cls}">${cells.map((cell, i) => {
                const lead = gh ? i < gh.leading.length : false;
                const style = lead ? alignCss(gh!.leading[i]?.align ?? 'left') : `text-align:center;font-family:${mono};`;
                return `<td style="${style}">${esc(cell ?? '')}</td>`;
            }).join('')}</tr>`;
        const groupedHtml = gh
            ? cfg.sections.filter(s => s.rows.length > 0).map(sec => {
                const titleHtml = sec.title ? `<div class="matrix-title">${esc(sec.title)}</div>` : '';
                const rowsHtml = sec.rows.map(r => renderGroupedRow(r)).join('');
                return `<div class="matrix-section">${titleHtml}<table><thead>${groupedHeadHtml}</thead><tbody>${rowsHtml}</tbody></table></div>`;
            }).join('')
            : '';

        const tableBlockHtml = gh
            ? groupedHtml
            : isMatrix
                ? `${matrixHtml}${matrixGrandHtml}`
                : `<table><thead>${headerHtml}</thead><tbody>${sectionsHtml}</tbody>${grandTotalHtml}</table>`;

        const criteriaGridHtml = `<div class="criteria-grid">${cfg.criteriaItems
            .map(it => `<div class="cell"><div class="cell-label">${esc(it.label)}</div><div class="cell-value">${esc(it.value)}</div></div>`)
            .join('')}</div>`;

        const subtitleHtml = cfg.subtitle
            ? `<div class="paper-section-sub"><em>${esc(cfg.subtitle)}</em></div>` : '';

        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head>
<meta charset="UTF-8" />
<title>${esc(cfg.reportTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @page {
        ${cfg.landscape ? 'size: A4 landscape;' : ''}
        margin: 12mm 8mm 22mm 8mm;
        @bottom-left { content: "● " "${cssStr(confidential)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 0 0 8mm; }
        @bottom-center { content: "${cssStr(pageWord)} " counter(page) " ${cssStr(ofWord)} " counter(pages); font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm; }
        @bottom-right { content: "${cssStr(warning)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 8mm 0 0; }
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
    .paper-section-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; }

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
    /* Keep the grand-total on the LAST page only — table-footer-group would repeat it on every page. */
    tfoot { display: table-row-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 7pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; padding: 2mm; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm; font-size: 9pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.06); vertical-align: middle; background: #fff; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    tr.band td { background: #ece9e0; font-family: ${serif}; font-weight: 700; font-size: 9.5pt; letter-spacing: 0.04em; text-transform: uppercase; color: #0b0b0b; }
    tr.subtotal td { background: #f0efe9; font-weight: 700; }
    tr.grand td { padding: 2mm; font-size: 9pt; font-weight: 700; border: 1px solid rgba(11,11,11,0.12); background: #e7e4da; }
    tfoot tr.grand td { padding: 2mm; font-size: 9pt; font-weight: 700; border: 1px solid rgba(11,11,11,0.12); background: #e7e4da; }
    /* Sections may span pages — DON'T avoid breaks, or a tall table jumps whole to
       the next page and leaves the letterhead alone on page 1. Keep the title with
       its first rows instead, and repeat the header on each page (thead group). */
    .matrix-section { margin-bottom: 6mm; }
    .matrix-title { font-family: ${serif}; font-weight: 700; font-size: 11pt; letter-spacing: 0.04em; text-transform: uppercase; color: #0b0b0b; margin: 0 0 1.5mm; padding: 1.5mm 2mm; background: #ece9e0; page-break-after: avoid; break-after: avoid; }
    ${cfg.landscape ? `
    /* Landscape pivots are wide — shrink type & padding so the table fits the page width. */
    table { font-size: 7pt; table-layout: fixed; }
    thead th { font-size: 5.5pt; padding: 1mm 0.6mm; letter-spacing: 0.03em; word-break: break-word; white-space: normal; }
    tbody td { font-size: 6.5pt; padding: 0.8mm 0.6mm; word-break: break-word; }
    tr.subtotal td, tr.grand td { font-size: 6.5pt; padding: 0.8mm 0.6mm; }
    .matrix-title { font-size: 9pt; }
    ` : ''}
</style>
</head>
<body>
    <div class="paper">
        <header class="paper-head">
            <div class="overline">${esc(overline)}</div>
            <h1 class="paper-title">${esc(orgTitle)}</h1>
            <div class="paper-sub"><em>${esc(orgSubtitle)}</em></div>
            <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
            <h2 class="paper-section">${esc(cfg.reportTitle)}</h2>
            ${subtitleHtml}
        </header>
        <div class="criteria">
            <div class="criteria-strip">
                <span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(criteriaTitle)}</span>
                <span class="criteria-strip-date">${esc(generatedLabel)} &middot; ${esc(formattedDate)}</span>
            </div>
            ${criteriaGridHtml}
        </div>
        ${tableBlockHtml}
    </div>
</body>
</html>`;
    }
}
