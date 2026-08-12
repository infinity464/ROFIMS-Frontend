import { Component, OnInit, ViewChild, ElementRef, inject } from '@angular/core';
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
import { ExBdLeaveClearanceService, ExBdLeaveClearanceDto, ExBdLeaveClearanceWithDetailsDto } from '@/services/ex-bd-leave-clearance.service';
import { EmpService } from '@/services/emp-service';
import { ReferenceNoEntry, OnulipiEntry, AttachmentEntry } from '@/models/office-order.model';
import { ApprovalStatus } from '@/models/enums';
import { NotesheetMembersTableComponent } from '@/Components/Shared/notesheet-members-table/notesheet-members-table';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, VerticalAlign, TableLayoutType, TabStopType, LineRuleType } from 'docx';
import { JsReportService } from '@/services/jsreport.service';
import { saveAs } from 'file-saver';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-clearance-ex-bd-leave-preview',
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
    templateUrl: './clearance-ex-bd-leave-preview.html',
    styleUrl: './clearance-ex-bd-leave-preview.scss'
})
export class ClearanceExBdLeavePreviewComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private http = inject(HttpClient);
    private clearanceService = inject(ExBdLeaveClearanceService);
    private empService = inject(EmpService);
    private messageService = inject(MessageService);
    private sanitizer = inject(DomSanitizer);
    private jsreportService = inject(JsReportService);

    @ViewChild('legalPaper') legalPaper!: ElementRef<HTMLDivElement>;

    readonly ApprovalStatus = ApprovalStatus;

    viewMode: 'list' | 'detail' = 'list';

    orders: ExBdLeaveClearanceDto[] = [];
    loadingList = false;

    order: ExBdLeaveClearanceWithDetailsDto | null = null;
    loading = true;
    error = false;

    referenceEntries: ReferenceNoEntry[] = [];
    onulipiEntries: OnulipiEntry[] = [];
    attachmentEntries: AttachmentEntry[] = [];

    showOnulipiFilter = false;
    onulipiChecked: boolean[] = [];

    get exportOnulipiEntries(): OnulipiEntry[] {
        if (this.onulipiChecked.length !== this.onulipiEntries.length) {
            this.onulipiChecked = this.onulipiEntries.map((_, i) => this.onulipiChecked[i] ?? true);
        }
        return this.onulipiEntries.filter((_, i) => this.onulipiChecked[i] !== false);
    }

    /** View-only reorder of an অনুলিপি entry (for print/export). Swaps the entry with its
     *  neighbour and carries its show/hide checkbox along; the paper, PDF and Word all
     *  read exportOnulipiEntries, so they follow. Ephemeral — resets on reload. */
    moveOnulipiUp(i: number): void { this.swapOnulipi(i, i - 1); }
    moveOnulipiDown(i: number): void { this.swapOnulipi(i, i + 1); }
    private swapOnulipi(from: number, to: number): void {
        const a = this.onulipiEntries;
        if (from < 0 || to < 0 || from >= a.length || to >= a.length) return;
        [a[from], a[to]] = [a[to], a[from]];
        const c = this.onulipiChecked;
        const cf = c[from] ?? true, ct = c[to] ?? true;
        c[from] = ct; c[to] = cf;
    }

    selectedPageSize: 'a4' | 'legal' = 'a4';

    exportingPdf = false;
    printingPreview = false;

    showApprovalModal = false;
    approvalAction: ApprovalStatus.Approve | ApprovalStatus.Cancel | null = null;
    approvalRemarks = '';
    savingApproval = false;

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
        this.router.navigate(['/clearance-ex-bd-leave-list']);
        this.loadList();
    }

    goEdit(): void {
        if (this.order) {
            this.router.navigate(['/clearance-ex-bd-leave/generate'], { queryParams: { id: this.order.id } });
        }
    }

    goEditFromList(row: ExBdLeaveClearanceDto): void {
        this.router.navigate(['/clearance-ex-bd-leave/generate'], { queryParams: { id: row.id } });
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

    loadList(): void {
        this.loadingList = true;
        this.clearanceService.getClearanceMasters().subscribe({
            next: (list) => {
                this.orders = list ?? [];
                this.loadingList = false;
            },
            error: () => {
                this.loadingList = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load clearances.' });
            }
        });
    }

    viewOrder(row: ExBdLeaveClearanceDto): void {
        this.viewMode = 'detail';
        this.router.navigate(['/clearance-ex-bd-leave-list'], { queryParams: { id: row.id } });
        this.loadOrder(row.id);
    }

    onGlobalFilter(table: any, event: Event): void {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    loadOrder(id: number): void {
        this.loading = true;
        this.clearanceService.getClearanceById(id).subscribe({
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
        this.onulipiChecked = this.onulipiEntries.map(() => true);
        try {
            const atts = this.order.attachments ? JSON.parse(this.order.attachments) : [];
            this.attachmentEntries = Array.isArray(atts) ? atts.map((a: any) => ({ text: a?.text ?? '' })) : [];
        } catch { this.attachmentEntries = []; }
    }

    getBodySafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(this.order?.body?.trim() || '');
    }

    referenceSerial(index: number): string {
        return String.fromCharCode(65 + index) + '.';
    }

    serial(n: number): string {
        return `${n}.`;
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
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
        const pageWidth = this.selectedPageSize === 'legal' ? 12240 : 11906;
        const totalWidth = pageWidth - 720 - 720;
        const slHeader = 'SL';
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
                children: [new Paragraph({ children: [new TextRun({ text: 'SL', font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                width: { size: colWidths[0], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
            }),
            ...columns.map((col: any, ci: number) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col.label || col.key, font, size: tableFontSize, bold: true })], alignment: AlignmentType.CENTER })],
                width: { size: colWidths[ci + 1], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER
            }))
        ];
        const dataRows = rows.map((row, idx) => {
            const ser = String(idx + 1);
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
        const font = 'Times New Roman';
        const titleSize = 20;    // 10pt — government header (same size as body, bold)
        const contentSize = 20;  // 10pt — all body content (uniform)
        const children: (Paragraph | Table)[] = [];
        const pageSize = this.selectedPageSize === 'legal'
            ? { width: 12240, height: 20160 }
            : { width: 11906, height: 16838 };



        const headerLines = [
            "Government of the People's Republic of Bangladesh",
            'Bangladesh Police',
            'Rapid Action Battalion Forces Headquarters',
            'Kurmitola, Dhaka.'
        ];
        for (const line of headerLines) {
            children.push(new Paragraph({ children: [new TextRun({ text: line, font, size: titleSize, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }));
        }
        children.push(new Paragraph({ text: '', spacing: { after: 100 } }));

        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Reference number: ', font, size: contentSize, bold: true }),
                new TextRun({ text: this.order.letterNo || '.............', font, size: contentSize }),
                new TextRun({ text: '\t', font, size: contentSize }),
                new TextRun({ text: 'Date: ', font, size: contentSize, bold: true }),
                new TextRun({ text: this.formatDate(this.order.letterDate), font, size: contentSize })
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: (pageSize.width - 720 - 720) }],
            spacing: { after: 100 }
        }));

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
            children.push(new Paragraph({ children: [new TextRun({ text: 'SUBJ: ', font, size: contentSize, bold: true }), new TextRun({ text: this.order.subject.toUpperCase(), font, size: contentSize, bold: true })], spacing: { after: 100 } }));
        }

        // Compact serial→text tab (0.3") so the gap after A./1./2. is small, matching the preview.
        const serialTab = [{ type: TabStopType.LEFT, position: 432 }];
        if (this.referenceEntries.length === 1) {
            // Single reference: label + value on ONE line (mirrors the preview), no serial. Single tab gap.
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: 'References:\t', font, size: contentSize, bold: true }),
                    new TextRun({ text: this.referenceEntries[0].text, font, size: contentSize })
                ],
                tabStops: serialTab,
                spacing: { before: 80, after: 60 }
            }));
        } else if (this.referenceEntries.length > 1) {
            children.push(new Paragraph({ children: [new TextRun({ text: 'References:', font, size: contentSize, bold: true })], spacing: { before: 80, after: 0 } }));
            for (let i = 0; i < this.referenceEntries.length; i++) {
                const ref = this.referenceEntries[i];
                const letter = String.fromCharCode(65 + i);
                children.push(new Paragraph({ children: [new TextRun({ text: `${letter}.\t${ref.text}`, font, size: contentSize })], tabStops: serialTab, spacing: { after: 20 } }));
            }
            children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
        }

        if (this.order.body) {
            const plainBody = this.htmlToPlainText(this.order.body);
            if (plainBody) {
                const bodyLines = plainBody.split('\n').filter(l => l.trim());
                bodyLines.forEach((line, i) => {
                    const runs: TextRun[] = [];
                    if (i === 0) {
                        runs.push(new TextRun({ text: '1.\t', font, size: contentSize, bold: true }));
                    }
                    runs.push(new TextRun({ text: line.trim(), font, size: contentSize }));
                    children.push(new Paragraph({ children: runs, tabStops: serialTab, alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 300, lineRule: LineRuleType.AUTO } }));
                });
            }
            const remarksText = (this.order.remarks || '').trim();
            if (remarksText) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: '2.\t', font, size: contentSize, bold: true }),
                        new TextRun({ text: remarksText, font, size: contentSize })
                    ],
                    tabStops: serialTab,
                    alignment: AlignmentType.JUSTIFIED, spacing: { after: 60, line: 300, lineRule: LineRuleType.AUTO }
                }));
            }
        }

        // Attachments — printed directly above the Information (Onulipi).
        if (this.attachmentEntries.length > 0) {
            children.push(new Paragraph({
                children: [new TextRun({ text: 'Attachment:', font, size: contentSize, bold: true })],
                spacing: { before: 300, after: 0 }
            }));
            this.attachmentEntries.forEach((att, idx) => {
                const ser = String(idx + 1);
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${ser}.\t${att.text}`, font, size: contentSize })],
                    indent: { left: 432, hanging: 432 },
                    tabStops: serialTab,
                    spacing: { after: 20 }
                }));
            });
        }

        const exportOnulipi = this.exportOnulipiEntries;
        if (exportOnulipi.length > 0) {
            children.push(new Paragraph({ children: [new TextRun({ text: 'Information:', font, size: contentSize, bold: true })], spacing: { before: 120 } }));
            exportOnulipi.forEach((entry, idx) => {
                const ser = String(idx + 1);
                // Serial at the left margin, text hangs at 0.3", wrapped lines align under the text.
                children.push(new Paragraph({
                    children: [new TextRun({ text: `${ser}.\t${entry.text}`, font, size: contentSize })],
                    indent: { left: 432, hanging: 432 },
                    tabStops: serialTab,
                    spacing: { after: 20 }
                }));
            });
        }

        if (this.order.approvalEmployeeName) {
            const sigIndent = 8500;
            children.push(new Paragraph({ text: '', spacing: { before: 400 } }));
            children.push(new Paragraph({ children: [new TextRun({ text: this.order.approvalEmployeeName, font, size: contentSize, bold: true })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            if (this.order.approvalEmployeeRank) {
                children.push(new Paragraph({ children: [new TextRun({ text: this.order.approvalEmployeeRank, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            }
            if (this.order.approvalEmployeeAppointment) {
                children.push(new Paragraph({ children: [new TextRun({ text: this.order.approvalEmployeeAppointment, font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
            }
            children.push(new Paragraph({ children: [new TextRun({ text: 'For Director General', font, size: contentSize })], alignment: AlignmentType.LEFT, indent: { left: sigIndent } }));
        }

        return new Document({ sections: [{ properties: { page: { size: pageSize, margin: { top: 720, bottom: 720, left: 1152, right: 576 } } }, children }] });
    }

    async exportWord(): Promise<void> {
        try {
            const doc = await this.buildWordDocument();
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `ExBdLeaveClearance_${this.order?.letterNo ?? 'export'}.docx`);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to export Word document.' });
        }
    }

    async exportPdf(): Promise<void> {
        if (!this.order || !this.legalPaper) return;
        this.exportingPdf = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(
                html, {}, `ExBdLeaveClearance_${this.order?.letterNo ?? 'export'}.pdf`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally { this.exportingPdf = false; }
    }

    async printPreview(): Promise<void> {
        if (!this.order || !this.legalPaper) return;
        this.printingPreview = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(
                html, {}, `ExBdLeaveClearance_${this.order?.letterNo ?? 'export'}`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally { this.printingPreview = false; }
    }

    private buildJsReportPdf(): { html: string; chrome: Record<string, unknown> } {
        const styles = this.collectDocumentStyles();
        const body = this.legalPaper.nativeElement.innerHTML;
        const isLegal = this.selectedPageSize === 'legal';
        const pageWidth = isLegal ? '215.9mm' : '210mm';
        const pageHeight = isLegal ? '355.6mm' : '297mm';
        const colWidth = isLegal ? '185.42mm' : '179.52mm'; // pageWidth − 0.8in left − 0.4in right
        const padLeft = 20.32, padRight = 10.16, padTop = 14, padBottom = 20; // mm — 0.8in left / 0.4in right page margins

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm; }
html, body { margin: 0; padding: 0; background: transparent; }

.no-print, .preview-header, .preview-actions, .approval-header-right, .oo-onulipi-filter, .oo-file-attachments { display: none !important; }

.pdf-flow {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${colWidth};
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}

/* The body's first paragraph must sit inline with its serial number. The matching
   rule is :host-scoped and does not apply in this standalone HTML, so restate it. */
.oo-doc-rich-content p { margin: 4px 0; text-align: justify; }
.oo-doc-rich-content--inline { display: inline; }
.oo-doc-rich-content--inline p:first-child { display: inline; }
</style>
</head>
<body>
<div class="pdf-flow">${body}</div>
</body>
</html>`;

        const chrome: Record<string, unknown> = {
            format: null,
            width: pageWidth,
            height: pageHeight,
            landscape: false,
            marginTop: '0', marginBottom: '0', marginLeft: '0', marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '', footerTemplate: ''
        };

        return { html, chrome };
    }

    private collectDocumentStyles(): string {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
            } catch { /* cross-origin — skip */ }
        }
        return out.join('\n');
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
            this.clearanceService.approveClearance(id, this.approvalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Clearance approved.' });
                        this.showApprovalModal = false;
                        this.loadOrder(id);
                    } else {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed.' });
                    }
                },
                error: () => { this.savingApproval = false; this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve.' }); }
            });
        } else {
            this.clearanceService.cancelClearance(id, this.approvalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Clearance cancelled.' });
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
