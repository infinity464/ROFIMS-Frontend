import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
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
import { NoteSheetCurrentStatus, NoteSheetOperationTypeOptions, ApprovalStatus } from '@/models/enums';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import { environment } from '@/Core/Environments/environment';
import { forkJoin } from 'rxjs';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun,
    TableLayoutType, HeightRule
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import type {
    NotesheetDocumentModel,
    ContentBlock,
    TextAlignment
} from '../notesheet-document-model';

@Component({
    selector: 'app-notesheet-preview-posting',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent
    ],
    providers: [MessageService],
    templateUrl: './notesheet-preview-posting.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewPostingComponent extends NotesheetPreviewBase implements AfterViewChecked {

    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;
    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);

    // ── Pagination ─────────────────────────────────────────────
    pageOffsets: number[] = [0];
    pageContentHeightPx = 0;
    titleBlockHeightPx = 0;
    private pageInsetPx = 0;
    private lastMeasuredHeight = 0;

    // ── Button visibility (configurable by parent) ───────────
    @Input() showEdit = true;
    @Input() showWord = true;
    @Input() showPdf = true;

    // ── Edit state ───────────────────────────────────────────
    editing = false;
    saving = false;

    // ── Employee dropdown options ────────────────────────────
    employeeOptions: { label: string; value: number }[] = [];

    // ── RAB Unit dropdown options ─────────────────────────────
    rabUnitOptions: { label: string; value: number }[] = [];

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
    editParagraphs: string[] = [];

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

    // ── Pagination logic ──────────────────────────────────────
    ngAfterViewChecked(): void {
        if (this.editing || !this.contentMeasure?.nativeElement) return;
        const measured = this.contentMeasure.nativeElement.scrollHeight;
        if (measured === this.lastMeasuredHeight || measured === 0) return;
        this.lastMeasuredHeight = measured;

        if (this.pageContentHeightPx === 0) {
            this.pageContentHeightPx = this.computePageContentHeightPx();
        }

        const newOffsets = this.calculatePageOffsets(measured);
        if (newOffsets.length !== this.pageOffsets.length ||
            newOffsets.some((v: number, i: number) => v !== this.pageOffsets[i])) {
            this.pageOffsets = newOffsets;
            this.cdr.detectChanges();
        }
    }

    trackByIndex(index: number): number {
        return index;
    }

    private computePageContentHeightPx(): number {
        // 321.6mm total content area - 4mm top inset - 4mm bottom inset = 313.6mm visible
        const testDiv = document.createElement('div');
        testDiv.style.cssText = 'position:absolute;left:-9999px;width:1mm;height:313.6mm;visibility:hidden';
        document.body.appendChild(testDiv);
        const heightPx = testDiv.getBoundingClientRect().height;
        document.body.removeChild(testDiv);

        // Compute inset in pixels (4mm)
        const insetDiv = document.createElement('div');
        insetDiv.style.cssText = 'position:absolute;left:-9999px;width:1mm;height:4mm;visibility:hidden';
        document.body.appendChild(insetDiv);
        this.pageInsetPx = insetDiv.getBoundingClientRect().height;
        document.body.removeChild(insetDiv);

        return heightPx;
    }

    /** Build page offsets — avoids splitting text lines and keep-together blocks */
    private calculatePageOffsets(totalHeight: number): number[] {
        const container = this.contentMeasure?.nativeElement;
        const pageH = this.pageContentHeightPx;
        if (!container || pageH <= 0) return [0];

        const containerTop = container.getBoundingClientRect().top;

        // Measure title block height (title is rendered outside viewport on page 1)
        const titleEl = container.querySelector('.ns-title-block') as HTMLElement;
        const docBox = container.querySelector('.ns-doc-box') as HTMLElement;
        this.titleBlockHeightPx = docBox
            ? docBox.getBoundingClientRect().top - containerTop
            : titleEl ? titleEl.getBoundingClientRect().height + 8 : 0;

        // First page has less space because title is above the viewport
        const firstPageH = pageH - this.titleBlockHeightPx;
        if (totalHeight <= firstPageH + this.titleBlockHeightPx) return [this.titleBlockHeightPx];

        // Keep-together blocks (should not be split across pages)
        const keepTogether = Array.from(
            container.querySelectorAll(
                '.ns-title-block, .ns-org-header, .ns-note, .ns-initiator-area, .ns-approver-section, .ns-posting-table tr'
            ) as NodeListOf<HTMLElement>
        ).map(el => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top - containerTop, bottom: rect.top - containerTop + rect.height, height: rect.height };
        }).filter(b => b.height > 0 && b.height < pageH)
          .sort((a, b) => a.top - b.top);

        // Collect per-line bottom positions from text blocks using getClientRects
        const textBlockInfo: { top: number; bottom: number; lineBottoms: number[] }[] = [];
        const textElements = container.querySelectorAll('.ns-para-text') as NodeListOf<HTMLElement>;
        for (const el of Array.from(textElements)) {
            const elRect = el.getBoundingClientRect();
            const blockTop = elRect.top - containerTop;
            const blockBottom = elRect.bottom - containerTop;
            const lbs: number[] = [];

            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let textNode: Node | null;
            while (textNode = walker.nextNode()) {
                if (!textNode.textContent?.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(textNode);
                const rects = range.getClientRects();
                for (let r = 0; r < rects.length; r++) {
                    if (rects[r].height > 0) {
                        lbs.push(Math.round(rects[r].bottom - containerTop));
                    }
                }
            }

            const uniqueLbs = [...new Set(lbs)].sort((a, b) => a - b);
            if (uniqueLbs.length > 0) {
                textBlockInfo.push({ top: blockTop, bottom: blockBottom, lineBottoms: uniqueLbs });
            }
        }

        // Page 1 starts after the title block (title is rendered outside viewport)
        const offsets: number[] = [this.titleBlockHeightPx];
        let cursor = this.titleBlockHeightPx;
        let isFirstPage = true;

        while (cursor < totalHeight) {
            const currentPageH = isFirstPage ? firstPageH : pageH;
            if (cursor + currentPageH >= totalHeight) break; // remaining content fits

            let nextBreak = cursor + currentPageH;

            // Step 1: Keep-together — push break before any block that straddles
            let adjusted = true;
            while (adjusted) {
                adjusted = false;
                for (const block of keepTogether) {
                    if (block.top > cursor && block.top < nextBreak && block.bottom > nextBreak) {
                        nextBreak = block.top;
                        adjusted = true;
                        break;
                    }
                }
            }

            // Step 2: Snap to line boundary if break falls inside a text block.
            // Use line BOTTOMS so we break after the last fully visible line.
            for (const tb of textBlockInfo) {
                if (tb.top < nextBreak && tb.bottom > nextBreak) {
                    for (let i = tb.lineBottoms.length - 1; i >= 0; i--) {
                        if (tb.lineBottoms[i] <= nextBreak && tb.lineBottoms[i] > cursor) {
                            nextBreak = tb.lineBottoms[i];
                            break;
                        }
                    }
                    break;
                }
            }

            // Safety: ensure we always advance
            if (nextBreak <= cursor) nextBreak = cursor + currentPageH;

            cursor = nextBreak;
            if (cursor < totalHeight) {
                offsets.push(cursor);
            }
            isFirstPage = false;
        }

        return offsets;
    }

    /** Height of white cover to hide excess content at bottom of a page that breaks early */
    getPageCoverHeight(pageIndex: number): number {
        if (pageIndex >= this.pageOffsets.length - 1) return 0;
        const usedHeight = this.pageOffsets[pageIndex + 1] - this.pageOffsets[pageIndex];
        const availHeight = pageIndex === 0
            ? this.pageContentHeightPx - this.titleBlockHeightPx
            : this.pageContentHeightPx;
        return Math.max(0, availHeight - usedHeight + this.pageInsetPx);
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
        this.editParagraphs = [...this.parsedParagraphs];

        this.fileRows = this.parseFileReferences();

        if (this.employeeOptions.length === 0) {
            this.loadEmployeeOptions();
        }
        if (this.rabUnitOptions.length === 0) {
            this.loadRabUnitOptions();
        }
    }

    private loadRabUnitOptions(): void {
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (list) => {
                this.rabUnitOptions = (list ?? []).map(c => ({
                    label: c.codeValueEN ?? c.codeValueBN ?? `ID ${c.codeId}`,
                    value: c.codeId
                }));
            }
        });
    }

    cancelEdit(): void {
        this.editing = false;
        this.fileRows = [];
        this.editParagraphs = [];
        this.lastMeasuredHeight = 0; // force pagination recalculation
    }

    addParagraph(): void {
        this.editParagraphs.push('');
    }

    removeParagraph(index: number): void {
        this.editParagraphs.splice(index, 1);
    }

    // ── Print Preview ───────────────────────────────────────
    printPreview(): void {
        const container = this.pagesContainer?.nativeElement;
        if (!container) return;

        const pagesHtml = container.innerHTML;
        const printWin = window.open('', '_blank');
        if (!printWin) return;

        printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Print Preview</title>
<style>
@page { size: 215.9mm 355.6mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; line-height: 1.7; }
.a4-paper-container { display: flex; flex-direction: column; align-items: center; padding: 0; gap: 0; }
.a4-paper { width: 215.9mm; height: 355.6mm; min-height: 355.6mm; padding: 14mm 10mm 20mm; background: #fff; box-sizing: border-box; font-family: 'Times New Roman', Times, serif; font-size: 10pt; color: #000; line-height: 1.7; position: relative; overflow: hidden; display: flex; flex-direction: column; page-break-after: always; break-after: page; }
.a4-paper:last-child { page-break-after: auto; break-after: auto; }
.a4-paper.paginated { height: 355.6mm; min-height: 355.6mm; overflow: hidden; }
.a4-paper.paginated .ns-doc-box { border: none; }
.page-viewport { flex: 1; overflow: hidden; position: relative; border: 1.5px solid #000; }
.page-viewport::before, .page-viewport::after { content: ''; position: absolute; left: 0; right: 0; height: 4mm; background: #fff; z-index: 2; }
.page-viewport::before { top: 0; }
.page-viewport::after { bottom: 0; }
.page-inner { position: absolute; top: 4mm; left: 0; width: 100%; }
.page-bottom-cover { position: absolute; bottom: 0; left: 0; right: 0; background: #fff; z-index: 1; }
.ns-title-block { text-align: center; margin-bottom: 8px; }
.ns-title-en { font-size: 12pt; font-weight: bold; text-decoration: underline; letter-spacing: 2px; }
.ns-title-bn { font-size: 12pt; text-decoration: underline; margin-top: 2px; }
.ns-doc-box { border: 1.5px solid #000; flex: 1; display: flex; align-items: stretch; }
.ns-main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ns-sanglagni-col { border-left: 1.5px solid #000; width: 60px; min-width: 60px; font-size: 10pt; text-align: center; padding: 6px 12px; line-height: 1.4; }
.ns-cell-subject { padding: 7px 16px 7px 20px; font-size: 10pt; font-weight: bold; text-decoration: underline; }
.ns-para { display: flex; gap: 8px; padding: 10px 16px 10px 20px; font-size: 10pt; line-height: 1.85; }
.ns-para-no { flex-shrink: 0; font-weight: 700; min-width: 30px; }
.ns-para-text { flex: 1; min-width: 0; text-align: justify; overflow-wrap: break-word; word-break: normal; hyphens: none; }
.ns-para-text p { margin: 0 0 0.4rem; }
.ns-para-text p:last-child { margin-bottom: 0; }
.ns-posting-table { padding: 4px 16px 10px 20px; overflow-x: auto; }
.ns-posting-table table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.ns-posting-table th, .ns-posting-table td { border: 1px solid #000; padding: 5px 7px; text-align: left; }
.ns-posting-table th { font-weight: bold; background: #f0f0f0; font-size: 9pt; text-transform: uppercase; }
.ns-note { padding: 6px 16px 6px 20px; font-size: 10pt; border-top: 1px dashed #aaa; }
.ns-initiator-area { padding: 14px 16px 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.ns-closing-text { font-size: 10pt; text-indent: 2em; }
.ns-initiator-sig { align-self: flex-end; text-align: center; min-width: 200px; max-width: 260px; }
.ns-approver-section { padding: 10px 16px 24px 20px; min-height: 90px; }
.ns-approver-role { font-size: 10pt; text-decoration: underline; margin-bottom: 6px; }
.ns-approver-body { display: flex; flex-direction: column; align-items: flex-start; min-height: 60px; gap: 0; }
.ns-approver-body--left { gap: 12px; }
.ns-approver-left { display: flex; gap: 6px; font-size: 10pt; flex-wrap: wrap; align-items: flex-start; }
.ns-approver-remark { font-size: 10pt; font-style: italic; }
.ns-approver-sig-area { width: 100%; text-align: center; margin-top: 10px; min-width: 0; }
.ns-sig-img { max-width: 100px; max-height: 40px; object-fit: contain; display: block; margin: 0 auto 4px; }
.ns-sig-paren { font-size: 10pt; margin-bottom: 2px; }
.ns-sig-appoint { font-size: 10pt; }
.ns-sig-date { font-size: 10pt; margin-top: 4px; }
.ns-exbd-info { padding: 4px 16px 10px 56px; font-size: 10pt; }
.ns-exbd-row { display: flex; gap: 8px; margin-bottom: 4px; }
.ns-exbd-label { font-weight: 700; min-width: 150px; flex-shrink: 0; }
.ns-cell-ref { padding: 5px 16px 5px 20px; font-size: 10pt; display: flex; align-items: flex-start; flex-wrap: wrap; gap: 0 4px; }
.ns-ref-key { font-weight: 700; margin-right: 4px; }
</style>
</head><body>${pagesHtml}</body></html>`);
        printWin.document.close();

        // Wait for images to load, then trigger print
        printWin.onload = () => {
            printWin.focus();
            printWin.print();
        };
        // Fallback if onload already fired
        setTimeout(() => {
            printWin.focus();
            printWin.print();
        }, 500);
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
                paragraphText: this.editParagraphs.some(p => p.trim()) ? JSON.stringify(this.editParagraphs.filter(p => p.trim())) : null,
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

            const postingDetailItems = this.postingEmployees.map(emp => ({
                id: emp.draftPostingDetailId,
                transferRabUnitId: emp.transferRabUnitId,
                remarks: emp.remarks
            }));

            const noteSheetUpdate$ = this.http.post(`${this.api}/UpdateAsyn`, payload);
            const postingUpdate$ = this.isInterPosting()
                ? this.postingService.updateDraftInterPostingDetails(postingDetailItems)
                : this.postingService.updateDraftPostingDetails(postingDetailItems);

            forkJoin([noteSheetUpdate$, postingUpdate$]).subscribe({
                next: () => {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                    this.editing = false;
                    this.saving = false;
                    this.fileRows = [];
                    this.lastMeasuredHeight = 0; // force pagination recalculation
                    this.reloadNoteSheet();
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update note-sheet.' });
                    this.saving = false;
                }
            });
        };

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
                recomender_status: existing?.recomender_status ?? ApprovalStatus.Pending,
                recomender_approve_remark: existing?.recomender_approve_remark ?? '',
                recomender_cancel_remark: existing?.recomender_cancel_remark ?? '',
                recomender_approved_date: existing?.recomender_approved_date ?? null
            };
        }));
    }

    /** Export PDF: builds legal-size PDF from shared document model using html2canvas + jsPDF. */
    override async exportPdf(): Promise<void> {
        if (!this.noteSheet) return;
        try {
            const model = this.buildDocumentModel();
            const html = this.modelToHtml(model);
            const fontFamily = model.isBangla
                ? "'Noto Sans Bengali','SolaimanLipi','Kalpurush','Nirmala UI',sans-serif"
                : "'Times New Roman',serif";

            const container = document.createElement('div');
            container.style.cssText = 'position:absolute;left:-9999px;top:0;width:720px;padding:14mm 10mm;font-size:10pt;line-height:1.6;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
            container.style.fontFamily = fontFamily;
            container.innerHTML = `
                <style>
                  .ns-pdf-wrap, .ns-pdf-wrap * { word-wrap:break-word!important; overflow-wrap:break-word!important; white-space:normal!important; max-width:100%!important; box-sizing:border-box!important; }
                  .ns-pdf-wrap img { max-width:100%!important; height:auto!important; }
                  .ns-pdf-wrap table, .ns-pdf-wrap th, .ns-pdf-wrap td { border:1px solid #000; padding:4px; white-space:normal!important; }
                  .ns-pdf-wrap th { font-weight:bold; }
                </style>
                <div class="ns-pdf-wrap" style="font-family:${fontFamily};color:#000;width:100%">${html}</div>`;
            document.body.appendChild(container);

            try {
                await new Promise(resolve => setTimeout(resolve, 300));
                const canvas = await html2canvas(container, {
                    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
                    scrollY: -window.scrollY, height: container.scrollHeight, windowHeight: container.scrollHeight
                });
                const imgData = canvas.toDataURL('image/jpeg', 0.92);
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;

                // Legal paper: 215.9mm × 355.6mm
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'legal' });
                const margin = 10;
                const pdfWidth = pdf.internal.pageSize.getWidth() - margin * 2;
                const pdfPageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
                const ratio = pdfWidth / imgWidth;
                const scaledHeight = imgHeight * ratio;

                if (scaledHeight <= pdfPageHeight) {
                    pdf.addImage(imgData, 'JPEG', margin, margin, pdfWidth, scaledHeight);
                } else {
                    let remainingHeight = imgHeight;
                    let srcY = 0;
                    const sliceHeight = Math.floor(pdfPageHeight / ratio);
                    while (remainingHeight > 0) {
                        const currentSlice = Math.min(sliceHeight, remainingHeight);
                        const sliceCanvas = document.createElement('canvas');
                        sliceCanvas.width = imgWidth;
                        sliceCanvas.height = currentSlice;
                        const ctx = sliceCanvas.getContext('2d')!;
                        ctx.drawImage(canvas, 0, srcY, imgWidth, currentSlice, 0, 0, imgWidth, currentSlice);
                        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
                        const slicePdfH = currentSlice * ratio;
                        if (srcY > 0) pdf.addPage('legal', 'p');
                        pdf.addImage(sliceData, 'JPEG', margin, margin, pdfWidth, slicePdfH);
                        srcY += currentSlice;
                        remainingHeight -= currentSlice;
                    }
                }
                pdf.save(`NoteSheet_${this.noteSheet!.noteSheetNo ?? 'export'}.pdf`);
            } finally {
                document.body.removeChild(container);
            }
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate PDF.' });
        }
    }

    override async exportWord(): Promise<void> {
        if (!this.noteSheet) return;
        const doc = await this.buildWordDocument();
        saveAs(await Packer.toBlob(doc), `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.docx`);
    }

    /** Build shared document model (used by both Word and PDF). */
    private buildDocumentModel(): NotesheetDocumentModel {
        if (!this.noteSheet) throw new Error('No noteSheet');
        const bn = !this.isEnglish();

        const mainHtml = this.fixBanglaWordBreaks(this.noteSheet.mainText ?? '');
        const mainBlocks = this.parseHtmlToContentBlocks(mainHtml);

        const model: NotesheetDocumentModel = {
            isBangla: bn,
            subject: '',
            referenceBlocks: [],
            referenceLabel: '',
            dateLabel: bn ? 'তারিখঃ ' : 'Date: ',
            dateValue: this.formatDate(this.noteSheet.noteSheetDate),
            mainSerialText: this.serial(1),
            mainBlocks,
            closingText: '',
            approvers: [],
            enclLabel: bn ? 'সংলগ্নী' : 'Encl.',
            enclNoLabel: bn ? 'নং' : 'No.'
        };
        if (this.noteSheet.note) model.note = this.noteSheet.note;

        if (this.initiatorDetails) {
            const d = this.initiatorDetails;
            const nameStr = bn ? (d.nameBN || d.name) : d.name;
            const rankStr = (d.rank && d.rank !== '-') ? (bn ? (d.rankBN || d.rank) : d.rank) : undefined;
            const approved = this.isInitiatorApproved();
            model.initiator = {
                role: '',
                serialText: '',
                nameLine: nameStr,
                rankLine: rankStr,
                appointment: bn ? (d.appointmentBN || d.appointment) : d.appointment,
                date: approved && this.noteSheet.noteSheetDate ? this.formatDate(this.noteSheet.noteSheetDate) : undefined,
                align: 'right',
                signatureDataUrl: approved && this.shouldShowSignature(d.step) ? d.signatureDataUrl : undefined
            };
        }

        const paraOffset = this.parsedParagraphs.length;
        for (let i = 0; i < this.approversDetails.length; i++) {
            const a = this.approversDetails[i];
            const role = bn ? (a.appointmentBN || a.appointment) : a.appointment;
            const remark = this.getApproverRemark(a.step);
            const approverDate = this.getApproverDate(a.step);
            model.approvers.push({
                role,
                serialText: this.serial(i + 2 + paraOffset),
                remark: remark || undefined,
                signatureDataUrl: this.shouldShowSignature(a.step) ? a.signatureDataUrl : undefined,
                nameLine: '',
                date: approverDate || undefined,
                align: 'center'
            });
        }
        return model;
    }

    /** Parse HTML into shared content blocks. */
    private parseHtmlToContentBlocks(html: string): ContentBlock[] {
        if (!html) return [];
        const div = document.createElement('div');
        div.innerHTML = html;
        const blocks: ContentBlock[] = [];

        for (const node of Array.from(div.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = this.normalizeTextForWord((node.textContent || '').trim());
                if (text) blocks.push({ type: 'paragraph', text, indent: 'normal' });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();
                const alignment = this.getAlignmentAsText(el);

                if (tag === 'table') {
                    const rows: string[][] = [];
                    el.querySelectorAll('tr').forEach(tr => {
                        const cells: string[] = [];
                        tr.querySelectorAll('td, th').forEach(td => {
                            cells.push(this.normalizeTextForWord((td.textContent || '').trim()));
                        });
                        if (cells.length) rows.push(cells);
                    });
                    if (rows.length) blocks.push({ type: 'table', rows, alignment });
                } else if (tag === 'ol' || tag === 'ul') {
                    let listCounter = 0;
                    el.querySelectorAll(':scope > li').forEach(li => {
                        const text = this.normalizeTextForWord((li.textContent || '').trim());
                        if (!text) return;
                        listCounter++;
                        const listType = li.getAttribute('data-list') || (tag === 'ol' ? 'ordered' : 'bullet');
                        const prefix = this.getListPrefix(listType, listCounter);
                        blocks.push({
                            type: 'list',
                            text: `${prefix}${text}`,
                            indent: 'list',
                            alignment
                        });
                    });
                } else {
                    const text = this.normalizeTextForWord((el.textContent || '').trim());
                    if (text) {
                        const bold = ['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
                            || el.style.fontWeight === 'bold' || !!el.querySelector('strong, b');
                        const italic = tag === 'em' || tag === 'i' || el.style.fontStyle === 'italic';
                        blocks.push({ type: 'paragraph', text, bold, italic, indent: 'normal', alignment });
                    }
                }
            }
        }
        return blocks;
    }

    private getAlignmentAsText(el: HTMLElement): TextAlignment | undefined {
        const cls = (el.className || '').toString();
        if (cls.includes('ql-align-justify')) return 'justify';
        if (cls.includes('ql-align-center')) return 'center';
        if (cls.includes('ql-align-right')) return 'right';
        const ta = (el.style?.textAlign || '').toLowerCase();
        if (ta === 'justify') return 'justify';
        if (ta === 'center') return 'center';
        if (ta === 'right') return 'right';
        return undefined;
    }

    /** Convert document model to HTML (layout matches Word: bordered doc-box + sanglagni). */
    private modelToHtml(model: NotesheetDocumentModel): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const block = (b: ContentBlock): string => {
            if (b.type === 'table' && b.rows?.length) {
                const th = (r: string[]) => r.map(c => `<th style="border:1px solid #000;padding:5px 8px;font-weight:bold">${esc(c)}</th>`).join('');
                const td = (r: string[]) => r.map(c => `<td style="border:1px solid #000;padding:5px 8px">${esc(c)}</td>`).join('');
                const header = b.rows[0] ? `<tr>${th(b.rows[0])}</tr>` : '';
                const body = b.rows.slice(1).map(r => `<tr>${td(r)}</tr>`).join('');
                return `<table style="width:100%;border-collapse:collapse;margin:6px 0"><thead>${header}</thead><tbody>${body}</tbody></table>`;
            }
            if (!b.text) return '';
            const tag = b.bold ? 'strong' : b.italic ? 'em' : 'span';
            const style = [`text-align:${b.alignment ?? 'left'}`];
            if (b.indent === 'list') style.push('margin-left:1em');
            return `<p style="${style.join(';')};margin:0 0 0.4rem"><${tag}>${esc(b.text)}</${tag}></p>`;
        };

        let mainContent = '';

        // Org header
        mainContent += `<div style="text-align:center;padding:8px 16px 4px;font-weight:700;line-height:1.5;font-size:10pt">`;
        mainContent += `<div>${esc(this.getOrgHeaderLine1())}</div>`;
        mainContent += `<div style="border-bottom:1.5px solid #000;display:inline-block;padding-bottom:2px">${esc(this.getOrgHeaderLine2())}</div>`;
        mainContent += `</div>`;

        // Notesheet number
        if (this.noteSheet?.noteSheetNo) {
            mainContent += `<div style="padding:4px 16px 2px;font-size:10pt">${esc(this.noteSheet.noteSheetNo)}</div>`;
        }

        // Subject
        if (this.noteSheet?.subject) {
            const subjectLabel = model.isBangla ? 'বিষয়' : 'Subject';
            mainContent += `<div style="padding:2px 16px 4px;font-size:10pt"><strong>${esc(subjectLabel)}:</strong> ${esc(this.noteSheet.subject)}</div>`;
        }

        // Main text
        mainContent += '<div style="padding:10px 16px 10px 20px;font-size:10pt;line-height:1.85;display:flex;gap:8px">';
        mainContent += `<span style="font-weight:700;min-width:30px;flex-shrink:0">${esc(model.mainSerialText)}</span>`;
        mainContent += '<div style="flex:1;min-width:0">';
        model.mainBlocks.forEach(b => { mainContent += block(b); });
        mainContent += '</div></div>';

        // Posting employee table (posting-specific)
        if (this.isPostingType() && this.postingEmployees.length > 0) {
            const bn = model.isBangla;
            const cols = bn ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','নিজ জেলা','মাতৃ ইউনিটের অবস্থান','বদলি ইউনিট','মন্তব্য'] : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Own District','Mother Unit Location','Transfer Unit','Remarks'];
            const headerCells = cols.map(c => `<th style="border:1px solid #000;padding:5px 8px;font-weight:bold;font-size:9pt">${esc(c)}</th>`).join('');
            const bodyRows = this.postingEmployees.map((emp, i) => {
                const ser = bn ? this.toBanglaDigits(i + 1) : String(i + 1);
                const transferUnit = bn ? (this.unitLabelMapBN[emp.transferRabUnitId!] || emp.transferRabUnitName || '') : (emp.transferRabUnitName ?? '');
                const vals = [ser, this.getServiceIdDisplay(emp), bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''), bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''), bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''), bn?(emp.motherUnitNameBN||emp.motherUnitName||''):(emp.motherUnitName??''), bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''), bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''), transferUnit, emp.remarks??''];
                return `<tr>${vals.map(v => `<td style="border:1px solid #000;padding:5px 8px;font-size:9pt">${esc(v)}</td>`).join('')}</tr>`;
            }).join('');
            let tfoot = '';
            if (model.note) {
                tfoot = `<tfoot><tr><td colspan="10" style="border:1px solid #000;padding:5px 8px;font-size:9pt"><strong>${bn ? 'নোটঃ ' : 'Note: '}</strong>${esc(model.note)}</td></tr></tfoot>`;
            }
            mainContent += `<div style="padding:0 20px 10px 20px"><table style="width:100%;border-collapse:collapse"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>${tfoot}</table></div>`;
        }

        // Paragraphs (after employee table)
        const paragraphs = this.parsedParagraphs;
        paragraphs.forEach((para, pi) => {
            mainContent += `<div style="padding:10px 16px 10px 20px;font-size:10pt;line-height:1.85;display:flex;gap:8px">`;
            mainContent += `<span style="font-weight:700;min-width:30px;flex-shrink:0">${esc(this.serial(pi + 2))}</span>`;
            mainContent += `<div style="flex:1;min-width:0">${esc(para)}</div>`;
            mainContent += `</div>`;
        });

        if (model.note && !(this.isPostingType() && this.postingEmployees.length > 0)) {
            mainContent += `<div style="padding:5px 16px 5px 20px;font-size:10pt"><strong>${model.isBangla ? 'নোটঃ ' : 'Note: '}</strong>${esc(model.note)}</div>`;
        }

        // Closing text
        if (model.closingText) mainContent += `<div style="padding:10px 16px 10px 20px;font-size:10pt;text-indent:2em">${esc(model.closingText)}</div>`;

        // Initiator
        if (model.initiator) {
            mainContent += '<div style="padding:8px 16px 8px 20px;text-align:right;margin-top:24px;min-height:60px">';
            if (model.initiator.signatureDataUrl) {
                mainContent += `<img src="${model.initiator.signatureDataUrl}" style="max-width:80px;max-height:32px;display:block;margin-left:auto;margin-bottom:8px" />`;
            } else {
                mainContent += '<div style="min-height:48px;margin-bottom:8px"></div>';
            }
            mainContent += `<div style="font-size:11pt">${esc(model.initiator.nameLine)}</div>`;
            if (model.initiator.rankLine) mainContent += `<div style="font-size:10pt">${esc(model.initiator.rankLine)}</div>`;
            if (model.initiator.appointment) mainContent += `<div style="font-size:10pt">${esc(model.initiator.appointment)}</div>`;
            if (model.initiator.date) mainContent += `<div style="font-size:10pt;margin-top:2em">${esc(model.initiator.date)}</div>`;
            mainContent += '</div>';
        }

        // Approvers
        model.approvers.forEach(ap => {
            mainContent += '<div style="padding:6px 16px 10px 20px;min-height:60px;margin-top:12px">';
            mainContent += `<div style="text-decoration:underline;font-size:10pt;margin-bottom:6px">${esc(ap.role)}</div>`;
            mainContent += `<div style="font-size:10pt"><strong>${esc(ap.serialText)}</strong>${ap.remark ? `<em> ${esc(ap.remark)}</em>` : ''}</div>`;
            if (ap.signatureDataUrl) {
                mainContent += `<img src="${ap.signatureDataUrl}" style="max-width:80px;max-height:32px;display:block;margin:8px auto 0" />`;
            } else {
                mainContent += '<div style="min-height:48px;margin-top:8px"></div>';
            }
            if (ap.date) mainContent += `<div style="font-size:10pt;text-align:center">${esc(ap.date)}</div>`;
            mainContent += '</div>';
        });

        return `
<div style="text-align:center;margin-bottom:8px">
  <div style="font-size:12pt;font-weight:bold;text-decoration:underline;letter-spacing:2px">NOTE SHEET</div>
  <div style="font-size:12pt;text-decoration:underline;margin-top:2px">মন্তব্য পত্র</div>
</div>
<div style="border:1.5px solid #000;width:100%">
    ${mainContent}
</div>`;
    }

    /** Build the Word document from shared document model. */
    private async buildWordDocument(): Promise<Document> {
        const model = this.buildDocumentModel();
        const bn = model.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 20 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thickBorder = { style: BorderStyle.SINGLE, size: 3, color: '000000' };
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        const mainChildren: (Paragraph | Table)[] = [];

        // Org header
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine1(), bold: true, size: 20, sizeComplexScript: 20, font, language: lang })],
            alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }
        }));
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine2(), bold: true, size: 20, sizeComplexScript: 20, font, language: lang, underline: {} })],
            alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }
        }));

        // Notesheet number
        if (this.noteSheet?.noteSheetNo) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: this.noteSheet.noteSheetNo, size: 20, sizeComplexScript: 20, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 60, after: 40 }
            }));
        }

        // Subject
        if (this.noteSheet?.subject) {
            const subjectLabel = bn ? 'বিষয়' : 'Subject';
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${subjectLabel}: `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: this.noteSheet.subject, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 20, after: 60 }
            }));
        }

        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: model.mainSerialText, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })],
            indent: { left: 240 }, spacing: { before: 160, after: 40 }
        }));
        mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));

        // Posting employee table (posting-specific)
        if (this.isPostingType() && this.postingEmployees.length > 0) {
            const cols = bn ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','নিজ জেলা','মাতৃ ইউনিটের অবস্থান','বদলি ইউনিট','মন্তব্য'] : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Own District','Mother Unit Location','Transfer Unit','Remarks'];
            const cw = Math.floor(10400 / cols.length);
            const headerRow = new TableRow({ tableHeader: true, children: cols.map(c => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c, size: 20, sizeComplexScript: bn ? 20 : undefined, bold: true, font, language: lang })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: cw, type: WidthType.DXA },
            })) });
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                bn ? this.toBanglaDigits(i + 1) : String(i + 1), this.getServiceIdDisplay(emp),
                bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''),
                bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''),
                bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                bn?(emp.motherUnitNameBN||emp.motherUnitName||''):(emp.motherUnitName??''),
                bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''),
                bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''),
                bn ? (this.unitLabelMapBN[emp.transferRabUnitId!] || emp.transferRabUnitName || '') : (emp.transferRabUnitName ?? ''), emp.remarks??''
            ].map(v => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })] })], borders: cellBorders, width: { size: cw, type: WidthType.DXA } })) }));
            const tableRows = [headerRow, ...dataRows];
            if (model.note) {
                tableRows.push(new TableRow({ children: [new TableCell({
                    children: [new Paragraph({ children: [
                        new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang }),
                        new TextRun({ text: model.note, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })
                    ] })],
                    borders: cellBorders, columnSpan: 10, width: { size: 10400, type: WidthType.DXA }
                })] }));
            }
            mainChildren.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
            mainChildren.push(new Table({ width: { size: 95, type: WidthType.PERCENTAGE }, rows: tableRows, indent: { size: 240, type: WidthType.DXA } }));
        }

        // Paragraphs (after employee table)
        const wordParagraphs = this.parsedParagraphs;
        wordParagraphs.forEach((para, pi) => {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.serial(pi + 2)}  `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: para, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 120, after: 80 }
            }));
        });

        if (model.note && !(this.isPostingType() && this.postingEmployees.length > 0)) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: model.note, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 80, after: 80 }
            }));
        }

        if (model.closingText) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.closingText, size: 20, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240, firstLine: 480 }, spacing: { before: 200 }
            }));
        }

        // Initiator — right-side block with centered text (matches preview)
        // Uses left indent to push text to right side + CENTER alignment
        if (model.initiator) {
            const sigIndent = { left: 7200 }; // push block to right ~63% of cell width

            // Signature image or spacer
            if (model.initiator.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(model.initiator.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.CENTER, indent: sigIndent, spacing: { before: 280, after: 80 }
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ indent: sigIndent, spacing: { before: 280, after: 80 } }));
            }

            // Name
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.CENTER, indent: sigIndent
            }));

            // Rank
            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER, indent: sigIndent
                }));
            }

            // Appointment
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER, indent: sigIndent
                }));
            }

            // Date (with spacing above for 2-line gap)
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER, indent: sigIndent, spacing: { before: 400 }
                }));
            }
        }

        // Approvers
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: 20, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 280 }
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, italics: true, size: 20, sizeComplexScript: csSize, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, indent: { left: 240 } }));
            if (ap.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(ap.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 40 }
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 } }));
            }
            if (ap.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: ap.date, size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER
                }));
            }
        }

        // Outer bordered table (no sanglagni for posting)
        const rowHeight = 17800;
        const outerTable = new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [11273],
            rows: [new TableRow({
                height: { value: rowHeight, rule: HeightRule.ATLEAST },
                children: [
                    new TableCell({
                        width: { size: 11273, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
                        margins: { right: 200 },
                        children: mainChildren.length > 0 ? mainChildren : [new Paragraph({})]
                    })
                ]
            })]
        });

        const docChildren: (Paragraph | Table)[] = [];
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 24, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER, spacing: { after: 40 }, keepNext: true
        }));
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
            alignment: AlignmentType.CENTER, spacing: { after: 160 }, keepNext: true
        }));
        docChildren.push(outerTable);

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: { page: { size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT }, margin: { top: 567, right: 400, bottom: 400, left: 567 } } },
                children: docChildren
            }]
        });
    }

    private normalizeTextForWord(s: string): string {
        return s.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }

    /** Convert shared content blocks to docx Paragraph/Table elements. */
    private contentBlocksToDocx(blocks: ContentBlock[], font: any, bn: boolean): (Paragraph | Table)[] {
        const result: (Paragraph | Table)[] = [];
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const csSize = bn ? 20 : undefined;

        for (const b of blocks) {
            if (b.type === 'table' && b.rows?.length) {
                const rows: TableRow[] = b.rows.map((row, rowIdx) => new TableRow({
                    children: row.map(cell => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: cell,
                                bold: rowIdx === 0,
                                size: 22,
                                sizeComplexScript: bn ? 22 : undefined,
                                font,
                                language: lang
                            })]
                        })],
                        borders: cellBorders
                    }))
                }));
                result.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows, alignment: AlignmentType.CENTER }));
            } else if (b.text) {
                let align: (typeof AlignmentType)[keyof typeof AlignmentType];
                if (b.alignment === 'center') align = AlignmentType.CENTER;
                else if (b.alignment === 'right') align = AlignmentType.RIGHT;
                else if (b.alignment === 'justify') align = AlignmentType.JUSTIFIED;
                else align = b.indent === 'list' ? AlignmentType.LEFT : AlignmentType.JUSTIFIED;
                const indent = b.indent === 'list' ? { left: 720 } : { left: 480 };
                result.push(new Paragraph({
                    children: [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: 20, sizeComplexScript: csSize, font, language: lang })],
                    indent,
                    spacing: { after: b.indent === 'list' ? 60 : 80 },
                    alignment: align
                } as any));
            }
        }
        return result;
    }

    private getListPrefix(listType: string, index: number): string {
        switch (listType) {
            case 'ordered': return `${index}. `;
            case 'upper-roman': return `${this.toRoman(index).toUpperCase()}. `;
            case 'lower-roman': return `${this.toRoman(index).toLowerCase()}. `;
            case 'upper-alpha': return `${String.fromCharCode(64 + index)}. `;
            case 'bangla-number': return `${this.toBanglaDigits(index)}. `;
            case 'lower-alpha': return `${String.fromCharCode(96 + index)}. `;
            case 'bangla-alpha': {
                const letters = 'অআইঈউঊঋএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়ৎংঃঁ';
                return `${[...letters][index - 1] ?? index} `;
            }
            case 'bangla-ka': {
                const letters = 'কখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহড়ঢ়য়ৎংঃঁ';
                return `${[...letters][index - 1] ?? index} `;
            }
            case 'bullet': return '• ';
            default: return `${index}. `;
        }
    }

    private toRoman(num: number): string {
        const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
        const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
        let result = '';
        for (let i = 0; i < vals.length; i++) {
            while (num >= vals[i]) { result += syms[i]; num -= vals[i]; }
        }
        return result;
    }

    private toBanglaDigits(num: number): string {
        const d = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return String(num).replace(/\d/g, c => d[+c]);
    }

    private toBanglaDigitsStr(str: string): string {
        const d = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        return str.replace(/\d/g, c => d[+c]);
    }

    getServiceIdDisplay(emp: DraftPostingEmployeeRow): string {
        const bn = !this.isEnglish();
        const sid = emp.serviceId || '';
        const prefix = bn ? (emp.prefixNameBN || emp.prefixName || '') : (emp.prefixName || '');
        const displayId = bn && sid ? this.toBanglaDigitsStr(sid) : sid;
        return prefix ? `${prefix}-${displayId}` : (displayId || '-');
    }

    private base64ToBytes(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
