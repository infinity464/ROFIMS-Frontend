import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { IconField as IconFieldModule } from 'primeng/iconfield';
import { InputIcon as InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { OfficeOrderService } from '@/services/office-order.service';
import { GeneralNotesheetOfficeOrderDto, GeneralNotesheetOfficeOrderWithDetailsDto, ReferenceNoEntry, OnulipiEntry } from '@/models/office-order.model';
import { ApprovalStatus } from '@/models/enums';
import { NotesheetMembersTableComponent } from '@/Components/Shared/notesheet-members-table/notesheet-members-table';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel, Table, TableRow, TableCell, WidthType, VerticalAlign } from 'docx';
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
        Toast,
        TableModule,
        IconFieldModule,
        InputIconModule,
        InputTextModule,
        NotesheetMembersTableComponent
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
    private sanitizer = inject(DomSanitizer);

    readonly ApprovalStatus = ApprovalStatus;

    // ─── View mode ───────────────────────────────────
    viewMode: 'list' | 'detail' = 'list';

    // ─── List mode ───────────────────────────────────
    orders: GeneralNotesheetOfficeOrderDto[] = [];
    loadingList = false;

    // ─── Detail mode ─────────────────────────────────
    order: GeneralNotesheetOfficeOrderWithDetailsDto | null = null;
    loading = true;
    error = false;

    // Parsed JSON fields
    referenceEntries: ReferenceNoEntry[] = [];
    onulipiEntries: OnulipiEntry[] = [];

    // Page size for export
    selectedPageSize: 'a4' | 'letter' = 'a4';

    // Export states
    exportingPdf = false;
    printingPreview = false;

    // Approval modal
    showApprovalModal = false;
    approvalAction: ApprovalStatus.Approve | ApprovalStatus.Cancel | null = null;
    approvalRemarks = '';
    savingApproval = false;

    // Parsed notesheet paragraphs (from DTO)
    nsMainText = '';
    nsNote = '';
    nsParagraphs: string[] = [];

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
        this.viewMode = 'list';
        this.order = null;
        this.router.navigate(['/office-order/preview']);
        this.loadList();
    }

    goEdit(): void {
        if (this.order) {
            this.router.navigate(['/office-order/generate'], { queryParams: { id: this.order.id } });
        }
    }

    goEditFromList(row: GeneralNotesheetOfficeOrderDto): void {
        this.router.navigate(['/office-order/generate'], { queryParams: { id: row.id } });
    }

    ngOnInit(): void {
        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (id) {
            this.viewMode = 'detail';
            this.loadOrder(id);
        } else {
            this.viewMode = 'list';
            this.loading = false;
            this.loadList();
        }
    }

    // ─── List ────────────────────────────────────────
    loadList(): void {
        this.loadingList = true;
        this.officeOrderService.getOfficeOrderMasters().subscribe({
            next: (list) => {
                this.orders = list ?? [];
                this.loadingList = false;
            },
            error: () => {
                this.loadingList = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load office orders.' });
            }
        });
    }

    viewOrder(row: GeneralNotesheetOfficeOrderDto): void {
        this.viewMode = 'detail';
        this.router.navigate(['/office-order/preview'], { queryParams: { id: row.id } });
        this.loadOrder(row.id);
    }

    onGlobalFilter(table: any, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    loadOrder(id: number): void {
        this.loading = true;
        this.officeOrderService.getOfficeOrderById(id).subscribe({
            next: (data) => {
                this.order = data;
                this.parseJsonFields();
                this.parseNoteSheetFields();
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

    private parseNoteSheetFields(): void {
        if (!this.order) return;
        this.nsMainText = this.order.nsMainText ?? '';
        this.nsNote = this.order.nsNote ?? '';
        const pt = (this.order.nsParagraphText ?? '').trim();
        if (!pt) {
            this.nsParagraphs = [];
        } else if (pt.startsWith('[')) {
            // Posting notesheets store as JSON array
            try {
                const arr = JSON.parse(pt);
                this.nsParagraphs = Array.isArray(arr) ? arr.filter((p: string) => p && p.trim()) : [];
            } catch { this.nsParagraphs = [pt]; }
        } else {
            // General notesheets store as plain HTML string
            this.nsParagraphs = [pt];
        }
    }

    get hasNoteSheetContent(): boolean {
        return !!(this.nsMainText || this.nsNote || this.nsParagraphs.length > 0);
    }

    serial(n: number): string {
        if (!this.isBangla) return `${n}.`;
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return String(n).replace(/\d/g, d => bn[+d]) + '।';
    }

    getMainTextSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(this.nsMainText);
    }

    getNoteSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(this.nsNote);
    }

    getParagraphSafe(text: string): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(text);
    }

    /** Compute serial numbers for note and paragraphText based on what sections exist. */
    get noteSerial(): number { return 2; }
    get lastTextStartSerial(): number {
        return this.noteSerial + (this.nsNote ? 1 : 0);
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            if (this.isBangla) {
                const day = this.toBanglaDigits(String(d.getDate()).padStart(2, '0'));
                const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
                const month = months[d.getMonth()];
                const year = this.toBanglaDigits(String(d.getFullYear()));
                return `${day} ${month} ${year}`;
            }
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return String(value); }
    }

    approvalStatusLabel(status: string | null | undefined): string {
        switch (status) {
            case ApprovalStatus.Approve: return 'Approved';
            case ApprovalStatus.Pending: return 'Pending';
            case ApprovalStatus.Cancel: return 'Cancelled';
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

    /** Convert HTML string to plain text preserving line breaks */
    private htmlToPlainText(html: string): string {
        if (!html) return '';
        let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return text;
    }

    // ─── Export ──────────────────────────────────────────

    /** Load members table data for export */
    private async loadMembersForExport(): Promise<{ columns: any[]; rows: Record<string, string>[] }> {
        if (!this.order?.noteSheetId) return { columns: [], rows: [] };
        try {
            const api = `${environment.apis.core}/NoteSheetReferenceEmployee/GetByNoteSheetId/${this.order.noteSheetId}`;
            const list = await firstValueFrom(this.http.get<any[]>(api));
            const filtered = (Array.isArray(list) ? list : []).filter(r => r.informationJson || r.InformationJson);
            if (filtered.length > 0) {
                const firstParsed = JSON.parse(filtered[0].informationJson || filtered[0].InformationJson);
                const columns = Array.isArray(firstParsed.columns) ? firstParsed.columns : [];
                const rows = filtered.map(r => {
                    const parsed = JSON.parse(r.informationJson || r.InformationJson);
                    return parsed.values ?? {};
                });
                return { columns, rows };
            }
        } catch { /* ignore */ }
        return { columns: [], rows: [] };
    }

    /** Build members table as docx Table */
    private buildMembersTable(columns: any[], rows: Record<string, string>[], font: string): Table {
        const tableFontSize = 14; // 7pt in half-points
        const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const borders = {
            top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle,
            insideHorizontal: borderStyle, insideVertical: borderStyle
        };

        // Header row
        const headerCells = [
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: this.isBangla ? 'ক্রমিক' : 'SL', font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                width: { size: 8, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER
            }),
            ...columns.map((col: any) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col.label || col.key, font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                verticalAlign: VerticalAlign.CENTER
            }))
        ];

        // Data rows
        const dataRows = rows.map((row, idx) => {
            const ser = this.isBangla ? this.toBanglaDigits(String(idx + 1)) : String(idx + 1);
            const cells = [
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: ser, font, size: tableFontSize })], alignment: AlignmentType.CENTER })],
                    verticalAlign: VerticalAlign.CENTER
                }),
                ...columns.map((col: any) => {
                    let val = '';
                    if (col.mergedFrom?.keys?.length) {
                        val = col.mergedFrom.keys.map((k: string) => row[k] || '').filter(Boolean).join(col.mergedFrom.separator ?? ' ');
                    } else {
                        val = row[col.key] || '';
                    }
                    if (this.isBangla && /\d/.test(val)) val = this.toBanglaDigits(val);
                    return new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: val, font, size: tableFontSize })] })],
                        verticalAlign: VerticalAlign.CENTER
                    });
                })
            ];
            return new TableRow({ children: cells });
        });

        return new Table({
            borders,
            rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
            width: { size: 100, type: WidthType.PERCENTAGE }
        });
    }

    private async buildWordDocument(): Promise<Document> {
        if (!this.order) throw new Error('No order loaded');

        const font = this.isBangla ? 'Nirmala UI' : 'Times New Roman';
        const titleSize = 18; // 9pt
        const contentSize = 16; // 8pt
        const children: (Paragraph | Table)[] = [];

        // ── Page size ──
        const pageSize = this.selectedPageSize === 'letter'
            ? { width: 12240, height: 15840 } // Letter: 8.5" × 11"
            : { width: 11906, height: 16838 }; // A4: 210mm × 297mm

        // ── Government Header (centered, 9pt) ──
        const headerLines = this.isBangla
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‌্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা']
            : ["Government of the People's Republic of Bangladesh", 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka'];
        for (const line of headerLines) {
            children.push(new Paragraph({
                children: [new TextRun({ text: line, font, size: titleSize, bold: true })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 20 }
            }));
        }

        // ── Title (9pt, bold, underlined, centered) ──
        children.push(new Paragraph({
            children: [new TextRun({ text: this.isBangla ? 'অফিস আদেশ' : 'OFFICE ORDER', font, size: titleSize, bold: true, underline: {} })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 160 }
        }));

        // ── Letter No & Date (8pt) ──
        children.push(new Paragraph({
            children: [
                new TextRun({ text: `${this.isBangla ? 'স্মারক নং: ' : 'Letter No: '}`, font, size: contentSize, bold: true }),
                new TextRun({ text: this.order.letterNo || '.............', font, size: contentSize }),
                new TextRun({ text: `\t\t\t${this.isBangla ? 'তারিখ: ' : 'Date: '}`, font, size: contentSize, bold: true }),
                new TextRun({ text: this.formatDate(this.order.letterDate), font, size: contentSize })
            ],
            spacing: { after: 100 }
        }));

        // ── Address To (8pt) ──
        if (this.order.addressTo) {
            const plainText = this.htmlToPlainText(this.order.addressTo);
            if (plainText) {
                for (const line of plainText.split('\n').filter(l => l.trim())) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: line.trim(), font, size: contentSize })],
                        spacing: { after: 20 }
                    }));
                }
                children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
            }
        }

        // ── Subject (8pt, bold + underline) ──
        if (this.order.subject) {
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.isBangla ? 'বিষয়: ' : 'Subject: '}`, font, size: contentSize, bold: true }),
                    new TextRun({ text: this.order.subject, font, size: contentSize, bold: true, underline: {} })
                ],
                spacing: { after: 100 }
            }));
        }

        // ── Reference No (8pt) ──
        if (this.referenceEntries.length > 0) {
            children.push(new Paragraph({
                children: [new TextRun({ text: this.isBangla ? 'সূত্র:' : 'Reference:', font, size: contentSize, bold: true })],
                spacing: { before: 80 }
            }));
            for (const ref of this.referenceEntries) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${ref.serial}। ${ref.text}`, font, size: contentSize })],
                    indent: { left: 360 },
                    spacing: { after: 20 }
                }));
            }
            children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
        }

        // ── Notesheet Content (8pt with table at 7pt) ──
        if (this.hasNoteSheetContent) {
            // Main Text (serial 1)
            if (this.nsMainText) {
                const plainMain = this.htmlToPlainText(this.nsMainText);
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${this.serial(1)} `, font, size: contentSize, bold: true }),
                        new TextRun({ text: plainMain, font, size: contentSize })
                    ],
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { after: 80 }
                }));

                // Members Table (7pt)
                const { columns, rows } = await this.loadMembersForExport();
                if (columns.length > 0 && rows.length > 0) {
                    children.push(this.buildMembersTable(columns, rows, font));
                    children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
                }
            }

            // Note (serial 2)
            if (this.nsNote) {
                const plainNote = this.htmlToPlainText(this.nsNote);
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${this.serial(this.noteSerial)} `, font, size: contentSize, bold: true }),
                        new TextRun({ text: plainNote, font, size: contentSize })
                    ],
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { after: 80 }
                }));
            }

            // Additional Paragraphs
            for (let pi = 0; pi < this.nsParagraphs.length; pi++) {
                const plainPara = this.htmlToPlainText(this.nsParagraphs[pi]);
                if (plainPara) {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({ text: `${this.serial(this.lastTextStartSerial + pi)} `, font, size: contentSize, bold: true }),
                            new TextRun({ text: plainPara, font, size: contentSize })
                        ],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 80 }
                    }));
                }
            }
        } else if (this.order.body) {
            // Fallback body (8pt)
            const plainBody = this.htmlToPlainText(this.order.body);
            if (plainBody) {
                for (const line of plainBody.split('\n').filter(l => l.trim())) {
                    children.push(new Paragraph({
                        children: [new TextRun({ text: line.trim(), font, size: contentSize })],
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 60 }
                    }));
                }
            }
        }

        // ── Approval Signature (8pt, right aligned) ──
        if (this.order.approvalEmployeeName) {
            children.push(new Paragraph({ text: '', spacing: { before: 400 } }));
            const sigName = this.isBangla
                ? (this.order.approvalEmployeeNameBN || this.order.approvalEmployeeName)
                : this.order.approvalEmployeeName;
            children.push(new Paragraph({
                children: [new TextRun({ text: sigName, font, size: contentSize, bold: true })],
                alignment: AlignmentType.RIGHT
            }));
            if (this.order.approvalEmployeeRank) {
                const rank = this.isBangla ? (this.order.approvalEmployeeRankBN || this.order.approvalEmployeeRank) : this.order.approvalEmployeeRank;
                children.push(new Paragraph({
                    children: [new TextRun({ text: rank, font, size: contentSize })],
                    alignment: AlignmentType.RIGHT
                }));
            }
            if (this.order.approvalEmployeeAppointment) {
                const appt = this.isBangla ? (this.order.approvalEmployeeAppointmentBN || this.order.approvalEmployeeAppointment) : this.order.approvalEmployeeAppointment;
                children.push(new Paragraph({
                    children: [new TextRun({ text: appt, font, size: contentSize })],
                    alignment: AlignmentType.RIGHT
                }));
            }
            if (this.order.approvalEmployeeRabUnit) {
                const unit = this.isBangla ? (this.order.approvalEmployeeRabUnitBN || this.order.approvalEmployeeRabUnit) : this.order.approvalEmployeeRabUnit;
                children.push(new Paragraph({
                    children: [new TextRun({ text: unit, font, size: contentSize })],
                    alignment: AlignmentType.RIGHT
                }));
            }
        }

        // ── Onulipi (8pt) ──
        if (this.onulipiEntries.length > 0) {
            children.push(new Paragraph({
                children: [new TextRun({
                    text: this.isBangla ? 'অনুলিপি (জ্যেষ্ঠতার ভিত্তিতে নহে):' : 'Copy (not in order of seniority):',
                    font, size: contentSize, bold: true
                })],
                spacing: { before: 300 }
            }));
            this.onulipiEntries.forEach((entry, idx) => {
                const ser = this.isBangla ? this.toBanglaDigits(String(idx + 1)) : String(idx + 1);
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${ser}। ${entry.text}`, font, size: contentSize })],
                    indent: { left: 360 },
                    spacing: { after: 20 }
                }));
            });
        }

        return new Document({
            sections: [{
                properties: {
                    page: {
                        size: pageSize,
                        margin: { top: 720, bottom: 720, left: 720, right: 720 }
                    }
                },
                children
            }]
        });
    }

    async exportWord(): Promise<void> {
        try {
            const doc = await this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `OfficeOrder_${this.order?.letterNo ?? 'export'}.docx`);
        } catch (err: any) {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export Word document.' });
        }
    }

    async exportPdf(): Promise<void> {
        this.exportingPdf = true;
        try {
            const doc = await this.buildWordDocument();
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
            const doc = await this.buildWordDocument();
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
