import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { OfficeOrderService } from '@/services/office-order.service';
import { GeneralNotesheetOfficeOrderWithDetailsDto, ReferenceNoEntry, OnulipiEntry } from '@/models/office-order.model';
import { ApprovalStatus } from '@/models/enums';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-office-order-preview',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        TooltipModule,
        DialogModule,
        TextareaModule,
        Toast
    ],
    providers: [MessageService],
    templateUrl: './office-order-preview.html',
    styleUrl: './office-order-preview.scss'
})
export class OfficeOrderPreviewComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private http = inject(HttpClient);
    private officeOrderService = inject(OfficeOrderService);
    private messageService = inject(MessageService);

    readonly ApprovalStatus = ApprovalStatus;

    order: GeneralNotesheetOfficeOrderWithDetailsDto | null = null;
    loading = true;
    error = false;

    // Parsed JSON fields
    referenceEntries: ReferenceNoEntry[] = [];
    onulipiEntries: OnulipiEntry[] = [];

    // Export states
    exportingPdf = false;
    printingPreview = false;

    // Approval modal
    showApprovalModal = false;
    approvalAction: ApprovalStatus.Approve | ApprovalStatus.Cancel | null = null;
    approvalRemarks = '';
    savingApproval = false;

    get isBangla(): boolean {
        return this.order?.textType === 'bn';
    }

    get isApproved(): boolean {
        return this.order?.approvalStatus === ApprovalStatus.Approve;
    }

    get isPending(): boolean {
        return this.order?.approvalStatus === ApprovalStatus.Pending;
    }

    goBack(): void {
        this.router.navigate(['/office-order/generate']);
    }

    ngOnInit(): void {
        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (!id) {
            this.error = true;
            this.loading = false;
            return;
        }
        this.loadOrder(id);
    }

    loadOrder(id: number): void {
        this.loading = true;
        this.officeOrderService.getOfficeOrderById(id).subscribe({
            next: (data) => {
                this.order = data;
                this.parseJsonFields();
                this.loading = false;
            },
            error: () => {
                this.error = true;
                this.loading = false;
            }
        });
    }

    private parseJsonFields(): void {
        if (!this.order) return;
        try { this.referenceEntries = this.order.referenceNo ? JSON.parse(this.order.referenceNo) : []; } catch { this.referenceEntries = []; }
        try { this.onulipiEntries = this.order.onulipi ? JSON.parse(this.order.onulipi) : []; } catch { this.onulipiEntries = []; }
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return String(value); }
    }

    approvalStatusLabel(status: string | null | undefined): string {
        switch (status) {
            case ApprovalStatus.Approve: return this.isBangla ? 'অনুমোদিত' : 'Approved';
            case ApprovalStatus.Pending: return this.isBangla ? 'অপেক্ষমাণ' : 'Pending';
            case ApprovalStatus.Cancel: return this.isBangla ? 'বাতিল' : 'Cancelled';
            default: return '-';
        }
    }

    approvalStatusSeverity(status: string | null | undefined): 'success' | 'warn' | 'danger' | 'secondary' {
        switch (status) {
            case ApprovalStatus.Approve: return 'success';
            case ApprovalStatus.Pending: return 'warn';
            case ApprovalStatus.Cancel: return 'danger';
            default: return 'secondary';
        }
    }

    toBanglaDigits(s: string): string {
        return s.replace(/\d/g, d => String.fromCharCode(0x09E6 + Number(d)));
    }

    // ─── Export ──────────────────────────────────────────
    private buildWordDocument(): Document {
        if (!this.order) throw new Error('No order loaded');

        const font = this.isBangla ? 'Nirmala UI' : 'Times New Roman';
        const paragraphs: Paragraph[] = [];

        // Letter No + Date
        paragraphs.push(new Paragraph({
            children: [
                new TextRun({ text: `${this.isBangla ? 'পত্র নম্বর: ' : 'Letter No: '}${this.order.letterNo}`, font, size: 24 }),
                new TextRun({ text: `\t\t${this.isBangla ? 'তারিখ: ' : 'Date: '}${this.formatDate(this.order.letterDate)}`, font, size: 24 }),
            ]
        }));
        paragraphs.push(new Paragraph({ text: '' }));

        // NoteSheet Reference
        if (this.order.noteSheetNo) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.isBangla ? 'নোটশীট নং: ' : 'NoteSheet No: '}${this.order.noteSheetNo}`, font, size: 22, italics: true }),
                ]
            }));
            paragraphs.push(new Paragraph({ text: '' }));
        }

        // Address To
        if (this.order.addressTo) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: this.isBangla ? 'প্রাপক:' : 'Address To:', font, size: 24, bold: true }),
                ]
            }));
            const plainText = this.order.addressTo.replace(/<[^>]*>/g, '').trim();
            if (plainText) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: plainText, font, size: 22 })],
                    spacing: { after: 200 }
                }));
            }
        }

        // Subject
        if (this.order.subject) {
            paragraphs.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.isBangla ? 'বিষয়: ' : 'Subject: '}`, font, size: 24, bold: true }),
                    new TextRun({ text: this.order.subject, font, size: 24, bold: true, underline: {} }),
                ],
                spacing: { after: 200 }
            }));
        }

        // Reference No
        if (this.referenceEntries.length > 0) {
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text: this.isBangla ? 'সূত্র:' : 'Reference:', font, size: 24, bold: true })],
                spacing: { before: 200 }
            }));
            for (const ref of this.referenceEntries) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: `${ref.serial}. ${ref.text}`, font, size: 22 })],
                    indent: { left: 360 }
                }));
            }
            paragraphs.push(new Paragraph({ text: '' }));
        }

        // Body
        if (this.order.body) {
            const plainBody = this.order.body.replace(/<[^>]*>/g, '').trim();
            if (plainBody) {
                for (const line of plainBody.split('\n').filter(l => l.trim())) {
                    paragraphs.push(new Paragraph({
                        children: [new TextRun({ text: line.trim(), font, size: 22 })],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 120 }
                    }));
                }
            }
        }

        // Onulipi
        if (this.onulipiEntries.length > 0) {
            paragraphs.push(new Paragraph({
                children: [new TextRun({ text: this.isBangla ? 'অনুলিপি:' : 'Onulipi:', font, size: 24, bold: true })],
                spacing: { before: 200 }
            }));
            this.onulipiEntries.forEach((entry, idx) => {
                const ser = this.isBangla ? this.toBanglaDigits(String(idx + 1)) : String(idx + 1);
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: `${ser}. ${entry.text}`, font, size: 22 })],
                    indent: { left: 360 }
                }));
            });
        }

        return new Document({
            sections: [{
                properties: {
                    page: {
                        size: { width: 12240, height: 20160 }, // Legal size in twips
                        margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
                    }
                },
                children: paragraphs
            }]
        });
    }

    async exportWord(): Promise<void> {
        try {
            const doc = this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `OfficeOrder_${this.order?.letterNo ?? 'export'}.docx`);
        } catch (err: any) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export Word document.' });
        }
    }

    async exportPdf(): Promise<void> {
        this.exportingPdf = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            saveAs(pdfBlob, `OfficeOrder_${this.order?.letterNo ?? 'export'}.pdf`);
        } catch (err: any) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export PDF.' });
        } finally {
            this.exportingPdf = false;
        }
    }

    async printPreview(): Promise<void> {
        this.printingPreview = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
        } catch (err: any) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate print preview.' });
        } finally {
            this.printingPreview = false;
        }
    }

    // ─── Approval ───────────────────────────────────────
    openApprovalModal(): void {
        this.approvalAction = null;
        this.approvalRemarks = '';
        this.showApprovalModal = true;
    }

    selectApprovalAction(action: ApprovalStatus.Approve | ApprovalStatus.Cancel): void {
        this.approvalAction = action;
        this.approvalRemarks = '';
    }

    saveApproval(): void {
        if (!this.order || !this.approvalAction) return;
        this.savingApproval = true;
        const id = this.order.id;

        if (this.approvalAction === ApprovalStatus.Approve) {
            this.officeOrderService.approveOfficeOrder(id, this.approvalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isBangla ? 'অফিস আদেশ অনুমোদিত হয়েছে।' : 'Office Order approved.' });
                        this.showApprovalModal = false;
                        this.loadOrder(id);
                    } else {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed.' });
                    }
                },
                error: () => {
                    this.savingApproval = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve.' });
                }
            });
        } else {
            this.officeOrderService.cancelOfficeOrder(id, this.approvalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: this.isBangla ? 'অফিস আদেশ বাতিল হয়েছে।' : 'Office Order cancelled.' });
                        this.showApprovalModal = false;
                        this.loadOrder(id);
                    } else {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed.' });
                    }
                },
                error: () => {
                    this.savingApproval = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to cancel.' });
                }
            });
        }
    }
}
