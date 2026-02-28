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
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { NoteSheetStatus, NoteSheetApprovalStep } from '@/models/enums';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
    selector: 'app-posting-order-preview',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, EditorModule, TextareaModule, InputTextModule, TooltipModule, SelectModule, NotesheetSignatoryComponent],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewComponent implements OnChanges, OnInit {
    @Input() noteSheet: any = null;
    @Input() isEnglish = true;
    @Input() initiatorDetails: any = null;
    @Input() approversDetails: any[] = [];
    @Input() preparedByDetails: any = null;

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

        // ── Recommender(s) + Final Approver (left-aligned) ──
        for (const approver of this.approversDetails) {
            const showApproverSig = approver.signatureDataUrl && this.shouldShowSignature(approver.step);
            if (showApproverSig) {
                children.push(new Paragraph({
                    children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(approver.signatureDataUrl), transformation: { width: 150, height: 50 } })],
                    spacing: { before: 200 }
                }));
            }
            children.push(new Paragraph({
                children: [new TextRun({ text: this.translateStep(approver.step), bold: true, size: 20, font })],
                spacing: showApproverSig ? {} : { before: 200 }
            }));
            const aLines = [approver.name, approver.rabId !== '-' ? `RAB ID: ${approver.rabId}` : '', approver.rank, approver.appointment].filter(l => l && l !== '-');
            aLines.forEach(line => {
                children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })] }));
            });
        }

        // ── Spacer ──
        children.push(new Paragraph({ spacing: { before: 300 } }));

        // ── Prepared by (right-aligned, first) ──
        const preparedByLabel = bn ? 'প্রস্তুতকারী' : 'Prepared by';
        if (this.preparedByDetails) {
            const showPbSig = this.preparedByDetails.signatureDataUrl && this.shouldShowSignature('Prepared by');
            if (showPbSig) {
                children.push(new Paragraph({
                    children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(this.preparedByDetails.signatureDataUrl), transformation: { width: 150, height: 50 } })],
                    alignment: AlignmentType.RIGHT, spacing: { before: 200 }
                }));
            }
            children.push(new Paragraph({
                children: [new TextRun({ text: preparedByLabel, bold: true, size: 20, font })],
                alignment: AlignmentType.RIGHT, spacing: showPbSig ? {} : { before: 200 }
            }));
            const pLines = [this.preparedByDetails.name, this.preparedByDetails.rabId !== '-' ? `RAB ID: ${this.preparedByDetails.rabId}` : '', this.preparedByDetails.rank, this.formatDate(this.noteSheet?.noteSheetDate)].filter(l => l && l !== '-' && l !== '—');
            pLines.forEach(line => {
                children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: AlignmentType.RIGHT }));
            });
        } else {
            const fallbackName = this.noteSheet?.preparedBy ?? '';
            if (fallbackName) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: preparedByLabel, bold: true, size: 20, font })],
                    alignment: AlignmentType.RIGHT, spacing: { before: 200 }
                }));
                children.push(new Paragraph({ children: [new TextRun({ text: fallbackName, size: 20, font })], alignment: AlignmentType.RIGHT }));
                children.push(new Paragraph({ children: [new TextRun({ text: this.formatDate(this.noteSheet?.noteSheetDate), size: 20, font })], alignment: AlignmentType.RIGHT }));
            }
        }

        // ── Initiator (right-aligned, after prepared by) ──
        if (this.initiatorDetails) {
            const showInitSig = this.initiatorDetails.signatureDataUrl && this.shouldShowSignature(this.initiatorDetails.step);
            if (showInitSig) {
                children.push(new Paragraph({
                    children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(this.initiatorDetails.signatureDataUrl), transformation: { width: 150, height: 50 } })],
                    alignment: AlignmentType.RIGHT, spacing: { before: 200 }
                }));
            }
            children.push(new Paragraph({
                children: [new TextRun({ text: this.translateStep(this.initiatorDetails.step), bold: true, size: 20, font })],
                alignment: AlignmentType.RIGHT, spacing: showInitSig ? {} : { before: 200 }
            }));
            const iLines = [this.initiatorDetails.name, this.initiatorDetails.rabId !== '-' ? `RAB ID: ${this.initiatorDetails.rabId}` : '', this.initiatorDetails.rank].filter(l => l && l !== '-');
            iLines.forEach(line => {
                children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: AlignmentType.RIGHT }));
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
        const sigHtml = this.buildSignatoriesHtml();

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
        const sigHtml = this.buildSignatoriesHtml();

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

    private readonly stepTranslations: Record<string, string> = {
        'Prepared by': 'প্রস্তুতকারী',
        'Initiator': 'সূচনাকারী',
        'Final Approver': 'চূড়ান্ত অনুমোদনকারী'
    };

    /** Translate a step label to Bangla when not English. */
    private translateStep(step: string): string {
        if (this.isEnglish) return step;
        if (step.startsWith('Recommender')) {
            const suffix = step.replace('Recommender', '').trim();
            return suffix ? `সুপারিশকারী ${suffix}` : 'সুপারিশকারী';
        }
        return this.stepTranslations[step] ?? step;
    }

    /** Whether a signatory's signature should be visible based on approval workflow status. */
    shouldShowSignature(step: string): boolean {
        const statusId = this.noteSheet?.noteSheetStatusId ?? NoteSheetStatus.Draft;
        const currentStep = this.noteSheet?.currentApprovalStep ?? NoteSheetApprovalStep.Initiator;

        // Prepared by: always show
        if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;

        // Initiator: show after initiator approved (step moved past Initiator) or fully approved/declined
        if (step === 'Initiator') return (statusId === NoteSheetStatus.Pending && currentStep >= NoteSheetApprovalStep.Recommender) || statusId >= NoteSheetStatus.Approved;

        // Recommender(s): show after recommender approved (step moved past Recommender) or fully approved/declined
        if (step.startsWith('Recommender')) return (statusId === NoteSheetStatus.Pending && currentStep >= NoteSheetApprovalStep.FinalApprover) || statusId >= NoteSheetStatus.Approved;

        // Final Approver: show only after fully approved
        if (step === 'Final Approver') return statusId === NoteSheetStatus.Approved;

        return false;
    }

    /** Build HTML signature blocks for all signatories (used by PDF exports). Two-column layout: left = approvers, right = initiator + prepared by. */
    private buildSignatoriesHtml(): string {
        const bn = !this.isEnglish;
        const sigImg = (detail: any, align: string) => detail?.signatureDataUrl && this.shouldShowSignature(detail.step)
            ? `<img src="${detail.signatureDataUrl}" style="max-width:150px;max-height:50px;object-fit:contain;display:block;${align === 'right' ? 'margin-left:auto' : ''}" />`
            : '';
        const sigBlock = (detail: any, align: string, showDate = false) => {
            if (!detail) return '';
            const lines = [
                detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
                detail.rank && detail.rank !== '-' ? detail.rank : '',
                detail.appointment && detail.appointment !== '-' ? detail.appointment : '',
                showDate ? this.formatDate(this.noteSheet?.noteSheetDate) : ''
            ].filter(Boolean);
            return `<div style="text-align:${align};margin-top:20px;line-height:1.6">
                ${sigImg(detail, align)}
                <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#1e3a5f">${this.escapeHtml(this.translateStep(detail.step))}</div>
                <div><strong>${this.escapeHtml(detail.name)}</strong></div>
                ${lines.map(l => `<div style="font-size:10pt">${this.escapeHtml(l)}</div>`).join('')}
            </div>`;
        };

        // Left column: Recommenders + Final Approver
        let leftHtml = '';
        for (const approver of this.approversDetails) {
            leftHtml += sigBlock(approver, 'left');
        }

        // Right column: Prepared by (first) + Initiator
        let rightHtml = '';
        if (this.preparedByDetails) {
            rightHtml += sigBlock({ ...this.preparedByDetails, step: bn ? 'প্রস্তুতকারী' : 'Prepared by' }, 'right', true);
        } else {
            const fallbackName = this.noteSheet?.preparedBy ?? '';
            if (fallbackName) {
                rightHtml += `<div style="text-align:right;margin-top:20px;line-height:1.6">
                    <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#1e3a5f">${bn ? 'প্রস্তুতকারী' : 'Prepared by'}</div>
                    <div><strong>${this.escapeHtml(fallbackName)}</strong></div>
                    <div style="font-size:10pt">${this.escapeHtml(this.formatDate(this.noteSheet?.noteSheetDate))}</div>
                </div>`;
            }
        }
        if (this.initiatorDetails) {
            rightHtml += sigBlock(this.initiatorDetails, 'right');
        }

        if (!leftHtml && !rightHtml) return '';
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:40px;margin-top:30px">
            <div>${leftHtml}</div>
            <div>${rightHtml}</div>
        </div>`;
    }

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

    private dataUrlToUint8Array(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array;
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
