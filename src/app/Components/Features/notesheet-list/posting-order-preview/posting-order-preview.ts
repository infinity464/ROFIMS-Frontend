import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { TextareaModule } from 'primeng/textarea';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { NoteSheetCurrentStatus, ApprovalStatus } from '@/models/enums';
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
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, RichEditorComponent, TextareaModule, InputTextModule, TooltipModule, SelectModule, NotesheetSignatoryComponent],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewComponent implements OnChanges, OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

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

    /** Whether the notesheet is approved (edit disabled) */
    get isApproved(): boolean {
        return this.noteSheet?.finalApprovalStatus === ApprovalStatus.Approve;
    }

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
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

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
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 14, font })], alignment: AlignmentType.CENTER })],
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
                children: [new Paragraph({ children: [new TextRun({ text: val, size: 14, font })], spacing: { after: 20 } })],
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

        // Helper: build paragraphs for a signatory block
        const buildSigParas = (detail: any, roleLabel: string, align: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph[] => {
            const paras: Paragraph[] = [];
            if (!detail) return paras;
            const showSig = detail.signatureDataUrl && this.shouldShowSignature(detail.step ?? roleLabel);
            if (showSig) {
                paras.push(new Paragraph({
                    children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(detail.signatureDataUrl), transformation: { width: 150, height: 50 } })],
                    alignment: align, spacing: { before: 200 }
                }));
            }
            paras.push(new Paragraph({
                children: [new TextRun({ text: '______________________________', size: 20, font })],
                alignment: align, spacing: showSig ? {} : { before: 200 }
            }));
            paras.push(new Paragraph({
                children: [new TextRun({ text: roleLabel, bold: true, size: 20, font })],
                alignment: align
            }));
            const lines = [
                detail.name,
                detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
                detail.rank && detail.rank !== '-' ? detail.rank : '',
                detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
            ].filter(l => l && l !== '-' && l !== '—');
            lines.forEach(line => {
                paras.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: align }));
            });
            return paras;
        };

        // ── Vertical layout: Initiator (right) first, then Recommender(s) + Final Approver (left) ──
        // Initiator (right-aligned)
        if (this.initiatorDetails) {
            children.push(...buildSigParas(this.initiatorDetails, this.translateStep(this.initiatorDetails.step), AlignmentType.RIGHT));
            children.push(new Paragraph({ spacing: { before: 300 } }));
        }

        // Recommender(s) + Final Approver (left-aligned)
        for (const approver of this.approversDetails) {
            children.push(...buildSigParas(approver, this.translateStep(approver.step), AlignmentType.LEFT));
            children.push(new Paragraph({ spacing: { before: 200 } }));
        }

        const doc = new Document({
            sections: [{
                properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
                children
            }]
        });

        const blob = await Packer.toBlob(doc);
        const filename = `NoteSheet_${this.noteSheet?.noteSheetNo ?? 'export'}.docx`;
        saveAs(blob, filename);
    }

    async exportPdfDirect(): Promise<void> {
        const bn = !this.isEnglish;
        const fontFamily = bn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        // ── Build meta ──
        const metaParts: string[] = [];
        if (this.noteSheet?.noteSheetNo) metaParts.push(`<span><strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(this.noteSheet.noteSheetNo)}</span>`);
        if (this.noteSheet?.noteSheetDate) metaParts.push(`<span><strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}</span>`);
        if (this.noteSheet?.referenceNumber) metaParts.push(`<span><strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber)}</span>`);

        // ── Build employee table ──
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

        const sigHtml = this.buildSignatoriesHtml();
        const noteText = this.noteSheet?.note
            ? `<p style="margin-top:16px"><strong>${bn ? 'নোটঃ' : 'Note:'}</strong> ${this.escapeHtml(this.noteSheet.note)}</p>`
            : '';

        // ── Offscreen container ──
        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:760px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.innerHTML = `
            <style>
              .ns-pdf-wrap, .ns-pdf-wrap * { word-wrap:break-word!important; overflow-wrap:break-word!important; white-space:normal!important; max-width:100%!important; box-sizing:border-box!important; }
              .ns-pdf-wrap img { max-width:100%!important; height:auto!important; }
              .ns-pdf-wrap table, .ns-pdf-wrap th, .ns-pdf-wrap td { white-space:normal!important; }
            </style>
            <div class="ns-pdf-wrap" style="font-family:${fontFamily};font-size:10pt;color:#000;line-height:1.5;width:100%">
                <h1 style="font-size:14pt;text-align:center;margin:0 0 10px 0">${this.escapeHtml(title)}</h1>
                <div style="font-size:9pt;margin-bottom:10px;display:flex;gap:20px;flex-wrap:wrap">${metaParts.join('')}</div>
                <div style="margin-bottom:10px;font-size:9pt">${this.noteSheet?.mainText ?? ''}</div>
                <table style="width:100%;border-collapse:collapse;font-size:7pt">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
                ${noteText}
                ${sigHtml}
            </div>`;
        container.querySelectorAll('th, td').forEach((cell: any) => {
            cell.style.border = '1px solid #000';
            cell.style.padding = '2px 4px';
            cell.style.textAlign = 'left';
        });
        container.querySelectorAll('th').forEach((cell: any) => {
            cell.style.fontWeight = 'bold';
        });
        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollY: -window.scrollY, height: container.scrollHeight, windowHeight: container.scrollHeight });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
            const ratio = pdfWidth / imgWidth;
            const scaledHeight = imgHeight * ratio;

            if (scaledHeight <= pdfPageHeight) {
                pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, scaledHeight);
            } else {
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
                    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
                    pdf.addImage(sliceData, 'JPEG', 10, 10, pdfWidth, currentSlice * ratio);
                    srcY += currentSlice;
                    remainingHeight -= currentSlice;
                    page++;
                }
            }

            pdf.save(`NoteSheet_${this.noteSheet?.noteSheetNo ?? 'export'}.pdf`);
        } finally {
            document.body.removeChild(container);
        }
    }

    exportPdf(): void {
        const bn = !this.isEnglish;
        const fontFamily = bn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        const metaParts: string[] = [];
        if (this.noteSheet?.noteSheetNo) metaParts.push(`<strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(this.noteSheet.noteSheetNo)}`);
        if (this.noteSheet?.noteSheetDate) metaParts.push(`<strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}`);
        if (this.noteSheet?.referenceNumber) metaParts.push(`<strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber)}`);

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

        // Signatures
        const sigHtml = this.buildSignatoriesHtml();

        const noteText = this.noteSheet?.note ? `<p style="margin-top:16px"><strong>${bn ? 'নোটঃ' : 'Note:'}</strong> ${this.escapeHtml(this.noteSheet.note)}</p>` : '';

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: ${fontFamily}; font-size: 10pt; margin: 0; padding: 16px; color: #000; }
    h1 { font-size: 14pt; text-align: center; margin: 0 0 10px 0; }
    .meta { font-size: 9pt; margin-bottom: 10px; display: flex; gap: 20px; flex-wrap: wrap; }
    .content { margin-bottom: 10px; line-height: 1.5; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #000; padding: 2px 4px; font-size: 7pt; text-align: left; }
    th { font-weight: bold; }
    tr:nth-child(even) { background: #f5f5f5; }
    @media print { body { padding: 0; } tr:nth-child(even) { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
    <h1>${this.escapeHtml(title)}</h1>
    <div class="meta">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>
    <div class="content">${this.noteSheet?.mainText ?? ''}</div>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
    ${noteText}
    ${sigHtml}
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
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
        const ns = this.noteSheet;
        if (!ns) return false;

        // Prepared by: always show
        if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;

        // Initiator: show once initiator has approved
        if (step === 'Initiator') return ns.initiatorStatus === ApprovalStatus.Approve;

        // Recommender(s): show once workflow has moved to recommender stage or beyond
        if (step.startsWith('Recommender')) {
            const cs: string = ns.currentStatus ?? '';
            return cs === NoteSheetCurrentStatus.Recommender
                || cs === NoteSheetCurrentStatus.FinalApproval
                || cs === NoteSheetCurrentStatus.Cancel;
        }

        // Final Approver: show only after final approval
        if (step === 'Final Approver') return ns.finalApprovalStatus === ApprovalStatus.Approve;

        return false;
    }

    /** Build HTML signature blocks for all signatories (used by PDF exports). Two-column layout: left = approvers, right = initiator. */
    private buildSignatoriesHtml(): string {
        const sigImg = (detail: any, align: string) => detail?.signatureDataUrl && this.shouldShowSignature(detail.step)
            ? `<img src="${detail.signatureDataUrl}" style="width:150px;height:50px;object-fit:contain;display:block;${align === 'right' ? 'margin-left:auto' : ''}" />`
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
                <div style="width:160px;border-bottom:1.5px solid #000;margin-bottom:4px;${align === 'right' ? 'margin-left:auto' : ''}"></div>
                <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#000">${this.escapeHtml(this.translateStep(detail.step))}</div>
                <div><strong>${this.escapeHtml(detail.name)}</strong></div>
                ${lines.map(l => `<div style="font-size:10pt">${this.escapeHtml(l)}</div>`).join('')}
            </div>`;
        };

        // Initiator (right-aligned, top)
        let rightHtml = '';
        if (this.initiatorDetails) {
            rightHtml += sigBlock(this.initiatorDetails, 'right');
        }

        // Recommender(s) + Final Approver (left-aligned, below)
        let leftHtml = '';
        for (const approver of this.approversDetails) {
            leftHtml += sigBlock(approver, 'left');
        }

        if (!leftHtml && !rightHtml) return '';
        return `<div style="margin-top:30px">
            ${rightHtml ? `<div>${rightHtml}</div>` : ''}
            ${leftHtml ? `<div style="margin-top:24px">${leftHtml}</div>` : ''}
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
