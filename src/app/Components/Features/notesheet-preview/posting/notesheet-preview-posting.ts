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
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { TreeSelectModule } from 'primeng/treeselect';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions, ApprovalStatus, NoteSheetRemarkAction, NoteSheetType, ApprovalLogAction, ApprovalLogActionOptions, DraftPostingStatus, PostingStatus, NoteSheetPreviewFrom } from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
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
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule, TreeSelectModule, FlexibleDateDirective,
        NotesheetSignatoryComponent, RichEditorComponent, FileReferencesFormComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-posting.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewPostingComponent extends NotesheetPreviewBase implements AfterViewChecked {


    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;
    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private cdr = inject(ChangeDetectorRef);
    private confirmationService = inject(ConfirmationService);
    private sharedService = inject(SharedService);

    // ── Submit for approval state ─────────────────────────────
    submitting = false;
    readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;

    // ── Pending-list inline actions (only when opened from pending list) ─
    /** True when this preview was opened from /notesheet-list/pending-new-posting (or any pending list). */
    fromPending = false;
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

    // Approval Log dialog
    showApprovalLogDialog = false;
    approvalLogEntries: ApprovalLogEntry[] = [];
    approvalLogLoading = false;
    approvalLogNoteSheetNo = '';
    readonly ApprovalLogAction = ApprovalLogAction;

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

    // ── RAB Unit tree select ────────────────────────────────
    private orgService = inject(OrgService);
    unitTreeNodes: TreeNode[] = [];
    selectedUnitNodes: Record<number, TreeNode | null> = {};
    private unitNodeMap: Record<number, TreeNode> = {};

    // ── Remarks: original (from draft posting) + new (added in edit mode) ──
    originalRemarks: Record<number, string> = {};
    newRemarks: Record<number, string> = {};

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
                    this.router.navigate([pendingRoute]);
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

                const empIds = (employees ?? []).map((e: any) => e.employeeId).filter((id: number) => id > 0);
                if (empIds.length > 0) {
                    this.postingService.updateEmployeesPostingStatus(empIds, PostingStatus.PendingForJoining).subscribe({
                        next: () => {},
                        error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to update employee posting status.' })
                    });
                }
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
        this.showMembersDialog = true;

        const obs = this.noteSheet.noteSheetType === NoteSheetType.InterPosting
            ? this.postingService.getDraftInterPostingEmployees(this.noteSheet.draftPostingMasterId)
            : this.postingService.getDraftPostingEmployees(this.noteSheet.draftPostingMasterId);

        obs.subscribe({
            next: (list: any[]) => { this.membersList = list ?? []; this.membersLoading = false; },
            error: (err: any) => { this.membersLoading = false; }
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
        this.loadUnitTree();
        if (!Object.keys(this.districtNameToId).length) {
            this.loadDistrictMap();
        }
        // SendingRemark (from EmployeeInfo) as readonly original; dd.Remarks as editable
        this.originalRemarks = {};
        this.newRemarks = {};
        for (const emp of this.postingEmployees) {
            this.originalRemarks[emp.employeeId] = emp.sendingRemark ?? '';
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
        emp.transferRabUnitId = Number(node.key);
        emp.transferRabUnitName = this.getUnitFullPath(node, false);
        this.onTransferUnitChange(emp);
    }

    onTreeUnitClear(emp: DraftPostingEmployeeRow): void {
        emp.transferRabUnitId = null as any;
        emp.transferRabUnitName = null as any;
        this.selectedUnitNodes[emp.employeeId] = null;
    }

    getCombinedRemarks(emp: DraftPostingEmployeeRow): string {
        return [emp.sendingRemark, emp.remarks].filter(s => s?.trim()).join(', ');
    }

    getRankQualifications(emp: DraftPostingEmployeeRow): string {
        const q = this.isEnglish()
            ? (emp.specialQualifications || '')
            : (emp.specialQualificationsBN || emp.specialQualifications || '');
        return q.trim();
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
        const empDistrictName = (emp.presentDistrictName || emp.presentDistrictNameBN || '').split('\n')[0].trim().toLowerCase();
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
                ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্পাউস জেলা (দায়িত্বপূর্ণ এলাকা)','পূর্ববতী কর্মস্থল','বদলি ইউনিট','মন্তব্য']
                : ['Ser','Service ID','Rank','Trade','Name','Own District (Responsible Area)','Spouse District (Responsible Area)','Previous Workplace','Transfer Unit','Remarks'];
            // Dynamic widths: if remarks exist, give more to Remarks; otherwise give more to Trade
            const hasRemarks = this.postingEmployees.some(e => !!e.remarks);
            //                  Ser,  ID,   Rank, Trade, Name, OwnDist, SpDist, Loc,  TrUnit, Remarks
            const colWidths = hasRemarks
                ? [490, 1220, 850, 1030, 1380, 1220, 1220, 1340, 1060, 1296]
                : [490, 1220, 850, 1516, 1380, 1220, 1220, 1340, 1060,  810];
            const hdrPara = (text: string) => new Paragraph({ children: [new TextRun({ text, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })], alignment: AlignmentType.CENTER });
            const hdrCell = (text: string, ci: number, extra?: any) => new TableCell({
                children: [hdrPara(text)], borders: cellBorders, width: { size: colWidths[ci], type: WidthType.DXA }, ...extra
            });

            let headerRows: TableRow[];
            if (this.isInterPosting()) {
                headerRows = [
                    new TableRow({ tableHeader: true, children: [
                        ...cols.slice(0, 7).map((c, ci) => hdrCell(c, ci, { verticalMerge: VerticalMergeType.RESTART })),
                        new TableCell({
                            children: [hdrPara(bn ? 'বদলিকৃত কর্মস্থল' : 'Transfer Station')],
                            columnSpan: 2, borders: cellBorders, width: { size: colWidths[7] + colWidths[8], type: WidthType.DXA }
                        }),
                        hdrCell(cols[9], 9, { verticalMerge: VerticalMergeType.RESTART })
                    ]}),
                    new TableRow({ tableHeader: true, children: [
                        ...[0,1,2,3,4,5,6].map(ci => new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: colWidths[ci], type: WidthType.DXA } })),
                        hdrCell(bn ? 'হইতে' : 'From', 7),
                        hdrCell(bn ? 'প্রতি' : 'To', 8),
                        new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: colWidths[9], type: WidthType.DXA } })
                    ]})
                ];
            } else {
                headerRows = [new TableRow({ tableHeader: true, children: cols.map((c, ci) => hdrCell(c, ci)) })];
            }
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                bn ? this.toBanglaDigits(i + 1) : String(i + 1), this.getServiceIdDisplay(emp),
                (bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??'')) + (this.getRankQualifications(emp) ? '\n(' + this.getRankQualifications(emp) + ')' : ''),
                (bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??'')) + (emp.tradeRemarks ? '\n(' + emp.tradeRemarks + ')' : ''),
                bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                bn?(emp.presentDistrictNameBN||emp.presentDistrictName||''):(emp.presentDistrictName??''),
                bn?(emp.spousePresentDistrictNameBN||emp.spousePresentDistrictName||''):(emp.spousePresentDistrictName??''),
                this.isInterPosting()
                    ? (bn?(emp.previousRabUnitsBN||emp.previousRabUnits||''):(emp.previousRabUnits??''))
                    : (bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??'')),
                bn ? (this.getUnitFullPath(this.unitNodeMap[emp.transferRabUnitId!] ?? null, true) || this.unitLabelMapBN[emp.transferRabUnitId!] || emp.transferRabUnitName || '') : (emp.transferRabUnitName ?? ''), this.getCombinedRemarks(emp)
            ].map((v, ci) => {
                const lines = v.split('\n');
                const cellParas = lines.map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20, sizeComplexScript: bn ? 20 : undefined, font, language: lang })], alignment: AlignmentType.CENTER }));
                return new TableCell({ children: cellParas, borders: cellBorders, width: { size: colWidths[ci], type: WidthType.DXA } });
            }) }));
            const tableRows = [...headerRows, ...dataRows];
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

        // Initiator — right-positioned, keep entire block together
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

        // Title paragraphs — inside the page border at the top
        const titleChildren: (Paragraph | Table)[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 24, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }
            }),
        ];

        const docChildren: (Paragraph | Table)[] = [...titleChildren, ...mainChildren];

        // Use page borders so every page renders the same border consistently
        const pageBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 10 };

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT },
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

    getServiceIdDisplay(emp: DraftPostingEmployeeRow): string {
        const bn = !this.isEnglish();
        const sid = emp.serviceId || '';
        const prefix = bn ? (emp.prefixNameBN || emp.prefixName || '') : (emp.prefixName || '');
        const displayId = bn && sid ? this.toBanglaDigits(sid) : sid;
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
