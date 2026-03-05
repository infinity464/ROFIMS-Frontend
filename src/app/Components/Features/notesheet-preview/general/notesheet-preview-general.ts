import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { NoteSheetCurrentStatus, NoteSheetOperationTypeOptions } from '@/models/enums';
import { environment } from '@/Core/Environments/environment';
import { forkJoin } from 'rxjs';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun,
    VerticalAlign, TableLayoutType, HeightRule
} from 'docx';
import { saveAs } from 'file-saver';

@Component({
    selector: 'app-notesheet-preview-general',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent
    ],
    providers: [MessageService],
    templateUrl: './notesheet-preview-general.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewGeneralComponent extends NotesheetPreviewBase {

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    // ── Edit state ───────────────────────────────────────────
    editing = false;
    saving = false;

    // ── Employee dropdown options ────────────────────────────
    employeeOptions: { label: string; value: number }[] = [];

    // ── Edit model fields ────────────────────────────────────
    editSubject = '';
    editReferenceNumber = '';
    editMainText = '';
    editNote = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;

    // ── Dropdown options ─────────────────────────────────────
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly operationTypeOptions = NoteSheetOperationTypeOptions;

    // ── File references ──────────────────────────────────────
    fileRows: FileRowData[] = [];

    // ── Computed ─────────────────────────────────────────────
    get canEdit(): boolean {
        const status = this.noteSheet?.currentStatus?.toLowerCase();
        return status === NoteSheetCurrentStatus.Draft || status === NoteSheetCurrentStatus.Initiator;
    }

    get isDraftStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Draft;
    }

    get isInitiatorStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Initiator;
    }

    // ── Toggle edit mode ─────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        this.editSubject = this.noteSheet.subject ?? '';
        this.editReferenceNumber = this.noteSheet.referenceNumber ?? '';
        this.editMainText = this.noteSheet.mainText ?? '';
        this.editNote = this.noteSheet.note ?? '';
        this.editNoteSheetDate = this.noteSheet.noteSheetDate ? new Date(this.noteSheet.noteSheetDate) : null;
        this.editInitiatorId = this.noteSheet.initiatorId ?? null;
        this.editRecommenderIds = this.parseRecommenderIds();
        this.editFinalApproverId = (this.noteSheet.finalApprovalId && this.noteSheet.finalApprovalId > 0)
            ? this.noteSheet.finalApprovalId
            : (this.noteSheet.finalApproverId && this.noteSheet.finalApproverId > 0 ? this.noteSheet.finalApproverId : null);

        this.editTextType = (this.noteSheet.textType ?? 0) === 1 ? 'bn' : 'en';
        this.editOperationType = this.noteSheet.noteSheetOperationType ?? null;

        // Parse existing file references
        this.fileRows = this.parseFileReferences();

        if (this.employeeOptions.length === 0) {
            this.loadEmployeeOptions();
        }
    }

    cancelEdit(): void {
        this.editing = false;
        this.fileRows = [];
    }

    // ── File references handlers ─────────────────────────────
    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    // ── Load employee dropdown options ───────────────────────
    loadEmployeeOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (list) => {
                this.employeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.fullNameEN || e.FullNameEN || '';
                    const rabId = e.rabid || e.Rabid || e.RABID || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee list.' });
            }
        });
    }

    // ── Save changes ─────────────────────────────────────────
    saveChanges(): void {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const recommendersJson = this.buildRecommendersJson();
            const now = new Date().toISOString();

            const payload: Record<string, unknown> = {
                ...this.noteSheet,
                subject: this.editSubject,
                referenceNumber: this.editReferenceNumber,
                mainText: this.editMainText,
                note: this.editNote || null,
                textType: this.editTextType === 'bn' ? 1 : 0,
                noteSheetOperationType: this.editOperationType,
                noteSheetDate: this.editNoteSheetDate ? this.formatDateOnly(this.editNoteSheetDate) : this.noteSheet!.noteSheetDate,
                initiatorId: this.editInitiatorId ?? 0,
                recommendersJson,
                finalApprovalId: this.editFinalApproverId ?? null,
                lastUpdatedBy: this.noteSheet!.lastUpdatedBy ?? this.noteSheet!.createdBy ?? 'system',
                lastupdate: now
            };

            if (filesReferencesJson != null && filesReferencesJson !== '') {
                payload['filesReferences'] = filesReferencesJson;
            }

            this.http.post(`${this.api}/UpdateAsyn`, payload).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                    this.editing = false;
                    this.saving = false;
                    this.fileRows = [];
                    this.reloadNoteSheet();
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update note-sheet.' });
                    this.saving = false;
                }
            });
        };

        // Upload new files first, then save
        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [
                        ...existingRefs.map(r => ({ FileId: r.FileId, fileName: r.fileName })),
                        ...newRefs
                    ];
                    doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload files.' });
                    this.saving = false;
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    // ── Reload notesheet after save ──────────────────────────
    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.preparedByDetails = null;
        this.loadNoteSheet();
    }

    // ── Parse file references from noteSheet ─────────────────
    private parseFileReferences(): FileRowData[] {
        const json = this.noteSheet?.filesReferences;
        if (!json || typeof json !== 'string') return [];
        try {
            const refs = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
            return Array.isArray(refs)
                ? refs.map(r => ({
                    displayName: r.fileName ?? r.FileName ?? '',
                    file: null,
                    fileId: r.FileId ?? r.fileId
                }))
                : [];
        } catch {
            return [];
        }
    }

    // ── Parse recommender IDs from JSON ──────────────────────
    private parseRecommenderIds(): number[] {
        if (!this.noteSheet) return [];
        const rawJson = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
        if (!rawJson || typeof rawJson !== 'string') return [];
        try {
            const arr = JSON.parse(rawJson);
            if (!Array.isArray(arr) || arr.length === 0) return [];
            if (typeof arr[0] === 'object' && arr[0] !== null) {
                return arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
            }
            return arr.filter((x: any) => typeof x === 'number');
        } catch {
            return [];
        }
    }

    // ── Build recommenders JSON from selected IDs ────────────
    private buildRecommendersJson(): string | null {
        if (!this.editRecommenderIds || this.editRecommenderIds.length === 0) return null;

        let existingMap: Record<number, any> = {};
        if (this.noteSheet?.recommendersJson) {
            try {
                const arr = JSON.parse(this.noteSheet.recommendersJson);
                if (Array.isArray(arr)) {
                    arr.forEach((r: any) => {
                        const id = r.recomender_id ?? r.recomenderId;
                        if (id) existingMap[id] = r;
                    });
                }
            } catch { /* ignore */ }
        }

        return JSON.stringify(this.editRecommenderIds.map((id, idx) => {
            const existing = existingMap[id];
            return {
                recomender_no: idx + 1,
                recomender_id: id,
                recomender_status: existing?.recomender_status ?? 'pending',
                recomender_approve_remark: existing?.recomender_approve_remark ?? '',
                recomender_cancel_remark: existing?.recomender_cancel_remark ?? '',
                recomender_approved_date: existing?.recomender_approved_date ?? null
            };
        }));
    }

    // ── Export: capture actual preview DOM for exact match ────

    /** Collect all <style> contents from the page (includes Angular scoped styles). */
    private collectPageStyles(): string {
        const styles: string[] = [];
        document.querySelectorAll('style').forEach(el => {
            if (el.textContent) styles.push(el.textContent);
        });
        return styles.join('\n');
    }

    /** Clone the .a4-paper element (view-mode only content). */
    private clonePaperElement(): HTMLElement | null {
        const paper = document.querySelector('.a4-paper');
        if (!paper) return null;
        const clone = paper.cloneNode(true) as HTMLElement;
        // Remove any edit-mode elements that might be present
        clone.querySelectorAll('.ns-edit-field, .ns-approval-edit').forEach(el => el.remove());
        return clone;
    }

    override exportPdf(): void {
        if (!this.noteSheet) return;
        const clone = this.clonePaperElement();
        if (!clone) return;

        const css = this.collectPageStyles();
        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;

        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>NoteSheet_${this.escapeHtml(this.noteSheet.noteSheetNo ?? 'export')}</title>
<style>
${css}
@page { size: A4 portrait; margin: 15mm; }
@media print { .no-print { display: none !important; } }
body { margin: 0; padding: 0; background: #fff; }
.a4-paper-container { padding: 0; display: flex; justify-content: center; }
.a4-paper { box-shadow: none; margin: 0 auto; }
</style></head><body>
<div class="a4-paper-container">${clone.outerHTML}</div>
</body></html>`);
        win.document.close();
        setTimeout(() => win.print(), 600);
    }

    override async exportWord(): Promise<void> {
        if (!this.noteSheet) return;
        const bn = !this.isEnglish();
        // For Bangla (complex script), must set cs font + hint so Word uses proper line-breaking
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 24 : undefined; // sizeComplexScript for Bangla
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thickBorder = { style: BorderStyle.SINGLE, size: 3, color: '000000' };
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

        // ── Build main column content ──
        const mainChildren: (Paragraph | Table)[] = [];

        // Subject (bold, underlined)
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.noteSheet.subject ?? '', bold: true, underline: {}, size: 24, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: 140, after: 80 },
            indent: { left: 240 }
        }));

        // Reference / Date
        if (this.noteSheet.referenceNumber) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'সূত্রঃ ' : 'Reference: ', bold: true, size: 24, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: this.stripHtml(this.noteSheet.referenceNumber), size: 24, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }
            }));
        } else if (this.noteSheet.noteSheetDate) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'তারিখঃ ' : 'Date: ', bold: true, size: 24, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: this.formatDate(this.noteSheet.noteSheetDate), size: 24, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }
            }));
        }

        // Serial number + Main text
        const mainTextElements = this.parseHtmlToDocx(this.noteSheet.mainText ?? '', font, bn);
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.serial(1), bold: true, size: 24, sizeComplexScript: csSize, font, language: lang })],
            indent: { left: 240 }, spacing: { before: 160, after: 40 }
        }));
        mainChildren.push(...mainTextElements);

        // Note
        if (this.noteSheet.note) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 24, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: this.noteSheet.note, size: 24, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 80, after: 80 }
            }));
        }

        // Closing text
        mainChildren.push(new Paragraph({
            children: [new TextRun({
                text: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.',
                size: 24, sizeComplexScript: csSize, font, language: lang
            })],
            indent: { left: 240, firstLine: 480 }, spacing: { before: 200 }
        }));

        // Initiator signature (right-aligned)
        if (this.initiatorDetails) {
            const d = this.initiatorDetails;
            if (this.shouldShowSignature(d.step) && d.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(d.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.RIGHT, spacing: { before: 200 }
                    }));
                } catch { /* no sig */ }
            }
            const nameStr = bn ? (d.nameBN || d.name) : d.name;
            const rankStr = (d.rank && d.rank !== '-') ? `, ${bn ? (d.rankBN || d.rank) : d.rank}` : '';
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: `(${nameStr}${rankStr})`, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.RIGHT,
                spacing: !(this.shouldShowSignature(d.step) && d.signatureDataUrl) ? { before: 200 } : {}
            }));
            if (d.appointment || d.appointmentBN) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: bn ? (d.appointmentBN || d.appointment) : d.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.RIGHT
                }));
            }
            if (this.noteSheet.noteSheetDate) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: this.formatDate(this.noteSheet.noteSheetDate), size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.RIGHT
                }));
            }
        }

        // Approver sections
        for (let i = 0; i < this.approversDetails.length; i++) {
            const approver = this.approversDetails[i];
            const role = bn ? (approver.appointmentBN || approver.appointment) : approver.appointment;
            const remark = this.getApproverRemark(approver.step);
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: role, underline: {}, size: 24, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 240 }
            }));
            const runs: TextRun[] = [new TextRun({ text: this.serial(i + 2), bold: true, size: 24, sizeComplexScript: csSize, font, language: lang })];
            if (remark) runs.push(new TextRun({ text: ` ${remark}`, italics: true, size: 24, sizeComplexScript: csSize, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, indent: { left: 240 } }));
            if (this.shouldShowSignature(approver.step) && approver.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(approver.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        indent: { left: 240 }, spacing: { before: 80 }
                    }));
                } catch { /* no sig */ }
            }
        }

        // ── Outer bordered table (main + sanglagni) ──
        // Legal page 20160 - top 567 - bottom 400 = 19193 usable; header ~1200 twips
        const rowHeight = 17800;
        const outerTable = new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [10473, 800],
            rows: [new TableRow({
                height: { value: rowHeight, rule: HeightRule.ATLEAST },
                children: [
                    new TableCell({
                        width: { size: 10473, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: noBorder },
                        margins: { right: 200 },
                        children: mainChildren.length > 0 ? mainChildren : [new Paragraph({})]
                    }),
                    new TableCell({
                        width: { size: 800, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
                        verticalAlign: VerticalAlign.TOP,
                        children: [
                            new Paragraph({ children: [new TextRun({ text: bn ? 'সংলগ্নী' : 'Encl.', size: 20, font: bn ? 'Nirmala UI' : 'Times New Roman' })], alignment: AlignmentType.CENTER }),
                            new Paragraph({ children: [new TextRun({ text: bn ? 'নং' : 'No.', size: 20, font: bn ? 'Nirmala UI' : 'Times New Roman' })], alignment: AlignmentType.CENTER })
                        ]
                    })
                ]
            })]
        });

        // ── Build document ──
        const docChildren: (Paragraph | Table)[] = [];
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 32, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER, spacing: { after: 40 }, keepNext: true
        }));
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
            alignment: AlignmentType.CENTER, spacing: { after: 160 }, keepNext: true
        }));
        docChildren.push(outerTable);

        const doc = new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: { page: { size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT }, margin: { top: 567, right: 400, bottom: 400, left: 567 } } },
                children: docChildren
            }]
        });

        saveAs(await Packer.toBlob(doc), `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.docx`);
    }

    // ── Parse HTML content into docx elements ─────────────────
    private parseHtmlToDocx(html: string, font: any, bn = false): (Paragraph | Table)[] {
        if (!html) return [];
        const div = document.createElement('div');
        div.innerHTML = html;
        const result: (Paragraph | Table)[] = [];
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const csSize = bn ? 24 : undefined;

        for (const node of Array.from(div.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent || '').trim();
                if (text) result.push(new Paragraph({ children: [new TextRun({ text, size: 24, sizeComplexScript: csSize, font, language: lang })], indent: { left: 480 }, spacing: { after: 80 } }));
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();
                if (tag === 'table') {
                    const rows: TableRow[] = [];
                    el.querySelectorAll('tr').forEach(tr => {
                        const cells: TableCell[] = [];
                        tr.querySelectorAll('td, th').forEach(td => {
                            cells.push(new TableCell({
                                children: [new Paragraph({ children: [new TextRun({ text: (td.textContent || '').trim(), bold: td.tagName.toLowerCase() === 'th', size: 22, sizeComplexScript: bn ? 22 : undefined, font, language: lang })] })],
                                borders: cellBorders
                            }));
                        });
                        if (cells.length > 0) rows.push(new TableRow({ children: cells }));
                    });
                    if (rows.length > 0) result.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows, alignment: AlignmentType.CENTER }));
                } else if (tag === 'ol' || tag === 'ul') {
                    el.querySelectorAll(':scope > li').forEach(li => {
                        const text = (li.textContent || '').trim();
                        if (text) result.push(new Paragraph({ children: [new TextRun({ text: `• ${text}`, size: 24, sizeComplexScript: csSize, font, language: lang })], indent: { left: 720 }, spacing: { after: 60 } }));
                    });
                } else {
                    const text = (el.textContent || '').trim();
                    if (text) {
                        const isBold = ['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) || el.style.fontWeight === 'bold' || !!el.querySelector('strong, b');
                        const isItalic = tag === 'em' || tag === 'i' || el.style.fontStyle === 'italic';
                        result.push(new Paragraph({ children: [new TextRun({ text, bold: isBold, italics: isItalic, size: 24, sizeComplexScript: csSize, font, language: lang })], indent: { left: 480 }, spacing: { after: 80 } }));
                    }
                }
            }
        }
        return result;
    }

    // ── Convert data URL to Uint8Array for ImageRun ───────────
    private base64ToBytes(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // ── Format Date as yyyy-MM-dd for backend DateOnly ───────
    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
