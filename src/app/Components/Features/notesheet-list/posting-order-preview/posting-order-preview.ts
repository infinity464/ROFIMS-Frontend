import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { EditorModule } from 'primeng/editor';
import { TextareaModule } from 'primeng/textarea';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
    selector: 'app-posting-order-preview',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, EditorModule, TextareaModule, InputTextModule, TooltipModule, SelectModule],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewComponent implements OnChanges, OnInit {
    @Input() noteSheet: any = null;
    @Input() isEnglish = true;
    @Input() initiatorDetails: any = null;
    @Input() approversDetails: any[] = [];

    @Output() saved = new EventEmitter<void>();

    /** Employees from vw_DraftPostingWithEmployees */
    employees: DraftPostingEmployeeRow[] = [];
    loadingEmployees = false;

    /** RAB Unit dropdown options */
    rabUnitOptions: { label: string; value: number }[] = [];

    /** Edit mode */
    editing = false;
    saving = false;
    editMainText = '';
    editNote = '';
    editReferenceNumber = '';

    private api = `${environment.apis.core}/NoteSheetInfo`;

    constructor(
        private postingService: PostingService,
        private masterBasicSetup: MasterBasicSetupService,
        private http: HttpClient,
        private messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadRabUnits();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['noteSheet'] && this.noteSheet) {
            this.editing = false;
            const masterId = this.noteSheet.draftPostingMasterId ?? this.noteSheet.DraftPostingMasterId;
            if (masterId) {
                this.loadDraftPostingDetails(masterId);
            }
        }
    }

    private loadRabUnits(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (list) => {
                this.rabUnitOptions = (list ?? []).map(c => ({ label: c.codeValueEN, value: c.codeId }));
            }
        });
    }

    private loadDraftPostingDetails(id: number): void {
        this.loadingEmployees = true;
        this.postingService.getDraftPostingEmployees(id).subscribe({
            next: (data) => {
                this.employees = data ?? [];
                this.loadingEmployees = false;
            },
            error: () => {
                this.loadingEmployees = false;
            }
        });
    }

    toggleEdit(): void {
        this.editMainText = this.noteSheet?.mainText ?? '';
        this.editNote = this.noteSheet?.note ?? '';
        this.editReferenceNumber = this.noteSheet?.referenceNumber ?? '';
        this.editing = true;
    }

    cancelEdit(): void {
        this.editing = false;
    }

    saveChanges(): void {
        if (!this.noteSheet) return;
        this.saving = true;

        // 1. Save notesheet fields
        const payload = {
            ...this.noteSheet,
            mainText: this.editMainText,
            note: this.editNote,
            referenceNumber: this.editReferenceNumber
        };
        this.http.post<{ statusCode?: number }>(`${this.api}/UpdateAsyn`, payload).subscribe({
            next: (res) => {
                if (res?.statusCode === 200) {
                    this.noteSheet.mainText = this.editMainText;
                    this.noteSheet.note = this.editNote;
                    this.noteSheet.referenceNumber = this.editReferenceNumber;

                    // 2. Save employee detail changes (Transfer Unit + Remarks)
                    if (this.employees.length) {
                        const items = this.employees.map(e => ({
                            id: e.draftPostingDetailId,
                            transferRabUnitId: e.transferRabUnitId,
                            remarks: e.remarks
                        }));
                        this.postingService.updateDraftPostingDetails(items).subscribe({
                            next: () => {
                                this.saving = false;
                                this.editing = false;
                                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting order updated.' });
                                const masterId = this.noteSheet?.draftPostingMasterId ?? this.noteSheet?.DraftPostingMasterId;
                                if (masterId) this.loadDraftPostingDetails(masterId);
                                this.saved.emit();
                            },
                            error: () => {
                                this.saving = false;
                                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Notesheet saved but employee details failed.' });
                            }
                        });
                    } else {
                        this.saving = false;
                        this.editing = false;
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting order updated.' });
                        this.saved.emit();
                    }
                } else {
                    this.saving = false;
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: 'Update failed.' });
                }
            },
            error: () => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed.' });
            }
        });
    }

    // ─── Export ────────────────────────────────────────────────────

    async exportWord(): Promise<void> {
        const bn = !this.isEnglish;
        const font = bn ? 'SutonnyMJ' : 'Times New Roman';
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Title ──
        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'মন্তব্যপত্র' : 'NOTE SHEET', bold: true, size: 32, font })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        });

        // ── Meta line ──
        const metaParts: string[] = [];
        if (this.noteSheet?.noteSheetNo) metaParts.push(`${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'} ${this.noteSheet.noteSheetNo}`);
        if (this.noteSheet?.noteSheetDate) metaParts.push(`${bn ? 'তারিখ:' : 'Date:'} ${this.formatDate(this.noteSheet.noteSheetDate)}`);
        if (this.noteSheet?.referenceNumber) metaParts.push(`${bn ? 'সুত্র:' : 'Reference:'} ${this.noteSheet.referenceNumber}`);
        const metaPara = new Paragraph({
            children: [new TextRun({ text: metaParts.join('    '), size: 20, font })],
            spacing: { after: 200 }
        });

        // ── Main text (strip HTML) ──
        const mainTextPlain = this.stripHtml(this.noteSheet?.mainText ?? '');
        const mainTextPara = new Paragraph({
            children: [new TextRun({ text: mainTextPlain, size: 22, font })],
            spacing: { after: 200 }
        });

        // ── Employee table ──
        const cols = bn
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'মাতৃ ইউনিট', 'যোগদান তারিখ', 'বদলি কর্মস্থল', 'মন্তব্য']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Mother Unit', 'Joining Date', 'Transfer Unit', 'Remarks'];
        const colCount = cols.length;
        const cellWidth = Math.floor(14000 / colCount);

        const headerRow = new TableRow({
            tableHeader: true,
            children: cols.map(col => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 18, font })], alignment: AlignmentType.CENTER })],
                borders: cellBorders,
                width: { size: cellWidth, type: WidthType.DXA }
            }))
        });

        const dataRows = this.employees.map((emp, i) => new TableRow({
            children: [
                String(i + 1),
                emp.serviceId ?? '',
                bn ? (emp.rankNameBN || emp.rankName || '') : (emp.rankName ?? ''),
                bn ? (emp.tradeNameBN || emp.tradeName || '') : (emp.tradeName ?? ''),
                bn ? (emp.fullNameBN || emp.fullNameEN || '') : (emp.fullNameEN ?? ''),
                bn ? (emp.motherUnitNameBN || emp.motherUnitName || '') : (emp.motherUnitName ?? ''),
                this.formatDate(emp.joiningDateInRAB),
                emp.transferRabUnitName ?? '',
                emp.remarks ?? ''
            ].map(val => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font })], spacing: { after: 40 } })],
                borders: cellBorders,
                width: { size: cellWidth, type: WidthType.DXA }
            }))
        }));

        const empTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows]
        });

        // ── Note ──
        const children: (Paragraph | Table)[] = [titlePara, metaPara, mainTextPara, empTable];

        if (this.noteSheet?.note) {
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 20, font }),
                    new TextRun({ text: this.noteSheet.note, size: 20, font })
                ],
                spacing: { before: 200, after: 200 }
            }));
        }

        // ── Spacer before signatures ──
        children.push(new Paragraph({ spacing: { before: 400 } }));

        // ── Prepared By signature (right-aligned) ──
        const preparedBy = this.noteSheet?.preparedBy ?? '';
        if (this.initiatorDetails || preparedBy) {
            const initName = this.initiatorDetails?.name ?? preparedBy;
            const initRank = this.initiatorDetails?.rank ?? '';
            const initAppt = this.initiatorDetails?.appointment ?? '';
            const lines = [initName, initRank, initAppt, this.formatDate(this.noteSheet?.noteSheetDate)].filter(l => l && l !== '—');
            lines.forEach(line => {
                children.push(new Paragraph({
                    children: [new TextRun({ text: line, size: 20, font })],
                    alignment: AlignmentType.RIGHT
                }));
            });
        }

        // ── Spacer ──
        children.push(new Paragraph({ spacing: { before: 300 } }));

        // ── Recommender(s) + Final Approver (left-aligned) ──
        for (const approver of this.approversDetails) {
            children.push(new Paragraph({
                children: [new TextRun({ text: approver.step, bold: true, size: 20, font })],
                spacing: { before: 200 }
            }));
            const lines = [approver.name, approver.rank, approver.appointment].filter(l => l && l !== '-');
            lines.forEach(line => {
                children.push(new Paragraph({
                    children: [new TextRun({ text: line, size: 20, font })]
                }));
            });
        }

        const doc = new Document({
            sections: [{
                properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
                children
            }]
        });

        const blob = await Packer.toBlob(doc);
        const filename = `NoteSheet_${this.noteSheet?.noteSheetNo ?? 'export'}.docx`;
        saveAs(blob, filename);
    }

    async exportPdfDirect(): Promise<void> {
        const bn = !this.isEnglish;
        const fontFamily = bn ? "'Noto Sans Bengali', 'SolaimanLipi', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'পোস্টিং অর্ডার – মন্তব্যপত্র' : 'POSTING ORDER – NOTE SHEET';

        // ── Build meta ──
        const metaParts: string[] = [];
        if (this.noteSheet?.noteSheetNo) metaParts.push(`<span><strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(this.noteSheet.noteSheetNo)}</span>`);
        if (this.noteSheet?.noteSheetDate) metaParts.push(`<span><strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}</span>`);
        if (this.noteSheet?.referenceNumber) metaParts.push(`<span><strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber)}</span>`);

        // ── Build employee table rows ──
        const cols = bn
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'মাতৃ ইউনিট', 'যোগদান তারিখ', 'বদলি কর্মস্থল', 'মন্তব্য']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Mother Unit', 'Joining Date', 'Transfer Unit', 'Remarks'];
        const headerCells = cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('');
        const bodyRows = this.employees.map((emp, i) => {
            const vals = [
                String(i + 1),
                emp.serviceId ?? '',
                bn ? (emp.rankNameBN || emp.rankName || '') : (emp.rankName ?? ''),
                bn ? (emp.tradeNameBN || emp.tradeName || '') : (emp.tradeName ?? ''),
                bn ? (emp.fullNameBN || emp.fullNameEN || '') : (emp.fullNameEN ?? ''),
                bn ? (emp.motherUnitNameBN || emp.motherUnitName || '') : (emp.motherUnitName ?? ''),
                this.formatDate(emp.joiningDateInRAB),
                emp.transferRabUnitName ?? '',
                emp.remarks ?? ''
            ];
            return `<tr>${vals.map(v => `<td>${this.escapeHtml(v)}</td>`).join('')}</tr>`;
        }).join('');

        // ── Build signature blocks ──
        let sigHtml = '';
        const preparedBy = this.noteSheet?.preparedBy ?? '';
        if (this.initiatorDetails || preparedBy) {
            const initName = this.initiatorDetails?.name ?? preparedBy;
            const initRank = this.initiatorDetails?.rank ?? '';
            const initAppt = this.initiatorDetails?.appointment ?? '';
            const dateLine = this.formatDate(this.noteSheet?.noteSheetDate);
            sigHtml += `<div style="text-align:right;margin-top:30px;line-height:1.6">
                <div><strong>${this.escapeHtml(initName)}</strong></div>
                ${initRank ? `<div>${this.escapeHtml(initRank)}</div>` : ''}
                ${initAppt ? `<div>${this.escapeHtml(initAppt)}</div>` : ''}
                <div>${this.escapeHtml(dateLine)}</div>
            </div>`;
        }
        for (const approver of this.approversDetails) {
            sigHtml += `<div style="margin-top:20px;line-height:1.6">
                <div><strong>${this.escapeHtml(approver.step)}</strong></div>
                <div>${this.escapeHtml(approver.name)}</div>
                ${approver.rank && approver.rank !== '-' ? `<div>${this.escapeHtml(approver.rank)}</div>` : ''}
                ${approver.appointment ? `<div>${this.escapeHtml(approver.appointment)}</div>` : ''}
            </div>`;
        }

        const noteText = this.noteSheet?.note
            ? `<p style="margin-top:16px"><strong>${bn ? 'নোটঃ' : 'Note:'}</strong> ${this.escapeHtml(this.noteSheet.note)}</p>`
            : '';

        // ── Create offscreen container ──
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:0;width:1100px;padding:30px;background:#fff;z-index:-1';
        container.innerHTML = `
            <div style="font-family:${fontFamily};font-size:11pt;color:#000;line-height:1.6">
                <h1 style="font-size:16pt;text-align:center;margin:0 0 10px 0">${this.escapeHtml(title)}</h1>
                <div style="font-size:10pt;margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">${metaParts.join('')}</div>
                <div style="margin-bottom:12px">${this.noteSheet?.mainText ?? ''}</div>
                <table style="width:100%;border-collapse:collapse;font-size:9pt">
                    <thead><tr style="background:#1e3a5f;color:#fff">${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
                ${noteText}
                ${sigHtml}
            </div>`;
        // table cell styles
        container.querySelectorAll('th, td').forEach((cell: any) => {
            cell.style.border = '1px solid #333';
            cell.style.padding = '4px 6px';
            cell.style.textAlign = 'left';
        });
        document.body.appendChild(container);

        try {
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            // A4 landscape dimensions in mm
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20; // 10mm margin each side
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
            const ratio = pdfWidth / imgWidth;
            const scaledHeight = imgHeight * ratio;

            if (scaledHeight <= pdfPageHeight) {
                pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, scaledHeight);
            } else {
                // Multi-page: slice the canvas
                let remainingHeight = imgHeight;
                let srcY = 0;
                let page = 0;
                const sliceHeight = Math.floor(pdfPageHeight / ratio);

                while (remainingHeight > 0) {
                    if (page > 0) pdf.addPage();
                    const currentSlice = Math.min(sliceHeight, remainingHeight);
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = imgWidth;
                    sliceCanvas.height = currentSlice;
                    const ctx = sliceCanvas.getContext('2d')!;
                    ctx.drawImage(canvas, 0, srcY, imgWidth, currentSlice, 0, 0, imgWidth, currentSlice);
                    const sliceData = sliceCanvas.toDataURL('image/png');
                    const sliceScaled = currentSlice * ratio;
                    pdf.addImage(sliceData, 'PNG', 10, 10, pdfWidth, sliceScaled);
                    srcY += currentSlice;
                    remainingHeight -= currentSlice;
                    page++;
                }
            }

            const filename = `NoteSheet_${this.noteSheet?.noteSheetNo ?? 'export'}.pdf`;
            pdf.save(filename);
        } finally {
            document.body.removeChild(container);
        }
    }

    exportPdf(): void {
        const bn = !this.isEnglish;
        const fontFamily = bn ? "'SutonnyMJ', serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        const metaParts: string[] = [];
        if (this.noteSheet?.noteSheetNo) metaParts.push(`${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'} ${this.noteSheet.noteSheetNo}`);
        if (this.noteSheet?.noteSheetDate) metaParts.push(`${bn ? 'তারিখ:' : 'Date:'} ${this.formatDate(this.noteSheet.noteSheetDate)}`);
        if (this.noteSheet?.referenceNumber) metaParts.push(`${bn ? 'সুত্র:' : 'Reference:'} ${this.noteSheet.referenceNumber}`);

        const cols = bn
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'মাতৃ ইউনিট', 'যোগদান তারিখ', 'বদলি কর্মস্থল', 'মন্তব্য']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Mother Unit', 'Joining Date', 'Transfer Unit', 'Remarks'];

        const headerCells = cols.map(c => `<th style="border:1px solid #000;padding:4px 6px;font-size:10pt">${this.escapeHtml(c)}</th>`).join('');
        const bodyRows = this.employees.map((emp, i) => {
            const vals = [
                String(i + 1),
                emp.serviceId ?? '',
                bn ? (emp.rankNameBN || emp.rankName || '') : (emp.rankName ?? ''),
                bn ? (emp.tradeNameBN || emp.tradeName || '') : (emp.tradeName ?? ''),
                bn ? (emp.fullNameBN || emp.fullNameEN || '') : (emp.fullNameEN ?? ''),
                bn ? (emp.motherUnitNameBN || emp.motherUnitName || '') : (emp.motherUnitName ?? ''),
                this.formatDate(emp.joiningDateInRAB),
                emp.transferRabUnitName ?? '',
                emp.remarks ?? ''
            ];
            return `<tr>${vals.map(v => `<td style="border:1px solid #000;padding:4px 6px;font-size:10pt">${this.escapeHtml(v)}</td>`).join('')}</tr>`;
        }).join('');

        // Signatures
        let sigHtml = '';
        const preparedBy = this.noteSheet?.preparedBy ?? '';
        if (this.initiatorDetails || preparedBy) {
            const initName = this.initiatorDetails?.name ?? preparedBy;
            const initRank = this.initiatorDetails?.rank ?? '';
            const initAppt = this.initiatorDetails?.appointment ?? '';
            const dateLine = this.formatDate(this.noteSheet?.noteSheetDate);
            sigHtml += `<div style="text-align:right;margin-top:30px">
                <div>${this.escapeHtml(initName)}</div>
                ${initRank ? `<div>${this.escapeHtml(initRank)}</div>` : ''}
                ${initAppt ? `<div>${this.escapeHtml(initAppt)}</div>` : ''}
                <div>${this.escapeHtml(dateLine)}</div>
            </div>`;
        }
        for (const approver of this.approversDetails) {
            sigHtml += `<div style="margin-top:20px">
                <div><strong>${this.escapeHtml(approver.step)}</strong></div>
                <div>${this.escapeHtml(approver.name)}</div>
                ${approver.rank && approver.rank !== '-' ? `<div>${this.escapeHtml(approver.rank)}</div>` : ''}
                ${approver.appointment ? `<div>${this.escapeHtml(approver.appointment)}</div>` : ''}
            </div>`;
        }

        const noteText = this.noteSheet?.note ? `<p style="margin-top:16px"><strong>${bn ? 'নোটঃ' : 'Note:'}</strong> ${this.escapeHtml(this.noteSheet.note)}</p>` : '';

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
    @font-face { font-family: 'SutonnyMJ'; src: url('/assets/fonts/SutonnyMJ.ttf') format('truetype'); }
    @page { size: A4 landscape; margin: 15mm; }
    body { font-family: ${fontFamily}; font-size: 11pt; margin: 0; padding: 0; }
    h1 { font-size: 16pt; text-align: center; margin-bottom: 8px; }
    .meta { font-size: 10pt; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
</style></head><body>
    <h1>${this.escapeHtml(title)}</h1>
    <div class="meta">${metaParts.map(p => this.escapeHtml(p)).join('&emsp;&emsp;')}</div>
    <div>${this.noteSheet?.mainText ?? ''}</div>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
    ${noteText}
    ${sigHtml}
</body></html>`;

        const win = window.open('', '_blank', 'width=1000,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 800);
    }

    // ─── Helpers ──────────────────────────────────────────────────

    formatDate(val: string | null | undefined): string {
        if (!val) return '—';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return val;
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return val;
        }
    }

    private stripHtml(html: string): string {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
