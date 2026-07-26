import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService, TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';

import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TreeSelectModule } from 'primeng/treeselect';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions, ApprovalStatus, NoteSheetRemarkAction, NoteSheetType, ApprovalLogAction, ApprovalLogActionOptions, DraftPostingStatus, NoteSheetPreviewFrom } from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { DraftPostingEmployeeRow, EmployeeRemovalInfo, CancelledInterPostingInfo } from '@/models/posting.model';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { JsReportService } from '@/services/jsreport.service';
import { environment } from '@/Core/Environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun, VerticalMergeType
} from 'docx';
import { saveAs } from 'file-saver';

import type {
    NotesheetDocumentModel,
    ContentBlock,
    InlineRun,
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
    selector: 'app-notesheet-preview-posting',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, ConfirmDialogModule, DialogModule, TableModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, CheckboxModule, DatePickerModule, TreeSelectModule, FlexibleDateDirective,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent, NotesheetApproverSelectComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-posting.html',
    styleUrls: ['../notesheet-preview.scss', './notesheet-preview-posting.scss']
})
export class NotesheetPreviewPostingComponent extends NotesheetPreviewBase implements AfterViewChecked {


    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;
    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);
    private confirmationService = inject(ConfirmationService);
    private sharedService = inject(SharedService);
    private jsreportService = inject(JsReportService);

    /** Loading flag for the "Print Preview" (JsReport) button. */
    exportingPdfJsReport = false;

    // ── Submit for approval state ─────────────────────────────
    submitting = false;
    readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;

    // ── Pending-list inline actions (only when opened from pending list) ─
    /** True when this preview was opened from /notesheet-list/pending-new-posting (or any pending list). */
    fromPending = false;
    /** The list URL to return to after an approval action (e.g. /notesheet-list/my-approval-new-posting). */
    returnUrl: string | null = null;
    currentUserEmployeeId = 0;

    // Remark dialog (Approve / Decline / Back)
    showRemarkDialog = false;
    remarkAction: NoteSheetRemarkAction | null = null;
    remarkText = '';
    actionSubmitting = false;
    readonly NoteSheetRemarkAction = NoteSheetRemarkAction;

    // View Members dialog
    showMembersDialog = false;
    membersLoading = false;
    membersList: DraftPostingEmployeeRow[] = [];
    membersNoteSheetNo = '';
    selectedMembers: DraftPostingEmployeeRow[] = [];
    removingMembers = false;

    // Approval Log dialog
    showApprovalLogDialog = false;
    approvalLogEntries: ApprovalLogEntry[] = [];
    approvalLogLoading = false;
    approvalLogNoteSheetNo = '';
    readonly ApprovalLogAction = ApprovalLogAction;

    // ── Pagination ─────────────────────────────────────────────
    pageOffsets: number[] = [0];
    /** Index-aligned with pageOffsets: true when the page opens inside the employee
     *  table body, so the column header (<thead>) is repeated at the top of that page. */
    pageNeedsTableHeader: boolean[] = [false];
    /** Measured height (px) of the employee table's <thead>, reserved as header space
     *  on continuation pages so repeated headers don't overlap the first row. */
    tableHeaderHeightPx = 0;
    pageContentHeightPx = 0;
    titleBlockHeightPx = 0;
    private pageInsetPx = 0;
    private lastMeasuredHeight = 0;

    // ── Button visibility (configurable by parent) ───────────
    @Input() showEdit = true;
    @Input() showWord = true;
    @Input() showPdf = true;

    // ── Page size for export ──────────────────────────────────
    pageSizeOptions = [
        { label: 'A4', value: 'A4' },
        { label: 'Legal', value: 'Legal' }
    ];
    selectedPageSize = 'A4';

    // ── Export detail toggles ──────────────────────────────────
    showRankQualifications = true;
    /** Show/hide the whole Trade column (header + cells) across preview / print / PDF / Word. */
    showTradeColumn = true;
    showTradeRemarks = true;
    showOwnDistrictDetail = true;
    showSpouseDistrictDetail = true;
    showPrevWorkplaceDetail = true;
    showRemarks = true;
    /** Inter-posting only: show/hide the "র‌্যাবে অবস্থানকাল" (Tenure in RAB) column
     *  group — Joining Date + Duration (Year/Month/Day). Header collapses to one row when off. */
    showTenure = true;
    showSignatureImage = true;
    showCorps = true;
    showProfQualification = true;
    showGallantryAwards = true;

    // ── Edit state ───────────────────────────────────────────
    editing = false;
    saving = false;

    // ── RAB Unit dropdown options ─────────────────────────────
    rabUnitOptions: { label: string; value: number }[] = [];

    // ── RAB Unit tree select ────────────────────────────────
    private orgService = inject(OrgService);
    unitTreeNodes: TreeNode[] = [];
    selectedUnitNodes: Record<number, TreeNode | null> = {};
    private unitNodeMap: Record<number, TreeNode> = {};

    // ── Remarks: original (from draft posting) + new (added in edit mode) ──
    originalRemarks: Record<number, string> = {};
    newRemarks: Record<number, string> = {};

    // ── Removal history (previous posting order info) ──
    removalHistoryMap: Record<number, EmployeeRemovalInfo> = {};
    /** Last cancelled inter posting per employee — drives the "previous transfer order may be cancelled" note. */
    cancelledInterMap: Record<number, CancelledInterPostingInfo> = {};

    protected override onPostingEmployeesLoaded(employees: DraftPostingEmployeeRow[]): void {
        this.loadRemovalHistory(employees);
        this.loadCancelledInterPosting(employees);
    }

    private loadCancelledInterPosting(emps: { employeeId: number }[]): void {
        const ids = emps.map(e => e.employeeId).filter(Boolean);
        if (ids.length === 0) return;
        const postingType = this.isInterPosting() ? NoteSheetType.InterPosting : NoteSheetType.NewPosting;
        this.postingService.getLastCancelledInterPostingByEmployeeIds(ids, postingType).subscribe({
            next: (list) => {
                this.cancelledInterMap = {};
                for (const item of (list ?? [])) {
                    if (item.postingOrderNo) this.cancelledInterMap[item.employeeId] = item;
                }
            },
            error: () => {}
        });
    }

    private loadRemovalHistory(emps: { employeeId: number }[]): void {
        const ids = emps.map(e => e.employeeId).filter(Boolean);
        if (ids.length === 0) return;
        this.postingService.getRemovalHistoryByEmployeeIds(ids).subscribe({
            next: (list) => {
                this.removalHistoryMap = {};
                for (const item of (list ?? [])) {
                    if (item.postingOrderNo || item.draftPostingNo) {
                        this.removalHistoryMap[item.employeeId] = item;
                    }
                }
            },
            error: () => {}
        });
    }

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

    /** Human-readable label for current status, used by the top-right status chip in preview */
    get currentStatusLabel(): string {
        const status = this.noteSheet?.currentStatus?.toLowerCase() ?? '';
        if (!status) return '';
        return NoteSheetCurrentStatusOptions.find(o => o.value === status)?.label ?? status;
    }

    /**
     * Dynamic label for the current approval step — used on the inline
     * Approve / Decline / Back buttons so they read e.g.
     *   "Approve as Initiator"
     *   "Approve as Recommender 1"  (if there are multiple recommenders)
     *   "Approve as Recommender"    (if only one)
     *   "Approve as Final Approver"
     * based on `noteSheet.currentStatus` and the pending recommender index.
     */
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
                        // First recommender whose status is still pending (or blank) is the current step
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

    // ── Submit for approval (from preview top-right) ─────────
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

    // ══════════════════════════════════════════════════════════════════
    //  Pending-list inline actions (only active when fromPending === true)
    //  Mirrors the Approve / Decline / Back / View Members / Approval Log
    //  behaviour from notesheet-list so the same actions are available
    //  without leaving the preview page.
    // ══════════════════════════════════════════════════════════════════

    override ngOnInit(): void {
        super.ngOnInit();
        // Detect `from=pending` query param to enable inline approval actions
        this.route.queryParams.subscribe(params => {
            this.fromPending = (params['from'] ?? '').toString().toLowerCase() === NoteSheetPreviewFrom.Pending;
            this.returnUrl = params['returnUrl'] ?? null;
        });
        // Resolve current user's employee id (needed for Approve/Decline/Back APIs)
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

    // ── Approve / Decline / Back: remark dialog ─────────────────────
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

        // Before Approve on a posting notesheet: validate all members have a transfer unit
        if (this.remarkAction === NoteSheetRemarkAction.Approve
            && (this.noteSheet.noteSheetType === NoteSheetType.InterPosting || this.noteSheet.noteSheetType === NoteSheetType.NewPosting)
            && this.noteSheet.draftPostingMasterId) {
            const employees$ = this.noteSheet.noteSheetType === NoteSheetType.InterPosting
                ? this.postingService.getDraftInterPostingEmployees(this.noteSheet.draftPostingMasterId)
                : this.postingService.getDraftPostingEmployees(this.noteSheet.draftPostingMasterId);
            employees$.subscribe({
                next: (employees) => {
                    const missing = (employees ?? []).filter((e: any) => !e.transferRabUnitId);
                    if (missing.length > 0) {
                        const names = missing.map((e: any) => e.fullNameEN || e.FullNameEN || e.employeeName || `ID ${e.employeeId ?? e.EmployeeId}`).join(', ');
                        this.messageService.add({
                            severity: 'warn',
                            summary: 'বদলি ইউনিট সেট করা হয়নি',
                            detail: `অনুমোদনের আগে সকল সদস্যের বদলি ইউনিট (Transfer Unit) সেট করতে হবে। যাদের সেট করা হয়নি: ${names}`,
                            life: 8000
                        });
                        return;
                    }
                    this.doSubmitRemark();
                },
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to validate transfer units. Please try again.' });
                }
            });
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
        const ns = this.noteSheet;
        const isFinalApproval = this.remarkAction === NoteSheetRemarkAction.Approve
            && ns.currentStatus === NoteSheetCurrentStatus.FinalApproval;
        const isPostingNoteSheet = (ns.noteSheetType === NoteSheetType.NewPosting || ns.noteSheetType === NoteSheetType.InterPosting) && !!ns.draftPostingMasterId;
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

                    // After final approval of a posting notesheet: update DraftPostingStatus + EmployeeInfo PostingStatus
                    if (isFinalApproval && isPostingNoteSheet) {
                        this.onPostingFinalApproval(ns.draftPostingMasterId!);
                    }

                    // Acted upon — the note-sheet is no longer pending for this user.
                    // Go back to the pending list so the user sees the updated list.
                    const pendingRoute = ns.noteSheetType === NoteSheetType.InterPosting
                        ? '/notesheet-list/pending-inter-posting'
                        : '/notesheet-list/pending-new-posting';
                    this.router.navigateByUrl(this.returnUrl || pendingRoute);
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

    /** After final approval of a posting notesheet, update DraftPostingMaster status and employees PostingStatus. */
    private onPostingFinalApproval(masterId: number): void {
        const isInterPosting = this.noteSheet?.noteSheetType === NoteSheetType.InterPosting;
        const empObs = isInterPosting
            ? this.postingService.getDraftInterPostingEmployees(masterId)
            : this.postingService.getDraftPostingEmployees(masterId);

        empObs.subscribe({
            next: (employees: any[]) => {
                const first = employees?.[0];
                if (first) {
                    const updateObs = isInterPosting
                        ? this.postingService.updateDraftInterPosting(
                            masterId,
                            first.draftInterPostingNo ?? first.draftPostingNo,
                            first.draftInterPostingDate ?? first.draftPostingDate,
                            DraftPostingStatus.Approved
                        )
                        : this.postingService.updateDraftNewPosting(
                            masterId,
                            first.draftPostingNo,
                            first.draftPostingDate,
                            DraftPostingStatus.Approved
                        );
                    updateObs.subscribe({
                        next: () => {},
                        error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to update Draft Posting status.' })
                    });
                }

                // NOTE: employees are NOT set to PendingForJoining here. That happens only
                // when the posting order is APPROVED (PostingOrderService.ApprovePostingOrderAsync),
                // not on note-sheet final approval.
            },
            error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to load posting employees for status update.' })
        });
    }

    // ── View Members dialog ─────────────────────────────────────────
    openViewMembers(): void {
        if (!this.noteSheet?.draftPostingMasterId) return;
        this.membersNoteSheetNo = this.noteSheet.noteSheetNo || '';
        this.membersLoading = true;
        this.membersList = [];
        this.selectedMembers = [];
        this.showMembersDialog = true;

        const obs = this.noteSheet.noteSheetType === NoteSheetType.InterPosting
            ? this.postingService.getDraftInterPostingEmployees(this.noteSheet.draftPostingMasterId)
            : this.postingService.getDraftPostingEmployees(this.noteSheet.draftPostingMasterId);

        const isInter = this.noteSheet.noteSheetType === NoteSheetType.InterPosting;
        obs.subscribe({
            next: (list: any[]) => {
                this.membersList = (list ?? []).map(e => isInter
                    ? { ...e, draftPostingDetailId: e.draftInterPostingDetailId ?? e.draftPostingDetailId }
                    : e
                );
                this.membersLoading = false;
            },
            error: (err: any) => { this.membersLoading = false; }
        });
    }

    removeSelectedMembers(): void {
        if (!this.noteSheet?.draftPostingMasterId || this.selectedMembers.length === 0) return;

        const count = this.selectedMembers.length;
        this.confirmationService.confirm({
            message: `Are you sure you want to remove ${count} employee(s) from this posting list? They will be returned to the supernumerary list.`,
            header: 'Confirm Remove',
            icon: 'pi pi-exclamation-triangle',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => {
                this.removingMembers = true;
                const isInter = this.noteSheet!.noteSheetType === NoteSheetType.InterPosting;
                const detailIds = this.selectedMembers.map(m => m.draftPostingDetailId);

                this.postingService.removeDraftPostingDetails(this.noteSheet!.draftPostingMasterId!, detailIds, isInter).subscribe({
                    next: (res) => {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description || `${count} employee(s) removed.` });
                        this.selectedMembers = [];
                        this.removingMembers = false;
                        // Refresh members list and posting employees
                        this.openViewMembers();
                        if (this.isInterPosting()) {
                            this.loadInterPostingEmployees();
                        } else {
                            this.loadPostingEmployees();
                        }
                    },
                    error: (err: any) => {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || err?.error?.message || 'Failed to remove employees.' });
                        this.removingMembers = false;
                    }
                });
            }
        });
    }

    // ── Approval Log dialog ─────────────────────────────────────────
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

    formatEmployeeDate(d: string | null | undefined): string {
        return this.formatDateShort(d);
    }

    formatJoiningDate(d: string | null | undefined): string {
        return this.formatDateShort(d).replace(/\//g, '-');
    }

    toBnDigits(s: string): string {
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return s.replace(/\d/g, d => bn[+d]);
    }

    calcTenure(joinDateStr: string | null | undefined): { y: number; m: number; d: number } {
        if (!joinDateStr) return { y: 0, m: 0, d: 0 };
        const join = new Date(joinDateStr);
        if (isNaN(join.getTime())) return { y: 0, m: 0, d: 0 };
        const now = new Date();
        let y = now.getFullYear() - join.getFullYear();
        let mo = now.getMonth() - join.getMonth();
        let d = now.getDate() - join.getDate();
        if (d < 0) { mo--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
        if (mo < 0) { y--; mo += 12; }
        return { y, m: mo, d };
    }

    tenure(joinDateStr: string | null | undefined, field: 'y' | 'm' | 'd'): string {
        const n = this.calcTenure(joinDateStr)[field];
        return this.isEnglish() ? String(n) : this.toBnDigits(String(n));
    }

    getInterPrevWorkplace(emp: DraftPostingEmployeeRow): string {
        const bn = !this.isEnglish();
        const parts = [
            bn ? (emp.motherUnitNameBN || emp.motherUnitName || '') : (emp.motherUnitName || ''),
            bn ? (emp.presentRabUnitNameBN || emp.presentRabUnitName || '') : (emp.presentRabUnitName || ''),
            bn ? (emp.presentRabWingNameBN || emp.presentRabWingName || '') : (emp.presentRabWingName || ''),
            bn ? (emp.presentRabBranchNameBN || emp.presentRabBranchName || '') : (emp.presentRabBranchName || ''),
            bn ? (emp.presentRabSubBranchNameBN || emp.presentRabSubBranchName || '') : (emp.presentRabSubBranchName || ''),
            bn ? (emp.presentRabSectionNameBN || emp.presentRabSectionName || '') : (emp.presentRabSectionName || ''),
            bn ? (emp.presentRabSubSectionNameBN || emp.presentRabSubSectionName || '') : (emp.presentRabSubSectionName || ''),
        ];
        return parts.filter(p => p).join('/ ') || '';
    }

    /**
     * Page-size dropdown changed (A4 ⇄ Legal). The paper height and `.page-measure`
     * width both change, so pagination must recompute against the new geometry:
     * reset the cached page height + last-measured height so ngAfterViewChecked
     * re-measures the (now re-styled) content on the next cycle.
     */
    onPageSizeChange(): void {
        this.pageContentHeightPx = 0;
        this.lastMeasuredHeight = 0;
        this.pageOffsets = [0];
        this.pageNeedsTableHeader = [false];
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
        //   Legal: 355.6mm paper − 14mm top − 20mm bottom padding − 2×4mm insets = 313.6mm
        //   A4:    297mm   paper − 14mm top − 20mm bottom padding − 2×4mm insets = 255mm
        const visibleH = this.selectedPageSize === 'Legal' ? '313.6mm' : '255mm';
        const testDiv = document.createElement('div');
        testDiv.style.cssText = `position:absolute;left:-9999px;width:1mm;height:${visibleH};visibility:hidden`;
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
        if (!container || pageH <= 0) { this.pageNeedsTableHeader = [false]; return [0]; }

        const containerTop = container.getBoundingClientRect().top;

        // Measure title block height (title is rendered outside viewport on page 1)
        const titleEl = container.querySelector('.ns-title-block') as HTMLElement;
        const docBox = container.querySelector('.ns-doc-box') as HTMLElement;
        this.titleBlockHeightPx = docBox
            ? docBox.getBoundingClientRect().top - containerTop
            : titleEl ? titleEl.getBoundingClientRect().height + 8 : 0;

        // First page has less space because title is above the viewport
        const firstPageH = pageH - this.titleBlockHeightPx;
        if (totalHeight <= firstPageH + this.titleBlockHeightPx) { this.pageNeedsTableHeader = [false]; return [this.titleBlockHeightPx]; }

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

        // Employee-table region + header height: a page that opens inside the table
        // body reserves space at its top for a repeated column header.
        const tbodyEl = container.querySelector('.ns-posting-table tbody') as HTMLElement | null;
        const theadEl = container.querySelector('.ns-posting-table thead') as HTMLElement | null;
        let tableBodyTop = Infinity;
        let tableBodyBottom = -Infinity;
        this.tableHeaderHeightPx = 0;
        if (tbodyEl && theadEl) {
            const bodyRect = tbodyEl.getBoundingClientRect();
            tableBodyTop = bodyRect.top - containerTop;
            tableBodyBottom = bodyRect.bottom - containerTop;
            this.tableHeaderHeightPx = theadEl.getBoundingClientRect().height;
        }
        const startsInTableBody = (pos: number): boolean => pos > tableBodyTop && pos < tableBodyBottom;

        // Page 1 starts after the title block (title is rendered outside viewport)
        const offsets: number[] = [this.titleBlockHeightPx];
        const needsHeader: boolean[] = [false];   // page 0 carries the table's own header
        let cursor = this.titleBlockHeightPx;
        let isFirstPage = true;

        while (cursor < totalHeight) {
            // Reserve header room when THIS page opens inside the table body.
            const headerReserve = needsHeader[needsHeader.length - 1] ? this.tableHeaderHeightPx : 0;
            const currentPageH = (isFirstPage ? firstPageH : pageH) - headerReserve;
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
                needsHeader.push(startsInTableBody(cursor));
            }
            isFirstPage = false;
        }

        this.pageNeedsTableHeader = needsHeader;
        return offsets;
    }

    /** Height of white cover to hide excess content at bottom of a page that breaks early */
    getPageCoverHeight(pageIndex: number): number {
        if (pageIndex >= this.pageOffsets.length - 1) return 0;
        const usedHeight = this.pageOffsets[pageIndex + 1] - this.pageOffsets[pageIndex];
        // Header pages reserve space at the top for the repeated column header, so
        // the usable area (and thus the bottom cover) shrinks by that much.
        const headerReserve = this.pageNeedsTableHeader[pageIndex] ? this.tableHeaderHeightPx : 0;
        const availHeight = (pageIndex === 0
            ? this.pageContentHeightPx - this.titleBlockHeightPx
            : this.pageContentHeightPx) - headerReserve;
        return Math.max(0, availHeight - usedHeight + this.pageInsetPx);
    }

    /** Number of leaf columns in the employee table, matching the visible colgroup.
     *  Used for the PDF header-gap spacer row's colspan (a wrong value squishes the
     *  table because table-layout:fixed would add phantom columns). */
    get postingColumnCount(): number {
        if (this.isInterPosting()) {
            // Ser, Service ID, Rank, Name, Own/Spouse District, Previous Workplace,
            // Transfer Station (8) + Tenure group (Joining Date, Year, Month, Day = 4)
            // + Remarks.
            return (this.showTenure ? 12 : 8) + (this.showRemarks ? 1 : 0);
        }
        // Ser, Service ID, Rank, Name, Own/Spouse District, Previous Workplace,
        // Transfer Unit (+ Trade + Remarks).
        return 8 + (this.showTradeColumn ? 1 : 0) + (this.showRemarks ? 1 : 0);
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

        if (this.rabUnitOptions.length === 0) {
            this.loadRabUnitOptions();
        }
        this.loadUnitTree();
        if (!Object.keys(this.districtNameToId).length) {
            this.loadDistrictMap();
        }
        // For new-posting: sendingRemark readonly, remarks editable.
        // For inter-posting: interPostingRemark readonly, remarks editable.
        this.originalRemarks = {};
        this.newRemarks = {};
        const isInter = this.isInterPosting();
        for (const emp of this.postingEmployees) {
            this.originalRemarks[emp.employeeId] = isInter ? (emp.interPostingRemark ?? '') : (emp.sendingRemark ?? '');
            this.newRemarks[emp.employeeId] = emp.remarks ?? '';
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

    // ── Unit tree select helpers ────────────────────────────
    private loadUnitTree(): void {
        if (this.unitTreeNodes.length > 0) {
            this.preselectUnitNodes();
            return;
        }
        this.orgService.getAll(0).subscribe(roots => {
            this.unitTreeNodes = roots
                .filter(r => r.status === 1)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map(r => this.orgNodeToTreeNode(r, null));
            this.preselectUnitNodes();
        });
    }

    private orgNodeToTreeNode(node: import('@/Components/basic-setup/org-tree/models/org-node.model').OrgNode, parent: TreeNode | null): TreeNode {
        const tn: TreeNode = {
            key: String(node.id),
            label: node.nameEN || node.nameBN || `ID ${node.id}`,
            data: { id: node.id, nameEN: node.nameEN, nameBN: node.nameBN, parent },
            leaf: false,
            children: []
        };
        this.unitNodeMap[node.id] = tn;
        return tn;
    }

    onUnitNodeExpand(event: any): void {
        const node: TreeNode = event.node;
        if (node.children && node.children.length > 0) return;
        const parentId = Number(node.key);
        this.orgService.loadChildren(parentId).subscribe(children => {
            const active = children.filter(c => c.status === 1).sort((a, b) => a.sortOrder - b.sortOrder);
            node.children = active.map(c => this.orgNodeToTreeNode(c, node));
            if (node.children!.length === 0) node.leaf = true;
            this.unitTreeNodes = [...this.unitTreeNodes];
        });
    }

    onTreeUnitSelect(emp: DraftPostingEmployeeRow, event: any): void {
        const node: TreeNode = event.node;
        const selectedUnitId = Number(node.key);

        if (emp.presentRabUnitId && selectedUnitId === emp.presentRabUnitId) {
            const name = emp.fullNameBN || emp.fullNameEN || '';
            this.messageService.add({
                severity: 'error',
                summary: 'অবৈধ নির্বাচন / Invalid Selection',
                detail: `${name} বর্তমানে এই ইউনিটেই কর্মরত আছেন। একই ইউনিটে বদলি করা যাবে না।`,
                life: 6000
            });
            emp.transferRabUnitId = null as any;
            emp.transferRabUnitName = null as any;
            this.selectedUnitNodes[emp.employeeId] = null;
            return;
        }

        emp.transferRabUnitId = selectedUnitId;
        emp.transferRabUnitName = this.getUnitFullPath(node, false);
        this.onTransferUnitChange(emp);
    }

    onTreeUnitClear(emp: DraftPostingEmployeeRow): void {
        emp.transferRabUnitId = null as any;
        emp.transferRabUnitName = null as any;
        this.selectedUnitNodes[emp.employeeId] = null;
    }

    getTransferUnitShort(emp: DraftPostingEmployeeRow): string {
        const full = this.isEnglish()
            ? (emp.transferRabUnitName || '')
            : (emp.transferRabUnitNameBN || emp.transferRabUnitName || '');
        if (!full) return '';
        const parts = full.split(',');
        return parts[parts.length - 1].trim();
    }

    getCombinedRemarks(emp: DraftPostingEmployeeRow): string {
        const history = this.removalHistoryMap[emp.employeeId];
        const removalRemark = this.isEnglish()
            ? (history?.removalRemark || '')
            : (history?.removalRemarkBN || history?.removalRemark || '');
        // After the main remarks, append the "previous posting cancelled" note when this
        // member's last posting (of this type) was cancelled.
        const cancelNote = this.getCancelledInterNote(emp);
        if (this.isInterPosting()) {
            return [emp.interPostingRemark, emp.remarks, removalRemark, cancelNote].filter(s => s?.trim()).join(', ');
        }
        return [emp.sendingRemark, emp.remarks, removalRemark, cancelNote].filter(s => s?.trim()).join(', ');
    }

    /**
     * Note when this member's last posting was cancelled (cancelledInterMap is the flag).
     * Same text for both posting types: "<order no> এর মাধ্যমে জারিকৃত বদলি আদেশ বাতিল করা হলো।".
     */
    private getCancelledInterNote(emp: DraftPostingEmployeeRow): string {
        const c = this.cancelledInterMap[emp.employeeId];
        if (!c?.postingOrderNo) return '';
        const no = c.postingOrderNo;
        return this.isEnglish()
            ? `The transfer order issued vide ${no} has been cancelled.`
            : `${no} এর মাধ্যমে জারিকৃত বদলি আদেশ বাতিল করা হলো।`;
    }

    getPreviousWorkplace(emp: DraftPostingEmployeeRow): string {
        const bn = !this.isEnglish();
        const rabUnit = this.showPrevWorkplaceDetail
            ? (bn ? (emp.motherOrgLocationNameBN || emp.motherOrgLocationName || '') : (emp.motherOrgLocationName || ''))
            : '';
        const motherOrg = bn
            ? (emp.motherUnitNameBN || emp.motherUnitName || '')
            : (emp.motherUnitName || '');
        if (motherOrg && rabUnit) return motherOrg + '\n(' + rabUnit + ')';
        if (motherOrg) return motherOrg;
        if (rabUnit) return rabUnit;
        return '';
    }

    getRankQualifications(emp: DraftPostingEmployeeRow): string {
        const q = this.isEnglish()
            ? (emp.specialQualifications || '')
            : (emp.specialQualificationsBN || emp.specialQualifications || '');
        return q.trim();
    }

    /** Treats "N/A" / "NA" / "অপ্রযোজ্য" (and empty) as nothing, so no detail line shows. */
    private notApplicable(value: string): boolean {
        const t = value.trim().toLowerCase();
        return t === '' || t === 'n/a' || t === 'na' || t === 'অপ্রযোজ্য' || t === '(অপ্রযোজ্য)';
    }

    /** Corps name (BN/EN); '' when not applicable. */
    getCorps(emp: DraftPostingEmployeeRow): string {
        const v = (this.isEnglish() ? (emp.corpsName || '') : (emp.corpsNameBN || emp.corpsName || '')).trim();
        return this.notApplicable(v) ? '' : v;
    }

    /** Professional Qualification — comma-joined names (BN/EN); '' when not applicable. */
    getProfQualification(emp: DraftPostingEmployeeRow): string {
        const v = (this.isEnglish() ? (emp.professionalQualification || '') : (emp.professionalQualificationBN || emp.professionalQualification || '')).trim();
        return this.notApplicable(v) ? '' : v;
    }

    /** Gallantry Awards / Decoration — comma-joined names (BN/EN); '' when not applicable. */
    getGallantryAwards(emp: DraftPostingEmployeeRow): string {
        const v = (this.isEnglish() ? (emp.gallantryAwardsDecoration || '') : (emp.gallantryAwardsDecorationBN || emp.gallantryAwardsDecoration || '')).trim();
        return this.notApplicable(v) ? '' : v;
    }

    /** Permanent (own) district display; drops the parenthetical detail when the toggle is off. */
    getOwnDistrict(emp: DraftPostingEmployeeRow): string {
        const full = this.isEnglish()
            ? (emp.permanentDistrictName || '')
            : (emp.permanentDistrictNameBN || emp.permanentDistrictName || '');
        return this.showOwnDistrictDetail ? full : full.split('\n')[0].replace(/\s*\(.*$/, '');
    }

    /** Spouse district display; drops the parenthetical detail when the toggle is off. */
    getSpouseDistrict(emp: DraftPostingEmployeeRow): string {
        const full = this.isEnglish()
            ? (emp.spousePermanentDistrictName || '')
            : (emp.spousePermanentDistrictNameBN || emp.spousePermanentDistrictName || '');
        return this.showSpouseDistrictDetail ? full : full.split('\n')[0].replace(/\s*\(.*$/, '');
    }

    getUnitFullPath(node: TreeNode | null, bn: boolean = false): string {
        if (!node) return '';
        const parts: string[] = [];
        let current: TreeNode | null = node;
        while (current) {
            const d: any = current.data;
            parts.unshift(bn ? (d?.nameBN || d?.nameEN || current.label || '') : (d?.nameEN || current.label || ''));
            current = d?.parent ?? null;
        }
        return parts.join(', ');
    }

    private preselectUnitNodes(): void {
        this.selectedUnitNodes = {};
        for (const emp of this.postingEmployees) {
            if (emp.transferRabUnitId && this.unitNodeMap[emp.transferRabUnitId]) {
                this.selectedUnitNodes[emp.employeeId] = this.unitNodeMap[emp.transferRabUnitId];
            } else if (emp.transferRabUnitId) {
                // Node not in tree yet (child not loaded) — create a temporary node with ancestors
                this.loadAndPreselectNode(emp);
            }
        }
    }

    private loadAndPreselectNode(emp: DraftPostingEmployeeRow): void {
        this.masterBasicSetup.getAncestorsOfCommonCode(emp.transferRabUnitId!).subscribe(ancestors => {
            if (!ancestors?.length) return;
            // ancestors come from root to leaf; build path and create temp node
            const sorted = [...ancestors].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
            let parent: TreeNode | null = null;
            for (const anc of sorted) {
                if (this.unitNodeMap[anc.codeId]) {
                    parent = this.unitNodeMap[anc.codeId];
                    continue;
                }
                const tn: TreeNode = {
                    key: String(anc.codeId),
                    label: anc.codeValueEN || anc.codeValueBN || `ID ${anc.codeId}`,
                    data: { id: anc.codeId, nameEN: anc.codeValueEN, nameBN: anc.codeValueBN, parent },
                    leaf: false,
                    children: []
                };
                this.unitNodeMap[anc.codeId] = tn;
                parent = tn;
            }
            if (this.unitNodeMap[emp.transferRabUnitId!]) {
                this.selectedUnitNodes[emp.employeeId] = this.unitNodeMap[emp.transferRabUnitId!];
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
        const empDistrictName = (emp.permanentDistrictName || emp.permanentDistrictNameBN || '').split('\n')[0].trim().toLowerCase();
        if (!empDistrictName) return;
        const empDistrictId = this.districtNameToId[empDistrictName];
        if (!empDistrictId) return;

        const checkAor = (districtIds: number[]) => {
            if (districtIds.includes(empDistrictId)) {
                const unitName = this.getUnitFullPath(this.unitNodeMap[unitId] ?? null) || (this.rabUnitOptions.find(o => o.value === unitId)?.label ?? '');
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
                remarks: (this.newRemarks[emp.employeeId] ?? '').trim() || null
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
                error: (err: any) => {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update note-sheet.' });
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
        this._lastLoadedId = null;
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
    /**
     * Download a PDF that is byte-for-byte the SAME render as the Print Preview
     * (JsReport chrome-pdf, matches the web view 1:1) — just saved as a file
     * instead of opened in a tab.
     */
    override async exportPdf(): Promise<void> {
        if (!this.noteSheet || !this.contentMeasure) return;
        this.exportingPdf = true;
        try {
            const { html, chrome } = await this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.pdf`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.exportingPdf = false;
        }
    }

    /**
     * Print Preview via JsReport (chrome-pdf). Renders the live preview and
     * opens the resulting PDF in a new tab. Output matches the web view 1:1.
     */
    async exportPdfWithJsReport(): Promise<void> {
        if (!this.noteSheet || !this.contentMeasure) return;
        this.exportingPdfJsReport = true;
        try {
            const { html, chrome } = await this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}`, chrome,
            );
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'JsReport error',
                detail: err?.message || 'Failed to render PDF via JsReport. Is the server reachable?'
            });
        } finally {
            this.exportingPdfJsReport = false;
        }
    }

    /**
     * Build the chrome-pdf HTML + chrome options shared by the PDF download and
     * the Print Preview, so both produce identical output. Snapshots the
     * UNPAGINATED source (hidden .page-measure div): the visible .a4-paper
     * viewports are pre-sliced for screen and would re-paginate into empty boxes
     * in Chromium; contentMeasure holds the full content as one flow, which
     * Chromium paginates correctly via @page rules.
     */
    private async buildJsReportPdf(): Promise<{ html: string; chrome: Record<string, unknown> }> {
        const styles = this.collectDocumentStyles();
        const fontCss = await this.embedBanglaFontCss();
        const body = this.contentMeasure.nativeElement.innerHTML;
        const isLegal = this.selectedPageSize === 'Legal';
        // Page margins are HALF the on-screen .a4-paper insets (5mm side / 7mm top /
        // 10mm bottom instead of 10 / 14 / 20) so the printed sheet uses more of the
        // page. The text column widens to match: Legal 215.9 - 2*5 = 205.9mm.
        const pageWidth = isLegal ? '215.9mm' : '210mm';
        const pageHeight = isLegal ? '355.6mm' : '297mm';
        const padX = 5;                 // mm — horizontal page margin
        const padTop = 7;               // mm — top page margin
        const padBottom = 10;           // mm — bottom page margin
        const contentWidth = `${(isLegal ? 215.9 : 210) - 2 * padX}mm`;

        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}

/* SolaimanLipi, inlined as base64. The collected page styles declare the same
   family against /assets/fonts/*.ttf, but JsReport renders this HTML as a bare
   string with no base URL, so that relative reference cannot resolve on the
   server — the embedded copy below is what Chromium actually loads. */
${fontCss}

/* @page insets are half the .a4-paper padding; .pdf-flow's width is derived from
   the same padX so the text column always equals page width - 2*padX. The top
   margin (uniform across all pages) gives the gap above the content — incl. the
   repeated table header on continuation pages. */
@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm; }

/* No body background — it would cover the position:fixed frame. */
html, body { margin: 0; padding: 0; background: transparent; }

/* Hide app chrome that may sneak through the global styles */
.no-print, .preview-header, .export-options-bar, .preview-actions, .preview-status-actions { display: none !important; }

/* Page frame: Chromium repeats position:fixed elements on every printed page.
   top/left/right/bottom:0 fills the printable area on every page incl. the last. */
.pdf-page-frame {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    border: 1.5px solid #000;
    pointer-events: none;
    z-index: 9999;
}

/* Source container — reset .page-measure's off-screen positioning and lock the
   exact .a4-paper text column + typography so Chromium wraps lines identically. */
.pdf-flow {
    position: static !important;
    left: auto !important;
    top: auto !important;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${contentWidth};
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}

/* Per-element font-size tiers restated so they win over scoped component styles
   (1:1 with the web view). */
.pdf-flow .ns-title-bn,
.pdf-flow .ns-title-en { font-size: 11pt !important; }   /* title — match প্রজ্ঞাপন / Word */

.pdf-flow .ns-cell-subject,
.pdf-flow .ns-edit-field,
.pdf-flow .ns-exbd-info,
.pdf-flow .ns-file-attachments-label,
.pdf-flow .ns-page-no { font-size: 10pt !important; }

.pdf-flow .ns-approver-left,
.pdf-flow .ns-approver-remark,
.pdf-flow .ns-approver-role,
.pdf-flow .ns-cell-ref,
.pdf-flow .ns-file-item,
.pdf-flow .ns-note,
.pdf-flow .ns-para,
.pdf-flow .ns-posting-note,
.pdf-flow .ns-sanglagni-col,
.pdf-flow .ns-sig-appoint,
.pdf-flow .ns-sig-date,
.pdf-flow .ns-sig-name,
.pdf-flow .ns-sig-paren,
.pdf-flow .ns-sig-rank { font-size: 10pt !important; }

.pdf-flow .ns-closing-text { font-size: 10pt !important; }

.pdf-flow .ns-members-preview-table,
.pdf-flow .ns-members-preview-table th,
.pdf-flow .ns-members-preview-table td,
.pdf-flow .ns-ref-file-btn,
.pdf-flow .ns-ref-file-btn i { font-size: 7pt !important; }

.pdf-flow .ns-posting-table td { font-size: 8pt !important; }    /* table content (inter) */
.pdf-flow .ns-posting-table.ns-posting-new td { font-size: 9pt !important; }  /* new posting content */
.pdf-flow .ns-posting-table th { font-size: 6.5pt !important; }  /* table header (inter) */
.pdf-flow .ns-posting-table.ns-posting-new th { font-size: 9pt !important; font-weight: normal !important; }  /* new posting header (not bold) */

/* No shading — plain white rows and header (no zebra, no grey header). */
.pdf-flow .ns-posting-table th,
.pdf-flow .ns-posting-table tr,
.pdf-flow .ns-posting-table tr:nth-child(even) { background: transparent !important; }

/* Keep column widths (colgroup) identical to the on-screen preview */
.pdf-flow .ns-posting-table table { table-layout: fixed; width: 100%; }
.pdf-flow .ns-posting-table th,
.pdf-flow .ns-posting-table td { word-break: break-word; overflow-wrap: anywhere; }

/* Rich-text content keeps the crisp document Bangla font (no faint "japsa" text) */
.pdf-flow .ns-para-text, .pdf-flow .ns-para-text *,
.pdf-flow .ns-ref-content, .pdf-flow .ns-ref-content *,
.pdf-flow .ns-note, .pdf-flow .ns-note * {
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif !important;
    color: #000 !important;
}

/* .ns-doc-box draws its own border that the frame replaces. */
.pdf-flow .ns-doc-box { border: none !important; }

/* Avoid awkward breaks: keep posting-table rows + signatory blocks together */
.ns-posting-table tr,
.ns-approver-section,
.ns-org-header,
.ns-title-block { page-break-inside: avoid; break-inside: avoid; }

/* ── Multi-page employee table ──────────────────────────────────────────────
   When the table spans 2+ pages: repeat the column header (<thead>) on every
   page, keep each row whole, and close the table with borders at each page
   boundary. The component's scoped ".ns-posting-table { overflow-x: hidden }"
   makes the table an unbreakable/clipped block in print and suppresses <thead>
   repetition — force overflow:visible so Chromium fragments it natively.
   Bordered cells + unbroken rows mean the columns "close" at the bottom of each
   page; the @page top margin (${padTop}mm) provides the small gap before the
   repeated header on continuation pages. */
.pdf-flow .ns-posting-table { overflow: visible !important; }
.pdf-flow .ns-posting-table table { border-collapse: collapse; }
.pdf-flow .ns-posting-table thead { display: table-header-group !important; }
.pdf-flow .ns-posting-table tfoot { display: table-footer-group; }
.pdf-flow .ns-posting-table th,
.pdf-flow .ns-posting-table td { border: 0.25px solid #888 !important; }
/* Normal block flow (not flex) around the table so Chromium fragments it across
   pages and repeats <thead> reliably — a table inside a flex column may not. */
.pdf-flow .ns-doc-box,
.pdf-flow .ns-main-col { display: block !important; }
/* Show the header gap row (hidden on screen) as a borderless band, so the
   repeated header has a gap below the page frame on every continuation page. */
.pdf-flow .ns-posting-table { --ns-head-gap-h: 6mm; }
.pdf-flow .ns-posting-table thead tr.ns-head-gap { display: table-row !important; }
.pdf-flow .ns-posting-table thead tr.ns-head-gap td {
    border: 0 !important;
    padding: 0 !important;
    height: var(--ns-head-gap-h);
    /* Transparent (not white): on page 1 the negative margin below overlaps this
       row into the paragraph above, so a white fill would mask the last line. */
    background: transparent;
}
/* Chromium repeats the whole <thead> — including the gap row — on EVERY page the
   table spans, so the gap also renders once at the table's natural start on
   page 1, adding a gap between the last paragraph and the table that the web
   view (where .ns-head-gap is display:none) never has. A negative top margin of
   exactly one gap-row height cancels it. Margins apply only to a box's first
   fragment, so page 1 matches the web spacing while continuation pages keep
   their gap below the page frame. */
.pdf-flow .ns-posting-table { margin-top: calc(-1 * var(--ns-head-gap-h)); }
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
            marginTop: '0',
            marginBottom: '0',
            marginLeft: '0',
            marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '',
            footerTemplate: ''
        };

        return { html, chrome };
    }

    /**
     * Concatenate every same-origin stylesheet loaded into the page. Cross-origin
     * sheets (e.g. CDN Google Fonts) throw on cssRules access and are skipped — so
     * those @font-face fonts must be system-installed where Chromium runs, or
     * bundled locally, to render identically.
     */
    private collectDocumentStyles(): string {
        const out: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try {
                for (const rule of Array.from(sheet.cssRules)) {
                    // The app's SolaimanLipi @font-face points at a relative asset URL
                    // that JsReport's Chromium cannot resolve. Drop it so it can't win
                    // over the base64 face embedded in buildJsReportPdf().
                    if (rule instanceof CSSFontFaceRule && rule.cssText.includes('SolaimanLipi')) continue;
                    out.push(rule.cssText);
                }
            } catch {
                // cross-origin or otherwise inaccessible — skip
            }
        }
        return out.join('\n');
    }

    /** Cached base64 @font-face CSS — the font is ~200KB per face, so build it once. */
    private banglaFontCss?: string;

    /**
     * SolaimanLipi as self-contained @font-face rules with the TTFs inlined as
     * base64 data URIs, so the PDF renders the same Bangla face as the web view
     * without the font being installed on the JsReport server.
     *
     * If a face cannot be fetched, it is skipped rather than failing the export:
     * Chromium then falls back to whatever Bangla font it has, which is the same
     * behaviour as before this font was bundled.
     */
    private async embedBanglaFontCss(): Promise<string> {
        if (this.banglaFontCss !== undefined) return this.banglaFontCss;

        const faces = [
            { file: 'SolaimanLipi.ttf', weight: 400 },
            { file: 'SolaimanLipi-Bold.ttf', weight: 700 },
        ];

        const rules: string[] = [];
        for (const face of faces) {
            try {
                const res = await fetch(`assets/fonts/${face.file}`);
                if (!res.ok) continue;
                rules.push(
                    `@font-face { font-family: 'SolaimanLipi'; font-style: normal; font-weight: ${face.weight};` +
                    ` src: url(data:font/ttf;base64,${this.toBase64(await res.arrayBuffer())}) format('truetype'); }`
                );
            } catch {
                // font asset unavailable — fall back to a system Bangla face
            }
        }

        this.banglaFontCss = rules.join('\n');
        return this.banglaFontCss;
    }

    /** btoa() over a font buffer, chunked to stay under the argument-count limit. */
    private toBase64(buf: ArrayBuffer): string {
        const bytes = new Uint8Array(buf);
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
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
                date: approved && this.noteSheet.noteSheetDate ? this.formatFullDate(this.noteSheet.noteSheetDate) : undefined,
                align: 'right',
                signatureDataUrl: approved && this.showSignatureImage && this.shouldShowSignature(d.step) ? d.signatureDataUrl : undefined
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
                signatureDataUrl: this.showSignatureImage && this.shouldShowSignature(a.step) ? a.signatureDataUrl : undefined,
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
                        // Check if the element is entirely bold/italic at the block level
                        const blockBold = ['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
                            || el.style.fontWeight === 'bold';
                        const blockItalic = tag === 'em' || tag === 'i' || el.style.fontStyle === 'italic';

                        // Extract inline runs to preserve bold/italic/underline
                        const blockUnderline = tag === 'u' || el.style.textDecoration?.includes('underline');
                        const inlineRuns = this.extractInlineRuns(el, blockBold, blockItalic, blockUnderline);
                        if (inlineRuns.length > 1 || inlineRuns.some(r => r.underline)) {
                            blocks.push({ type: 'paragraph', text, runs: inlineRuns, indent: 'normal', alignment });
                        } else {
                            const hasBold = blockBold || !!el.querySelector('strong, b');
                            const hasItalic = blockItalic || !!el.querySelector('em, i');
                            blocks.push({ type: 'paragraph', text, bold: hasBold, italic: hasItalic, indent: 'normal', alignment });
                        }
                    }
                }
            }
        }
        return blocks;
    }

    /** Walk child nodes of an element and extract inline runs with bold/italic/underline info. */
    private extractInlineRuns(el: HTMLElement, parentBold: boolean, parentItalic: boolean, parentUnderline: boolean = false): InlineRun[] {
        const runs: InlineRun[] = [];
        const walk = (node: Node, bold: boolean, italic: boolean, underline: boolean) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const t = this.normalizeTextForWord(node.textContent || '');
                if (t) runs.push({ text: t, bold: bold || undefined, italic: italic || undefined, underline: underline || undefined });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const child = node as HTMLElement;
                const childTag = child.tagName.toLowerCase();
                const b = bold || ['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(childTag) || child.style.fontWeight === 'bold';
                const i = italic || childTag === 'em' || childTag === 'i' || child.style.fontStyle === 'italic';
                const u = underline || childTag === 'u' || child.style.textDecoration?.includes('underline');
                for (const c of Array.from(child.childNodes)) {
                    walk(c, b, i, u);
                }
            }
        };
        for (const child of Array.from(el.childNodes)) {
            walk(child, parentBold, parentItalic, parentUnderline);
        }
        return runs;
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
            ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const }
            : 'Times New Roman';
        // Font sizes in half-points (1pt = 2 half-pts) — matched to posting-order-preview
        const ORG_SZ = 18;      // 9pt — org header (HEADER — kept)
        const BODY_SZ = 20;     // 10pt — body text, paragraphs, note, reference
        const TBL_SZ = this.isInterPosting() ? 16 : 18;  // 8pt inter / 9pt new posting — table content
        const TBL_HDR_SZ = this.isInterPosting() ? 13 : 18;  // 6.5pt inter / 9pt new posting — table header
        const SIG_SZ = 20;      // 10pt — signature & approver
        const NODATE_SZ = BODY_SZ;  // 10pt — notesheet no + date (matches body)
        const csSize = bn ? BODY_SZ : undefined;
        const csNoDate = bn ? NODATE_SZ : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        const mainChildren: (Paragraph | Table)[] = [];

        // Org header
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine1(), bold: true, size: ORG_SZ, sizeComplexScript: bn ? ORG_SZ : undefined, font, language: lang })],
            alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }
        }));
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: this.getOrgHeaderLine2(), bold: true, size: ORG_SZ, sizeComplexScript: bn ? ORG_SZ : undefined, font, language: lang, underline: {} })],
            alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }
        }));

        // Notesheet number + date on same line
        if (this.noteSheet?.noteSheetNo) {
            const nsRuns: TextRun[] = [
                new TextRun({ text: this.noteSheet.noteSheetNo, size: NODATE_SZ, sizeComplexScript: csNoDate, font, language: lang })
            ];
            if (this.noteSheet.noteSheetDate) {
                const dateLabel = bn ? 'তারিখঃ ' : 'Date: ';
                const dateVal = this.formatFullDate(this.noteSheet.noteSheetDate);
                nsRuns.push(new TextRun({ text: '\t' + dateLabel + dateVal, size: NODATE_SZ, sizeComplexScript: csNoDate, font, language: lang }));
            }
            mainChildren.push(new Paragraph({
                children: nsRuns,
                tabStops: [{ type: 'right' as any, position: 10800 }],
                indent: { left: 100 }, spacing: { before: 60, after: 40 }
            }));
        }

        // Subject
        if (this.noteSheet?.subject) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: this.noteSheet.subject, bold: true, underline: {}, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 100 }, spacing: { before: 20, after: 60 }
            }));
        }

        // Reference
        if (this.noteSheet?.referenceNumber) {
            const refLabel = bn ? 'সূত্রঃ' : 'Reference:';
            const refHtml = this.fixBanglaWordBreaks(this.noteSheet.referenceNumber);
            const refBlocks = this.parseHtmlToContentBlocks(refHtml);
            const validBlocks = refBlocks.filter(b => b.text);
            if (validBlocks.length > 0) {
                // Label on its own line
                mainChildren.push(new Paragraph({
                    children: [
                        new TextRun({ text: refLabel, bold: true, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })
                    ],
                    indent: { left: 100 }, spacing: { before: 40, after: 20 }
                }));
                // Content blocks as separate paragraphs below, preserving bold/italic
                for (let ri = 0; ri < validBlocks.length; ri++) {
                    const rb = validBlocks[ri];
                    const children = rb.runs?.length
                        ? rb.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang }))
                        : [new TextRun({ text: rb.text!, bold: rb.bold, italics: rb.italic, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })];
                    mainChildren.push(new Paragraph({
                        children,
                        indent: { left: 100 }, spacing: { before: 20, after: ri === validBlocks.length - 1 ? 60 : 20 }
                    }));
                }
            }
        }

        // Merge serial with first text block so they appear inline (like ২।, ৩। etc.)
        if (model.mainBlocks.length > 0 && model.mainBlocks[0].type === 'paragraph' && model.mainBlocks[0].text) {
            const firstBlock = model.mainBlocks[0];
            const firstBlockRuns = firstBlock.runs?.length
                ? firstBlock.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang }))
                : [new TextRun({ text: firstBlock.text!, bold: firstBlock.bold, italics: firstBlock.italic, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })];
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${model.mainSerialText}  `, bold: true, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang }),
                    ...firstBlockRuns
                ],
                indent: { left: 100 }, spacing: { before: 160, after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
            if (model.mainBlocks.length > 1) {
                mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks.slice(1), font, bn));
            }
        } else {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.mainSerialText, bold: true, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 100 }, spacing: { before: 160, after: 40 }
            }));
            mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));
        }

        // Posting employee table (posting-specific)
        if (this.isPostingType() && this.postingEmployees.length > 0) {
            const isA4 = this.selectedPageSize === 'A4';
            const pageUsable = isA4 ? 10772 : 11106;
            const cellMargins = { top: 30, bottom: 30, left: 0, right: 0 };
            const cellSpacing = { before: 0, after: 0, line: 220 };
            const hdrParaFn = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true, size: TBL_HDR_SZ, sizeComplexScript: bn ? TBL_HDR_SZ : undefined, font, language: lang })], alignment: AlignmentType.CENTER, spacing: cellSpacing });
            const dataCellFn = (v: string, w: number, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.CENTER) => {
                const lines = v.split('\n');
                const cellParas = lines.map(line => new Paragraph({ children: [new TextRun({ text: line, size: TBL_SZ, sizeComplexScript: bn ? TBL_SZ : undefined, font, language: lang })], alignment: align, spacing: cellSpacing }));
                return new TableCell({ children: cellParas, borders: cellBorders, width: { size: w, type: WidthType.DXA }, margins: cellMargins });
            };

            if (this.isInterPosting()) {
                // ── Inter-posting: 13-column (no Trade), 3-row header ──
                // Indices: 0=ser,1=svcId,2=rank,3=name,4=ownDist,5=spouseDist,
                //          6=joinDate,7=yr,8=mo,9=day,10=prevWp,11=trUnit,12=remarks
                //          ser svcId rank name own  spo  jdt  yr  mo  day prev unit rem
                // When tenure is hidden, give the freed width to Name / Previous
                // Workplace / Transfer Station (idx 3 / 10 / 11).
                const iBase = this.showTenure
                    ? [300, 1150, 850, 1000, 900, 900, 800, 400, 400, 400, 700, 900, 650]
                    : [300, 1150, 850, 1600, 900, 900, 800, 400, 400, 400, 1300, 1400, 650];
                const iBnHdr = ['ক্রমিক','ব্যক্তিগত নং','পদবি','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্বামী/স্ত্রীর জেলা (দায়িত্বপূর্ণ এলাকা)','','','','','পূর্ববতী কর্মস্থল','বদলিকৃত কর্মস্থল','মন্তব্য'];
                const iEnHdr = ['Ser','Service ID','Rank','Name','Own District (Responsible Area)',"Husband/Wife's District (Responsible Area)",'','','','','Previous Workplace','Transfer Station','Remarks'];
                const iVisIdx = iBase.map((_, i) => i).filter(i => {
                    if (i === 12) return this.showRemarks;          // Remarks
                    if (i >= 6 && i <= 9) return this.showTenure;   // Tenure group (join date + Y/M/D)
                    return true;
                });
                // Scale to the VISIBLE columns so the table fills the page width even
                // when the tenure (or remarks) columns are hidden.
                const iBaseTotal = iVisIdx.reduce((a, oi) => a + iBase[oi], 0);
                const iW = iBase.map(w => Math.round(w * pageUsable / iBaseTotal));

                const iMkHdrCell = (text: string, w: number, extra?: any) => new TableCell({
                    children: [hdrParaFn(text)], borders: cellBorders, width: { size: w, type: WidthType.DXA }, margins: cellMargins, ...extra
                });
                const iContCell = (w: number) => new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: w, type: WidthType.DXA }, margins: cellMargins });

                let iHdrRows: TableRow[];
                if (this.showTenure) {
                    // Row 1: outer cols span 3 rows, tenure block colspan=4
                    const r1: TableCell[] = [];
                    for (const oi of iVisIdx) {
                        if (oi >= 7 && oi <= 9) continue; // covered by colspan=4 from oi=6
                        if (oi === 6) {
                            r1.push(iMkHdrCell(bn ? 'র‌্যাবে অবস্থানকাল' : 'Tenure in RAB', iW[6]+iW[7]+iW[8]+iW[9], { columnSpan: 4 }));
                        } else {
                            r1.push(iMkHdrCell(bn ? iBnHdr[oi] : iEnHdr[oi], iW[oi], { verticalMerge: VerticalMergeType.RESTART }));
                        }
                    }

                    // Row 2: joining date spans 2 rows, duration colspan=3
                    const r2: TableCell[] = [];
                    for (const oi of iVisIdx) {
                        if (oi < 6 || oi >= 10) { r2.push(iContCell(iW[oi])); }
                        else if (oi === 6) { r2.push(iMkHdrCell(bn ? 'যোগদানের তারিখ' : 'Joining Date', iW[6], { verticalMerge: VerticalMergeType.RESTART })); }
                        else if (oi === 7) { r2.push(iMkHdrCell(bn ? 'অবস্থানকাল' : 'Duration', iW[7]+iW[8]+iW[9], { columnSpan: 3 })); }
                        // oi 8,9: skipped (covered by colspan=3)
                    }

                    // Row 3: joining date continues, বছর/মাস/দিন cells
                    const r3: TableCell[] = [];
                    const subBn = ['বছর','মাস','দিন'];
                    const subEn = ['Year','Month','Day'];
                    for (const oi of iVisIdx) {
                        if (oi < 6 || oi >= 10) { r3.push(iContCell(iW[oi])); }
                        else if (oi === 6) { r3.push(iContCell(iW[6])); }
                        else { r3.push(iMkHdrCell(bn ? subBn[oi-7] : subEn[oi-7], iW[oi])); }
                    }

                    iHdrRows = [
                        new TableRow({ tableHeader: true, children: r1 }),
                        new TableRow({ tableHeader: true, children: r2 }),
                        new TableRow({ tableHeader: true, children: r3 }),
                    ];
                } else {
                    // Tenure hidden → single-row header (indices 6-9 already dropped from iVisIdx)
                    const r1 = iVisIdx.map(oi => iMkHdrCell(bn ? iBnHdr[oi] : iEnHdr[oi], iW[oi]));
                    iHdrRows = [new TableRow({ tableHeader: true, children: r1 })];
                }

                const iDataRows = this.postingEmployees.map((emp, i) => {
                    const t = this.calcTenure(emp.joiningDateInRAB);
                    const allV: string[] = [
                        bn ? this.serial(i + 1) : String(i + 1),
                        this.getServiceIdDisplay(emp),
                        (bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??'')) + (this.showRankQualifications && this.getRankQualifications(emp) ? '\n(' + this.getRankQualifications(emp) + ')' : ''),
                        bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                        bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''),
                        bn?(emp.spousePermanentDistrictNameBN||emp.spousePermanentDistrictName||''):(emp.spousePermanentDistrictName??''),
                        bn ? this.toBnDigits(this.formatJoiningDate(emp.joiningDateInRAB)) : this.formatJoiningDate(emp.joiningDateInRAB),
                        bn ? this.toBnDigits(String(t.y)) : String(t.y),
                        bn ? this.toBnDigits(String(t.m)) : String(t.m),
                        bn ? this.toBnDigits(String(t.d)) : String(t.d),
                        this.getInterPrevWorkplace(emp),
                        this.getTransferUnitShort(emp),
                        this.getCombinedRemarks(emp)
                    ];
                    // cantSplit: keep each employee row whole — Word must not break a
                    // multi-line row across pages (that leaves a stray fragment after
                    // the repeated header on the next page).
                    return new TableRow({ cantSplit: true, children: iVisIdx.map(oi => dataCellFn(allV[oi], iW[oi], oi === 3 ? AlignmentType.LEFT : AlignmentType.CENTER)) });
                });

                const iTotalW = iVisIdx.reduce((a, oi) => a + iW[oi], 0);
                mainChildren.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
                mainChildren.push(new Table({ width: { size: iTotalW, type: WidthType.DXA }, rows: [...iHdrRows, ...iDataRows], columnWidths: iVisIdx.map(oi => iW[oi]), alignment: AlignmentType.LEFT, indent: { size: 100, type: WidthType.DXA } }));

            } else {
                // ── New posting: 10-column, single-row header ──
                const allColKeys = ['ser', 'serviceId', 'rank', 'trade', 'name', 'ownDistrict', 'spouseDistrict', 'prevWorkplace', 'transferUnit', 'remarks'];
                const allColHeaders = bn
                    ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্পাউস জেলা (দায়িত্বপূর্ণ এলাকা)','পূর্ববতী কর্মস্থল','বদলি ইউনিট','মন্তব্য']
                    : ['Ser','Service ID','Rank','Trade','Name','Own District (Responsible Area)','Spouse District (Responsible Area)','Previous Workplace','Transfer Unit','Remarks'];
                //                    ser  svcId rank trade name  own   spouse prev  unit  rem
                const allBaseWidths = [620, 1480, 850,  820, 1380, 1400, 1220, 1040,  780,  800];

                const visibleIndices = allColKeys.map((k, i) => {
                    if (k === 'remarks' && !this.showRemarks) return -1;
                    if (k === 'trade' && !this.showTradeColumn) return -1;
                    return i;
                }).filter(i => i >= 0);
                const cols = visibleIndices.map(i => allColHeaders[i]);
                const baseWidths = visibleIndices.map(i => allBaseWidths[i]);
                const baseTotal = baseWidths.reduce((a, b) => a + b, 0);
                const colWidths = baseWidths.map(w => Math.round(w * pageUsable / baseTotal));

                const hdrCell = (text: string, wi: number, extra?: any) => new TableCell({
                    children: [hdrParaFn(text)], borders: cellBorders, width: { size: colWidths[wi], type: WidthType.DXA }, margins: cellMargins, ...extra
                });

                const buildAllCellValues = (emp: any, i: number): string[] => [
                    bn ? this.serial(i + 1) : String(i + 1),
                    this.getServiceIdDisplay(emp),
                    (bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??'')) + (this.showRankQualifications && this.getRankQualifications(emp) ? '\n(' + this.getRankQualifications(emp) + ')' : ''),
                    (bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??'')) + (this.showTradeRemarks && emp.tradeRemarks ? '\n(' + emp.tradeRemarks + ')' : ''),
                    bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                    this.showOwnDistrictDetail
                        ? (bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''))
                        : (bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??'')).split('\n')[0].replace(/\s*\(.*$/, ''),
                    this.showSpouseDistrictDetail
                        ? (bn?(emp.spousePermanentDistrictNameBN||emp.spousePermanentDistrictName||''):(emp.spousePermanentDistrictName??''))
                        : (bn?(emp.spousePermanentDistrictNameBN||emp.spousePermanentDistrictName||''):(emp.spousePermanentDistrictName??'')).split('\n')[0].replace(/\s*\(.*$/, ''),
                    this.getPreviousWorkplace(emp),
                    this.getTransferUnitShort(emp),
                    this.getCombinedRemarks(emp)
                ];

                const headerRows = [new TableRow({ tableHeader: true, children: cols.map((c, vi) => hdrCell(c, vi)) })];
                const dataRows = this.postingEmployees.map((emp, i) => {
                    const allVals = buildAllCellValues(emp, i);
                    // cantSplit: keep each employee row whole across page breaks.
                    return new TableRow({ cantSplit: true, children: visibleIndices.map((oi, vi) => dataCellFn(allVals[oi], colWidths[vi], oi === 4 ? AlignmentType.LEFT : AlignmentType.CENTER)) });
                });
                const tableRows = [...headerRows, ...dataRows];
                mainChildren.push(new Paragraph({ spacing: { before: 200 }, children: [] }));
                const totalColW = colWidths.reduce((a, b) => a + b, 0);
                mainChildren.push(new Table({ width: { size: totalColW, type: WidthType.DXA }, rows: tableRows, columnWidths: colWidths, alignment: AlignmentType.LEFT, indent: { size: 100, type: WidthType.DXA } }));
            }
        }

        // Note (between employee table and paragraphs, matching view order)
        if (model.note) {
            const noteLines = model.note.split('\n').filter((l: string) => l.trim());
            for (const line of noteLines) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: line, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })],
                    indent: { left: 100 }, spacing: { before: 40, after: 40 }
                }));
            }
        }

        // Paragraphs (after employee table)
        const wordParagraphs = this.parsedParagraphs;
        wordParagraphs.forEach((para: string, pi: number) => {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.serial(pi + 2)}  `, bold: true, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: para, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 100 }, spacing: { before: 120, after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
        });


        if (model.closingText) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.closingText, size: BODY_SZ, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240, firstLine: 480 }, spacing: { before: 200 }
            }));
        }

        // Initiator — right-positioned, keep entire block together
        if (model.initiator) {
            const initIndent = { left: 6300 };  // ~70% from left — matches the on-screen preview
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
                children: [new TextRun({ text: model.initiator.nameLine, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
            }));

            // Rank
            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Appointment
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            // Date (last item — no keepNext needed)
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 400 }
                }));
            }
        }

        // Approvers — keep each approver block together
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                indent: { left: 100 }, spacing: { before: 280 }, keepNext: true, keepLines: true
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, indent: { left: 100 }, keepNext: true }));
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
                    children: [new TextRun({ text: ap.date, size: SIG_SZ, sizeComplexScript: bn ? SIG_SZ : undefined, font, language: lang })],
                    alignment: AlignmentType.CENTER
                }));
            }
        }

        // Title paragraphs — inside the page border at the top
        const titleChildren: (Paragraph | Table)[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, size: 24, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', size: 24, font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const } })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }
            }),
        ];

        const docChildren: (Paragraph | Table)[] = [...titleChildren, ...mainChildren];

        // Use page borders so every page renders the same border consistently
        const pageBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 10 };

        // Page dimensions: A4 = 8.27" x 11.69", Legal = 8.5" x 14"
        const pageWidth = this.selectedPageSize === 'A4' ? 11906 : 12240;   // twips
        const pageHeight = this.selectedPageSize === 'A4' ? 16838 : 20160;  // twips

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { width: pageWidth, height: pageHeight, orientation: PageOrientation.PORTRAIT },
                        margin: { top: 567, right: 567, bottom: 567, left: 567 },
                        borders: {
                            pageBorderTop: pageBorder,
                            pageBorderBottom: pageBorder,
                            pageBorderLeft: pageBorder,
                            pageBorderRight: pageBorder,
                        },
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
        const bodySize = 16;  // 8pt
        const csSize = bn ? bodySize : undefined;

        for (const b of blocks) {
            if (b.type === 'table' && b.rows?.length) {
                const rows: TableRow[] = b.rows.map((row, rowIdx) => new TableRow({
                    children: row.map(cell => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: cell,
                                bold: rowIdx === 0,
                                size: bodySize,
                                sizeComplexScript: csSize,
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
                // Use inline runs if available for mixed bold/italic formatting
                const children = b.runs?.length
                    ? b.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, size: bodySize, sizeComplexScript: csSize, font, language: lang }))
                    : [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: bodySize, sizeComplexScript: csSize, font, language: lang })];
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

    getServiceIdDisplay(emp: DraftPostingEmployeeRow): string {
        const bn = !this.isEnglish();
        const sid = emp.serviceId || '';
        const prefix = bn ? (emp.prefixNameBN || emp.prefixName || '') : (emp.prefixName || '');
        const displayId = bn && sid ? this.toBanglaDigits(sid) : sid;
        if (!prefix) return displayId || '-';
        const full = `${prefix}-${displayId}`;
        // Long IDs: put the prefix (with dash) on its own line, number on the next.
        return full.length > 10 ? `${prefix}-\n${displayId}` : full;
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
