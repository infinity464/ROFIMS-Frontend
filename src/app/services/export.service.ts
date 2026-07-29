import { Injectable } from '@angular/core';
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    ImageRun,
    TableLayoutType,
    PageOrientation,
    Footer,
    PageNumber,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ReportConfig {
    title: string;
    lang: 'en' | 'bn';
    columns: string[];
    rows: string[][];
    /**
     * Optional final row rendered after `rows` (e.g. "Total" line). When supplied,
     * the last data row is glued to it via keep-with-next so the totals can't
     * orphan onto a new page.
     */
    subtotalRow?: string[];
    showPageNumbers: boolean;
    /** Optional base filename (without extension). Falls back to 'report_en/bn'. */
    filename?: string;
    /** Optional applied filter lines shown below the date (e.g. "Rank: Major"). */
    filterLines?: string[];
    /**
     * Optional scope lines rendered ABOVE the date — used for access-scope
     * chips (e.g. unit picks) that should sit visually closer to the title
     * than the filter banner. Each entry becomes its own line.
     */
    preDateLines?: string[];
    /** Use landscape orientation (default false = portrait). */
    landscape?: boolean;
    /** Page margin in mm (default 20). */
    marginMm?: number;
    /**
     * Render the RAB letterhead (Government overline, "RAPID ACTION BATTALION"
     * title, subtitle, and a SELECTION CRITERIA grid) so Word matches the
     * frontend print design. Used by the statistics reports.
     */
    rabLetterhead?: boolean;
    /** Label/value pairs shown in the SELECTION CRITERIA grid (letterhead mode). */
    criteriaItems?: { label: string; value: string }[];
    /**
     * Complex-script font used for `lang: 'bn'` Word exports. Defaults to
     * 'SolaimanLipi'.
     *
     * Word cannot fall back through a font stack: if the named font is not
     * REGISTERED on the reader's machine (having the .ttf in C:\Windows\Fonts is
     * not enough), it silently drops to the Latin font and every Bengali glyph
     * renders as a tofu box. Pass 'Nirmala UI' — which ships with Windows and is
     * always registered — when the document must render on any machine.
     */
    bnFont?: string;
}

/** One section in a sectioned report: org-style heading + its own table. */
export interface ReportSection {
    /** Heading text rendered above the section's table (e.g. "Army"). */
    title: string;
    /**
     * Optional per-section column headers. When present, this section's table uses
     * its own columns instead of the top-level `SectionedReportConfig.columns`.
     * Used by reports where each section has a different column set (e.g. mother-org-wise
     * manpower where rank columns vary per organisation).
     */
    columns?: string[];
    /** Data rows inside this section's table. */
    rows: string[][];
    /** Optional trailing row inside the table (subtotal). */
    subtotalRow?: string[];
}

/** Config for sectioned exports: one table per section, each with its own heading. */
export interface SectionedReportConfig extends Omit<ReportConfig, 'rows'> {
    sections: ReportSection[];
    /** Optional final row rendered after all sections (e.g. Grand Total). */
    grandTotalRow?: string[];
}

/**
 * Two-row header export (e.g. unit × rank pivot tables): leading columns are merged
 * vertically across both header rows, each group column is merged horizontally across
 * its sub-headers. Each data row must have leadingColumns.length +
 * groupColumns.length × subHeaders.length cells.
 */
export interface MatrixReportConfig {
    title: string;
    lang: 'en' | 'bn';
    /** Columns shown at the start that get rowspan=2 in the header (e.g. ['Unit']). */
    leadingColumns: string[];
    /** Top-level group labels — each spans subHeaders.length sub-columns. */
    groupColumns: string[];
    /** Sub-header row repeated under each group (e.g. ['Auth', 'Held']). */
    subHeaders: string[];
    /** Data rows for the single-table mode (ignored when `sections` is provided). */
    rows: string[][];
    /**
     * Optional: render one matrix table per section, each with an optional banner above.
     * Every section shares the same `groupColumns` + `subHeaders` (column structure is
     * uniform); only `rows` and the banner differ. Used by unit-rank-wise when multiple
     * RAB Units are drilled into.
     */
    sections?: { title?: string; rows: string[][] }[];
    filename?: string;
    filterLines?: string[];
    /** Use landscape orientation in Word (default false). */
    landscape?: boolean;
    /** When true, render "Page X of Y" centred in the Word footer. */
    showPageNumbers?: boolean;
}

/** One section in a profile export: heading + table (same as web view). */
export interface ProfileExportSection {
    title: string;
    columns: string[];
    rows: string[][];
    /** When true, do not render table header row (label-value blocks like Basic Service, Address). */
    noTableHeader?: boolean;
    /** When true, render Permanent/Present Address as full-width subsection headers. */
    addressSection?: boolean;
    /** Columns per row for label-value sections (default 3). Use 2 for 2x2 layout. */
    colsPerRow?: 2 | 3;
}

