import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions, ApprovalStatus, NoteSheetRemarkAction, NoteSheetPreviewFrom, ApprovalLogAction, ApprovalLogActionOptions } from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { environment } from '@/Core/Environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-general.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewGeneralComponent extends NotesheetPreviewBase implements AfterViewChecked {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;


    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;
    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);
    private confirmationService = inject(ConfirmationService);
    private sharedService = inject(SharedService);

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
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee list.' });
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
                    this.lastMeasuredHeight = 0;
                    this.reloadNoteSheet();
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update note-sheet.' });
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
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload files.' });
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
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        super.ngOnInit();
        this.route.queryParams.subscribe(params => {
            this.fromPending = (params['from'] ?? '').toString().toLowerCase() === NoteSheetPreviewFrom.Pending;
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
                    this.router.navigate(['/notesheet-list/pending']);
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

        for (let i = 0; i < this.approversDetails.length; i++) {
            const a = this.approversDetails[i];
            const role = bn ? (a.appointmentBN || a.appointment) : a.appointment;
            const remark = this.getApproverRemark(a.step);
            const approverDate = this.getApproverDate(a.step);
            model.approvers.push({
                role,
                serialText: this.serial(i + 2),
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
        const csSize = bn ? 20 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;

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
        if (model.subject) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.subject, bold: true, underline: {}, size: 20, sizeComplexScript: csSize, font, language: lang })],
                spacing: { before: 20, after: 60 },
                indent: { left: 240 }
            }));
        }

        // Reference / Date (general-specific) — label + first content block merged inline
        if (model.referenceBlocks.length > 0) {
            const labelRun = new TextRun({ text: `${model.referenceLabel} `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang });
            const firstRefBlock = model.referenceBlocks[0];
            if (firstRefBlock.type === 'paragraph' && (firstRefBlock.text || (firstRefBlock.runs && firstRefBlock.runs.length > 0))) {
                const contentRuns = (firstRefBlock.runs && firstRefBlock.runs.length > 0)
                    ? firstRefBlock.runs.map(r => new TextRun({
                        text: r.text,
                        bold: r.bold,
                        italics: r.italic,
                        underline: r.underline ? {} : undefined,
                        size: 20,
                        sizeComplexScript: csSize,
                        font,
                        language: lang
                    }))
                    : [new TextRun({ text: firstRefBlock.text!, bold: firstRefBlock.bold, italics: firstRefBlock.italic, size: 20, sizeComplexScript: csSize, font, language: lang })];
                mainChildren.push(new Paragraph({
                    children: [labelRun, ...contentRuns],
                    indent: { left: 240 }, spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED
                }));
                if (model.referenceBlocks.length > 1) {
                    mainChildren.push(...this.contentBlocksToDocx(model.referenceBlocks.slice(1), font, bn));
                }
            } else {
                // First block is not a simple paragraph (e.g. list/table) — render label alone then all blocks
                mainChildren.push(new Paragraph({
                    children: [labelRun],
                    indent: { left: 240 }, spacing: { after: 40 }
                }));
                mainChildren.push(...this.contentBlocksToDocx(model.referenceBlocks, font, bn));
            }
        } else if (this.noteSheet?.referenceNumber) {
            const plain = this.stripHtml(this.noteSheet.referenceNumber ?? '');
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${model.referenceLabel} `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: plain, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
        } else if (this.noteSheet?.noteSheetDate) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: model.dateLabel, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: model.dateValue, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }
            }));
        }

        // Merge serial (১।) with first text block so they appear inline (matches posting style)
        if (model.mainBlocks.length > 0 && model.mainBlocks[0].type === 'paragraph' && model.mainBlocks[0].text) {
            const firstBlock = model.mainBlocks[0];
            const serialRun = new TextRun({ text: `${model.mainSerialText}  `, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang });
            const contentRuns = (firstBlock.runs && firstBlock.runs.length > 0)
                ? firstBlock.runs.map(r => new TextRun({
                    text: r.text,
                    bold: r.bold,
                    italics: r.italic,
                    underline: r.underline ? {} : undefined,
                    size: 20,
                    sizeComplexScript: csSize,
                    font,
                    language: lang
                }))
                : [new TextRun({ text: firstBlock.text!, bold: firstBlock.bold, italics: firstBlock.italic, size: 20, sizeComplexScript: csSize, font, language: lang })];
            mainChildren.push(new Paragraph({
                children: [serialRun, ...contentRuns],
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

        // Note
        if (model.note) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: model.note, size: 20, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 80, after: 80 }
            }));
        }

        // Closing text
        if (model.closingText) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.closingText, size: 20, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240, firstLine: 480 }, spacing: { before: 200 }
            }));
        }

        // Initiator — right-positioned (via left indent), keep entire block together
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
                        alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 280, after: 80 },
                        keepNext: true, keepLines: true
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ spacing: { before: 280, after: 80 }, keepNext: true }));
            }

            // Name
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
            }));

            // Rank
            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Appointment
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Date (last item — no keepNext needed)
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 400 }
                }));
            }
        }

        // Approvers — keep each approver block together
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: 20, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 280 }, keepNext: true, keepLines: true
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, size: 20, sizeComplexScript: csSize, font, language: lang }));
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
                    children: [new TextRun({ text: ap.date, size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER
                }));
            }
        }

        // Title paragraphs — placed at top of the left (main) cell, INSIDE the outer border
        const titleChildren: Paragraph[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 24, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }, keepNext: true
            }),
        ];

        // Sanglagni (right narrow column) header content
        const sanglagniChildren: Paragraph[] = bn
            ? [
                new Paragraph({
                    children: [new TextRun({ text: 'সংলগ্নী', size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'নং', size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }
                })
            ]
            : [
                new Paragraph({
                    children: [new TextRun({ text: 'Encl.', size: 20, font: 'Times New Roman' })],
                    alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }
                }),
                new Paragraph({
                    children: [new TextRun({ text: 'No.', size: 20, font: 'Times New Roman' })],
                    alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }
                })
            ];

        // Outer bordered table: main cell (wide) | sanglagni cell (narrow)
        // Legal page 12240w − margins 400×2 = 11440 usable → split ~10640 + 800
        // HeightRule.ATLEAST makes the row tall enough so the outer borders span the full page
        // When content exceeds the row, Word splits the row across pages and re-draws the
        // table borders (top/bottom/left/right) on every page piece.
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
        const thickBorder = { style: BorderStyle.SINGLE, size: 12, color: '000000' } as const;
        const rowHeight = 19200; // ≈ full legal page content height (20160 − top/bottom margins)

        const outerTable = new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [10640, 800],
            rows: [new TableRow({
                cantSplit: false,
                height: { value: rowHeight, rule: HeightRule.ATLEAST },
                children: [
                    new TableCell({
                        width: { size: 10640, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: noBorder },
                        margins: { top: 60, bottom: 60, left: 120, right: 120 },
                        verticalAlign: VerticalAlign.TOP,
                        children: [...titleChildren, ...mainChildren]
                    }),
                    new TableCell({
                        width: { size: 800, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
                        verticalAlign: VerticalAlign.TOP,
                        children: sanglagniChildren
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
                        size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT },
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
                // Align body paragraphs with the first "১।" paragraph's left indent (240 twips)
                const indent = b.indent === 'list' ? { left: 480 } : { left: 240 };
                const children = (b.runs && b.runs.length > 0)
                    ? b.runs.map(r => new TextRun({
                        text: r.text,
                        bold: r.bold,
                        italics: r.italic,
                        underline: r.underline ? {} : undefined,
                        size: 20,
                        sizeComplexScript: csSize,
                        font,
                        language: lang
                    }))
                    : [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: 20, sizeComplexScript: csSize, font, language: lang })];
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
        const testDiv = document.createElement('div');
        testDiv.style.cssText = 'position:absolute;left:-9999px;width:1mm;height:313.6mm;visibility:hidden';
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
