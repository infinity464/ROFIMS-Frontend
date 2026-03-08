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
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

export interface ReportConfig {
    title: string;
    lang: 'en' | 'bn';
    columns: string[];
    rows: string[][];
    showPageNumbers: boolean;
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
        const pageFooter = config.showPageNumbers
            ? `
            @page {
                size: A4;
                margin: 20mm;
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
                size: A4;
                margin: 20mm;
            }
        `;

        const headerCells = columns
            .map(
                (c) =>
                    `<th style="padding:8px 10px;font-weight:700;font-size:10pt;text-align:left;white-space:nowrap;word-break:keep-all">${escapeHtml(c)}</th>`
            )
            .join('');
        const dataRows = rows
            .map(
                (row) => {
                    const cells = row
                        .map(
                            (cell) =>
                                `<td style="padding:6px 10px;white-space:nowrap;word-break:keep-all;font-size:${sizeContentPt}">${escapeHtml(cell)}</td>`
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
    <title>${escapeHtml(title)}</title>
    <style>
        body { font-family: ${fontFamily}; font-size: ${sizeContentPt}; margin: 0; padding: 0; }
        h1 { font-family: ${fontFamily}; font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 8px; }
        .date { font-family: ${fontFamily}; font-size: 14pt; color: #555; text-align: center; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-family: ${fontFamily}; }
        thead th { font-family: ${fontFamily}; }
        tbody td { font-family: ${fontFamily}; }
        ${pageFooter}
    </style>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <div class="date">${escapeHtml(dateText)}</div>
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
                            spacing: { after: 300 },
                        }),
                        table,
                    ],
                },
            ],
        });

        const blob = await Packer.toBlob(doc);
        const filename = config.lang === 'bn' ? 'report_bn.docx' : 'report_en.docx';
        saveAs(blob, filename);
    }

    exportExcel(config: ReportConfig): void {
        const dateStr = new Date().toLocaleDateString(config.lang === 'bn' ? 'bn-BD' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const data: unknown[][] = [
            [config.title],
            [dateStr],
            [],
            config.columns,
            ...config.rows,
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = config.columns.map(() => ({ wch: 22 }));

        const colCount = config.columns.length;
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        ];

        const wb = XLSX.utils.book_new();
        const sheetName = config.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const filename = config.lang === 'bn' ? 'report_bn.xlsx' : 'report_en.xlsx';
        XLSX.writeFile(wb, filename);
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
