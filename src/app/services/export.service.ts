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
    showPageNumbers: boolean;
    /** Optional base filename (without extension). Falls back to 'report_en/bn'. */
    filename?: string;
    /** Optional applied filter lines shown below the date (e.g. "Rank: Major"). */
    filterLines?: string[];
    /** Use landscape orientation (default false = portrait). */
    landscape?: boolean;
    /** Page margin in mm (default 20). */
    marginMm?: number;
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
    /** Data rows. */
    rows: string[][];
    filename?: string;
    filterLines?: string[];
    /** Use landscape orientation in Word (default false). */
    landscape?: boolean;
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
        // Same font as Word: Nirmala UI (Bangla) / Times New Roman (English)
        const fontFamily = config.lang === 'bn' ? "'Nirmala UI', serif" : "'Times New Roman', serif";
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

    async exportWord(config: ReportConfig): Promise<void> {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        // Use Nirmala UI for Bangla so Word renders Bengali Unicode without font embedding (ships with Windows 8+ / Office).
        const font = config.lang === 'bn' ? 'Nirmala UI' : 'Times New Roman';
        const title = config.title;
        const dateText = dateStr;
        const columns = config.columns;
        const rows = config.rows;
        const cellWidth = Math.floor(9000 / Math.max(config.columns.length, 1));
        // Font sizes in half-points: page header 14pt=28, table header 10pt=20, content bn 8pt=16 / en 11pt=22
        const sizePageHeader = 28;
        const sizeTableHeader = 20;
        const sizeTableContent = config.lang === 'bn' ? 16 : 22;

        const headerRow = new TableRow({
            tableHeader: true,
            children: columns.map(
                (col) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: col, bold: true, font, size: sizeTableHeader })],
                                alignment: AlignmentType.LEFT,
                                spacing: { after: 100 },
                            }),
                        ],
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                            left: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                            right: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                        },
                        width: { size: cellWidth, type: WidthType.DXA },
                    })
            ),
        });

        const dataRows = rows.map(
            (row) =>
                new TableRow({
                    children: row.map(
                        (cell) =>
                            new TableCell({
                                children: [
                                    new Paragraph({
                                        children: [new TextRun({ text: cell, font, size: sizeTableContent })],
                                        spacing: { after: 100 },
                                    }),
                                ],
                                borders: {
                                    top: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                                    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                                    left: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                                    right: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' },
                                },
                                width: { size: cellWidth, type: WidthType.DXA },
                            })
                    ),
                })
        );

        const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
        });

        const doc = new Document({
            sections: [
                {
                    properties: config.landscape ? {
                        page: { size: { orientation: PageOrientation.LANDSCAPE } },
                    } : undefined,
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
                            spacing: { after: 200 },
                        }),
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
                                size: 20,
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

        const blob = await Packer.toBlob(doc);
        const base = config.filename ?? 'report';
        const filename = `${base}_${config.lang}.docx`;
        saveAs(blob, filename);
    }

    exportExcel(config: ReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const filterLine = config.filterLines?.length ? config.filterLines.join('  |  ') : '';
        const data: unknown[][] = [
            [config.title],
            [dateStr],
            ...(filterLine ? [[filterLine]] : []),
            [],
            config.columns,
            ...config.rows,
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = config.columns.map(() => ({ wch: 22 }));

        const colCount = config.columns.length;
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        ];
        if (filterLine) {
            merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } });
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
     * Word export with a two-row header. Leading columns merge vertically (rowSpan=2);
     * each group column merges horizontally across its sub-headers (columnSpan=subCount).
     * Mirrors exportExcelMatrix so pivot tables look the same in both formats.
     */
    async exportWordMatrix(config: MatrixReportConfig): Promise<void> {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        });
        const font = config.lang === 'bn' ? 'Nirmala UI' : 'Times New Roman';
        const sizePageHeader = 28;
        const sizeTableHeader = 20;
        const sizeTableContent = config.lang === 'bn' ? 16 : 22;

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

        const headerCell = (text: string, opts: { rowSpan?: number; columnSpan?: number; width: number }) =>
            new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({ text, bold: true, font, size: sizeTableHeader })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                })],
                borders,
                rowSpan: opts.rowSpan,
                columnSpan: opts.columnSpan,
                width: { size: opts.width, type: WidthType.DXA },
            });

        // Row 1: leading columns (rowSpan=2) + each group label (columnSpan=subCount).
        const headerRow1 = new TableRow({
            tableHeader: true,
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
        const headerRow2 = new TableRow({
            tableHeader: true,
            children: Array.from({ length: groupCount * subCount }, (_, idx) => {
                const sub = config.subHeaders[idx % subCount];
                return headerCell(sub, { width: colWidths[leadCount + idx] });
            }),
        });

        const dataRows = config.rows.map(row => {
            const cells = row.slice(0, totalCols);
            while (cells.length < totalCols) cells.push('');
            return new TableRow({
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

        const table = new Table({
            width: { size: totalDxa, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: colWidths,
            rows: [headerRow1, headerRow2, ...dataRows],
        });

        const filterPara = config.filterLines?.length ? [new Paragraph({
            children: config.filterLines.map((line, i) => new TextRun({
                text: (i > 0 ? '  |  ' : '') + line, size: 20, color: '333333', font,
            })),
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
        })] : [];

        const doc = new Document({
            sections: [{
                properties: config.landscape ? {
                    page: { size: { orientation: PageOrientation.LANDSCAPE } },
                } : undefined,
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
                    table,
                ],
            }],
        });

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
            headerRow1,
            headerRow2,
            ...config.rows,
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = Array.from({ length: totalCols }, (_, i) => ({ wch: i < leadCount ? 22 : 12 }));

        const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
        ];
        // Track the row index where the two header rows live (after title/date/filter/blank).
        const h1Row = filterLine ? 4 : 3;
        const h2Row = h1Row + 1;
        if (filterLine) {
            merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } });
        }
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
        const font = config.lang === 'bn' ? 'Nirmala UI' : 'Times New Roman';
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

            const makeHeaderRow = () => new TableRow({
                tableHeader: true,
                children: cols.map((col, i) => new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({ text: col, bold: true, font, size: sizeTableHeader })],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 100 },
                    })],
                    borders,
                    width: { size: colWidths[i], type: WidthType.DXA },
                })),
            });

            const makeBodyRow = (row: string[], bold = false) => {
                const cells = row.slice(0, colCount);
                while (cells.length < colCount) cells.push('');
                return new TableRow({
                    children: cells.map((cell, i) => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: cell, font, size: sizeTableContent, bold })],
                            spacing: { after: 100 },
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

        const children: (Paragraph | Table)[] = [
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

        config.sections.forEach((sec, idx) => {
            children.push(new Paragraph({
                children: [new TextRun({ text: sec.title, bold: true, size: sizeSectionHeader, font })],
                spacing: { before: idx > 0 ? 200 : 0, after: 120 },
                keepNext: true,
            }));
            // Section-level columns override top-level columns when present.
            const cols = sec.columns ?? config.columns;
            const { makeHeaderRow, makeBodyRow, makeTable } = makeHelpers(cols);
            const tableRows: TableRow[] = [makeHeaderRow()];
            sec.rows.forEach(r => tableRows.push(makeBodyRow(r)));
            if (sec.subtotalRow) tableRows.push(makeBodyRow(sec.subtotalRow, true));
            children.push(makeTable(tableRows));
        });

        if (config.grandTotalRow) {
            // Grand-total table renders against the grandTotalRow's own column count.
            const gtCols = config.grandTotalRow.map(() => '');
            const { makeBodyRow, makeTable } = makeHelpers(gtCols);
            children.push(new Paragraph({ children: [new TextRun({ text: '', font, size: sizeTableContent })], spacing: { before: 200, after: 80 } }));
            children.push(makeTable([makeBodyRow(config.grandTotalRow, true)]));
        }

        return new Document({
            sections: [{
                properties: config.landscape ? {
                    page: { size: { orientation: PageOrientation.LANDSCAPE } },
                } : undefined,
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
        const fontFamily = config.lang === 'bn' ? "'Nirmala UI', serif" : "'Times New Roman', serif";
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
                    const pairItems = pairs
                        .map(
                            (p) =>
                                `<span style="font-size:${sizeContentPt};"><span style="font-weight:400">${escapeHtml(p.label.endsWith(':') ? p.label : p.label + ':')} </span><strong>${escapeHtml(p.value)}</strong></span>`
                        )
                        .join('');
                    return `
                    <div class="profile-section" style="margin-bottom: 1.5rem; page-break-inside: avoid;">
                        <h2 style="font-family: ${fontFamily}; font-size: 12pt; font-weight: bold; margin-bottom: 0.5rem; border-bottom: 1px solid #ccc; page-break-after: avoid;">${escapeHtml(sec.title)}</h2>
                        <div style="font-family: ${fontFamily}; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px 14px; background: #fafafa;">
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 1.5em;">${pairItems}</div>
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
        const font = config.lang === 'bn' ? 'Nirmala UI' : 'Times New Roman';
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
            ? "'Noto Sans Bengali', 'Nirmala UI', sans-serif"
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

        const containerWidth = config.landscape ? 1050 : 760;
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:-9999px;top:0;width:${containerWidth}px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box`;
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:${sizeContentPt};color:#000;line-height:1.4;width:100%">
                <h1 style="font-size:14pt;font-weight:700;text-align:center;margin:0 0 3px 0">${esc(config.title)}</h1>
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