/** Config for full profile export (multiple sections, same style as web view). */
export interface ProfileExportConfig {
    title: string;
    lang: 'en' | 'bn';
    sections: ProfileExportSection[];
    showPageNumbers: boolean;
    /** Profile photo as data URL (e.g. data:image/jpeg;base64,...) for PDF/Word. */
    imageDataUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
    exportPDF(config: ReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const title = config.title;
        const dateText = dateStr;
        const columns = config.columns;
        const rows = config.rows;
        // Same font as Word: SolaimanLipi (Bangla) / Times New Roman (English)
        const fontFamily = config.lang === 'bn' ? "'Times New Roman', 'SolaimanLipi', serif" : "'Times New Roman', serif";
        // Same sizes as Word: page header 14pt, table header 10pt, content 8pt (bn) / 11pt (en)
        const sizeContentPt = config.lang === 'bn' ? '8pt' : '11pt';
        const pageSize = config.landscape ? 'A4 landscape' : 'A4';
        const margin = `${config.marginMm ?? 20}mm`;
        const pageFooter = config.showPageNumbers
            ? `
            @page {
                size: ${pageSize};
                margin: ${margin};
                @bottom-center {
                    content: "Page " counter(page) " of " counter(pages);
                    font-family: ${fontFamily};
                    font-size: 9pt;
                    color: #555;
                }
            }
        `
            : `
            @page {
                size: ${pageSize};
                margin: ${margin};
            }
        `;

        const headerCells = columns
            .map(
                (c) =>
                    `<th style="padding:4px 6px;font-weight:700;font-size:10pt;text-align:left;word-break:break-word;border:1px solid #ccc">${escapeHtml(c)}</th>`
            )
            .join('');
        const dataRows = rows
            .map(
                (row) => {
                    const cells = row
                        .map(
                            (cell) =>
                                `<td style="padding:3px 6px;word-break:break-word;font-size:${sizeContentPt};border:1px solid #ccc">${escapeHtml(cell)}</td>`
                        )
                        .join('');
                    return `<tr style="page-break-inside:avoid">${cells}</tr>`;
                }
            )
            .join('');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(config.filename ? `${config.filename}_${config.lang}` : title)}</title>
    <style>
        body { font-family: ${fontFamily}; font-size: ${sizeContentPt}; margin: 0; padding: 0; }
        h1 { font-family: ${fontFamily}; font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 8px; }
        .date { font-family: ${fontFamily}; font-size: 14pt; color: #555; text-align: center; margin-bottom: 4px; }
        .pre-date { font-family: ${fontFamily}; font-size: 11pt; color: var(--p-primary-color, #10b981); text-align: center; margin-bottom: 4px; font-weight: 500; }
        .filters { font-family: ${fontFamily}; font-size: 10pt; color: #333; text-align: center; margin-bottom: 16px; }
        .filters span { display: inline-block; margin: 2px 6px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-family: ${fontFamily}; }
        thead th { font-family: ${fontFamily}; }
        tbody td { font-family: ${fontFamily}; }
        ${pageFooter}
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    ${(config.preDateLines?.length) ? config.preDateLines.map(l => `<div class="pre-date">${escapeHtml(l)}</div>`).join('') : ''}
    <div class="date">${escapeHtml(dateText)}</div>
    ${(config.filterLines?.length) ? `<div class="filters">${config.filterLines.map(l => `<span>${escapeHtml(l)}</span>`).join(' | ')}</div>` : ''}
    <table>
        <thead>
            <tr>${headerCells}</tr>
        </thead>
        <tbody>${dataRows}</tbody>
    </table>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => {
            win.print();
            win.close();
        }, 800);
    }

    /**
     * Builds the flat Word <see cref="Document"/> in memory without saving it.
     * Used by <c>exportWord</c> as well as by consumers that want to pack the
     * docx → blob → server PDF conversion themselves (mirroring the mother-org
     * reports' "PDF via Word" path).
     */
    buildWordDoc(config: ReportConfig): Document {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        // Use SolaimanLipi for Bangla so Word renders Bengali Unicode without font embedding (ships with Windows 8+ / Office).
        const font = config.lang === 'bn' ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const } : 'Times New Roman';
        const title = config.title;
        const dateText = dateStr;
        const columns = config.columns;
        const rows = config.rows;
        // A4 landscape ≈ 297mm, portrait ≈ 210mm. After ~1" margins the usable width in DXA
        // (1/20 pt; 1440 DXA = 1 inch) is ~13900 (landscape) / ~9000 (portrait).
        const totalDxa = config.landscape ? 13900 : 9000;
        const cellWidth = Math.floor(totalDxa / Math.max(config.columns.length, 1));
        // Sizes are in half-points: 24 = 12pt, 20 = 10pt, 18 = 9pt, 12 = 6pt.
        const sizePageHeader = 24;
        const sizeTableHeader = 16;
        const sizeTableContent = config.lang === 'bn' ? 12 : 18;
        const borders = {
            top:    { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            left:   { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            right:  { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
        };

        // tableHeader + keepNext: the header repeats on every page and sticks to the first body row.
        const headerRow = new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: columns.map(
                (col) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: col, bold: true, font, size: sizeTableHeader })],
                                alignment: AlignmentType.LEFT,
                                spacing: { after: 100 },
                                keepNext: true,
                            }),
                        ],
                        borders,
                        width: { size: cellWidth, type: WidthType.DXA },
                    })
            ),
        });

        const lastDataIdx = rows.length - 1;
        const dataRows = rows.map((row, ri) => {
            // Glue the last data row to the subtotal row (when one is supplied)
            // so the totals line can't orphan onto a new page.
            const keepWithNext = config.subtotalRow != null && ri === lastDataIdx;
            return new TableRow({
                cantSplit: true,
                children: row.map(
                    (cell) =>
                        new TableCell({
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: cell, font, size: sizeTableContent })],
                                    spacing: { after: 100 },
                                    keepNext: keepWithNext,
                                }),
                            ],
                            borders,
                            width: { size: cellWidth, type: WidthType.DXA },
                        })
                ),
            });
        });

        const subtotalRow = config.subtotalRow ? new TableRow({
            cantSplit: true,
            children: config.subtotalRow.map(
                (cell) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: cell, font, size: sizeTableContent, bold: true })],
                                spacing: { after: 100 },
                            }),
                        ],
                        borders,
                        width: { size: cellWidth, type: WidthType.DXA },
                    })
            ),
        }) : null;

        const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: subtotalRow ? [headerRow, ...dataRows, subtotalRow] : [headerRow, ...dataRows],
        });

        // "Page X of Y" centred footer — only when explicitly requested.
        const footers = config.showPageNumbers ? {
            default: new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ children: ['Page ', PageNumber.CURRENT], font, size: 16, color: '555555' }),
                        new TextRun({ children: [' of ', PageNumber.TOTAL_PAGES], font, size: 16, color: '555555' }),
                    ],
                })],
            }),
        } : undefined;

        return new Document({
            sections: [
                {
                    properties: config.landscape ? {
                        page: { size: { orientation: PageOrientation.LANDSCAPE } },
                    } : undefined,
                    footers,
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: title,
                                    bold: true,
                                    size: sizePageHeader,
                                    color: '1e3a5f',
                                    font,
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: (config.preDateLines?.length) ? 120 : 200 },
                        }),
                        // Scope chip(s) — rendered between title and date so
                        // the org/scope context reads with the title.
                        ...((config.preDateLines ?? []).map((line) => new Paragraph({
                            children: [new TextRun({
                                text: line,
                                size: 22,
                                color: '10b981',
                                bold: true,
                                font,
                            })],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 120 },
                        }))),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: dateText,
                                    size: sizePageHeader,
                                    color: '666666',
                                    font,
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: (config.filterLines?.length) ? 150 : 300 },
                        }),
                        ...(config.filterLines?.length ? [new Paragraph({
                            children: config.filterLines.map((line, i) => new TextRun({
                                text: (i > 0 ? '  |  ' : '') + line,
                                size: 16,
                                color: '333333',
                                font,
                            })),
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 300 },
                        })] : []),
                        table,
                    ],
                },
            ],
        });
    }

    async exportWord(config: ReportConfig): Promise<void> {
        const doc = this.buildWordDoc(config);
        const blob = await Packer.toBlob(doc);
        const base = config.filename ?? 'report';
        saveAs(blob, `${base}_${config.lang}.docx`);
    }

    exportExcel(config: ReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const filterLine = config.filterLines?.length ? config.filterLines.join('  |  ') : '';
        const preDateLines = config.preDateLines ?? [];
        const data: unknown[][] = [
            [config.title],
            // Scope chip rows between title and date so the layout mirrors the
            // on-screen header and the Word / PDF exports.
            ...preDateLines.map(line => [line]),
            [dateStr],
            ...(filterLine ? [[filterLine]] : []),
            [],
            config.columns,
            ...config.rows,
            ...(config.subtotalRow ? [config.subtotalRow] : []),
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = config.columns.map(() => ({ wch: 22 }));

        const colCount = config.columns.length;
        // Each header row gets a horizontal merge across the column range. Title
        // is row 0; pre-date scope lines follow; then date; then optional filter.
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        ];
        let nextRow = 1;
        for (let i = 0; i < preDateLines.length; i++) {
            merges.push({ s: { r: nextRow, c: 0 }, e: { r: nextRow, c: colCount - 1 } });
            nextRow++;
        }
        // Date row
        merges.push({ s: { r: nextRow, c: 0 }, e: { r: nextRow, c: colCount - 1 } });
        nextRow++;
        if (filterLine) {
            merges.push({ s: { r: nextRow, c: 0 }, e: { r: nextRow, c: colCount - 1 } });
        }
        ws['!merges'] = merges;

        const wb = XLSX.utils.book_new();
        const sheetName = config.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const base = config.filename ?? 'report';
        const filename = `${base}_${config.lang}.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    /**
     * Builds the matrix Word <see cref="Document"/> in memory without saving it —
     * the same two-row-header layout as <c>exportWordMatrix</c>. Used by consumers
     * that want to pack the docx → blob → server PDF conversion themselves.
     */
    buildMatrixWordDoc(config: MatrixReportConfig): Document {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
        const font = config.lang === 'bn' ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const } : 'Times New Roman';
        // Sizes in half-points: 24 = 12pt, 16 = 8pt, 18 = 9pt, 12 = 6pt.
        const sizePageHeader = 24;
        const sizeTableHeader = 16;
        const sizeTableContent = config.lang === 'bn' ? 12 : 18;

        const leadCount = config.leadingColumns.length;
        const subCount = Math.max(config.subHeaders.length, 1);
        const groupCount = config.groupColumns.length;
        const totalCols = leadCount + groupCount * subCount;
        // A4 landscape ≈ 297mm, portrait ≈ 210mm. After ~1" margins the usable width in DXA
        // (1/20 pt; 1440 DXA = 1 inch) is ~13900 (landscape) / ~9000 (portrait).
        const totalDxa = config.landscape ? 13900 : 9000;

        // Per-column widths. Leading columns get a wider share (twice a sub-column), the rest
        // is split evenly across the group sub-columns. Last column absorbs the rounding diff
        // so the row sums to totalDxa exactly — Word's FIXED layout is unforgiving here.
        const leadShare = 2;
        const subShare = 1;
        const totalShares = leadCount * leadShare + groupCount * subCount * subShare;
        const unit = totalDxa / totalShares;
        const colWidths: number[] = [];
        for (let i = 0; i < leadCount; i++) colWidths.push(Math.floor(unit * leadShare));
        for (let i = 0; i < groupCount * subCount; i++) colWidths.push(Math.floor(unit * subShare));
        const widthSum = colWidths.reduce((a, b) => a + b, 0);
        if (widthSum < totalDxa) colWidths[colWidths.length - 1] += (totalDxa - widthSum);

        const borders = {
            top:    { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            left:   { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            right:  { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
        };

        // keepNext on header paragraphs makes the two-row header stick with the
        // first data row so it can't orphan at the bottom of a page.
        const headerCell = (text: string, opts: { rowSpan?: number; columnSpan?: number; width: number }) =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text, bold: true, font, size: sizeTableHeader })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                    keepNext: true,
                })],
                borders,
                rowSpan: opts.rowSpan,
                columnSpan: opts.columnSpan,
                width: { size: opts.width, type: WidthType.DXA },
            });

        // Row 1: leading columns (rowSpan=2) + each group label (columnSpan=subCount).
        // Built via a factory so we can emit a fresh copy per section in sectioned mode.
        const headerRow1Factory = () => new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
                ...config.leadingColumns.map((c, i) =>
                    headerCell(c, { rowSpan: 2, width: colWidths[i] })),
                ...config.groupColumns.map((g, gi) => {
                    const startCol = leadCount + gi * subCount;
                    const groupWidth = colWidths.slice(startCol, startCol + subCount).reduce((a, b) => a + b, 0);
                    return headerCell(g, { columnSpan: subCount, width: groupWidth });
                }),
            ],
        });
        // Row 2: sub-headers under every group (leading columns are already covered by rowSpan).
        const headerRow2Factory = () => new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: Array.from({ length: groupCount * subCount }, (_, idx) => {
                const sub = config.subHeaders[idx % subCount];
                return headerCell(sub, { width: colWidths[leadCount + idx] });
            }),
        });

        // cantSplit prevents a row's own content from breaking across pages.
        const buildDataRows = (rows: string[][]): TableRow[] => rows.map(row => {
            const cells = row.slice(0, totalCols);
            while (cells.length < totalCols) cells.push('');
            return new TableRow({
                cantSplit: true,
                children: cells.map((cell, i) => new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: cell, font, size: sizeTableContent })],
                        alignment: i < leadCount ? AlignmentType.LEFT : AlignmentType.CENTER,
                        spacing: { after: 80 },
                    })],
                    borders,
                    width: { size: colWidths[i], type: WidthType.DXA },
                })),
            });
        });

        // Each rendered matrix table re-emits its own two-row header so the
        // header repeats above every section (e.g. one per drilled-into RAB Unit).
        const buildTable = (rows: string[][]): Table => new Table({
            width: { size: totalDxa, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: colWidths,
            rows: [
                // Each call to headerCell returns a fresh TableCell, so it's safe to
                // re-clone the header rows per section.
                headerRow1Factory(), headerRow2Factory(),
                ...buildDataRows(rows),
            ],
        });

        const filterPara = config.filterLines?.length ? [new Paragraph({
            children: config.filterLines.map((line, i) => new TextRun({
                text: (i > 0 ? '  |  ' : '') + line, size: 20, color: '333333', font,
            })),
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
        })] : [];

        // "Page X of Y" centred footer — only when explicitly requested.
        const footers = config.showPageNumbers ? {
            default: new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ children: ['Page ', PageNumber.CURRENT], font, size: 16, color: '555555' }),
                        new TextRun({ children: [' of ', PageNumber.TOTAL_PAGES], font, size: 16, color: '555555' }),
                    ],
                })],
            }),
        } : undefined;

        // Sectioned mode: one banner + matrix table per section. Fallback: single matrix
        // table from top-level `rows` (backwards-compatible with the original signature).
        const sectionBlocks: (Paragraph | Table)[] = [];
        if (config.sections && config.sections.length > 0) {
            const sizeSectionHeader = 20;
            config.sections.forEach((sec, idx) => {
                if (sec.title) {
                    sectionBlocks.push(new Paragraph({
                        children: [new TextRun({ text: sec.title, bold: true, size: sizeSectionHeader, font })],
                        spacing: { before: idx > 0 ? 240 : 0, after: 120 },
                        keepNext: true,
                        keepLines: true,
                    }));
                }
                sectionBlocks.push(buildTable(sec.rows));
            });
        } else {
            sectionBlocks.push(buildTable(config.rows));
        }

        return new Document({
            sections: [{
                properties: config.landscape ? {
                    page: { size: { orientation: PageOrientation.LANDSCAPE } },
                } : undefined,
                footers,
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: config.title, bold: true, size: sizePageHeader, color: '1e3a5f', font })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 },
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: dateStr, size: sizePageHeader, color: '666666', font })],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: filterPara.length ? 150 : 300 },
                    }),
                    ...filterPara,
                    ...sectionBlocks,
                ],
            }],
        });
    }

    /**
     * Word export with a two-row header. Leading columns merge vertically (rowSpan=2);
     * each group column merges horizontally across its sub-headers (columnSpan=subCount).
     * Mirrors exportExcelMatrix so pivot tables look the same in both formats.
     */
    async exportWordMatrix(config: MatrixReportConfig): Promise<void> {
        const doc = this.buildMatrixWordDoc(config);
        const blob = await Packer.toBlob(doc);
        const base = config.filename ?? 'report';
        saveAs(blob, `${base}_${config.lang}.docx`);
    }

    /**
     * Excel export with a two-row header. Leading columns merge vertically across both
     * header rows; each group column merges horizontally across its sub-headers.
     * Use for unit × rank pivot tables where a flat header would lose the grouping.
     */
    exportExcelMatrix(config: MatrixReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });

        const filterLine = config.filterLines?.length ? config.filterLines.join('  |  ') : '';
        const leadCount = config.leadingColumns.length;
        const subCount = Math.max(config.subHeaders.length, 1);
        const groupCount = config.groupColumns.length;
        const totalCols = leadCount + groupCount * subCount;

        // Header row 1: leading labels, then each group label followed by (subCount-1) blanks.
        const headerRow1: string[] = [...config.leadingColumns];
        for (const g of config.groupColumns) {
            headerRow1.push(g);
            for (let i = 1; i < subCount; i++) headerRow1.push('');
        }
        // Header row 2: blank under leading columns, sub-headers repeated per group.
        const headerRow2: string[] = config.leadingColumns.map(() => '');
        for (let g = 0; g < groupCount; g++) {
            for (const sub of config.subHeaders) headerRow2.push(sub);
        }

        const data: unknown[][] = [
            [config.title],
            [dateStr],
            ...(filterLine ? [[filterLine]] : []),
            [],
        ];
        const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
        ];
        if (filterLine) {
            merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } });
        }

        // Sectioned mode: banner row + repeated two-row header + rows, per section.
        // Single-table mode: top-level rows with one header block.
        const sections = config.sections && config.sections.length > 0
            ? config.sections
            : [{ title: undefined as string | undefined, rows: config.rows }];

        for (const sec of sections) {
            if (sec.title) {
                const titleRowIdx = data.length;
                data.push([sec.title]);
                merges.push({ s: { r: titleRowIdx, c: 0 }, e: { r: titleRowIdx, c: totalCols - 1 } });
            }
            const h1Row = data.length;
            const h2Row = h1Row + 1;
            data.push(headerRow1);
            data.push(headerRow2);
            // Leading columns: merge vertically (rowspan=2).
            for (let c = 0; c < leadCount; c++) {
                merges.push({ s: { r: h1Row, c }, e: { r: h2Row, c } });
            }
            // Group columns: merge horizontally across their sub-headers.
            if (subCount > 1) {
                for (let g = 0; g < groupCount; g++) {
                    const startCol = leadCount + g * subCount;
                    merges.push({ s: { r: h1Row, c: startCol }, e: { r: h1Row, c: startCol + subCount - 1 } });
                }
            }
            for (const r of sec.rows) data.push(r);
            data.push([]);  // blank row between sections
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = Array.from({ length: totalCols }, (_, i) => ({ wch: i < leadCount ? 22 : 12 }));
        ws['!merges'] = merges;

        const wb = XLSX.utils.book_new();
        const sheetName = config.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const base = config.filename ?? 'report';
        XLSX.writeFile(wb, `${base}_${config.lang}.xlsx`);
    }

    /**
     * Builds the sectioned Word <see cref="Document"/> in memory without saving it.
     * Used by <c>exportWordSectioned</c> as well as by consumers that want to
     * pack the docx → blob → server PDF conversion themselves (e.g. mother-unit-wise
     * report's "PDF via Word" path, mirroring notesheet-preview).
     */
    buildSectionedWordDoc(config: SectionedReportConfig): Document {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
        const font = config.lang === 'bn'
            ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: config.bnFont ?? 'SolaimanLipi', hint: 'cs' as const }
            : 'Times New Roman';
        // A4 landscape ≈ 297mm, portrait ≈ 210mm. After ~1" margins the usable width in DXA
        // (1/20 pt; 1440 DXA = 1 inch) is ~13900 (landscape) / ~9000 (portrait).
        const totalDxa = config.landscape ? 13900 : 9000;
        // Sizes are in half-points: 24 = 12pt, 20 = 10pt, 16 = 8pt, 18 = 9pt, 12 = 6pt.
        const sizePageHeader = 24;
        const sizeSectionHeader = 20;
        const sizeTableHeader = 16;
        const sizeTableContent = config.lang === 'bn' ? 12 : 18;
        const borders = {
            top:    { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            left:   { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
            right:  { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
        };

        // Per-section helper factory: lets each section use its own column set
        // (e.g. mother-org reports where rank columns vary per org).
        const makeHelpers = (cols: string[]) => {
            const colCount = Math.max(cols.length, 1);
            const cellWidth = Math.floor(totalDxa / colCount);
            const colWidths = Array.from({ length: colCount }, (_, i) =>
                i === colCount - 1 ? totalDxa - cellWidth * (colCount - 1) : cellWidth
            );

            // tableHeader: header repeats on each page if the table spans multiple pages.
            // keepNext on the header paragraphs makes the header stick with the first body row,
            // so a section title + header row never orphan above the first data row.
            const makeHeaderRow = () => new TableRow({
                tableHeader: true,
                cantSplit: true,
                children: cols.map((col, i) => new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: col, bold: true, font, size: sizeTableHeader })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 100 },
                        keepNext: true,
                    })],
                    borders,
                    width: { size: colWidths[i], type: WidthType.DXA },
                })),
            });

            // keepWithNext on a body row makes it stick with the following row. Used for
            // the last body row in a section so the subtotal can't orphan onto a new page.
            const makeBodyRow = (row: string[], bold = false, keepWithNext = false) => {
                const cells = row.slice(0, colCount);
                while (cells.length < colCount) cells.push('');
                return new TableRow({
                    cantSplit: true,
                    children: cells.map((cell, i) => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: cell, font, size: sizeTableContent, bold })],
                            spacing: { after: 100 },
                            keepNext: keepWithNext,
                        })],
                        borders,
                        width: { size: colWidths[i], type: WidthType.DXA },
                    })),
                });
            };

            const makeTable = (rows: TableRow[]) => new Table({
                width: { size: totalDxa, type: WidthType.DXA },
                layout: TableLayoutType.FIXED,
                columnWidths: colWidths,
                rows,
            });

            return { makeHeaderRow, makeBodyRow, makeTable };
        };

        let children: (Paragraph | Table)[];

        if (config.rabLetterhead) {
            const isBn = config.lang === 'bn';
            const overline = isBn ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার' : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
            const orgTitle = isBn ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION';
            const orgSubtitle = isBn ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা' : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
            const criteriaTitle = isBn ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA';
            const generatedLabel = isBn ? 'তারিখ' : 'GENERATED';
            const items = config.criteriaItems ?? [];

            children = [
                new Paragraph({
                    children: [new TextRun({ text: overline, size: 15, color: '555555', font, allCaps: !isBn })],
                    alignment: AlignmentType.CENTER, spacing: { after: 60 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: orgTitle, bold: true, size: 40, color: '0b0b0b', font })],
                    alignment: AlignmentType.CENTER, spacing: { after: 40 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: orgSubtitle, italics: true, size: 18, color: '555555', font })],
                    alignment: AlignmentType.CENTER, spacing: { after: 80 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: '◆', size: 18, color: 'b78b3b', font })],
                    alignment: AlignmentType.CENTER, spacing: { after: 120 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: config.title, bold: true, size: 26, color: '0b0b0b', font, allCaps: !isBn })],
                    alignment: AlignmentType.CENTER, spacing: { after: 160 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: `◆ ${criteriaTitle}`, bold: true, size: 16, color: '4a4a4a', font, allCaps: !isBn }),
                               new TextRun({ text: `        ${generatedLabel} · ${dateStr.toUpperCase()}`, size: 14, color: '888888', font })],
                    spacing: { after: 100 },
                }),
            ];

            // SELECTION CRITERIA grid: a bordered table, up to 3 label/value cells per row.
            if (items.length > 0) {
                const cellBorders = {
                    top:    { style: BorderStyle.SINGLE, size: 1, color: 'e6e4de' },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e6e4de' },
                    left:   { style: BorderStyle.SINGLE, size: 1, color: 'e6e4de' },
                    right:  { style: BorderStyle.SINGLE, size: 1, color: 'e6e4de' },
                };
                const perRow = 3;
                const cellW = Math.floor(totalDxa / perRow);
                const critRows: TableRow[] = [];
                for (let i = 0; i < items.length; i += perRow) {
                    const slice = items.slice(i, i + perRow);
                    while (slice.length < perRow) slice.push({ label: '', value: '' });
                    critRows.push(new TableRow({
                        cantSplit: true,
                        children: slice.map(it => new TableCell({
                            children: [
                                new Paragraph({ children: [new TextRun({ text: it.label, size: 13, color: '8a8a8a', font, allCaps: !isBn })], spacing: { after: 20 } }),
                                new Paragraph({ children: [new TextRun({ text: it.value, bold: true, size: 18, color: '0b0b0b', font })] }),
                            ],
                            borders: cellBorders,
                            width: { size: cellW, type: WidthType.DXA },
                        })),
                    }));
                }
                children.push(new Table({
                    width: { size: totalDxa, type: WidthType.DXA },
                    layout: TableLayoutType.FIXED,
                    columnWidths: Array.from({ length: perRow }, () => cellW),
                    rows: critRows,
                }));
            }
            children.push(new Paragraph({ children: [], spacing: { after: 200 } }));
        } else {
            children = [
                new Paragraph({
                    children: [new TextRun({ text: config.title, bold: true, size: sizePageHeader, color: '1e3a5f', font })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: dateStr, size: sizePageHeader, color: '666666', font })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: (config.filterLines?.length) ? 150 : 300 },
                }),
                ...(config.filterLines?.length ? [new Paragraph({
                    children: config.filterLines.map((line, i) => new TextRun({
                        text: (i > 0 ? '  |  ' : '') + line, size: 20, color: '333333', font,
                    })),
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 300 },
                })] : []),
            ];
        }

        const lastSectionIdx = config.sections.length - 1;
        config.sections.forEach((sec, idx) => {
            // Skip the heading paragraph for untitled sections (e.g. a single-table report).
            if (sec.title) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: sec.title, bold: true, size: sizeSectionHeader, font })],
                    spacing: { before: idx > 0 ? 200 : 0, after: 120 },
                    keepNext: true,
                    keepLines: true,
                }));
            }
            // Section-level columns override top-level columns when present.
            const cols = sec.columns ?? config.columns;
            const { makeHeaderRow, makeBodyRow, makeTable } = makeHelpers(cols);
            const tableRows: TableRow[] = [makeHeaderRow()];
            const lastBodyIdx = sec.rows.length - 1;
            sec.rows.forEach((r, ri) => {
                // Last body row sticks to the subtotal (if any) so the totals row
                // can't end up alone on the next page.
                const keepWithNext = sec.subtotalRow != null && ri === lastBodyIdx;
                tableRows.push(makeBodyRow(r, false, keepWithNext));
            });
            if (sec.subtotalRow) {
                // For the FINAL section, glue the subtotal row to the spacer + grand-total
                // table that follows so the cross-org grand total can't orphan onto a new page.
                const isLastSection = idx === lastSectionIdx;
                const keepWithNext = isLastSection && config.grandTotalRow != null;
                tableRows.push(makeBodyRow(sec.subtotalRow, true, keepWithNext));
            }
            children.push(makeTable(tableRows));
        });

        if (config.grandTotalRow) {
            // Grand-total table renders against the grandTotalRow's own column count.
            const gtCols = config.grandTotalRow.map(() => '');
            const { makeBodyRow, makeTable } = makeHelpers(gtCols);
            // Minimal spacer so the grand total sits tight against the previous table.
            // Less vertical padding = better chance of fitting at the bottom of the
            // page where the last section ended (instead of being pushed onto a new page).
            children.push(new Paragraph({
                children: [new TextRun({ text: '', font, size: sizeTableContent })],
                spacing: { before: 60, after: 0 },
                keepNext: true,
            }));
            children.push(makeTable([makeBodyRow(config.grandTotalRow, true)]));
        }

        // "Page X of Y" centred footer — only emitted when explicitly requested,
        // so callers that don't care (e.g. embedded snapshots) stay clean.
        // Bangla documents get the "পাতা-X/Y" form instead. Word renders the field
        // digits per its own locale, so these can still come out as 1/2 rather
        // than ১/২ — only the print/PDF view guarantees Bangla numerals.
        const footers = config.showPageNumbers ? {
            default: new Footer({
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: config.lang === 'bn'
                        ? [
                            new TextRun({ children: ['পাতা-', PageNumber.CURRENT], font, size: 16, color: '555555' }),
                            new TextRun({ children: ['/', PageNumber.TOTAL_PAGES], font, size: 16, color: '555555' }),
                        ]
                        : [
                            new TextRun({ children: ['Page ', PageNumber.CURRENT], font, size: 16, color: '555555' }),
                            new TextRun({ children: [' of ', PageNumber.TOTAL_PAGES], font, size: 16, color: '555555' }),
                        ],
                })],
            }),
        } : undefined;

        return new Document({
            sections: [{
                properties: config.landscape ? {
                    page: { size: { orientation: PageOrientation.LANDSCAPE } },
                } : undefined,
                footers,
                children,
            }],
        });
    }

    /**
     * Word export with one table per section. Each section gets a heading paragraph
     * (e.g. "Army") above its own table. Optional final grand-total row after all sections.
     */
    async exportWordSectioned(config: SectionedReportConfig): Promise<void> {
        const doc = this.buildSectionedWordDoc(config);
        const blob = await Packer.toBlob(doc);
        const base = config.filename ?? 'report';
        saveAs(blob, `${base}_${config.lang}.docx`);
    }

    /**
     * Opens a popup window that embeds the supplied PDF blob URL in a full-window
     * iframe and auto-triggers the browser's print dialog once the PDF has rendered.
     * Mirrors unit-rank-wise-manpower's print-button UX but works against the
     * Word-derived PDF so the printed output matches the PDF / Word file exactly.
     */
    openPdfPrintPopup(pdfUrl: string): void {
        const win = window.open('', '_blank', 'width=1100,height=800');
        if (!win) return;
        const html = `<!DOCTYPE html>
<html>
<head><title>Print Preview</title>
<style>html,body{margin:0;padding:0;height:100%;background:#525659}</style>
</head>
<body>
<iframe id="pdfFrame" src="${pdfUrl}" style="width:100vw;height:100vh;border:0"></iframe>
<script>
  (function(){
    var f = document.getElementById('pdfFrame');
    var printed = false;
    var doPrint = function() {
      if (printed) return;
      printed = true;
      // 600ms gives the in-browser PDF viewer time to lay out the first page.
      setTimeout(function() {
        try { f.contentWindow.print(); }
        catch (e) { try { window.print(); } catch (_) {} }
      }, 600);
    };
    f.addEventListener('load', doPrint);
    // Safety net for browsers whose PDF plugin doesn't dispatch 'load'.
    setTimeout(doPrint, 2500);
  })();
</script>
</body></html>`;
        win.document.open();
        win.document.write(html);
        win.document.close();
    }

    /**
     * Excel export with one table per section. Each section is preceded by a merged row
     * containing the section title; the table header repeats per section so it's readable
     * when each section is treated as its own block.
     */
    exportExcelSectioned(config: SectionedReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
        const filterLine = config.filterLines?.length ? config.filterLines.join('  |  ') : '';

        // Per-section column resolution: section.columns overrides config.columns.
        // Sheet width spans the widest section so title / date / section-title rows
        // can merge cleanly across every column.
        const sectionColumns = (sec: ReportSection): string[] => sec.columns ?? config.columns;
        const maxColCount = Math.max(
            config.columns.length,
            ...config.sections.map(s => sectionColumns(s).length),
            config.grandTotalRow?.length ?? 0,
            1,
        );

        const data: unknown[][] = [
            [config.title],
            [dateStr],
            ...(filterLine ? [[filterLine]] : []),
            [],
        ];
        const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: maxColCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: maxColCount - 1 } },
        ];
        if (filterLine) {
            merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: maxColCount - 1 } });
        }

        config.sections.forEach((sec) => {
            const cols = sectionColumns(sec);
            const sectionTitleRowIdx = data.length;
            data.push([sec.title]);
            merges.push({ s: { r: sectionTitleRowIdx, c: 0 }, e: { r: sectionTitleRowIdx, c: maxColCount - 1 } });
            data.push(cols);
            sec.rows.forEach(r => data.push(r));
            if (sec.subtotalRow) data.push(sec.subtotalRow);
            data.push([]);
        });

        if (config.grandTotalRow) {
            data.push(config.grandTotalRow);
        }

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = Array.from({ length: maxColCount }, () => ({ wch: 22 }));
        ws['!merges'] = merges;

        const wb = XLSX.utils.book_new();
        const sheetName = config.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        const base = config.filename ?? 'report';
        XLSX.writeFile(wb, `${base}_${config.lang}.xlsx`);
    }

    exportProfilePDF(config: ProfileExportConfig): void {
        const fontFamily = config.lang === 'bn' ? "'Times New Roman', 'SolaimanLipi', serif" : "'Times New Roman', serif";
        const sizeContentPt = config.lang === 'bn' ? '8pt' : '11pt';
        const pageFooter = config.showPageNumbers
            ? `
            @page { size: A4; margin: 20mm;
                @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: ${fontFamily}; font-size: 9pt; color: #555; }
            }`
            : `@page { size: A4; margin: 20mm; }`;

        const padRow = (row: string[], colCount: number) => {
            const r = [...row];
            while (r.length < colCount) r.push('');
            return r;
        };
        const sectionBlocks = config.sections
            .map((sec) => {
                const colCount = sec.columns.length;
                const isLabelValue = sec.noTableHeader && colCount >= 2;
                if (isLabelValue) {
                    // Web-like block: grid of "Label: Value" pairs, max 3 per row, with line gap
                    const pairs = sec.rows.map((row) => {
                        const r = padRow(row, 2);
                        return { label: r[0], value: r[1] };
                    });
                    const pairSpan = (p: { label: string; value: string }) =>
                        `<span style="font-size:${sizeContentPt};"><span style="font-weight:400">${escapeHtml(p.label.endsWith(':') ? p.label : p.label + ':')} </span><strong>${escapeHtml(p.value)}</strong></span>`;
                    const pairGrid = (items: { label: string; value: string }[]) =>
                        `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 1.5em;">${items.map(pairSpan).join('')}</div>`;

                    // Address sections carry several addresses in one list; each one starts with the
                    // address-type row (e.g. "Address: Permanent Address"). Give every address its own
                    // boxed block with the type as a heading, otherwise Permanent/Present run together.
                    if (sec.addressSection && pairs.length > 0) {
                        const typeLabel = pairs[0].label;
                        const blocks: { head: { label: string; value: string }; items: { label: string; value: string }[] }[] = [];
                        pairs.forEach((p) => {
                            if (blocks.length === 0 || p.label === typeLabel) blocks.push({ head: p, items: [] });
                            else blocks[blocks.length - 1].items.push(p);
                        });
                        const blockHtml = blocks
                            .map(
                                (b) => `
                            <div style="border: 1px solid #d0d0d0; border-radius: 4px; padding: 10px 12px; margin-bottom: 8px; background: #fafafa; page-break-inside: avoid;">
                                <div style="font-size:${sizeContentPt}; font-weight: bold; border-bottom: 1px solid #d0d0d0; padding-bottom: 4px; margin-bottom: 8px;">${escapeHtml(b.head.value || b.head.label)}</div>
                                ${b.items.length ? pairGrid(b.items) : ''}
                            </div>`
                            )
                            .join('');
                        return `
                    <div class="profile-section" style="margin-bottom: 1.5rem; page-break-inside: avoid;">
                        <h2 style="font-family: ${fontFamily}; font-size: 12pt; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #ccc; page-break-after: avoid;">${escapeHtml(sec.title)}</h2>
                        <div style="font-family: ${fontFamily};">${blockHtml}</div>
                    </div>`;
                    }

                    return `
                    <div class="profile-section" style="margin-bottom: 1.5rem; page-break-inside: avoid;">
                        <h2 style="font-family: ${fontFamily}; font-size: 12pt; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #ccc; page-break-after: avoid;">${escapeHtml(sec.title)}</h2>
                        <div style="font-family: ${fontFamily}; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px 14px; background: #fafafa;">
                            ${pairGrid(pairs)}
                        </div>
                    </div>`;
                }
                const headerCells = sec.columns
                    .map((c) => `<th style="padding:8px 10px;font-weight:700;font-size:10pt;text-align:left;white-space:nowrap;word-break:keep-all;border:1px solid #ddd">${escapeHtml(c)}</th>`)
                    .join('');
                const dataRows = sec.rows
                    .map((row) => {
                        const cells = padRow(row, colCount)
                            .map((cell) => `<td style="padding:6px 10px;white-space:nowrap;word-break:keep-all;font-size:${sizeContentPt};border:1px solid #ddd">${escapeHtml(cell)}</td>`)
                            .join('');
                        return `<tr style="page-break-inside:avoid">${cells}</tr>`;
                    })
                    .join('');
                return `
                    <div class="profile-section" style="margin-bottom: 1.5rem; page-break-inside: avoid;">
                        <h2 style="font-family: ${fontFamily}; font-size: 12pt; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #ccc; page-break-after: avoid;">${escapeHtml(sec.title)}</h2>
                        <table style="width: 100%; border-collapse: collapse; font-family: ${fontFamily};">
                            <thead><tr>${headerCells}</tr></thead>
                            <tbody>${dataRows}</tbody>
                        </table>
                    </div>`;
            })
            .join('');

        const profileHeader = config.imageDataUrl
            ? `<div style="text-align:right;margin-bottom:16px;"><img src="${config.imageDataUrl}" alt="" style="width:130px;height:165px;object-fit:cover;border:1px solid #ddd;" /></div>`
            : '';

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(config.title)}</title>
<style>
body { font-family: ${fontFamily}; font-size: ${sizeContentPt}; margin: 0; padding: 0; }
${pageFooter}
</style></head><body>
${profileHeader}
${sectionBlocks}
</body></html>`;

        const win = window.open('', '_blank', 'width=800,height=600');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); win.close(); }, 800);
    }

    async exportProfileWord(config: ProfileExportConfig): Promise<void> {
        const font = config.lang === 'bn' ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const } : 'Times New Roman';
        const sizePageHeader = 28;
        const sizeSectionHeader = 28; // 14pt for Basic Service, Own Address, etc.
        const sizeAddrSubheader = 24; // 12pt for Permanent/Present Address headings
        const sizeTableHeader = 20;
        const sizeTableContent = config.lang === 'bn' ? 16 : 22;

        const children: (Paragraph | Table)[] = [];

        // Passport size: 35mm x 45mm ≈ 130x165 px at 96 DPI; right-aligned
        if (config.imageDataUrl) {
            const match = config.imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (match) {
                const type = (match[1] === 'jpeg' || match[1] === 'jpg') ? 'jpg' as const : (match[1] === 'png' ? 'png' as const : 'png' as const);
                const base64 = match[2];
                const binary = atob(base64);
                const arr = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                try {
                    children.push(
                        new Paragraph({
                            children: [
                                new ImageRun({
                                    type,
                                    data: arr,
                                    transformation: { width: 130, height: 165 }, // passport size (35mm x 45mm)
                                }),
                            ],
                            alignment: AlignmentType.RIGHT,
                            spacing: { after: 400 },
                        })
                    );
                } catch {
                    // omit image on error
                }
            }
        }

        for (let secIndex = 0; secIndex < config.sections.length; secIndex++) {
            const sec = config.sections[secIndex];
            const colCount = Math.max(sec.columns.length, 1);
            const isLabelValue = sec.noTableHeader && colCount >= 2;
            const isBasicService = secIndex === 0 && isLabelValue;

            children.push(
                new Paragraph({
                    children: [new TextRun({ text: sec.title, bold: true, size: sizeSectionHeader, font })],
                    spacing: { before: secIndex > 0 ? 200 : 0, after: 150 },
                    keepNext: true,
                })
            );

            if (isLabelValue) {
                const pairs = sec.rows.map((row) => {
                    const r = row.slice(0, 2);
                    while (r.length < 2) r.push('');
                    return { label: r[0], value: r[1] };
                });
                const labelValueBorders = { top: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' }, left: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' }, right: { style: BorderStyle.SINGLE, size: 1, color: 'e0e0e0' } };
                const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
                const cellContent = (p: { label: string; value: string }) =>
                    [new Paragraph({ children: [new TextRun({ text: (p.label.endsWith(':') ? p.label : p.label + ':') + ' ', font, size: sizeTableContent }), new TextRun({ text: p.value, font, size: sizeTableContent, bold: true })], spacing: { after: 120 } })];

                // Address section: Permanent/Present as full-width headers
                const isAddrType = (v: string) => ['Permanent Address', 'Present Address', 'স্থায়ী ঠিকানা', 'বর্তমান ঠিকানা'].includes(v);

                // Nested tables: outer table (1 col) wraps each row; each row is a nested table that resizes independently
                const makeRowTable = (items: { label: string; value: string }[], cellPct: number) => {
                    const cells: TableCell[] = items.map((p) =>
                        new TableCell({ children: cellContent(p), borders: labelValueBorders, width: { size: cellPct, type: WidthType.PERCENTAGE } })
                    );
                    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] });
                };

                const outerRows: TableRow[] = [];
                if (sec.addressSection && pairs.length > 0) {
                    const addrOuterRows: TableRow[] = [];
                    let i = 0;
                    while (i < pairs.length) {
                        const p = pairs[i];
                        if (p && isAddrType(p.value)) {
                            const headerCell = new TableCell({
                                children: [new Paragraph({ children: [new TextRun({ text: p.value, bold: true, size: sizeAddrSubheader, font })], spacing: { after: 100 } })],
                                borders: labelValueBorders,
                                width: { size: 100, type: WidthType.PERCENTAGE },
                            });
                            addrOuterRows.push(new TableRow({
                                children: [new TableCell({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [headerCell] })] })], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                            }));
                            i++;
                            const addrPairs: { label: string; value: string }[] = [];
                            for (let k = 0; k < 6 && i < pairs.length; k++, i++) {
                                if (pairs[i] && !isAddrType(pairs[i].value)) addrPairs.push(pairs[i]);
                                else { i--; break; }
                            }
                            for (let j = 0; j < addrPairs.length; j += 3) {
                                const rowPairs = [addrPairs[j], addrPairs[j + 1], addrPairs[j + 2]].filter(Boolean);
                                if (rowPairs.length > 0) {
                                    const pct = 100 / 3;
                                    const addrCells: TableCell[] = rowPairs.map((pr) => new TableCell({ children: cellContent(pr), borders: labelValueBorders, width: { size: pct, type: WidthType.PERCENTAGE } }));
                                    while (addrCells.length < 3) addrCells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ' ', font, size: sizeTableContent })], spacing: { after: 120 } })], borders: labelValueBorders, width: { size: pct, type: WidthType.PERCENTAGE } }));
                                    addrOuterRows.push(new TableRow({
                                        children: [new TableCell({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: addrCells })] })], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                                    }));
                                }
                            }
                        } else {
                            i++;
                        }
                    }
                    if (addrOuterRows.length > 0) {
                        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: addrOuterRows, borders: noBorder }));
                    } else {
                        const fallbackRows: TableRow[] = [];
                        for (let i = 0; i < pairs.length; i += 3) {
                            const cells: TableCell[] = [];
                            const pct = 100 / 3;
                            for (let j = 0; j < 3; j++) {
                                const p = pairs[i + j];
                                const content = p ? cellContent(p) : [new Paragraph({ children: [new TextRun({ text: ' ', font, size: sizeTableContent })], spacing: { after: 120 } })];
                                cells.push(new TableCell({ children: content, borders: labelValueBorders, width: { size: pct, type: WidthType.PERCENTAGE } }));
                            }
                            fallbackRows.push(new TableRow({ children: cells }));
                        }
                        if (fallbackRows.length > 0) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: fallbackRows }));
                    }
                } else if (isBasicService && pairs.length >= 3) {
                    outerRows.push(new TableRow({
                        children: [new TableCell({ children: [makeRowTable([pairs[0]], 100)], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                    }));
                    outerRows.push(new TableRow({
                        children: [new TableCell({ children: [makeRowTable([pairs[1], pairs[2]], 50)], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                    }));
                    for (let i = 3; i < pairs.length; i += 2) {
                        if (pairs[i] || pairs[i + 1]) {
                            const pct = 50;
                            const cells: TableCell[] = [];
                            for (let j = 0; j < 2; j++) {
                                const p = pairs[i + j];
                                const content = p ? cellContent(p) : [new Paragraph({ children: [new TextRun({ text: ' ', font, size: sizeTableContent })], spacing: { after: 120 } })];
                                cells.push(new TableCell({ children: content, borders: labelValueBorders, width: { size: pct, type: WidthType.PERCENTAGE } }));
                            }
                            outerRows.push(new TableRow({
                                children: [new TableCell({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] })], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                            }));
                        }
                    }
                } else {
                    const cols = sec.colsPerRow === 2 ? 2 : 3;
                    const pct = 100 / cols;
                    for (let i = 0; i < pairs.length; i += cols) {
                        const cells: TableCell[] = [];
                        for (let j = 0; j < cols; j++) {
                            const p = pairs[i + j];
                            const content = p ? cellContent(p) : [new Paragraph({ children: [new TextRun({ text: ' ', font, size: sizeTableContent })], spacing: { after: 120 } })];
                            cells.push(new TableCell({ children: content, borders: labelValueBorders, width: { size: pct, type: WidthType.PERCENTAGE } }));
                        }
                        if (cells.length > 0) {
                            outerRows.push(new TableRow({
                                children: [new TableCell({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] })], borders: noBorder, margins: { top: 0, bottom: 0, left: 0, right: 0 } })],
                            }));
                        }
                    }
                }
                if (outerRows.length > 0) {
                    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: outerRows, borders: noBorder }));
                }
                continue;
            }

            const cellWidth = Math.floor(9000 / Math.max(colCount, 1));
            const tableBorders = { top: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' }, left: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' }, right: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' } };
            const headerRow = new TableRow({
                tableHeader: true,
                children: sec.columns.map((col) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: col, bold: true, font, size: sizeTableHeader })],
                                alignment: AlignmentType.LEFT,
                                spacing: { after: 100 },
                            }),
                        ],
                        borders: tableBorders,
                        width: { size: cellWidth, type: WidthType.DXA },
                    })
                ),
            });
            const dataRows = sec.rows.map((row) => {
                const cells = row.slice(0, colCount);
                while (cells.length < colCount) cells.push('');
                return new TableRow({
                    children: cells.map((cell) =>
                        new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: cell, font, size: sizeTableContent })], spacing: { after: 100 } })],
                            borders: tableBorders,
                            width: { size: cellWidth, type: WidthType.DXA },
                        })
                    ),
                });
            });
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
        }

        const doc = new Document({
            sections: [{ children }],
        });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, config.lang === 'bn' ? 'profile_bn.docx' : 'profile_en.docx');
    }

    /** Generate a real PDF (html2canvas + jsPDF) and open it in a new browser tab. */
    async generatePDF(config: ReportConfig): Promise<void> {
        const fontFamily = config.lang === 'bn'
            ? "'Times New Roman', 'SolaimanLipi', sans-serif"
            : "'Times New Roman', serif";
        const sizeContentPt = config.lang === 'bn' ? '8pt' : '9pt';
        const orientation = config.landscape ? 'landscape' : 'portrait';
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });

        const esc = escapeHtml;
        const headerCells = config.columns
            .map(c => `<th style="padding:4px 6px;font-weight:700;font-size:9pt;text-align:center;border:1px solid #000;white-space:nowrap;background:#fff;color:#000">${esc(c)}</th>`)
            .join('');
        const dataRows = config.rows
            .map(row => {
                const cells = row
                    .map(cell => `<td style="padding:3px 6px;font-size:${sizeContentPt};border:1px solid #000;color:#000">${esc(cell)}</td>`)
                    .join('');
                return `<tr>${cells}</tr>`;
            })
            .join('');

        const filterHtml = config.filterLines?.length
            ? `<div style="font-size:9pt;text-align:center;margin-bottom:10px;color:#333">${config.filterLines.map(l => esc(l)).join(' | ')}</div>`
            : '';

        // Scope chip lines render between the title and the date so the org-
        // context reads with the title (mirrors the on-screen header).
        const preDateHtml = config.preDateLines?.length
            ? config.preDateLines
                .map(l => `<div style="font-size:10pt;font-weight:600;text-align:center;margin:0 0 2px 0;color:#0f6b4b">${esc(l)}</div>`)
                .join('')
            : '';

        const containerWidth = config.landscape ? 1050 : 760;
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:-9999px;top:0;width:${containerWidth}px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box`;
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:${sizeContentPt};color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(config.title)}</h1>
                ${preDateHtml}
                <div style="font-size:9pt;text-align:center;margin-bottom:6px">${esc(dateStr)}</div>
                ${filterHtml}
                <table style="width:100%;border-collapse:collapse;font-family:${fontFamily}">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${dataRows}</tbody>
                </table>
            </div>`;
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const scale = 2;
            const canvas = await html2canvas(container, {
                scale, useCORS: true, backgroundColor: '#ffffff',
                logging: false, scrollY: -window.scrollY,
                height: container.scrollHeight, windowHeight: container.scrollHeight,
            });
            const imgWidth = canvas.width;

            const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
            const marginMm = config.marginMm ?? 10;
            const pdfWidth = pdf.internal.pageSize.getWidth() - marginMm * 2;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - marginMm * 2;
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
                pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', marginMm, marginMm, pdfWidth, sliceH * ratio);
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

    exportProfileExcel(config: ProfileExportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const maxCols = Math.max(...config.sections.map((s) => Math.max(s.columns.length, ...s.rows.map((r) => r.length))), 2);
        const pad = (arr: string[], n: number) => { const a = [...arr]; while (a.length < n) a.push(''); return a; };
        const data: unknown[][] = [[config.title], [dateStr], []];
        for (const sec of config.sections) {
            if (!sec.noTableHeader) data.push(pad(sec.columns, maxCols));
            for (const row of sec.rows) data.push(pad(row, maxCols));
            data.push([]);
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = Array.from({ length: maxCols }, () => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, config.lang === 'bn' ? 'প্রোফাইল' : 'Profile');
        XLSX.writeFile(wb, config.lang === 'bn' ? 'profile_bn.xlsx' : 'profile_en.xlsx');
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
