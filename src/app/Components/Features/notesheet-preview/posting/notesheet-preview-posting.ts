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
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';

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

    // ── District → ID map & AOR cache for transfer-unit warning ──
    private districtNameToId: Record<string, number> = {};
    private aorCache: Record<number, number[]> = {};

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
        if (!Object.keys(this.districtNameToId).length) {
            this.loadDistrictMap();
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

    private loadDistrictMap(): void {
        this.masterBasicSetup.getAllByType('District').subscribe({
            next: (list) => {
                (list ?? []).forEach(d => {
                    if (d.codeValueEN) this.districtNameToId[d.codeValueEN.trim().toLowerCase()] = d.codeId;
                    if (d.codeValueBN) this.districtNameToId[d.codeValueBN.trim().toLowerCase()] = d.codeId;
                });
            }
        });
    }

    onTransferUnitChange(emp: DraftPostingEmployeeRow): void {
        if (!emp.transferRabUnitId) return;
        const unitId = emp.transferRabUnitId;
        const empDistrictName = (emp.presentDistrictName || emp.presentDistrictNameBN || '').split('\n')[0].trim().toLowerCase();
        if (!empDistrictName) return;
        const empDistrictId = this.districtNameToId[empDistrictName];
        if (!empDistrictId) return;

        const checkAor = (districtIds: number[]) => {
            if (districtIds.includes(empDistrictId)) {
                const unitName = this.rabUnitOptions.find(o => o.value === unitId)?.label ?? '';
                const name = emp.fullNameBN || emp.fullNameEN || '';
                this.messageService.add({
                    severity: 'warn', summary: 'সতর্কতা / Warning',
                    detail: `${name} এর নিজ জেলার অধীনে ${unitName} ইউনিট নির্বাচন করা হয়েছে।`,
                    life: 6000
                });
            }
        };

        if (this.aorCache[unitId]) {
            checkAor(this.aorCache[unitId]);
            return;
        }

        this.masterBasicSetup.getRABUnitAORByRabUnit(unitId).subscribe({
            next: (rows) => {
                const ids: number[] = [];
                (rows ?? []).forEach((r: any) => {
                    const csv = r.districtIds ?? r.DistrictIds ?? '';
                    if (csv) csv.split(',').forEach((s: string) => {
                        const n = parseInt(s.trim(), 10);
                        if (!isNaN(n)) ids.push(n);
                    });
                });
                this.aorCache[unitId] = ids;
                checkAor(ids);
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
    async printPreview(): Promise<void> {
        if (!this.noteSheet) return;
        try {
            const doc = await this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            await this.openPdfPreview(docxBlob);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Preview Error', detail: 'Failed to generate print preview.' });
        }
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

    /** Export PDF: builds Word document, sends to backend for conversion, downloads PDF. */
    override async exportPdf(): Promise<void> {
        if (!this.noteSheet) return;
        try {
            const doc = await this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            await this.convertWordToPdf(docxBlob, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.pdf`);
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
                date: approved && this.noteSheet.noteSheetDate ? this.formatMonthYear(this.noteSheet.noteSheetDate) : undefined,
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

    /** Build the Word document from shared document model. */
    private async buildWordDocument(): Promise<Document> {
        const model = this.buildDocumentModel();
        const bn = model.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 20 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
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
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: this.noteSheet.subject, bold: true, underline: {}, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 20, after: 60 }
            }));
        }

        // Merge serial with first text block so they appear inline (like ২।, ৩। etc.)
        if (model.mainBlocks.length > 0 && model.mainBlocks[0].type === 'paragraph' && model.mainBlocks[0].text) {
            const firstBlock = model.mainBlocks[0];
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${model.mainSerialText}  `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: firstBlock.text, bold: firstBlock.bold, italics: firstBlock.italic, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 160, after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
            if (model.mainBlocks.length > 1) {
                mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks.slice(1), font, bn));
            }
        } else {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.mainSerialText, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 160, after: 40 }
            }));
            mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));
        }

        // Posting employee table (posting-specific)
        if (this.isPostingType() && this.postingEmployees.length > 0) {
            const cols = bn
                ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্পাউস জেলা (দায়িত্বপূর্ণ এলাকা)','পূর্ববতী কর্মস্থল (দায়িত্বপূর্ণ এলাকা)','বদলি ইউনিট','মন্তব্য']
                : ['Ser','Service ID','Rank','Trade','Name','Own District (Responsible Area)','Spouse District (Responsible Area)','Previous Workplace (Responsible Area)','Transfer Unit','Remarks'];
            // Dynamic widths: if remarks exist, give more to Remarks; otherwise give more to Trade
            const hasRemarks = this.postingEmployees.some(e => !!e.remarks);
            //                  Ser,  ID,   Rank, Trade, Name, OwnDist, SpDist, Loc,  TrUnit, Remarks
            const colWidths = hasRemarks
                ? [600, 1150, 800,  550, 1300, 1150, 1150, 1266, 1000, 1500]
                : [600, 1150, 800, 1100, 1300, 1150, 1150, 1266, 1000,  950];
            const headerRow = new TableRow({ tableHeader: true, children: cols.map((c, ci) => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: colWidths[ci], type: WidthType.DXA },
            })) });
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                bn ? this.toBanglaDigits(i + 1) : String(i + 1), this.getServiceIdDisplay(emp),
                bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''),
                bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''),
                bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                bn?(emp.presentDistrictNameBN||emp.presentDistrictName||''):(emp.presentDistrictName??''),
                bn?(emp.spousePresentDistrictNameBN||emp.spousePresentDistrictName||''):(emp.spousePresentDistrictName??''),
                bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''),
                bn ? (this.unitLabelMapBN[emp.transferRabUnitId!] || emp.transferRabUnitName || '') : (emp.transferRabUnitName ?? ''), emp.remarks??''
            ].map((v, ci) => {
                const lines = v.split('\n');
                const cellParas = lines.map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })], alignment: AlignmentType.CENTER }));
                return new TableCell({ children: cellParas, borders: cellBorders, width: { size: colWidths[ci], type: WidthType.DXA } });
            }) }));
            const tableRows = [headerRow, ...dataRows];
            mainChildren.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
            const totalColW = colWidths.reduce((a, b) => a + b, 0);
            mainChildren.push(new Table({ width: { size: totalColW, type: WidthType.DXA }, rows: tableRows, columnWidths: colWidths, alignment: AlignmentType.CENTER }));
        }

        // Paragraphs (after employee table)
        const wordParagraphs = this.parsedParagraphs;
        wordParagraphs.forEach((para, pi) => {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.serial(pi + 2)}  `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: para, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 120, after: 80 }, alignment: AlignmentType.JUSTIFIED
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

        // Initiator — right-positioned, left-aligned text within block
        if (model.initiator) {
            const initIndent = { left: 5500 };
            // Signature image or spacer
            if (model.initiator.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(model.initiator.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 280, after: 80 }
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ spacing: { before: 280, after: 80 } }));
            }

            // Name
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent
            }));

            // Rank
            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent
                }));
            }

            // Appointment
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent
                }));
            }

            // Date (with spacing above for 2-line gap)
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 400 }
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
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, size: 20, sizeComplexScript: csSize, font, language: lang }));
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

        // Title paragraphs — sit ABOVE the bordered table
        const titleChildren: (Paragraph | Table)[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 24, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { after: 40 }
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }
            }),
        ];

        // Wrap all content in a single bordered table cell so borders continue across page breaks
        const frameBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
        const contentWidth = 12240 - 567 - 567; // page width minus margins
        const borderedTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            rows: [new TableRow({
                children: [new TableCell({
                    children: mainChildren.length > 0 ? mainChildren : [new Paragraph({})],
                    borders: { top: frameBorder, bottom: frameBorder, left: frameBorder, right: frameBorder },
                    width: { size: contentWidth, type: WidthType.DXA },
                    margins: { top: 80, bottom: 10200, left: 120, right: 120 },
                })]
            })],
        });

        const docChildren: (Paragraph | Table)[] = [...titleChildren, borderedTable];

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT },
                        margin: { top: 567, right: 567, bottom: 200, left: 567 },
                    }
                },
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
