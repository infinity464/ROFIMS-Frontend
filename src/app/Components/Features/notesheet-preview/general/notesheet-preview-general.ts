import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { FieldsetModule } from 'primeng/fieldset';

import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { MemberColumnDef, MemberRow, MembersJsonData, AVAILABLE_MEMBER_COLUMNS, ReferenceParagraph } from '../../notesheet-generate/notesheet-generate';
import { NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions, ApprovalStatus, NoteSheetRemarkAction, NoteSheetPreviewFrom, ApprovalLogAction, ApprovalLogActionOptions } from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { environment } from '@/Core/Environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FamilyInfoService } from '@/services/family-info-service';
import { JsReportService } from '@/services/jsreport.service';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun,
    VerticalAlign, TableLayoutType, HeightRule
} from 'docx';
import { saveAs } from 'file-saver';
import type {
    NotesheetDocumentModel,
    ContentBlock,
    InlineRun,
    SignatoryBlock,
    TextAlignment
} from '../notesheet-document-model';

interface ApprovalLogEntry {
    step: string;
    action: ApprovalLogAction;
    date: string | null;
    remark: string | null;
    employeeId: number | null;
    serviceId?: string;
    name?: string;
    rank?: string;
}

@Component({
    selector: 'app-notesheet-preview-general',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, ConfirmDialogModule, DialogModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, DatePickerModule, FlexibleDateDirective, FieldsetModule,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent, NotesheetApproverSelectComponent,
        EmployeeSearchComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-general.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewGeneralComponent extends NotesheetPreviewBase implements AfterViewChecked {


    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;
    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);
    private confirmationService = inject(ConfirmationService);
    private sharedService = inject(SharedService);
    private familyInfoService = inject(FamilyInfoService);
    private jsreportService = inject(JsReportService);

    // ── Page size for jsReport export (Legal default, A4 optional) ──
    selectedPageSize = 'A4';
    pageSizeOptions = [
        { label: 'Legal', value: 'Legal' },
        { label: 'A4', value: 'A4' }
    ];

    // ── Button visibility (configurable by parent) ───────────
    @Input() showEdit = true;
    @Input() showWord = true;
    @Input() showPdf = true;

    // ── Edit state ───────────────────────────────────────────
    editing = false;
    saving = false;

    // ── Submit for approval state ─────────────────────────────
    submitting = false;
    readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;

    // ── Pending-list inline actions ───────────────────────────
    fromPending = false;
    /** The list URL to return to after an approval action (e.g. /notesheet-list/my-approval). */
    returnUrl: string | null = null;
    currentUserEmployeeId = 0;

    // Remark dialog
    showRemarkDialog = false;
    remarkAction: NoteSheetRemarkAction | null = null;
    remarkText = '';
    actionSubmitting = false;
    readonly NoteSheetRemarkAction = NoteSheetRemarkAction;

    // Approval Log dialog
    showApprovalLogDialog = false;
    approvalLogEntries: ApprovalLogEntry[] = [];
    approvalLogLoading = false;
    approvalLogNoteSheetNo = '';
    readonly ApprovalLogAction = ApprovalLogAction;

    // ── Pagination ────────────────────────────────────────────
    pageOffsets: number[] = [0];
    pageContentHeightPx = 0;
    titleBlockHeightPx = 0;
    private pageInsetPx = 0;
    private lastMeasuredHeight = 0;

    // ── Edit model fields ────────────────────────────────────
    editSubject = '';
    editReferenceParagraphs: ReferenceParagraph[] = [{ text: '', fileRows: [] }];
    editMainText = '';
    editNote = '';
    editParagraphText = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;

    // ── Members edit state ────────────────────────────────────
    editMembersData: MembersJsonData = { columns: [], members: [] };
    memberAddLoading = false;
    showAddColumnDialog = false;
    addColumnMode: 'field' | 'custom' = 'field';
    selectedColumnKey: string | null = null;
    newCustomColumnName = '';
    editingMemberCellKey: string | null = null;
    editingMemberCellValue = '';
    readonly availableColumns = AVAILABLE_MEMBER_COLUMNS;
    editingColLabelKey: string | null = null;
    editingColLabelValue = '';
    dragColIndex: number | null = null;
    dragOverColIndex: number | null = null;

    // ── Dropdown options ─────────────────────────────────────
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly operationTypeOptions = NoteSheetOperationTypeOptions;

    // ── File references ──────────────────────────────────────
    fileRows: FileRowData[] = [];

    // ── View-mode file attachments ─────────────────────────
    get viewFileAttachments(): { fileId: number; fileName: string }[] {
        const json = this.noteSheet?.filesReferences;
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

    // ── Members table data (loaded from NoteSheetReferenceEmployee) ──
    previewMembersColumns: { key: string; label: string; mergedFrom?: string[]; width?: number }[] = [];
    previewMembersRows: Record<string, string>[] = [];
    private loadedMemberEmployeeIds: number[] = [];

    // ── Computed ─────────────────────────────────────────────
    get canEdit(): boolean {
        const status = this.noteSheet?.currentStatus?.toLowerCase();
        return status === NoteSheetCurrentStatus.Draft;
    }

    get isDraftStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Draft;
    }

    get isInitiatorStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Initiator;
    }

    get currentStatusLabel(): string {
        const status = this.noteSheet?.currentStatus?.toLowerCase() ?? '';
        if (!status) return '';
        return NoteSheetCurrentStatusOptions.find(o => o.value === status)?.label ?? status;
    }

    get currentApproverLabel(): string {
        const status = this.noteSheet?.currentStatus?.toLowerCase() ?? '';
        if (!status || !this.noteSheet) return '';
        if (status === NoteSheetCurrentStatus.Initiator) return 'Initiator';
        if (status === NoteSheetCurrentStatus.FinalApproval) return 'Final Approver';
        if (status === NoteSheetCurrentStatus.Recommender) {
            try {
                const json = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
                if (json && typeof json === 'string') {
                    const arr = JSON.parse(json) as any[];
                    if (Array.isArray(arr) && arr.length > 0) {
                        const pendingIdx = arr.findIndex(r => {
                            const s = (r?.recomender_status ?? '').toString().toLowerCase();
                            return !s || s === 'pending';
                        });
                        const idx = pendingIdx >= 0 ? pendingIdx : 0;
                        return arr.length > 1 ? `Recommender ${idx + 1}` : 'Recommender';
                    }
                }
            } catch { /* ignore */ }
            return 'Recommender';
        }
        return '';
    }

    // ── Toggle edit mode ─────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        this.editSubject = this.noteSheet.subject ?? '';
        // Parse reference number into paragraphs
        const refNumber = this.noteSheet.referenceNumber;
        if (refNumber && typeof refNumber === 'string') {
            try {
                const arr = JSON.parse(refNumber);
                if (Array.isArray(arr) && arr.length > 0) {
                    this.editReferenceParagraphs = arr.map((item: any) => ({
                        text: item.text ?? item.Text ?? '',
                        fileRows: (item.files ?? item.Files ?? []).map((f: any) => ({
                            displayName: f.fileName ?? f.FileName ?? '',
                            file: null,
                            fileId: f.FileId ?? f.fileId
                        }))
                    }));
                } else {
                    this.editReferenceParagraphs = [{ text: '', fileRows: [] }];
                }
            } catch {
                this.editReferenceParagraphs = [{ text: refNumber, fileRows: [] }];
            }
        } else {
            this.editReferenceParagraphs = [{ text: '', fileRows: [] }];
        }
        this.editMainText = this.noteSheet.mainText ?? '';
        this.editNote = this.noteSheet.note ?? '';
        this.editParagraphText = this.noteSheet.paragraphText ?? '';
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

        // Load existing members into edit model
        const cols: MemberColumnDef[] = this.previewMembersColumns.map(c => ({
            key: c.key,
            label: c.label,
            group: (c as any).group ?? 'basic',
            ...(c.mergedFrom ? { mergedFrom: (c as any).mergedFrom } : {}),
            ...(c.width != null ? { width: c.width } : {})
        }));
        const members: MemberRow[] = this.previewMembersRows.map((row, i) => ({
            employeeId: this.loadedMemberEmployeeIds[i] ?? 0,
            values: { ...row }
        }));
        this.editMembersData = { columns: cols, members };
    }

    cancelEdit(): void {
        this.editing = false;
        this.fileRows = [];
        this.editMembersData = { columns: [], members: [] };
        this.lastMeasuredHeight = 0;
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
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    // ── Reference Paragraphs ──────────────────────────────────
    addReferenceParagraph(): void {
        this.editReferenceParagraphs.push({ text: '', fileRows: [] });
    }

    removeReferenceParagraph(index: number): void {
        if (this.editReferenceParagraphs.length > 1) {
            this.editReferenceParagraphs.splice(index, 1);
        }
    }

    getRefSerialLabel(index: number): string {
        if (this.editTextType === 'bn') {
            const banglaLetters = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];
            return (banglaLetters[index] ?? String(index + 1)) + '.';
        }
        return String.fromCharCode(65 + index) + '.';
    }

    onRefFileRowsChange(event: FileRowData[], index: number): void {
        if (event && Array.isArray(event)) {
            this.editReferenceParagraphs[index].fileRows = event;
        }
    }

    onRefDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
        });
    }

    private async uploadEditReferenceParagraphFiles(): Promise<string> {
        const result: { text: string; files: { FileId: number; fileName: string }[] }[] = [];
        for (const para of this.editReferenceParagraphs) {
            const existingFiles = para.fileRows.filter(r => r.fileId != null).map(r => ({ FileId: r.fileId!, fileName: r.displayName ?? '' }));
            const newFiles = para.fileRows.filter(r => r.file != null);
            if (newFiles.length > 0) {
                const uploads = newFiles.map(r => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name).toPromise());
                const uploaded = await Promise.all(uploads);
                const uploadedRefs = (uploaded as any[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                result.push({ text: para.text, files: [...existingFiles, ...uploadedRefs] });
            } else {
                result.push({ text: para.text, files: existingFiles });
            }
        }
        return JSON.stringify(result);
    }

    // ── Save changes ─────────────────────────────────────────
    saveChanges(): void {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null, referenceNumberJson: string | null) => {
            const recommendersJson = this.buildRecommendersJson();
            const now = new Date().toISOString();

            const payload: Record<string, unknown> = {
                ...this.noteSheet,
                subject: this.editSubject,
                referenceNumber: referenceNumberJson,
                mainText: this.editMainText,
                note: this.editNote || null,
                paragraphText: this.editParagraphText || null,
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
                    // Sync members to NoteSheetReferenceEmployee
                    const noteSheetId = this.noteSheet!.noteSheetId ?? (this.noteSheet as any).NoteSheetId;
                    if (noteSheetId) {
                        const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
                        const employees = this.editMembersData.members.map(m => ({
                            employeeId: m.employeeId,
                            informationJson: JSON.stringify({
                                columns: this.editMembersData.columns,
                                values: m.values
                            })
                        }));
                        const syncPayload = {
                            noteSheetId,
                            employees,
                            updatedBy: payload['lastUpdatedBy'] ?? 'system'
                        };
                        this.http.post(refApi + '/Sync', syncPayload).subscribe({
                            error: () => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Saved but failed to sync members.' })
                        });
                    }
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                    this.editing = false;
                    this.saving = false;
                    this.fileRows = [];
                    this.lastMeasuredHeight = 0;
                    this.reloadNoteSheet();
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update note-sheet.' });
                    this.saving = false;
                }
            });
        };

        // Build reference paragraphs JSON, then upload files, then save
        this.uploadEditReferenceParagraphFiles().then((refNumberJson) => {
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
                        doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null, refNumberJson);
                    },
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload files.' });
                        this.saving = false;
                    }
                });
                return;
            }

            const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
            doSave(filesReferencesJson, refNumberJson);
        }).catch(() => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload reference files.' });
            this.saving = false;
        });
    }

    // ── Reload notesheet after save ──────────────────────────
    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.lastMeasuredHeight = 0;
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

    // ── Lifecycle: detect pending mode, resolve current user ──
    override ngOnInit(): void {
        super.ngOnInit();
        this.route.queryParams.subscribe(params => {
            this.fromPending = (params['from'] ?? '').toString().toLowerCase() === NoteSheetPreviewFrom.Pending;
            this.returnUrl = params['returnUrl'] ?? null;
        });
        const userId = this.sharedService.getCurrentUserId?.();
        if (userId) {
            this.http.get<any[]>(`${environment.apis.core}/IdentityUserMapping/GetMappings`).subscribe({
                next: (list) => {
                    const me = (Array.isArray(list) ? list : []).find((m: any) => m.userId === userId);
                    if (me?.employeeId) this.currentUserEmployeeId = me.employeeId;
                },
                error: (err: any) => {}
            });
        }
    }

    // ── Override loadNoteSheet to also load members ───────────
    protected override loadNoteSheet(): void {
        super.loadNoteSheet();
        // After base loads, also load members from NoteSheetReferenceEmployee
        if (this.noteSheetId) {
            const refApi = `${environment.apis.core}/NoteSheetReferenceEmployee`;
            this.http.get<any[]>(`${refApi}/GetByNoteSheetId/${this.noteSheetId}`).subscribe({
                next: (list) => {
                    const rows = (Array.isArray(list) ? list : []).filter(r => r.informationJson || r.InformationJson);
                    if (rows.length > 0) {
                        try {
                            const firstParsed = JSON.parse(rows[0].informationJson || rows[0].InformationJson);
                            this.previewMembersColumns = Array.isArray(firstParsed.columns) ? firstParsed.columns : [];
                            this.previewMembersRows = rows.map(r => {
                                const parsed = JSON.parse(r.informationJson || r.InformationJson);
                                return parsed.values ?? {};
                            });
                            this.loadedMemberEmployeeIds = rows.map(r => r.employeeId ?? r.EmployeeId ?? 0);
                        } catch {
                            this.previewMembersColumns = [];
                            this.previewMembersRows = [];
                            this.loadedMemberEmployeeIds = [];
                        }
                    } else {
                        this.previewMembersColumns = [];
                        this.previewMembersRows = [];
                        this.loadedMemberEmployeeIds = [];
                    }
                }
            });
        }
    }

    // ── Serial computation: mainText(+members table) = 1, note, lastText ──
    get contentSerialCount(): number {
        let count = 1; // ১। Main Text (+ members table, no separate serial)
        if (this.noteSheet?.note) count++;
        if (this.noteSheet?.paragraphText) count++;
        return count;
    }

    /** Get serial number for note section */
    get noteSerial(): number { return 2; }
    /** Get serial number for last text section */
    get lastTextSerial(): number {
        return this.noteSerial + (this.noteSheet?.note ? 1 : 0);
    }
    /** Get starting serial for approver sections */
    get approverStartSerial(): number {
        return 1 + this.contentSerialCount;
    }

    // ── Members edit methods ────────────────────────────────────

    onMemberFound(emp: EmployeeBasicInfo): void {
        if (this.editMembersData.members.some(m => m.employeeId === emp.employeeID)) {
            this.messageService.add({ severity: 'warn', summary: 'Duplicate', detail: 'This member is already added.' });
            return;
        }
        this.memberAddLoading = true;
        forkJoin([
            this.servingMembersService.getEmployeePersonalServiceOverview(emp.employeeID),
            this.familyInfoService.getFamilyInfoByEmployeeView(emp.employeeID)
        ]).subscribe({
            next: ([profile, familyList]: [any, any]) => {
                const values: Record<string, string> = {};
                values['serviceId'] = profile.serviceId ?? '';
                values['rabId'] = profile.rabId ?? '';
                values['nameEnglish'] = profile.nameEnglish ?? '';
                values['nameBN'] = profile.nameBN ?? '';
                values['armyRank'] = profile.armyRank ?? '';
                values['armyRankBN'] = profile.armyRankBN ?? '';
                values['corps'] = profile.corps ?? '';
                values['corpsBN'] = profile.corpsBN ?? '';
                values['trade'] = profile.trade ?? '';
                values['tradeBN'] = profile.tradeBN ?? '';
                values['motherOrganization'] = profile.motherOrganization ?? '';
                values['motherOrganizationBN'] = profile.motherOrganizationBN ?? '';
                values['motherUnit'] = profile.motherUnit ?? '';
                values['motherUnitBN'] = profile.motherUnitBN ?? '';
                values['memberType'] = profile.memberType ?? '';
                values['memberTypeBN'] = profile.memberTypeBN ?? '';
                values['appointment'] = profile.appointment ?? '';
                values['appointmentBN'] = profile.appointmentBN ?? '';
                values['joiningDate'] = profile.joiningDate ?? '';
                values['gender'] = profile.gender ?? '';
                values['genderBN'] = profile.genderBN ?? '';
                values['batch'] = profile.batch ?? '';
                values['batchBN'] = profile.batchBN ?? '';
                values['rabUnit'] = profile.rabUnit ?? '';
                values['rabUnitBN'] = profile.rabUnitBN ?? '';
                values['postingStatus'] = profile.postingStatus ?? '';
                values['permanentDistrictTypeName'] = profile.permanentDistrictTypeName ?? '';
                values['permanentDistrictTypeNameBN'] = profile.permanentDistrictTypeNameBN ?? '';
                values['prefix'] = profile.prefix ?? '';
                values['prefixBN'] = profile.prefixBN ?? '';
                values['prefixWithServiceId'] = ((profile.prefix ?? '') + ' ' + (profile.serviceId ?? '')).trim();
                values['prefixWithServiceIdBN'] = ((profile.prefixBN ?? '') + ' ' + (profile.serviceId ?? '')).trim();
                values['tradeRemarks'] = profile.tradeRemarks ?? '';
                values['dateOfBirth'] = profile.dateOfBirth ?? '';
                values['bloodGroup'] = profile.bloodGroup ?? '';
                values['nid'] = profile.nid ?? '';
                values['mobileNo'] = profile.mobileNo ?? '';
                values['mobileNoOfficial'] = profile.mobileNoOfficial ?? '';
                values['emailAddress'] = profile.emailAddress ?? '';
                values['religion'] = profile.religion ?? '';
                values['religionBN'] = profile.religionBN ?? '';
                values['passportNo'] = profile.passportNo ?? '';
                values['maritalStatus'] = profile.maritalStatus ?? '';
                values['maritalStatusBN'] = profile.maritalStatusBN ?? '';
                values['emergencyContactNo'] = profile.emergencyContactNo ?? '';
                values['dateOfCommission'] = profile.dateOfCommission ?? '';
                values['dateOfJoiningInServiceTraining'] = profile.dateOfJoiningInServiceTraining ?? '';
                values['medicalCategory'] = profile.medicalCategory ?? '';
                values['medicalCategoryBN'] = profile.medicalCategoryBN ?? '';
                values['educationQualification'] = profile.educationQualification ?? '';
                values['educationQualificationBN'] = profile.educationQualificationBN ?? '';
                values['professionalQualification'] = profile.professionalQualification ?? '';
                values['professionalQualificationBN'] = profile.professionalQualificationBN ?? '';
                values['personalQualification'] = profile.personalQualification ?? '';
                values['personalQualificationBN'] = profile.personalQualificationBN ?? '';
                values['gallantryAwardsDecoration'] = profile.gallantryAwardsDecoration ?? '';
                values['gallantryAwardsDecorationBN'] = profile.gallantryAwardsDecorationBN ?? '';
                values['height'] = profile.height != null ? String(profile.height) : '';
                values['weight'] = profile.weight != null ? String(profile.weight) : '';
                values['identificationMark'] = profile.identificationMark ?? '';
                const family = Array.isArray(familyList) ? familyList : [];
                const spouse = family.find((f: any) => (f.relation ?? '').toLowerCase().includes('spouse') || (f.relation ?? '').toLowerCase().includes('wife') || (f.relation ?? '').toLowerCase().includes('husband'));
                const father = family.find((f: any) => (f.relation ?? '').toLowerCase().includes('father'));
                const mother = family.find((f: any) => (f.relation ?? '').toLowerCase().includes('mother'));
                values['family_spouse'] = spouse?.name ?? '';
                values['family_father'] = father?.name ?? '';
                values['family_mother'] = mother?.name ?? '';
                values['family_members'] = family.map((f: any) => `${f.relation ?? ''}: ${f.name ?? ''}`).join('; ');
                this.editMembersData.members.push({ employeeId: emp.employeeID, values });
                this.memberAddLoading = false;
                this.messageService.add({ severity: 'success', summary: 'Member Added', detail: `${profile.nameEnglish || emp.fullNameEN} added.` });
            },
            error: () => {
                this.memberAddLoading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load member profile.' });
            }
        });
    }

    removeMember(index: number): void {
        this.editMembersData.members.splice(index, 1);
    }

    get unusedColumns(): MemberColumnDef[] {
        const usedKeys = new Set(this.editMembersData.columns.map(c => c.key));
        return this.availableColumns.filter(c => !usedKeys.has(c.key));
    }

    get groupedUnusedColumns(): { label: string; value: string; items: { label: string; value: string }[] }[] {
        const groups: Record<string, { label: string; value: string }[]> = {};
        const groupLabels: Record<string, string> = { basic: 'Basic Info', personal: 'Personal Info', family: 'Family Info' };
        for (const col of this.unusedColumns) {
            const g = col.group;
            if (!groups[g]) groups[g] = [];
            groups[g].push({ label: col.label, value: col.key });
        }
        return Object.entries(groups).map(([key, items]) => ({
            label: groupLabels[key] ?? key, value: key, items
        }));
    }

    openAddColumnDialog(): void {
        this.addColumnMode = 'field';
        this.selectedColumnKey = null;
        this.newCustomColumnName = '';
        this.showAddColumnDialog = true;
    }

    closeAddColumnDialog(): void {
        this.showAddColumnDialog = false;
    }

    confirmAddColumn(): void {
        if (this.addColumnMode === 'field') {
            if (!this.selectedColumnKey) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Please select a field.' });
                return;
            }
            const def = this.availableColumns.find(c => c.key === this.selectedColumnKey);
            if (def && !this.editMembersData.columns.some(c => c.key === def.key)) {
                this.editMembersData.columns.push({ ...def });
            }
        } else {
            const name = this.newCustomColumnName.trim();
            if (!name) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'Column name cannot be empty.' });
                return;
            }
            const key = `custom_${name}`;
            if (this.editMembersData.columns.some(c => c.key === key)) {
                this.messageService.add({ severity: 'warn', summary: 'Validation', detail: 'A column with that name already exists.' });
                return;
            }
            this.editMembersData.columns.push({ key, label: name, group: 'custom' });
            for (const member of this.editMembersData.members) {
                member.values[key] = '';
            }
        }
        this.closeAddColumnDialog();
    }

    removeColumn(colKey: string): void {
        this.editMembersData.columns = this.editMembersData.columns.filter(c => c.key !== colKey);
    }

    isCustomColumn(col: MemberColumnDef): boolean {
        return col.group === 'custom';
    }

    memberCellKey(rowIndex: number, colKey: string): string {
        return `${rowIndex}_${colKey}`;
    }

    startEditMemberCell(rowIndex: number, colKey: string, event: Event): void {
        this.editingMemberCellKey = this.memberCellKey(rowIndex, colKey);
        this.editingMemberCellValue = this.editMembersData.members[rowIndex]?.values[colKey] ?? '';
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('td')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    onMemberCellBlur(rowIndex: number, colKey: string): void {
        if (this.editingMemberCellKey === this.memberCellKey(rowIndex, colKey)) {
            this.saveMemberCell(rowIndex, colKey);
        }
    }

    onMemberCellKeydown(event: KeyboardEvent, rowIndex: number, colKey: string): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveMemberCell(rowIndex, colKey);
        } else if (event.key === 'Escape') {
            this.editingMemberCellKey = null;
        }
    }

    private saveMemberCell(rowIndex: number, colKey: string): void {
        if (this.editMembersData.members[rowIndex]) {
            this.editMembersData.members[rowIndex].values[colKey] = this.editingMemberCellValue;
        }
        this.editingMemberCellKey = null;
    }

    startEditColLabel(colKey: string, currentLabel: string, event: Event): void {
        event.stopPropagation();
        this.editingColLabelKey = colKey;
        this.editingColLabelValue = currentLabel;
        setTimeout(() => {
            const el = (event.target as HTMLElement)?.closest('th')?.querySelector('input');
            el?.focus();
            el?.select();
        });
    }

    saveColLabel(colKey: string): void {
        const trimmed = this.editingColLabelValue.trim();
        if (trimmed) {
            const col = this.editMembersData.columns.find(c => c.key === colKey);
            if (col) col.label = trimmed;
        }
        this.editingColLabelKey = null;
    }

    getMergedCellValue(member: MemberRow, col: MemberColumnDef): string {
        if (!col.mergedFrom) return member.values[col.key] || '—';
        const { keys, separator } = col.mergedFrom;
        if (separator === '()') {
            const parts = keys.map(k => member.values[k] || '').filter(Boolean);
            if (parts.length <= 1) return parts[0] || '—';
            return `${parts[0]} (${parts.slice(1).join(', ')})`;
        }
        return keys.map(k => member.values[k] || '').filter(Boolean).join(separator) || '—';
    }

    // Drag & drop column reorder
    onColDragStart(index: number, event: DragEvent): void {
        this.dragColIndex = index;
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/plain', String(index));
    }
    onColDragOver(index: number, event: DragEvent): void {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
    }
    onColDragEnter(index: number, event: DragEvent): void {
        event.preventDefault();
        this.dragOverColIndex = index;
    }
    onColDragLeave(event: DragEvent): void {}
    onColDrop(targetIndex: number, event: DragEvent): void {
        event.preventDefault();
        if (this.dragColIndex !== null && this.dragColIndex !== targetIndex) {
            const cols = [...this.editMembersData.columns];
            const [moved] = cols.splice(this.dragColIndex, 1);
            cols.splice(targetIndex, 0, moved);
            this.editMembersData.columns = cols;
        }
        this.dragColIndex = null;
        this.dragOverColIndex = null;
    }
    onColDragEnd(): void {
        this.dragColIndex = null;
        this.dragOverColIndex = null;
    }

    // ── Column Resize (edit mode) ────────────────────────────────────────

    private resizeColIndex: number | null = null;
    private resizeStartX = 0;
    private resizeStartWidth = 0;
    private resizeTableWidth = 0;
    private resizeBoundMove = this.onResizeMove.bind(this);
    private resizeBoundUp = this.onResizeUp.bind(this);

    onResizeStart(colIndex: number, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.resizeColIndex = colIndex;
        this.resizeStartX = event.clientX;
        const th = (event.target as HTMLElement).closest('th');
        const table = th?.closest('table');
        this.resizeTableWidth = table?.offsetWidth ?? 800;
        this.resizeStartWidth = this.editMembersData.columns[colIndex]?.width ?? this.getDefaultColWidth(this.editMembersData.columns.length);
        document.addEventListener('mousemove', this.resizeBoundMove);
        document.addEventListener('mouseup', this.resizeBoundUp);
    }

    private onResizeMove(event: MouseEvent): void {
        if (this.resizeColIndex === null) return;
        const dx = event.clientX - this.resizeStartX;
        const dPct = (dx / this.resizeTableWidth) * 100;
        const newWidth = Math.max(3, Math.min(80, this.resizeStartWidth + dPct));
        this.editMembersData.columns[this.resizeColIndex].width = Math.round(newWidth * 10) / 10;
    }

    private onResizeUp(): void {
        this.resizeColIndex = null;
        document.removeEventListener('mousemove', this.resizeBoundMove);
        document.removeEventListener('mouseup', this.resizeBoundUp);
    }

    getDefaultColWidth(colCount: number): number {
        if (colCount === 0) return 100;
        return Math.round(((100 - 10) / colCount) * 10) / 10;
    }

    getEditColWidth(col: MemberColumnDef): number {
        return col.width ?? this.getDefaultColWidth(this.editMembersData.columns.length);
    }

    getPreviewColWidth(col: { width?: number }): number {
        return col.width ?? this.getDefaultColWidth(this.previewMembersColumns.length);
    }

    /** Bangla header text for member-table columns (keyed by column key, both
     *  EN and BN variants map to the same Bangla label). Falls back to the
     *  configured English label for anything not listed. */
    private readonly memberColHeaderBN: Record<string, string> = {
        serviceId: 'সার্ভিস আইডি', rabId: 'র‍্যাব আইডি', prefixWithServiceId: 'সার্ভিস আইডি', prefixWithServiceIdBN: 'সার্ভিস আইডি',
        nameEnglish: 'নাম', nameBN: 'নাম',
        armyRank: 'পদবি', armyRankBN: 'পদবি',
        corps: 'কোর', corpsBN: 'কোর',
        trade: 'ট্রেড', tradeBN: 'ট্রেড', tradeRemarks: 'ট্রেড মন্তব্য',
        motherOrganization: 'মূল সংস্থা', motherOrganizationBN: 'মূল সংস্থা',
        motherUnit: 'মাতৃ ইউনিট', motherUnitBN: 'মাতৃ ইউনিট',
        memberType: 'সদস্য ধরন', memberTypeBN: 'সদস্য ধরন',
        appointment: 'নিয়োগ', appointmentBN: 'নিয়োগ',
        joiningDate: 'যোগদানের তারিখ',
        rabUnit: 'র‍্যাব ইউনিট', rabUnitBN: 'র‍্যাব ইউনিট',
        gender: 'লিঙ্গ', genderBN: 'লিঙ্গ',
        batch: 'ব্যাচ', batchBN: 'ব্যাচ',
        postingStatus: 'পোস্টিং অবস্থা',
        permanentDistrictTypeName: 'স্থায়ী জেলা', permanentDistrictTypeNameBN: 'স্থায়ী জেলা',
        prefix: 'উপসর্গ', prefixBN: 'উপসর্গ',
    };

    /** Column header for the members table — Bangla when the note-sheet is
     *  Bangla, the configured English label otherwise. Drives web + PDF + preview
     *  (all render from this same template). */
    getMemberColHeader(col: { key: string; label: string }): string {
        if (this.isEnglish()) return col.label;
        return this.memberColHeaderBN[col.key] ?? col.label;
    }

    /** Auto serial for members table rows: Bangla numerals when Bangla, English otherwise */
    memberSerial(index: number): string {
        const n = index + 1;
        if (this.isEnglish()) return String(n);
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return String(n).replace(/\d/g, d => bn[+d]);
    }

    /** Get cell value for preview members table — handles merged columns + Bangla numeral conversion */
    formatMemberCell(row: Record<string, string>, col: { key: string; mergedFrom?: string[] }): string {
        let val: string;
        if (col.mergedFrom?.length) {
            val = col.mergedFrom.map(k => row[k] || '').filter(Boolean).join(' ');
        } else {
            val = row[col.key] || '';
        }
        if (!val) return '';
        // Auto-convert digits to Bangla when notesheet language is Bangla
        if (!this.isEnglish() && /\d/.test(val)) {
            const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
            val = val.replace(/\d/g, d => bn[+d]);
        }
        return val;
    }

    /** Parse referenceNumber JSON → array of text strings */
    get parsedReferences(): string[] {
        const raw = this.noteSheet?.referenceNumber;
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return arr.map((item: any) => (item.text ?? item.Text ?? '')).filter((t: string) => t.trim());
            }
            return [];
        } catch {
            // Legacy plain string
            return raw.trim() ? [raw] : [];
        }
    }

    /** Get ক,খ,গ / a,b,c serial label for reference paragraphs */
    refSerialLabel(index: number): string {
        if (!this.isEnglish()) {
            const banglaLetters = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];
            return (banglaLetters[index] ?? String(index + 1)) + '.';
        }
        return String.fromCharCode(97 + index) + '.'; // a, b, c...
    }

    /** Render note HTML safely */
    getNoteSafe(): SafeHtml {
        const raw = this.noteSheet?.note ?? '';
        return this.sanitizer.bypassSecurityTrustHtml(this.fixBanglaWordBreaks(raw));
    }

    /** Render paragraphText (Last Text) HTML safely */
    getLastTextSafe(): SafeHtml {
        const raw = this.noteSheet?.paragraphText ?? '';
        return this.sanitizer.bypassSecurityTrustHtml(this.fixBanglaWordBreaks(raw));
    }

    // ── Submit for approval ─────────────────────────────────────
    submitForApproval(): void {
        if (!this.noteSheet || this.submitting) return;
        this.confirmationService.confirm({
            message: 'Do you want to submit this note-sheet for approval process?',
            header: 'Submit for Approval',
            acceptLabel: 'Submit',
            rejectLabel: 'Cancel',
            acceptButtonStyleClass: 'p-button-success',
            accept: () => this.doSubmitForApproval()
        });
    }

    private doSubmitForApproval(): void {
        if (!this.noteSheet) return;
        this.submitting = true;
        const req = {
            NoteSheetId: this.noteSheet.noteSheetId,
            LastUpdatedBy: this.sharedService.getCurrentUser?.() ?? 'system'
        };
        this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(
            `${this.api}/SubmitForApproval`, req, { observe: 'response' }
        ).subscribe({
            next: (resp) => {
                this.submitting = false;
                const body = resp.body;
                const code = body?.statusCode ?? body?.StatusCode;
                const msg = body?.description ?? body?.Description;
                if (resp.status >= 200 && resp.status < 300 && (code == null || code === 200)) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Submitted for approval.' });
                    this.reloadNoteSheet();
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Submit for approval', detail: msg || 'Submit failed.' });
                }
            },
            error: (err) => {
                this.submitting = false;
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.error?.message ?? err?.message ?? 'Submit failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    // ── Approve / Decline / Back: remark dialog ─────────────────
    openRemarkDialog(action: NoteSheetRemarkAction): void {
        if (!this.noteSheet) return;
        this.remarkAction = action;
        this.remarkText = '';
        this.showRemarkDialog = true;
    }

    submitRemark(): void {
        if (!this.noteSheet || !this.remarkAction) return;
        if (this.remarkAction === NoteSheetRemarkAction.Decline && !this.remarkText?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Remark Required', detail: 'Please provide a remark before declining.' });
            return;
        }
        if (this.remarkAction === NoteSheetRemarkAction.Back && !this.remarkText?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Remark Required', detail: 'Please provide a remark before sending back.' });
            return;
        }
        this.doSubmitRemark();
    }

    private doSubmitRemark(): void {
        if (!this.noteSheet || !this.remarkAction) return;
        const url = `${this.api}/${this.remarkAction.charAt(0).toUpperCase() + this.remarkAction.slice(1)}`;
        const body = {
            NoteSheetId: this.noteSheet.noteSheetId,
            EmployeeId: this.currentUserEmployeeId,
            Remark: this.remarkText,
            LastUpdatedBy: this.sharedService.getCurrentUser?.() ?? 'system'
        };
        this.actionSubmitting = true;

        this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(url, body, { observe: 'response' }).subscribe({
            next: (resp) => {
                this.actionSubmitting = false;
                const res = resp.body;
                const code = res?.statusCode ?? res?.StatusCode;
                const msg = res?.description ?? res?.Description;
                if (code === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
                    this.showRemarkDialog = false;
                    this.router.navigateByUrl(this.returnUrl || '/notesheet-list/pending');
                } else {
                    this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
                }
            },
            error: (err) => {
                this.actionSubmitting = false;
                const detail = err?.error?.description ?? err?.error?.Description ?? err?.error?.message ?? err?.message ?? 'Request failed.';
                this.messageService.add({ severity: 'error', summary: 'Error', detail });
            }
        });
    }

    // ── Approval Log dialog ─────────────────────────────────────
    openApprovalLog(): void {
        if (!this.noteSheet) return;
        this.approvalLogEntries = [];
        this.approvalLogLoading = true;
        this.approvalLogNoteSheetNo = this.noteSheet.noteSheetNo || '';
        this.showApprovalLogDialog = true;

        forkJoin({
            noteSheet: this.http.get<any[]>(`${this.api}/GetFilteredByKeysAsyn/${this.noteSheet.noteSheetId}`).pipe(
                map(data => (Array.isArray(data) ? data[0] : null) as any | null),
                catchError(() => of(null as any | null))
            ),
            backHistory: this.http.get<{ id: number; backedByEmployeeId: number; backedFromStatus: string; backedToStatus: string; backReason: string | null; backedDate: string; createdBy: string }[]>(
                `${this.api}/GetBackHistory`, { params: { noteSheetId: this.noteSheet.noteSheetId.toString() } }
            ).pipe(catchError(() => of([])))
        }).subscribe({
            next: ({ noteSheet, backHistory }) => {
                if (!noteSheet) { this.approvalLogLoading = false; return; }
                this.buildApprovalLog(noteSheet, backHistory);
            },
            error: (err: any) => { this.approvalLogLoading = false; }
        });
    }

    private buildApprovalLog(
        ns: any,
        backHistory: { backedByEmployeeId: number; backedFromStatus: string; backedToStatus: string; backReason: string | null; backedDate: string }[]
    ): void {
        const entries: ApprovalLogEntry[] = [];

        if (ns.preparedByEmployeeId && ns.preparedByEmployeeId > 0) {
            entries.push({
                step: 'Prepared By',
                action: ApprovalLogAction.Approve,
                date: ns.createdDate ?? null,
                remark: null,
                employeeId: ns.preparedByEmployeeId
            });
        }

        if (ns.initiatorId) {
            entries.push({
                step: 'Initiator',
                action: (ns.initiatorStatus as ApprovalLogAction) ?? ApprovalLogAction.Pending,
                date: ns.initiatorApprovedDate ?? null,
                remark: ns.initiatorApproveRemark || ns.initiatorCancelRemark || null,
                employeeId: ns.initiatorId
            });
        }

        try {
            const json = ns.recommendersJson;
            if (json && typeof json === 'string') {
                const arr = JSON.parse(json) as any[];
                if (Array.isArray(arr)) {
                    arr.forEach((r, i) => {
                        entries.push({
                            step: arr.length > 1 ? `Recommender ${i + 1}` : 'Recommender',
                            action: (r.recomender_status as ApprovalLogAction) ?? ApprovalLogAction.Pending,
                            date: r.recomender_approved_date ?? null,
                            remark: r.recomender_approve_remark || r.recomender_cancel_remark || null,
                            employeeId: r.recomender_id ?? null
                        });
                    });
                }
            }
        } catch { /* ignore */ }

        if (ns.finalApprovalId) {
            entries.push({
                step: 'Final Approver',
                action: (ns.finalApprovalStatus as ApprovalLogAction) ?? ApprovalLogAction.Pending,
                date: ns.finalApprovalApprovedDate ?? null,
                remark: ns.finalApprovalRemark || ns.finalApprovalCancelRemark || null,
                employeeId: ns.finalApprovalId
            });
        }

        for (const bh of backHistory) {
            entries.push({
                step: `Back: ${this.getApprovalStatusLabel(bh.backedFromStatus)} → ${this.getApprovalStatusLabel(bh.backedToStatus)}`,
                action: ApprovalLogAction.Back,
                date: bh.backedDate,
                remark: bh.backReason,
                employeeId: bh.backedByEmployeeId
            });
        }

        entries.sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        this.approvalLogEntries = entries;

        const empIds = [...new Set(entries.filter(e => e.employeeId).map(e => e.employeeId!))];
        if (empIds.length === 0) { this.approvalLogLoading = false; return; }

        forkJoin(
            empIds.map(id =>
                this.servingMembersService.getEmployeePersonalServiceOverview(id).pipe(catchError(() => of(null)))
            )
        ).subscribe({
            next: (results) => {
                const empMap = new Map<number, { serviceId: string; name: string; rank: string }>();
                results.forEach((emp: any, idx: number) => {
                    if (emp) {
                        empMap.set(empIds[idx], {
                            serviceId: emp.serviceId ?? emp.rabId ?? '-',
                            name: emp.nameEnglish ?? '-',
                            rank: emp.armyRank ?? '-'
                        });
                    }
                });
                for (const entry of this.approvalLogEntries) {
                    if (entry.employeeId && empMap.has(entry.employeeId)) {
                        const d = empMap.get(entry.employeeId)!;
                        entry.serviceId = d.serviceId;
                        entry.name = d.name;
                        entry.rank = d.rank;
                    }
                }
                this.approvalLogLoading = false;
            },
            error: (err: any) => { this.approvalLogLoading = false; }
        });
    }

    getApprovalStatusLabel(status: string): string {
        return NoteSheetCurrentStatusOptions.find(o => o.value === status)?.label ?? status;
    }

    getActionLabel(action: ApprovalLogAction): string {
        return ApprovalLogActionOptions.find(o => o.value === action)?.label ?? action;
    }

    getActionIcon(action: ApprovalLogAction): string {
        switch (action) {
            case ApprovalLogAction.Approve: return 'pi pi-check-circle';
            case ApprovalLogAction.Cancel:  return 'pi pi-times-circle';
            case ApprovalLogAction.Back:    return 'pi pi-replay';
            case ApprovalLogAction.Pending: return 'pi pi-clock';
            default:                        return 'pi pi-circle';
        }
    }

    formatDateShort(d: string | null | undefined): string {
        if (!d) return '-';
        try {
            const dt = new Date(d);
            return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return d;
        }
    }

    // ── Print Preview via JsReport (chrome-pdf, opens in new tab) ──
    async printPreview(): Promise<void> {
        if (!this.noteSheet || !this.contentMeasure) return;
        this.printingPreview = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.printingPreview = false;
        }
    }

    /** Export PDF via JsReport (chrome-pdf) — same render as Print Preview, downloaded. */
    override async exportPdf(): Promise<void> {
        if (!this.noteSheet || !this.contentMeasure) return;
        this.exportingPdf = true;
        try {
            const { html, chrome } = this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.pdf`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error', summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.exportingPdf = false;
        }
    }

    /**
     * Build the chrome-pdf HTML + chrome options shared by the PDF download and
     * Print Preview, reproducing the on-screen `.a4-paper` exactly. Snapshots the
     * UNPAGINATED source (hidden .page-measure div) so Chromium paginates the full
     * flow via @page rules; @page insets mirror .a4-paper's padding so the text
     * column matches the web view (Legal 215.9−2×10 = 195.9mm; A4 = 190mm).
     */
    private buildJsReportPdf(): { html: string; chrome: Record<string, unknown> } {
        const styles = this.collectDocumentStyles();
        const body = this.contentMeasure.nativeElement.innerHTML;
        const isLegal = this.selectedPageSize === 'Legal';
        const pageWidth = isLegal ? '215.9mm' : '210mm';
        const pageHeight = isLegal ? '355.6mm' : '297mm';
        const colWidth = isLegal ? '195.9mm' : '190mm';
        const padX = 10, padTop = 14, padBottom = 20; // mm — .a4-paper padding

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm; }
html, body { margin: 0; padding: 0; background: transparent; }

.no-print, .preview-header, .export-options-bar, .preview-actions, .preview-status-actions { display: none !important; }

/* Page frame: Chromium repeats position:fixed elements on every printed page,
   filling the printable area (page minus @page margin) on every page. */
.pdf-page-frame {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    border: 1.5px solid #000;
    pointer-events: none;
    z-index: 9999;
}

/* Source container — lock the exact .a4-paper text column + typography. */
.pdf-flow {
    position: static !important;
    left: auto !important;
    top: auto !important;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${colWidth};
    font-family: 'Times New Roman', 'SolaimanLipi', 'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', 'Shonar Bangla', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}

.pdf-flow .ns-doc-box { border: none !important; }

/* Avoid awkward breaks: keep table rows + signatory blocks together */
.ns-posting-table tr,
.ns-approver-section,
.ns-org-header,
.ns-title-block { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="pdf-page-frame"></div>
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

    /** Concatenate every same-origin stylesheet loaded into the page. */
    private collectDocumentStyles(): string {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
            } catch { /* cross-origin — skip */ }
        }
        return out.join('\n');
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

        const refHtml = this.fixBanglaWordBreaks(this.noteSheet.referenceNumber ?? '');
        const refBlocks = refHtml ? this.parseHtmlToContentBlocks(refHtml) : [];

        const mainHtml = this.fixBanglaWordBreaks(this.noteSheet.mainText ?? '');
        const mainBlocks = this.parseHtmlToContentBlocks(mainHtml);

        const model: NotesheetDocumentModel = {
            isBangla: bn,
            subject: this.noteSheet.subject ?? '',
            referenceBlocks: refBlocks,
            referenceLabel: bn ? 'সূত্রঃ ' : 'Reference: ',
            dateLabel: bn ? 'তারিখঃ ' : 'Date: ',
            dateValue: this.formatDate(this.noteSheet.noteSheetDate),
            mainSerialText: this.serial(1),
            mainBlocks,
            closingText: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.',
            approvers: [],
            enclLabel: '',
            enclNoLabel: ''
        };
        if (this.noteSheet.note) model.note = this.noteSheet.note;

        // Add members table info to model
        if (this.previewMembersRows.length > 0 && this.previewMembersColumns.length > 0) {
            (model as any).membersColumns = this.previewMembersColumns;
            (model as any).membersRows = this.previewMembersRows;
        }
        // Add last text / paragraphText
        if (this.noteSheet.paragraphText) {
            (model as any).lastText = this.noteSheet.paragraphText;
            (model as any).lastTextSerial = this.serial(this.lastTextSerial);
        }
        // Note serial
        if (this.noteSheet.note) {
            (model as any).noteSerial = this.serial(this.noteSerial);
        }

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

        for (let i = 0; i < this.approversDetails.length; i++) {
            const a = this.approversDetails[i];
            const role = bn ? (a.appointmentBN || a.appointment) : a.appointment;
            const remark = this.getApproverRemark(a.step);
            const approverDate = this.getApproverDate(a.step);
            model.approvers.push({
                role,
                serialText: this.serial(this.approverStartSerial + i),
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
                if (text) blocks.push({ type: 'paragraph', text, runs: [{ text }], indent: 'normal' });
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
                        const liEl = li as HTMLElement;
                        const runs = this.extractInlineRuns(liEl);
                        const plainText = runs.map(r => r.text).join('').trim();
                        if (!plainText) return;
                        listCounter++;
                        const listType = liEl.getAttribute('data-list') || (tag === 'ol' ? 'ordered' : 'bullet');
                        const prefix = this.getListPrefix(listType, listCounter);
                        // Prepend the prefix as a non-formatted run so it doesn't inherit formatting
                        const prefixedRuns: InlineRun[] = [{ text: prefix }, ...runs];
                        blocks.push({
                            type: 'list',
                            text: `${prefix}${plainText}`,
                            runs: prefixedRuns,
                            indent: 'list',
                            alignment
                        });
                    });
                } else {
                    // Extract inline runs to preserve per-segment bold/italic/underline
                    const headingBold = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
                    const baseBold = headingBold || ['strong', 'b'].includes(tag);
                    const baseItalic = ['em', 'i'].includes(tag);
                    const runs = this.extractInlineRuns(el, baseBold, baseItalic);
                    const plainText = runs.map(r => r.text).join('').trim();
                    if (plainText) {
                        blocks.push({ type: 'paragraph', text: plainText, runs, indent: 'normal', alignment });
                    }
                }
            }
        }
        return blocks;
    }

    /** Walk DOM node recursively and emit inline runs preserving per-segment bold/italic/underline. */
    private extractInlineRuns(root: Node, inheritedBold = false, inheritedItalic = false, inheritedUnderline = false): InlineRun[] {
        const collected: InlineRun[] = [];

        const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean): void => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = this.normalizeTextForWord(node.textContent || '');
                if (text) collected.push({ text, bold, italic, underline });
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const element = node as HTMLElement;
            const tag = element.tagName.toLowerCase();
            if (tag === 'br') { collected.push({ text: ' ', bold, italic, underline }); return; }

            const fw = (element.style?.fontWeight || '').toLowerCase();
            const fs = (element.style?.fontStyle || '').toLowerCase();
            const td = (element.style?.textDecoration || '').toLowerCase();
            const isBold = bold
                || ['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
                || fw === 'bold' || fw === 'bolder' || fw === '600' || fw === '700' || fw === '800' || fw === '900';
            const isItalic = italic || ['em', 'i'].includes(tag) || fs === 'italic' || fs === 'oblique';
            const isUnderline = underline || tag === 'u' || td.includes('underline');

            for (const child of Array.from(element.childNodes)) {
                walk(child, isBold, isItalic, isUnderline);
            }
        };

        walk(root, inheritedBold, inheritedItalic, inheritedUnderline);

        // Merge consecutive runs sharing identical formatting
        const merged: InlineRun[] = [];
        for (const r of collected) {
            const last = merged[merged.length - 1];
            if (last && !!last.bold === !!r.bold && !!last.italic === !!r.italic && !!last.underline === !!r.underline) {
                last.text += r.text;
            } else {
                merged.push({ ...r });
            }
        }

        // Trim leading/trailing whitespace-only runs and inner edges
        while (merged.length && !merged[0].text.replace(/\s/g, '')) merged.shift();
        while (merged.length && !merged[merged.length - 1].text.replace(/\s/g, '')) merged.pop();
        if (merged.length) {
            merged[0].text = merged[0].text.replace(/^\s+/, '');
            merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
        }
        return merged;
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
        // Font sizes in half-points: title/org=9pt(18), body=8pt(16), table=7pt(14), sig=9pt(18)
        const titleSize = 18;   // 9pt — title, org header
        const bodySize = 16;    // 8pt — main text, reference, note, notesheet no, subject
        const tblSize = 14;     // 7pt — members table content
        const sigSize = 18;     // 9pt — signature sections
        const csTitle = bn ? titleSize : undefined;
        const csBody = bn ? bodySize : undefined;
        const csTbl = bn ? tblSize : undefined;
        const csSig = bn ? sigSize : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;

        // Page size follows the selected option (A4 default / Legal). Margins are
        // 400 twips each side, so the bordered cell width = pageWidth − 800
        // (A4 = 11106, Legal = 11440 twips).
        const wordIsLegal = this.selectedPageSize === 'Legal';
        const wordPageWidth = wordIsLegal ? 12240 : 11906;
        const wordPageHeight = wordIsLegal ? 20160 : 16838;
        const wordCellWidth = wordPageWidth - 800;

        const mainChildren: (Paragraph | Table)[] = [];

        // Org header (9pt)
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine1(), bold: true, size: titleSize, sizeComplexScript: csTitle, font, language: lang })],
            alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }
        }));
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine2(), bold: true, size: titleSize, sizeComplexScript: csTitle, font, language: lang, underline: {} })],
            alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }
        }));

        // Notesheet number (8pt)
        if (this.noteSheet?.noteSheetNo) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: this.noteSheet.noteSheetNo, size: bodySize, sizeComplexScript: csBody, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 60, after: 40 }
            }));
        }

        // Subject (8pt)
        if (model.subject) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.subject, bold: true, underline: {}, size: bodySize, sizeComplexScript: csBody, font, language: lang })],
                spacing: { before: 20, after: 60 },
                indent: { left: 240 }
            }));
        }

        // Reference / Date (8pt)
        const refs = this.parsedReferences;
        if (refs.length === 1) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${model.referenceLabel} `, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang }),
                    new TextRun({ text: refs[0], size: bodySize, sizeComplexScript: csBody, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
        } else if (refs.length > 1) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.referenceLabel, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang })],
                indent: { left: 240 }, spacing: { after: 40 }
            }));
            for (let ri = 0; ri < refs.length; ri++) {
                mainChildren.push(new Paragraph({
                    children: [
                        new TextRun({ text: `${this.refSerialLabel(ri)} `, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang }),
                        new TextRun({ text: refs[ri], size: bodySize, sizeComplexScript: csBody, font, language: lang })
                    ],
                    indent: { left: 480 }, spacing: { after: 40 }
                }));
            }
        } else if (this.noteSheet?.noteSheetDate) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: model.dateLabel, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang }),
                    new TextRun({ text: model.dateValue, size: bodySize, sizeComplexScript: csBody, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }
            }));
        }

        // Merge serial (১।) with first text block so they appear inline (matches posting style)
        if (model.mainBlocks.length > 0 && model.mainBlocks[0].type === 'paragraph' && model.mainBlocks[0].text) {
            const firstBlock = model.mainBlocks[0];
            const serialRun = new TextRun({ text: `${model.mainSerialText}  `, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang });
            const contentRuns = (firstBlock.runs && firstBlock.runs.length > 0)
                ? firstBlock.runs.map(r => new TextRun({
                    text: r.text,
                    bold: r.bold,
                    italics: r.italic,
                    underline: r.underline ? {} : undefined,
                    size: bodySize,
                    sizeComplexScript: csBody,
                    font,
                    language: lang
                }))
                : [new TextRun({ text: firstBlock.text!, bold: firstBlock.bold, italics: firstBlock.italic, size: bodySize, sizeComplexScript: csBody, font, language: lang })];
            mainChildren.push(new Paragraph({
                children: [serialRun, ...contentRuns],
                indent: { left: 240 }, spacing: { before: 160, after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
            if (model.mainBlocks.length > 1) {
                mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks.slice(1), font, bn));
            }
        } else {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.mainSerialText, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 160, after: 40 }
            }));
            mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));
        }

        // Members table (if any)
        const mModel = model as any;
        if (mModel.membersColumns?.length > 0 && mModel.membersRows?.length > 0) {
            const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
            const cols = mModel.membersColumns as { key: string; label: string; mergedFrom?: string[] }[];
            const slLabel = bn ? 'ক্রমিক' : 'SL';
            const bnDigits = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
            const convertDigits = (s: string) => bn && /\d/.test(s) ? s.replace(/\d/g, d => bnDigits[+d]) : s;
            const rows = mModel.membersRows as Record<string, string>[];

            // Use saved width% from JSON if available; otherwise distribute proportionally by content
            const hasCustomWidths = cols.some((c: any) => c.width != null);
            let slPct: number;
            let colPcts: number[];
            if (hasCustomWidths) {
                const defaultPct = Math.round(((100 - 5) / cols.length) * 10) / 10;
                slPct = 5;
                colPcts = cols.map((c: any) => c.width ?? defaultPct);
            } else {
                const colMaxLens = cols.map(c => {
                    let max = c.label.length;
                    for (const row of rows) {
                        const val = c.mergedFrom ? c.mergedFrom.map((k: string) => row[k] || '').filter(Boolean).join(' ') : (row[c.key] || '');
                        if (val.length > max) max = val.length;
                    }
                    return Math.max(max, 2);
                });
                const slMaxLen = Math.max(slLabel.length, String(rows.length).length, 2);
                const totalLen = slMaxLen + colMaxLens.reduce((a, b) => a + b, 0);
                slPct = Math.round((slMaxLen / totalLen) * 100);
                colPcts = colMaxLens.map(l => Math.round((l / totalLen) * 100));
            }

            const mkWidth = (pct: number) => ({ size: pct, type: WidthType.PERCENTAGE });
            const slHeaderCell = new TableCell({ width: mkWidth(slPct), children: [new Paragraph({ children: [new TextRun({ text: slLabel, bold: true, size: tblSize, sizeComplexScript: csTbl, font, language: lang })], alignment: AlignmentType.CENTER })], borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
            const headerRow = new TableRow({
                children: [slHeaderCell, ...cols.map((c, ci) => new TableCell({ width: mkWidth(colPcts[ci]), children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true, size: tblSize, sizeComplexScript: csTbl, font, language: lang })], alignment: AlignmentType.CENTER })], borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } }))]
            });
            const dataRows = rows.map((row: Record<string, string>, ri: number) => {
                const slVal = bn ? String(ri + 1).replace(/\d/g, d => bnDigits[+d]) : String(ri + 1);
                const slCell = new TableCell({ width: mkWidth(slPct), children: [new Paragraph({ children: [new TextRun({ text: slVal, size: tblSize, sizeComplexScript: csTbl, font, language: lang })], alignment: AlignmentType.CENTER })], borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
                return new TableRow({
                    children: [slCell, ...cols.map((c, ci) => {
                        let val = c.mergedFrom ? c.mergedFrom.map((k: string) => row[k] || '').filter(Boolean).join(' ') : (row[c.key] || '');
                        val = convertDigits(val);
                        return new TableCell({ width: mkWidth(colPcts[ci]), children: [new Paragraph({ children: [new TextRun({ text: val, size: tblSize, sizeComplexScript: csTbl, font, language: lang })], alignment: AlignmentType.CENTER })], borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder } });
                    })]
                });
            });
            mainChildren.push(new Table({
                layout: TableLayoutType.FIXED,
                indent: { size: 240, type: WidthType.DXA },
                width: { size: 97, type: WidthType.PERCENTAGE },
                rows: [headerRow, ...dataRows]
            }));
        }

        // Note (with serial, rendered as HTML content blocks)
        if (model.note) {
            const noteSerial = mModel.noteSerial || '';
            const noteBlocks = this.parseHtmlToContentBlocks(this.fixBanglaWordBreaks(model.note));
            if (noteBlocks.length > 0 && noteBlocks[0].type === 'paragraph' && noteBlocks[0].text) {
                const firstBlock = noteBlocks[0];
                const serialRun = new TextRun({ text: `${noteSerial}  `, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang });
                const contentRuns = (firstBlock.runs?.length)
                    ? firstBlock.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, size: bodySize, sizeComplexScript: csBody, font, language: lang }))
                    : [new TextRun({ text: firstBlock.text!, size: bodySize, sizeComplexScript: csBody, font, language: lang })];
                mainChildren.push(new Paragraph({
                    children: [serialRun, ...contentRuns],
                    indent: { left: 240 }, spacing: { before: 80, after: 80 }, alignment: AlignmentType.JUSTIFIED
                }));
                if (noteBlocks.length > 1) {
                    mainChildren.push(...this.contentBlocksToDocx(noteBlocks.slice(1), font, bn));
                }
            } else {
                // Fallback: plain text
                const plainNote = this.stripHtml(model.note);
                mainChildren.push(new Paragraph({
                    children: [
                        new TextRun({ text: noteSerial + ' ', bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang }),
                        new TextRun({ text: plainNote, size: bodySize, sizeComplexScript: csBody, font, language: lang })
                    ],
                    indent: { left: 240 }, spacing: { before: 80, after: 80 }
                }));
            }
        }

        // Last Text (paragraphText) with serial
        if (mModel.lastText) {
            const ltBlocks = this.parseHtmlToContentBlocks(this.fixBanglaWordBreaks(mModel.lastText));
            if (ltBlocks.length > 0 && ltBlocks[0].type === 'paragraph' && ltBlocks[0].text) {
                const firstBlock = ltBlocks[0];
                const serialRun = new TextRun({ text: `${mModel.lastTextSerial}  `, bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang });
                const contentRuns = (firstBlock.runs?.length)
                    ? firstBlock.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, size: bodySize, sizeComplexScript: csBody, font, language: lang }))
                    : [new TextRun({ text: firstBlock.text!, size: bodySize, sizeComplexScript: csBody, font, language: lang })];
                mainChildren.push(new Paragraph({
                    children: [serialRun, ...contentRuns],
                    indent: { left: 240 }, spacing: { before: 160, after: 80 }, alignment: AlignmentType.JUSTIFIED
                }));
                if (ltBlocks.length > 1) {
                    mainChildren.push(...this.contentBlocksToDocx(ltBlocks.slice(1), font, bn));
                }
            } else {
                mainChildren.push(new Paragraph({
                    children: [
                        new TextRun({ text: mModel.lastTextSerial + ' ', bold: true, size: bodySize, sizeComplexScript: csBody, font, language: lang }),
                        new TextRun({ text: this.stripHtml(mModel.lastText), size: bodySize, sizeComplexScript: csBody, font, language: lang })
                    ],
                    indent: { left: 240 }, spacing: { before: 160, after: 80 }
                }));
            }
        }

        // Initiator — right-positioned (via left indent), keep entire block together
        if (model.initiator) {
            const initIndent = { left: 7800 };
            // Signature image or spacer
            if (model.initiator.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(model.initiator.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 280, after: 80 },
                        keepNext: true, keepLines: true
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ spacing: { before: 280, after: 80 }, keepNext: true }));
            }

            // Name
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
            }));

            // Rank
            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Appointment
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Date (last item — no keepNext needed)
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 400 }
                }));
            }
        }

        // Approvers — 9pt
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 280 }, keepNext: true, keepLines: true
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: sigSize, sizeComplexScript: csSig, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, size: sigSize, sizeComplexScript: csSig, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, indent: { left: 240 }, keepNext: true }));
            if (ap.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(ap.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 40 },
                        keepNext: true
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 }, keepNext: true }));
            }
            if (ap.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: ap.date, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.CENTER
                }));
            }
        }

        // Title paragraphs — placed at top of the left (main) cell, INSIDE the outer border
        const titleChildren: Paragraph[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: titleSize, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: titleSize, font: 'Nirmala UI' })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }, keepNext: true
            }),
        ];

        // Outer bordered table: single cell (full width, no sanglagni column)
        const thickBorder = { style: BorderStyle.SINGLE, size: 12, color: '000000' } as const;
        // ≈ full page content height (page height − 2×400 twip margins), so the
        // border stretches the page. Smaller for A4 so it does not overflow.
        const rowHeight = wordIsLegal ? 19200 : 15900;

        const outerTable = new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [wordCellWidth],
            rows: [new TableRow({
                cantSplit: false,
                height: { value: rowHeight, rule: HeightRule.ATLEAST },
                children: [
                    new TableCell({
                        width: { size: wordCellWidth, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
                        margins: { top: 60, bottom: 60, left: 120, right: 120 },
                        verticalAlign: VerticalAlign.TOP,
                        children: [...titleChildren, ...mainChildren]
                    })
                ]
            })]
        });

        const docChildren: (Paragraph | Table)[] = [outerTable];

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { width: wordPageWidth, height: wordPageHeight, orientation: PageOrientation.PORTRAIT },
                        margin: { top: 400, right: 400, bottom: 400, left: 400 }
                    }
                },
                children: docChildren
            }]
        });
    }

    /** Normalize text for Word: replace non-breaking space and ZWSP so Word breaks at word boundaries (Bangla). */
    private normalizeTextForWord(s: string): string {
        return s.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }

    /** Convert shared content blocks to docx Paragraph/Table elements. */
    private contentBlocksToDocx(blocks: ContentBlock[], font: any, bn: boolean): (Paragraph | Table)[] {
        const result: (Paragraph | Table)[] = [];
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const csBody = bn ? 20 : undefined;

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
                // Align body paragraphs with the first "১।" paragraph's left indent (240 twips)
                const indent = b.indent === 'list' ? { left: 480 } : { left: 240 };
                const children = (b.runs && b.runs.length > 0)
                    ? b.runs.map(r => new TextRun({
                        text: r.text,
                        bold: r.bold,
                        italics: r.italic,
                        underline: r.underline ? {} : undefined,
                        size: 20,
                        sizeComplexScript: csBody,
                        font,
                        language: lang
                    }))
                    : [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: 20, sizeComplexScript: csBody, font, language: lang })];
                result.push(new Paragraph({
                    children,
                    indent,
                    spacing: { after: b.indent === 'list' ? 60 : 80 },
                    alignment: align
                } as any));
            }
        }
        return result;
    }

    // ── List prefix helpers for Word export ──────────────────────
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

    // ── Convert data URL to Uint8Array for ImageRun ───────────
    private base64ToBytes(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    /**
     * Page-size dropdown changed (A4 ⇄ Legal). Reset cached pagination geometry so
     * ngAfterViewChecked re-measures the re-styled content against the new page height.
     */
    onPageSizeChange(): void {
        this.pageContentHeightPx = 0;
        this.lastMeasuredHeight = 0;
        this.pageOffsets = [0];
        this.cdr.detectChanges();
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
        // Visible content height inside the page viewport, per page size:
        //   Legal: 355.6mm − 14mm − 20mm − 2×4mm = 313.6mm; A4: 297mm − … = 255mm
        const visibleH = this.selectedPageSize === 'Legal' ? '313.6mm' : '255mm';
        const testDiv = document.createElement('div');
        testDiv.style.cssText = `position:absolute;left:-9999px;width:1mm;height:${visibleH};visibility:hidden`;
        document.body.appendChild(testDiv);
        const heightPx = testDiv.getBoundingClientRect().height;
        document.body.removeChild(testDiv);

        const insetDiv = document.createElement('div');
        insetDiv.style.cssText = 'position:absolute;left:-9999px;width:1mm;height:4mm;visibility:hidden';
        document.body.appendChild(insetDiv);
        this.pageInsetPx = insetDiv.getBoundingClientRect().height;
        document.body.removeChild(insetDiv);

        return heightPx;
    }

    private calculatePageOffsets(totalHeight: number): number[] {
        const container = this.contentMeasure?.nativeElement;
        const pageH = this.pageContentHeightPx;
        if (!container || pageH <= 0) return [0];

        const containerTop = container.getBoundingClientRect().top;

        const titleEl = container.querySelector('.ns-title-block') as HTMLElement;
        const docBox = container.querySelector('.ns-doc-box') as HTMLElement;
        this.titleBlockHeightPx = docBox
            ? docBox.getBoundingClientRect().top - containerTop
            : titleEl ? titleEl.getBoundingClientRect().height + 8 : 0;

        const firstPageH = pageH - this.titleBlockHeightPx;
        if (totalHeight <= firstPageH + this.titleBlockHeightPx) return [this.titleBlockHeightPx];

        const keepTogether = Array.from(
            container.querySelectorAll(
                '.ns-title-block, .ns-title-area, .ns-org-header, .ns-note, .ns-initiator-area, .ns-approver-section'
            ) as NodeListOf<HTMLElement>
        ).map(el => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top - containerTop, bottom: rect.top - containerTop + rect.height, height: rect.height };
        }).filter(b => b.height > 0 && b.height < pageH)
          .sort((a, b) => a.top - b.top);

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

        const offsets: number[] = [this.titleBlockHeightPx];
        let cursor = this.titleBlockHeightPx;
        let isFirstPage = true;

        while (cursor < totalHeight) {
            const currentPageH = isFirstPage ? firstPageH : pageH;
            if (cursor + currentPageH >= totalHeight) break;

            let nextBreak = cursor + currentPageH;

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

            if (nextBreak <= cursor) nextBreak = cursor + currentPageH;

            cursor = nextBreak;
            if (cursor < totalHeight) {
                offsets.push(cursor);
            }
            isFirstPage = false;
        }

        return offsets;
    }

    getPageCoverHeight(pageIndex: number): number {
        if (pageIndex >= this.pageOffsets.length - 1) return 0;
        const usedHeight = this.pageOffsets[pageIndex + 1] - this.pageOffsets[pageIndex];
        const availHeight = pageIndex === 0
            ? this.pageContentHeightPx - this.titleBlockHeightPx
            : this.pageContentHeightPx;
        return Math.max(0, availHeight - usedHeight + this.pageInsetPx);
    }

    // ── Format Date as yyyy-MM-dd for backend DateOnly ───────
    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}
