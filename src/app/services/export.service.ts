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
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
