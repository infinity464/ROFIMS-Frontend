import { Injectable } from '@angular/core';
import { unicodeToBijoy } from '@abdalgolabs/ansi-unicode-converter';
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
    ShadingType,
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
        const toBijoy = (s: string) =>
            config.lang === 'bn' ? (unicodeToBijoy(s) ?? s) : s;
        const title = toBijoy(config.title);
        const dateText = toBijoy(dateStr);
        const columns = config.columns.map(toBijoy);
        const rows = config.rows.map((row) => row.map(toBijoy));
        const fontFamily = config.lang === 'bn' ? "'SutonnyMJ', serif" : "'Times New Roman', serif";
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
                    `<th style="background:#1e3a5f;color:#fff;padding:8px 10px;font-weight:700;white-space:nowrap;word-break:keep-all;-webkit-print-color-adjust:exact">${escapeHtml(c)}</th>`
            )
            .join('');
        const dataRows = rows
            .map(
                (row, i) => {
                    const bg = i % 2 === 0 ? '#fff' : '#f7fafc';
                    const cells = row
                        .map(
                            (cell) =>
                                `<td style="padding:6px 10px;white-space:nowrap;word-break:keep-all;background:${bg};-webkit-print-color-adjust:exact">${escapeHtml(cell)}</td>`
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
        @font-face {
            font-family: 'SutonnyMJ';
            src: url('/assets/fonts/SutonnyMJ.ttf') format('truetype');
        }
        body { font-family: ${fontFamily}; font-size: 10pt; margin: 0; padding: 0; }
        h1 { font-size: 16pt; font-weight: bold; text-align: center; margin-bottom: 8px; }
        .date { font-size: 9pt; color: #555; text-align: center; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
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
        const toBijoy = (s: string) =>
            config.lang === 'bn' ? (unicodeToBijoy(s) ?? s) : s;
        const font = config.lang === 'bn' ? 'SutonnyMJ' : 'Times New Roman';
        const title = toBijoy(config.title);
        const dateText = toBijoy(dateStr);
        const columns = config.columns.map(toBijoy);
        const rows = config.rows.map((row) => row.map(toBijoy));
        const cellWidth = Math.floor(9000 / Math.max(config.columns.length, 1));

        const headerRow = new TableRow({
            tableHeader: true,
            children: columns.map(
                (col) =>
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: col, bold: true, font })],
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 100 },
                            }),
                        ],
                        shading: { fill: '1e3a5f', type: ShadingType.SOLID },
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
                                        children: [new TextRun({ text: cell, font: font })],
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
                                    size: 72,
                                    color: '1e3a5f',
                                    font: font,
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { after: 200 },
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: dateText,
                                    size: 36,
                                    color: '666666',
                                    font: font,
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
        const sheetName = config.lang === 'bn' ? 'cÖwZ‡e`b' : 'Report';
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
