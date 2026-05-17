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
import { CheckboxModule } from 'primeng/checkbox';
import { Toast } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { IconField as IconFieldModule } from 'primeng/iconfield';
import { InputIcon as InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { ExBdLeaveOfficeOrderService, ExBdLeaveOfficeOrderDto, ExBdLeaveOfficeOrderWithDetailsDto } from '@/services/ex-bd-leave-office-order.service';
import { EmpService } from '@/services/emp-service';
import { ReferenceNoEntry, OnulipiEntry } from '@/models/office-order.model';
import { ApprovalStatus } from '@/models/enums';
import { NotesheetMembersTableComponent } from '@/Components/Shared/notesheet-members-table/notesheet-members-table';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, VerticalAlign, TableLayoutType } from 'docx';
import { saveAs } from 'file-saver';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-office-order-ex-bd-leave-preview',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        TooltipModule,
        DialogModule,
        TextareaModule,
        CheckboxModule,
        Toast,
        TableModule,
        IconFieldModule,
        InputIconModule,
        InputTextModule,
        NotesheetMembersTableComponent
    ],
    providers: [MessageService],
    templateUrl: './office-order-ex-bd-leave-preview.html',
    styleUrl: './office-order-ex-bd-leave-preview.scss'
})
export class OfficeOrderExBdLeavePreviewComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private http = inject(HttpClient);
    private officeOrderService = inject(ExBdLeaveOfficeOrderService);
    private empService = inject(EmpService);
    private messageService = inject(MessageService);
    private sanitizer = inject(DomSanitizer);

    readonly ApprovalStatus = ApprovalStatus;

    // ─── View mode ───────────────────────────────────
    viewMode: 'list' | 'detail' = 'list';

    // ─── List mode ───────────────────────────────────
    orders: ExBdLeaveOfficeOrderDto[] = [];
    loadingList = false;

    // ─── Detail mode ─────────────────────────────────
    order: ExBdLeaveOfficeOrderWithDetailsDto | null = null;
    loading = true;
    error = false;

    // Parsed JSON fields
    referenceEntries: ReferenceNoEntry[] = [];
    onulipiEntries: OnulipiEntry[] = [];

    // Onulipi show/hide filter
    showOnulipiFilter = false;
    onulipiChecked: boolean[] = [];

    get exportOnulipiEntries(): OnulipiEntry[] {
        if (this.onulipiChecked.length !== this.onulipiEntries.length) {
            this.onulipiChecked = this.onulipiEntries.map((_, i) => this.onulipiChecked[i] ?? true);
        }
        return this.onulipiEntries.filter((_, i) => this.onulipiChecked[i] !== false);
    }

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

    get viewFileAttachments(): { fileId: number; fileName: string }[] {
        const json = this.order?.filesReferences;
        if (!json || typeof json !== 'string') return [];
        try {
            const refs = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
            return Array.isArray(refs)
                ? refs.filter(r => (r.FileId ?? r.fileId)).map(r => ({
                    fileId: r.FileId ?? r.fileId ?? 0,
                    fileName: r.fileName ?? r.FileName ?? 'File'
                }))
                : [];
        } catch { return []; }
    }

    downloadAttachment(file: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(file.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, file.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    goBack(): void {
        this.viewMode = 'list';
        this.order = null;
        this.router.navigate(['/office-order-ex-bd-leave/preview']);
        this.loadList();
    }

    goEdit(): void {
        if (this.order) {
            this.router.navigate(['/office-order-ex-bd-leave/generate'], { queryParams: { id: this.order.id } });
        }
    }

    goEditFromList(row: ExBdLeaveOfficeOrderDto): void {
        this.router.navigate(['/office-order-ex-bd-leave/generate'], { queryParams: { id: row.id } });
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

    viewOrder(row: ExBdLeaveOfficeOrderDto): void {
        this.viewMode = 'detail';
        this.router.navigate(['/office-order-ex-bd-leave/preview'], { queryParams: { id: row.id } });
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
        this.onulipiChecked = this.onulipiEntries.map(() => true);
    }

    private parseNoteSheetFields(): void {
        if (!this.order) return;
        this.nsMainText = this.order.nsMainText ?? '';
        this.nsNote = this.order.nsNote ?? '';
        const pt = (this.order.nsParagraphText ?? '').trim();
        if (!pt) {
            this.nsParagraphs = [];
        } else if (pt.startsWith('[')) {
            try {
                const arr = JSON.parse(pt);
                this.nsParagraphs = Array.isArray(arr) ? arr.filter((p: string) => p && p.trim()) : [];
            } catch { this.nsParagraphs = [pt]; }
        } else {
            this.nsParagraphs = [pt];
        }
    }

    get hasNoteSheetContent(): boolean {
        return !!(this.nsMainText || this.nsNote || this.nsParagraphs.length > 0);
    }

    /** Build main paragraph text like the notesheet preview does */
    buildMainParagraph(): string {
        if (!this.order) return this.nsMainText || '';
        const bn = this.isBangla;
        const o = this.order;

        const unitName = bn ? (o.appEmployeeRabUnitBN || o.appEmployeeRabUnit || '') : (o.appEmployeeRabUnit || '');
        const rabId = o.appEmployeeRabId ? (bn ? this.toBanglaDigits(String(o.appEmployeeRabId)) : String(o.appEmployeeRabId)) : '';
        const empName = bn ? (o.appEmployeeNameBN || o.appEmployeeName || '') : (o.appEmployeeName || '');
        const purpose = bn ? (o.appVisitTypeNameBN || o.appVisitTypeName || '') : (o.appVisitTypeName || '');
        const countryText = bn ? (o.appCountriesDisplayBN || o.appCountriesDisplay || '') : (o.appCountriesDisplay || '');
        const familyText = o.appFamilyMembersDisplay || '';

        const fromDate = o.appFromDate ? this.formatDate(o.appFromDate) : '';
        const toDate = o.appToDate ? this.formatDate(o.appToDate) : '';
        const totalDays = o.appTotalDays ?? 0;
        const totalDaysBN = bn ? this.toBanglaDigits(String(totalDays)) : String(totalDays);
        const totalDaysWord = bn ? this.numberToBanglaWord(totalDays) : '';

        let text = '';
        if (bn) {
            text = 'র‍্যাব প্রেষণে নিয়োজিত বর্তমানে';
            if (unitName) text += ` ${unitName}`;
            text += ` এ কর্মরত নং-${rabId} ${empName}`;
            if (purpose) text += ` এর নিজের ${purpose}র জন্য`;
            if (familyText) text += ` নিজ এবং পরিবারবর্গ (${familyText})`;
            if (fromDate && toDate) text += ` আগামী ${fromDate} হতে ${toDate} তারিখ পর্যন্ত`;
            if (totalDays > 0) {
                const daysDisplay = totalDaysWord ? `${totalDaysBN} (${totalDaysWord})` : totalDaysBN;
                text += ` ${daysDisplay} দিন অথবা উল্লিখিত সময়ের মধ্যে যাত্রার তারিখ হতে ${daysDisplay} দিন`;
            }
            if (countryText) text += ` ${countryText} গমনের জন্য`;
            text += ' অর্জিত';
        } else {
            text = `Currently, working at the ${unitName}`;
            text += `, ${rabId}: ${empName}`;
            text += `, has submitted a request for a security clearance`;
            if (familyText) text += ` for family ${familyText}`;
            if (countryText) text += ` to travel to ${countryText}`;
            if (purpose) text += ` for ${purpose}`;
            if (fromDate && toDate) text += ` from ${fromDate} to ${toDate}`;
            if (totalDays > 0) text += `, or within ${totalDays} days from the date of travel`;
            text += '.';
        }

        // Append MainText HTML (preserve rich editor formatting: line breaks, paragraphs)
        const mainText = (this.nsMainText || '').trim();
        if (mainText) {
            // Strip outer <p> wrapper to inline with paragraph, keep inner HTML
            const inline = mainText.replace(/^<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '');
            text += ' ' + inline;
        }

        return text;
    }

    getMainParagraphSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(this.buildMainParagraph());
    }

    private numberToBanglaWord(n: number): string {
        const words: Record<number, string> = {
            1: 'এক', 2: 'দুই', 3: 'তিন', 4: 'চার', 5: 'পাঁচ',
            6: 'ছয়', 7: 'সাত', 8: 'আট', 9: 'নয়', 10: 'দশ',
            11: 'এগারো', 12: 'বারো', 13: 'তেরো', 14: 'চৌদ্দ', 15: 'পনেরো',
            16: 'ষোলো', 17: 'সতেরো', 18: 'আঠারো', 19: 'উনিশ', 20: 'বিশ',
            21: 'একুশ', 22: 'বাইশ', 23: 'তেইশ', 24: 'চব্বিশ', 25: 'পঁচিশ',
            26: 'ছাব্বিশ', 27: 'সাতাশ', 28: 'আটাশ', 29: 'ঊনত্রিশ', 30: 'ত্রিশ',
            31: 'একত্রিশ', 45: 'পঁয়তাল্লিশ', 60: 'ষাট', 90: 'নব্বই',
            180: 'একশত আশি', 365: 'তিনশত পঁয়ষট্টি'
        };
        return words[n] || '';
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

    private htmlToPlainText(html: string): string {
        if (!html) return '';
        return html
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
    }

    // ─── Export ──────────────────────────────────────────

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

    private calcColumnWidthsDxa(columns: any[], rows: Record<string, string>[]): number[] {
        const pageWidth = this.selectedPageSize === 'letter' ? 12240 : 11906;
        const totalWidth = pageWidth - 720 - 720;
        const slHeader = this.isBangla ? 'ক্রমিক' : 'SL';
        const slMaxLen = Math.max(slHeader.length, String(rows.length).length);
        const colMaxLens = columns.map((col: any) => {
            const headerLen = (col.label || col.key || '').length;
            let maxContentLen = 0;
            for (const row of rows) {
                let val = '';
                if (col.mergedFrom?.keys?.length) {
                    val = col.mergedFrom.keys.map((k: string) => row[k] || '').filter(Boolean).join(col.mergedFrom.separator ?? ' ');
                } else {
                    val = row[col.key] || '';
                }
                if (val.length > maxContentLen) maxContentLen = val.length;
            }
            return Math.max(headerLen, maxContentLen, 3);
        });
        const allLens = [slMaxLen, ...colMaxLens];
        const totalLen = allLens.reduce((sum, l) => sum + l, 0);
        let widths = allLens.map((l, i) => {
            const w = Math.round((l / totalLen) * totalWidth);
            return i === 0 ? Math.max(w, 600) : Math.max(w, 800);
        });
        const currentSum = widths.reduce((s, w) => s + w, 0);
        const diff = totalWidth - currentSum;
        const maxIdx = widths.indexOf(Math.max(...widths));
        widths[maxIdx] += diff;
        return widths;
    }

    private buildMembersTable(columns: any[], rows: Record<string, string>[], font: string): Table {
        const tableFontSize = 14;
        const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle, insideHorizontal: borderStyle, insideVertical: borderStyle };
        const colWidths = this.calcColumnWidthsDxa(columns, rows);
        const totalWidth = colWidths.reduce((s, w) => s + w, 0);
        const headerCells = [
            new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: this.isBangla ? 'ক্রমিক' : 'SL', font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                width: { size: colWidths[0], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
            }),
            ...columns.map((col: any, ci: number) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col.label || col.key, font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                width: { size: colWidths[ci + 1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
            }))
        ];
        const dataRows = rows.map((row, idx) => {
            const ser = this.isBangla ? this.toBanglaDigits(String(idx + 1)) : String(idx + 1);
            const cells = [
                new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: ser, font, size: tableFontSize })], alignment: AlignmentType.CENTER })],
                    width: { size: colWidths[0], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
                }),
                ...columns.map((col: any, ci: number) => {
                    let val = '';
                    if (col.mergedFrom?.keys?.length) {
                        val = col.mergedFrom.keys.map((k: string) => row[k] || '').filter(Boolean).join(col.mergedFrom.separator ?? ' ');
                    } else { val = row[col.key] || ''; }
                    if (this.isBangla && /\d/.test(val)) val = this.toBanglaDigits(val);
                    return new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: val, font, size: tableFontSize })] })],
                        width: { size: colWidths[ci + 1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
                    });
                })
            ];
            return new TableRow({ children: cells });
        });
        return new Table({
            borders, rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
            width: { size: totalWidth, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: colWidths
        });
    }

    private async buildWordDocument(): Promise<Document> {
        if (!this.order) throw new Error('No order loaded');
        const font = this.isBangla ? 'Nirmala UI' : 'Times New Roman';
        const titleSize = 18;
        const contentSize = 16;
        const children: (Paragraph | Table)[] = [];
        const pageSize = this.selectedPageSize === 'letter'
            ? { width: 12240, height: 15840 }
            : { width: 11906, height: 16838 };

        // Government Header
        const headerLines = this.isBangla
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‍্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা।']
            : ["People's Republic of Bangladesh", 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka.'];
        for (const line of headerLines) {
            children.push(new Paragraph({ children: [new TextRun({ text: line, font, size: titleSize, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }));
        }
        children.push(new Paragraph({ text: '', spacing: { after: 100 } }));

        // Letter No & Date
        children.push(new Paragraph({ children: [new TextRun({ text: `${this.isBangla ? 'স্মারক নং: ' : 'Letter No: '}`, font, size: contentSize, bold: true }), new TextRun({ text: this.order.letterNo || '.............', font, size: contentSize })], spacing: { after: 40 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `${this.isBangla ? 'তারিখ: ' : 'Date: '}`, font, size: contentSize, bold: true }), new TextRun({ text: this.formatDate(this.order.letterDate), font, size: contentSize })], alignment: AlignmentType.RIGHT, spacing: { after: 100 } }));

        if (this.order.addressTo) {
            const plainText = this.htmlToPlainText(this.order.addressTo);
            if (plainText) {
                for (const line of plainText.split('\n').filter(l => l.trim())) {
                    children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), font, size: contentSize })], spacing: { after: 20 } }));
                }
                children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
            }
        }

        if (this.order.subject) {
            children.push(new Paragraph({ children: [new TextRun({ text: `${this.isBangla ? 'বিষয়: ' : 'Subject: '}`, font, size: contentSize, bold: true }), new TextRun({ text: this.order.subject, font, size: contentSize, bold: true, underline: {} })], spacing: { after: 100 } }));
        }

        if (this.referenceEntries.length > 0) {
            children.push(new Paragraph({ children: [new TextRun({ text: this.isBangla ? 'সূত্র:' : 'Reference:', font, size: contentSize, bold: true })], spacing: { before: 80 } }));
            for (const ref of this.referenceEntries) {
                children.push(new Paragraph({ children: [new TextRun({ text: `${ref.serial}। ${ref.text}`, font, size: contentSize })], indent: { left: 360 }, spacing: { after: 20 } }));
            }
            children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
        }

        if (this.order.appEmployeeName || this.hasNoteSheetContent) {
            // Main paragraph (dynamically built like notesheet) - strip HTML for Word
            const mainParaHtml = this.buildMainParagraph();
            const mainParaPlain = this.htmlToPlainText(mainParaHtml);
            if (mainParaPlain) {
                const lines = mainParaPlain.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    children.push(new Paragraph({ children: [new TextRun({ text: line, font, size: contentSize })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 } }));
                }
            }
            for (let pi = 0; pi < this.nsParagraphs.length; pi++) {
                const plainPara = this.htmlToPlainText(this.nsParagraphs[pi]);
                if (plainPara) {
                    children.push(new Paragraph({ children: [new TextRun({ text: plainPara, font, size: contentSize })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 } }));
                }
            }
        } else if (this.order.body) {
            const plainBody = this.htmlToPlainText(this.order.body);
            if (plainBody) {
                for (const line of plainBody.split('\n').filter(l => l.trim())) {
                    children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), font, size: contentSize })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 60 } }));
                }
            }
        }

        if (this.order.approvalEmployeeName) {
            const sigIndent = 8500;
            children.push(new Paragraph({ text: '', spacing: { before: 400 } }));
            const sigName = this.isBangla ? (this.order.approvalEmployeeNameBN || this.order.approvalEmployeeName) : this.order.approvalEmployeeName;
            children.push(new Paragraph({ children: [new TextRun({ text: sigName, font, size: contentSize, bold: true })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            if (this.order.approvalEmployeeRank) {
                const rank = this.isBangla ? (this.order.approvalEmployeeRankBN || this.order.approvalEmployeeRank) : this.order.approvalEmployeeRank;
                children.push(new Paragraph({ children: [new TextRun({ text: rank, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            }
            if (this.order.approvalEmployeeAppointment) {
                const appt = this.isBangla ? (this.order.approvalEmployeeAppointmentBN || this.order.approvalEmployeeAppointment) : this.order.approvalEmployeeAppointment;
                children.push(new Paragraph({ children: [new TextRun({ text: appt, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            }
            if (this.order.approvalEmployeeRabUnit) {
                const unit = this.isBangla ? (this.order.approvalEmployeeRabUnitBN || this.order.approvalEmployeeRabUnit) : this.order.approvalEmployeeRabUnit;
                children.push(new Paragraph({ children: [new TextRun({ text: unit, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            }
            if (this.isApproved && this.order.approvalDate) {
                const dateLabel = this.isBangla ? 'তারিখ: ' : 'Date: ';
                children.push(new Paragraph({ children: [new TextRun({ text: `${dateLabel}${this.formatDate(this.order.approvalDate)}`, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent }, spacing: { before: 40 } }));
            }
        }

        const exportOnulipi = this.exportOnulipiEntries;
        if (exportOnulipi.length > 0) {
            if (this.order.noteSheetNo) {
                children.push(new Paragraph({ children: [new TextRun({ text: this.order.noteSheetNo, font, size: contentSize })], spacing: { before: 300 } }));
            }
            children.push(new Paragraph({ children: [new TextRun({ text: this.isBangla ? 'অনুলিপি (জ্যেষ্ঠতার ভিত্তিতে নহে):' : 'Copy (not in order of seniority):', font, size: contentSize, bold: true })], spacing: { before: this.order.noteSheetNo ? 80 : 300 } }));
            exportOnulipi.forEach((entry, idx) => {
                const ser = this.isBangla ? this.toBanglaDigits(String(idx + 1)) : String(idx + 1);
                children.push(new Paragraph({ children: [new TextRun({ text: `${ser}। ${entry.text}`, font, size: contentSize })], indent: { left: 360 }, spacing: { after: 20 } }));
            });
        }

        return new Document({ sections: [{ properties: { page: { size: pageSize, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }] });
    }

    async exportWord(): Promise<void> {
        try {
            const doc = await this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `ExBdLeaveOfficeOrder_${this.order?.letterNo ?? 'export'}.docx`);
        } catch {
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
            const pdfBlob = await firstValueFrom(this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' }));
            saveAs(pdfBlob, `ExBdLeaveOfficeOrder_${this.order?.letterNo ?? 'export'}.pdf`);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export PDF.' });
        } finally { this.exportingPdf = false; }
    }

    async printPreview(): Promise<void> {
        this.printingPreview = true;
        try {
            const doc = await this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' }));
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to generate print preview.' });
        } finally { this.printingPreview = false; }
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
                error: () => { this.savingApproval = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve.' }); }
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
                error: () => { this.savingApproval = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to cancel.' }); }
            });
        }
    }
}
