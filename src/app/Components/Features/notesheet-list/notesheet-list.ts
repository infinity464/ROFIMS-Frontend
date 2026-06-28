import { Component, Input, OnInit , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TextareaModule } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { FluidModule } from 'primeng/fluid';
import { ActivatedRoute, Router } from '@angular/router';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EmpService } from '@/services/emp-service';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { NoteSheetType, NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, ApprovalStatus, NoteSheetRemarkAction, ApprovalLogAction, ApprovalLogActionOptions, NoteSheetOperationType, DraftPostingStatus, NoteSheetPreviewFrom } from '@/models/enums';
import { ServingMembersService } from '@/services/serving-members.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { CommonCodeService } from '@/services/common-code-service';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { TreeSelectModule } from 'primeng/treeselect';
import { TreeNode } from 'primeng/api';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Table } from 'primeng/table';
import { PostingService } from '@/services/posting.service';
import { DraftPostingEmployeeRow, PostingMemberRemovalHistoryDto } from '@/models/posting.model';
import { EmployeeList } from '@/models/employee-list.model';
import { EmployeeListService } from '@/services/employee-list.service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { IsSendingNotesheetStatus } from '@/models/enums';
import { ForeignVisitInfoService } from '@/services/foreign-visit-info.service';
import { ExBdLeaveApplicationService, ExBdLeaveApplicationModel } from '@/services/ex-bd-leave-application.service';
import { PostingOrderPreviewComponent } from './posting-order-preview/posting-order-preview';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, PageOrientation, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface NoteSheetInfoRow {
  noteSheetId: number;
  noteSheetNo: string;
  noteSheetDate: string;
  wingBattalionId?: number;
  branchId?: number;
  subject: string;
  /** Workflow position: draft | initiator | recommender | final_approval | cancel */
  currentStatus?: string;
  initiatorStatus?: string;
  finalApprovalStatus?: string;
  finalApprovalApprovedDate?: string;
  finalApprovalId?: number;
  lastUpdatedBy?: string;
  /** Type string: General, ExBDLeave, NewPosting, InterPosting; used to route Update and Preview */
  noteSheetType?: string;
  remark?: string;
  referenceNumber?: string;
  draftPostingMasterId?: number | null;
  /** Comma-separated CommonCode member-type ids (CodeType = 'EmployeeType'). */
  employeeTypeIds?: string | null;
  /** Resolved member-type names (EN/BN), filled server-side in the existing list response. */
  employeeTypeNames?: string | null;
  employeeTypeNamesBN?: string | null;
  /** JSON array of { FileId, fileName } from API */
  filesReferences?: string;
  /** True when this note sheet is currently in a step it was backed to. */
  isCurrentlyBacked?: boolean;
  /** Reason given for the most recent back action. */
  lastBackRemark?: string;
  /** Operation type: manual | system_generate */
  noteSheetOperationType?: string;
  /** Whether the note sheet is marked as secret */
  isSecret?: boolean;
  /** True when a PostingOrder has already been generated for this notesheet. */
  hasPostingOrder?: boolean;
}

/** Full model for single note-sheet (get by id, preview, update). */
export interface NoteSheetInfoFull extends NoteSheetInfoRow {
  mainText?: string;
  referenceNumber?: string;
  preparedBy?: string;
  textType?: number; // 0 = English, 1 = Bangla
  unitId?: number;
  employeeId?: number;
  // ── Initiator ──────────────────────────────────────────
  initiatorId?: number;
  initiatorStatus?: string;
  initiatorApproveRemark?: string;
  initiatorCancelRemark?: string;
  initiatorApprovedDate?: string;
  // ── Recommenders ───────────────────────────────────────
  recommendersJson?: string;
  recommenderIdsJson?: string;
  // ── Final Approval ─────────────────────────────────────
  finalApprovalId?: number;
  finalApproverId?: number;
  finalApprovalRemark?: string;
  finalApprovalCancelRemark?: string;
  finalApprovalApprovedDate?: string;
  // ── Other ──────────────────────────────────────────────
  filesReferences?: string;
  createdBy?: string;
  lastUpdatedBy?: string;
  createdDate?: string;
  lastupdate?: string;
  /** Ex-BD Leave specific */
  exBdLeaveApplicationId?: number | null;
  exBdLeaveSubjectId?: number | null;
  /** New Posting specific */
  draftPostingMasterId?: number | null;
  note?: string | null;
  preparedByEmployeeId?: number | null;
}

export type NoteSheetSection = 'draft' | 'pending' | 'approved' | 'declined' | 'all' | 'my-pending';

export const NOTE_SHEET_SECTIONS = {
  DRAFT: 'draft' as NoteSheetSection,
  PENDING: 'pending' as NoteSheetSection,
  APPROVED: 'approved' as NoteSheetSection,
  DECLINED: 'declined' as NoteSheetSection,
  ALL: 'all' as NoteSheetSection,
  MY_PENDING: 'my-pending' as NoteSheetSection,
};

export interface ApprovalLogEntry {
  step: string;
  action: ApprovalLogAction;
  date: string | null;
  remark: string | null;
  employeeId: number | null;
  /** Resolved at runtime */
  serviceId?: string;
  name?: string;
  rank?: string;
}

@Component({
  selector: 'app-notesheet-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    TextareaModule,
    ToastModule,
    FluidModule,
    RichEditorComponent,
    TooltipModule,
    DatePickerModule, FlexibleDateDirective,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    PostingOrderPreviewComponent,
    NotesheetSignatoryComponent,
    ConfirmDialogModule,
    SelectModule,
    TreeSelectModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './notesheet-list.html',
  styleUrl: './notesheet-list.scss'
})
export class NotesheetListComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

  private api = `${environment.apis.core}/NoteSheetInfo`;

  @Input() sectionInput: NoteSheetSection | null = null;
  /** Which section to show (one page per section). */
  section: NoteSheetSection = 'draft';
  /** Optional filter: only show notesheets of this type (e.g. 'NewPosting'). */
  noteSheetTypeFilter: string | null = null;

  unitLabelMap: Record<number, string> = {};
  wingLabelMap: Record<number, string> = {};
  branchLabelMap: Record<number, string> = {};
  purposeLabelMap: Record<number, string> = {};
  countryLabelMap: Record<number, string> = {};

  draftList: NoteSheetInfoRow[] = [];
  pendingList: NoteSheetInfoRow[] = [];
  approvedList: NoteSheetInfoRow[] = [];
  declinedList: NoteSheetInfoRow[] = [];
  allList: NoteSheetInfoRow[] = [];
  /** Unfiltered copies for date filtering */
  private _fullList: NoteSheetInfoRow[] = [];
  loading = false;

  /** Date filter */
  filterDateFrom: Date | null = null;
  filterDateTo: Date | null = null;

  showRemarkDialog = false;
  remarkAction: NoteSheetRemarkAction | null = null;
  remarkText = '';
  selectedRow: NoteSheetInfoRow | null = null;
  currentUserEmployeeId = 0;

  /** Preview dialog */
  showPreviewDialog = false;
  previewNoteSheet: NoteSheetInfoFull | null = null;

  /** View Members modal */
  showMembersDialog = false;
  membersLoading = false;
  membersList: DraftPostingEmployeeRow[] = [];
  membersNoteSheetNo = '';

  /** Approval log dialog */
  showApprovalLogDialog = false;
  approvalLogEntries: ApprovalLogEntry[] = [];
  approvalLogLoading = false;
  approvalLogNoteSheetNo = '';
  previewLoading = false;
  /** Initiator details (show on right, below main text). */
  initiatorDetails: { step: string; name: string; rabId: string; rank: string; serviceRank: string; appointment: string; employeeId?: number; signatureDataUrl?: string } | null = null;
  /** Approvers on left: Recommender(s) + Final Approver (dynamic, no static titles). */
  approversDetails: { step: string; name: string; rabId: string; rank: string; serviceRank: string; appointment: string; employeeId?: number; signatureDataUrl?: string }[] = [];
  /** Prepared by employee details. */
  preparedByDetails: { step: string; name: string; rabId: string; rank: string; serviceRank: string; appointment: string; employeeId?: number; signatureDataUrl?: string } | null = null;

  /** Preview inline edit */
  previewEditing = false;
  savingPreview = false;
  editSubject = '';
  editMainText = '';
  editReferenceNumber = '';

  /** Edit main text modal */
  showEditMainTextDialog = false;
  editMainTextNoteSheet: NoteSheetInfoFull | null = null;
  mainTextEditValue = '';
  savingMainText = false;

  /** Employee details dialog */
  showEmployeesDialog = false;
  employeesDialogTitle = '';
  employeesList: DraftPostingEmployeeRow[] = [];
  loadingEmployees = false;
  selectedEmployees: DraftPostingEmployeeRow[] = [];
  removingEmployees = false;
  private employeesDialogRow: NoteSheetInfoRow | null = null;

  /** Add member to posting list */
  addMemberList: EmployeeList[] = [];
  addMemberLoading = false;
  addMemberSaving = false;
  selectedAddEmployee: EmployeeList | null = null;

  /** Transfer unit tree-select (required on approved-new-posting route) */
  addMemberUnitTreeNodes: TreeNode[] = [];
  selectedAddUnitNode: TreeNode | null = null;
  private addMemberUnitNodeMap: Record<number, TreeNode> = {};
  addMemberTreeLoading = false;
  addMemberRemarks = '';

  /** Removal history dialog */
  showRemovalHistoryDialog = false;
  removalHistoryLoading = false;
  removalHistoryList: PostingMemberRemovalHistoryDto[] = [];
  removalHistoryTitle = '';

  /** Leave Avail dialog */
  showLeaveAvailDialog = false;
  leaveAvailLoading = false;
  leaveAvailSaving = false;
  leaveAvailFromDate: Date | null = null;
  leaveAvailToDate: Date | null = null;
  leaveAvailApp: ExBdLeaveApplicationModel | null = null;

  /** Leave Not Avail dialog */
  showLeaveNotAvailDialog = false;
  leaveNotAvailReason = '';
  leaveNotAvailSaving = false;
  leaveNotAvailApp: ExBdLeaveApplicationModel | null = null;

  readonly statusLabels: Record<string, string> = {
    [NoteSheetCurrentStatus.Draft]:         'Draft',
    [NoteSheetCurrentStatus.Initiator]:     'Pending with Initiator',
    [NoteSheetCurrentStatus.Recommender]:   'Pending with Recommender',
    [NoteSheetCurrentStatus.FinalApproval]: 'Pending with Final Approver',
    [NoteSheetCurrentStatus.Cancel]:        'Cancelled'
  };

  readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;
  readonly NoteSheetRemarkAction  = NoteSheetRemarkAction;
  readonly ApprovalLogAction      = ApprovalLogAction;

  /** Member type ids the logged-in user may access (null = unresolved / no restriction). */
  allowedMemberTypeIds: number[] | null = null;

  constructor(
    private http: HttpClient,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private sharedService: SharedService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private empService: EmpService,
    private noteSheetEditCache: NoteSheetEditCacheService,
    private masterBasicSetup: MasterBasicSetupService,
    private orgService: OrgService,
    private postingService: PostingService,
    private commonCodeService: CommonCodeService,
    private servingMembersService: ServingMembersService,
    private foreignVisitService: ForeignVisitInfoService,
    private exBdLeaveApplicationService: ExBdLeaveApplicationService,
    private employeeListService: EmployeeListService,
    private memberTypeAccess: IdentityUserMemberTypeAccessService
  ) {}

  /** Resolve the current user's accessible member type ids (cache first, then always refetch). */
  private loadCurrentUserMemberTypePermissions(): void {
    const userId = this.sharedService.getCurrentUserId?.() ?? null;
    if (!userId) { this.allowedMemberTypeIds = null; return; }
    this.allowedMemberTypeIds = this.memberTypeAccess.getCachedMemberTypeIds(userId);
    this.memberTypeAccess.cacheForUser(userId).subscribe({
      next: (ids) => { this.allowedMemberTypeIds = Array.isArray(ids) ? ids : []; },
      error: () => { /* keep cached value */ }
    });
  }

  /** True if an employee's member type is within the user's accessible set (no restriction when unresolved). */
  private isAccessibleMemberType(id: number | null | undefined): boolean {
    if (this.allowedMemberTypeIds == null) return true;
    if (id == null) return false;
    return this.allowedMemberTypeIds.includes(id);
  }

  /** Member-type names for the column — resolved server-side into the existing list row (no extra call). */
  memberTypeNames(row: NoteSheetInfoRow): string {
    const bn = !this.isPreviewEnglish();
    const v = (bn ? (row?.employeeTypeNamesBN || row?.employeeTypeNames) : (row?.employeeTypeNames || row?.employeeTypeNamesBN)) || '';
    return v.trim() || '-';
  }

  /** Open preview page: navigate to the type-specific preview route */
  openPreview(row: NoteSheetInfoRow): void {
    let route = '/notesheet-preview/general';
    if (row.noteSheetType === NoteSheetType.ExBDLeave) {
      route = '/notesheet-preview/exbd';
    } else if (row.noteSheetType === NoteSheetType.NewPosting || row.noteSheetType === NoteSheetType.InterPosting) {
      route = '/notesheet-preview/posting';
    }
    const queryParams: Record<string, string | number> = { id: row.noteSheetId };
    // When previewing from the Pending or My-Approval section, pass a marker so preview can
    // show inline approval actions (Approve/Decline/Back/View Members/Log).
    if (this.section === NOTE_SHEET_SECTIONS.PENDING || this.section === NOTE_SHEET_SECTIONS.MY_PENDING) {
      queryParams['from'] = NoteSheetPreviewFrom.Pending;
      // Remember which list we came from so the preview returns here after an action.
      queryParams['returnUrl'] = this.router.url;
    }
    this.router.navigate([route], { queryParams });
  }

  openViewMembers(row: NoteSheetInfoRow): void {
    if (!row.draftPostingMasterId) return;
    this.membersNoteSheetNo = row.noteSheetNo || '';
    this.membersLoading = true;
    this.membersList = [];
    this.showMembersDialog = true;

    const obs = row.noteSheetType === NoteSheetType.InterPosting
      ? this.postingService.getDraftInterPostingEmployees(row.draftPostingMasterId)
      : this.postingService.getDraftPostingEmployees(row.draftPostingMasterId);

    obs.subscribe({
      next: (list: any[]) => { this.membersList = list ?? []; this.membersLoading = false; },
      error: (err: any) => { this.membersLoading = false; }
    });
  }

  /** Load approval chain: Prepared by, Initiator (right), Recommender(s) + Final Approver (left). All dynamic. Also loads signatures. */
  private loadApprovalChain(ns: NoteSheetInfoFull): void {
    const preparedByEmpId = ns.preparedByEmployeeId && ns.preparedByEmployeeId > 0 ? ns.preparedByEmployeeId : null;
    const initiatorId = ns.initiatorId && ns.initiatorId > 0 ? ns.initiatorId : null;
    const approverIds: { empId: number; step: string }[] = [];
    try {
      const json = ns.recommenderIdsJson;
      if (json && typeof json === 'string') {
        const arr = JSON.parse(json) as number[] | { EmployeeId?: number; employeeId?: number }[];
        if (Array.isArray(arr)) {
          arr.forEach((r, i) => {
            const id = typeof r === 'number' ? r : (r.EmployeeId ?? r.employeeId);
            if (id && id > 0) approverIds.push({ empId: id, step: `Recommender ${arr.length > 1 ? i + 1 : ''}`.trim() });
          });
        }
      }
    } catch { /* ignore */ }
    const finalApproverEmpId = (ns.finalApprovalId && ns.finalApprovalId > 0)
      ? ns.finalApprovalId
      : (ns.finalApproverId && ns.finalApproverId > 0 ? ns.finalApproverId : null);
    if (finalApproverEmpId) approverIds.push({ empId: finalApproverEmpId, step: 'Final Approver' });

    const allIds = [
      ...(preparedByEmpId ? [{ empId: preparedByEmpId, step: 'Prepared by' }] : []),
      ...(initiatorId ? [{ empId: initiatorId, step: 'Initiator' }] : []),
      ...approverIds
    ];
    if (allIds.length === 0) return;
    const obs = allIds.map(({ empId, step }) =>
      forkJoin({
        searchInfo: this.empService.getEmployeeSearchInfo(empId),
        empInfo: this.empService.getEmployeeById(empId).pipe(catchError(() => of(null)))
      }).pipe(
        map(({ searchInfo, empInfo }) => {
          const emp = empInfo as any;
          const info = searchInfo as any;
          const name = info?.fullNameEN ?? info?.FullNameEN ?? emp?.FullNameEN ?? emp?.fullNameEN ?? '-';
          const rabId = emp?.RABID || emp?.Rabid || emp?.rabid || emp?.rabID || emp?.rabId
            || info?.rabID || info?.RABID || info?.rabid || info?.Rabid || info?.rabId || '-';
          const rank = info?.rank ?? info?.Rank ?? '-';
          const appointment = info?.appointment ?? info?.Appointment ?? emp?.Appointment ?? '';
          return { step, name, rabId, rank, serviceRank: rank, appointment, employeeId: empId };
        })
      )
    );
    forkJoin(obs).subscribe({
      next: (results) => {
        let idx = 0;
        this.preparedByDetails = preparedByEmpId ? results[idx++] ?? null : null;
        this.initiatorDetails = initiatorId ? results[idx++] ?? null : null;
        this.approversDetails = approverIds.length > 0 ? results.slice(idx) : [];
        this.loadSignaturesForChain();
      },
      error: (err: any) => {}
    });
  }

  /** Load signature images for all signatories in the approval chain. */
  private loadSignaturesForChain(): void {
    const allDetails = [
      ...(this.preparedByDetails ? [this.preparedByDetails] : []),
      ...(this.initiatorDetails ? [this.initiatorDetails] : []),
      ...this.approversDetails
    ].filter(d => d.employeeId && d.employeeId > 0);

    for (const detail of allDetails) {
      this.empService.getSignatureBlob(detail.employeeId!).subscribe({
        next: (blob) => {
          if (blob && blob.size > 0) {
            const reader = new FileReader();
            reader.onloadend = () => { detail.signatureDataUrl = reader.result as string; };
            reader.readAsDataURL(blob);
          }
        },
        error: (err: any) => { /* no signature available */ }
      });
    }
  }

  /** Whether preview is in English (textType 0 = en). */
  isPreviewEnglish(): boolean {
    return (this.previewNoteSheet?.textType ?? 0) === 0;
  }

  /** Whether the previewed note sheet is Ex-BD Leave. */
  isPreviewExBdLeave(): boolean {
    return this.previewNoteSheet?.noteSheetType === NoteSheetType.ExBDLeave;
  }

  /** Called when posting-order-preview saves successfully. */
  onPostingOrderSaved(): void {
    this.loadAll();
  }

  /** Whether the previewed notesheet is a draft (editable). */
  isPreviewDraft(): boolean {
    return this.previewNoteSheet?.currentStatus === NoteSheetCurrentStatus.Draft;
  }

  /** Whether the previewed notesheet can be edited (draft, or initiator in pending section). */
  isPreviewEditable(): boolean {
    if (this.previewNoteSheet?.currentStatus === NoteSheetCurrentStatus.Draft) return true;
    if (this.section === NOTE_SHEET_SECTIONS.PENDING && this.previewNoteSheet?.currentStatus === NoteSheetCurrentStatus.Initiator) return true;
    return false;
  }

  shouldShowSignature(step: string): boolean {
    const ns = this.previewNoteSheet;
    if (!ns) return false;

    if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;
    if (step === 'Initiator') return ns.initiatorStatus === ApprovalStatus.Approve;
    if (step.startsWith('Recommender')) {
      const cs = ns.currentStatus ?? '';
      return cs === NoteSheetCurrentStatus.Recommender
          || cs === NoteSheetCurrentStatus.FinalApproval
          || cs === NoteSheetCurrentStatus.Cancel;
    }
    if (step === 'Final Approver') return ns.finalApprovalStatus === ApprovalStatus.Approve;
    return false;
  }

  togglePreviewEdit(): void {
    this.editSubject = this.previewNoteSheet?.subject ?? '';
    this.editMainText = this.previewNoteSheet?.mainText ?? '';
    this.editReferenceNumber = this.previewNoteSheet?.referenceNumber ?? '';
    this.previewEditing = true;
  }

  cancelPreviewEdit(): void {
    this.previewEditing = false;
  }

  savePreviewChanges(): void {
    if (!this.previewNoteSheet) return;
    this.savingPreview = true;
    const payload = {
      ...this.previewNoteSheet,
      subject: this.editSubject,
      mainText: this.editMainText,
      referenceNumber: this.editReferenceNumber
    };
    this.http.post<{ statusCode?: number }>(`${this.api}/UpdateAsyn`, payload).subscribe({
      next: (res) => {
        this.savingPreview = false;
        if (res?.statusCode === 200) {
          this.previewNoteSheet!.subject = this.editSubject;
          this.previewNoteSheet!.mainText = this.editMainText;
          this.previewNoteSheet!.referenceNumber = this.editReferenceNumber;
          this.previewEditing = false;
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note sheet updated.' });
          this.loadAll();
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Notice', detail: 'Update failed.' });
        }
      },
      error: (err: any) => {
        this.savingPreview = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed.' });
      }
    });
  }

  /** Open employee details dialog for a note-sheet that has a draftPostingMasterId. */
  openEmployeesDialog(row: NoteSheetInfoRow): void {
    const masterId = row.draftPostingMasterId;
    if (!masterId) {
      this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No Draft Posting linked to this note-sheet.' });
      return;
    }
    this.employeesDialogRow = row;
    this.employeesDialogTitle = `Employees in Posting List – ${row.noteSheetNo || ''}`;
    this.employeesList = [];
    this.selectedEmployees = [];
    this.loadingEmployees = true;
    this.showEmployeesDialog = true;
    // Reset add-member panel
    this.selectedAddEmployee = null;
    this.addMemberList = [];
    this.selectedAddUnitNode = null;
    this.addMemberRemarks = '';
    // Load employees available to add (draft status)
    this.loadAddMemberList();
    // Load unit tree if on approved route (transfer unit is required)
    if (this.isApprovedPostingRoute) this.loadAddMemberUnitTree();

    const isInter = row.noteSheetType === NoteSheetType.InterPosting;
    const obs = isInter
      ? this.postingService.getDraftInterPostingEmployees(masterId)
      : this.postingService.getDraftPostingEmployees(masterId);

    obs.subscribe({
      next: (list: any[]) => {
        this.employeesList = (list ?? []).map(e => isInter
          ? { ...e, draftPostingDetailId: e.draftInterPostingDetailId ?? e.draftPostingDetailId }
          : e
        );
        this.loadingEmployees = false;
      },
      error: (err: any) => {
        this.loadingEmployees = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee list.' });
      }
    });
  }

  removeSelectedEmployees(): void {
    const row = this.employeesDialogRow;
    if (!row?.draftPostingMasterId || this.selectedEmployees.length === 0) return;

    // Once the note-sheet is approved, its posting-list members can no longer be removed.
    if (this.isDialogNoteSheetApproved) {
      this.messageService.add({ severity: 'warn', summary: 'Not allowed', detail: 'This note-sheet is already approved — members can no longer be removed from the posting list.' });
      return;
    }

    const count = this.selectedEmployees.length;
    const isLastRemoval = count >= this.employeesList.length;
    this.confirmationService.confirm({
      message: `Are you sure you want to remove ${count} employee(s) from this posting list? They will be returned to the supernumerary list.`,
      header: 'Confirm Remove',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.removingEmployees = true;
        const isInter = row.noteSheetType === NoteSheetType.InterPosting;
        const detailIds = this.selectedEmployees.map(m => m.draftPostingDetailId);
        this.postingService.removeDraftPostingDetails(
          row.draftPostingMasterId!, detailIds, isInter,
          row.noteSheetId, row.noteSheetNo
        ).subscribe({
          next: (res) => {
            this.messageService.add({ severity: 'success', summary: 'Success', detail: res.description || `${count} employee(s) removed.` });
            this.selectedEmployees = [];
            this.removingEmployees = false;
            if (isLastRemoval) {
              this.showEmployeesDialog = false;
              this.loadSection();
            } else {
              this.openEmployeesDialog(row);
            }
          },
          error: (err: any) => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || err?.error?.message || 'Failed to remove employees.' });
            this.removingEmployees = false;
          }
        });
      }
    });
  }

  /** Load employees available to be added to the current posting list.
   *  Inter-posting: employees marked for inter posting (same list as add-draft-inter-posting "Presently Serving Employees").
   *  New posting: employees with Draft status. */
  private loadAddMemberList(): void {
    this.addMemberLoading = true;
    const isInter = this.employeesDialogRow?.noteSheetType === NoteSheetType.InterPosting;
    const obs = isInter
      ? this.employeeListService.getEmployeesMarkedForInterPosting()
      : this.employeeListService.getEmployeesByIsSendingNotesheetStatus(IsSendingNotesheetStatus.Draft);
    obs.subscribe({
      next: (list) => {
        // Scope the add-member dropdown to the user's accessible member types.
        this.addMemberList = (list ?? []).filter((e) => this.isAccessibleMemberType(e.memberTypeId));
        this.addMemberLoading = false;
      },
      error: () => { this.addMemberLoading = false; }
    });
  }

  /** Add the selected employee to the current posting list. */
  addMemberToPosting(): void {
    const row = this.employeesDialogRow;
    if (!row?.draftPostingMasterId || !this.selectedAddEmployee) return;
    if (this.isApprovedPostingRoute && !this.addMemberTransferUnitId) {
      this.messageService.add({ severity: 'warn', summary: 'Required', detail: 'Please select a Transfer Unit (Wing / Branch / Section).' });
      return;
    }

    const empId = this.selectedAddEmployee.employeeID;
    const isInter = row.noteSheetType === NoteSheetType.InterPosting;
    const createdBy = this.sharedService.getCurrentUser?.() ?? 'system';

    this.addMemberSaving = true;
    this.postingService.addDraftPostingDetail(
      row.draftPostingMasterId, isInter, [empId], createdBy, this.addMemberTransferUnitId, this.addMemberRemarks
    ).subscribe({
      next: (res) => {
        this.messageService.add({ severity: 'success', summary: 'Added', detail: res.description || 'Employee added successfully.' });
        this.selectedAddEmployee = null;
        this.selectedAddUnitNode = null;
        this.addMemberRemarks = '';
        this.addMemberSaving = false;
        this.openEmployeesDialog(row);
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || err?.error?.message || 'Failed to add employee.' });
        this.addMemberSaving = false;
      }
    });
  }

  get isApprovedPostingRoute(): boolean {
    return this._router.url.includes('approved-new-posting') || this._router.url.includes('approved-inter-posting');
  }

  get isInterPostingDialog(): boolean {
    return this.employeesDialogRow?.noteSheetType === NoteSheetType.InterPosting;
  }

  /** True when the current dialog row already has a generated posting order — add/remove locked. */
  get isDialogRowPosted(): boolean {
    return this.isApprovedPostingRoute && (this.employeesDialogRow?.hasPostingOrder === true);
  }

  /** True once the dialog's note-sheet is approved — members can no longer be removed from the posting list. */
  get isDialogNoteSheetApproved(): boolean {
    return this.employeesDialogRow?.finalApprovalStatus === ApprovalStatus.Approve;
  }

  get addMemberTransferUnitId(): number | null {
    return this.selectedAddUnitNode ? Number(this.selectedAddUnitNode.key) : null;
  }

  getAddMemberUnitFullPath(node: TreeNode | null): string {
    if (!node) return '';
    const parts: string[] = [];
    let cur: TreeNode | null = node;
    while (cur) {
      parts.unshift(cur.label ?? '');
      cur = (cur.data?.parent) ?? null;
    }
    return parts.join(' > ');
  }

  private loadAddMemberUnitTree(): void {
    if (this.addMemberUnitTreeNodes.length > 0) return; // already loaded
    this.addMemberTreeLoading = true;
    this.orgService.getAll(0).subscribe({
      next: (roots) => {
        this.addMemberUnitNodeMap = {};
        this.addMemberUnitTreeNodes = roots
          .filter(r => r.status === 1)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(r => this.toAddMemberTreeNode(r, null));
        this.addMemberTreeLoading = false;
      },
      error: () => { this.addMemberTreeLoading = false; }
    });
  }

  private toAddMemberTreeNode(node: any, parent: TreeNode | null): TreeNode {
    const tn: TreeNode = {
      key: String(node.id),
      label: node.nameEN || node.nameBN || `ID ${node.id}`,
      data: { id: node.id, nameEN: node.nameEN, nameBN: node.nameBN, parent },
      leaf: false,
      children: []
    };
    this.addMemberUnitNodeMap[node.id] = tn;
    return tn;
  }

  onAddMemberNodeExpand(event: any): void {
    const node: TreeNode = event.node;
    if (node.children && node.children.length > 0) return;
    this.orgService.loadChildren(Number(node.key)).subscribe({
      next: (children) => {
        node.children = children
          .filter(c => c.status === 1)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(c => this.toAddMemberTreeNode(c, node));
        if (node.children.length === 0) node.leaf = true;
        this.addMemberUnitTreeNodes = [...this.addMemberUnitTreeNodes];
      },
      error: () => {}
    });
  }

  onAddMemberNodeSelect(event: any): void {
    this.selectedAddUnitNode = event.node;
  }

  onAddMemberNodeClear(): void {
    this.selectedAddUnitNode = null;
  }

  openRemovalHistory(row: NoteSheetInfoRow): void {
    if (!row.draftPostingMasterId) return;
    const isInter = row.noteSheetType === NoteSheetType.InterPosting;
    this.removalHistoryTitle = `Removal History — ${row.noteSheetNo || 'Notesheet'}`;
    this.removalHistoryList = [];
    this.removalHistoryLoading = true;
    this.showRemovalHistoryDialog = true;
    this.postingService.getPostingMemberRemovalHistory(row.draftPostingMasterId, isInter).subscribe({
      next: (list) => { this.removalHistoryList = list ?? []; this.removalHistoryLoading = false; },
      error: () => { this.removalHistoryLoading = false; }
    });
  }

  formatRemovalDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return String(value); }
  }

  formatEmployeeDate(value: string | null | undefined): string {
    if (!value) return '-';
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return String(value); }
  }

  /** Whether the previewed note sheet is New Posting. */
  isPreviewNewPosting(): boolean {
    return this.previewNoteSheet?.noteSheetType === NoteSheetType.NewPosting;
  }

  /** Preview dialog header: type-specific. */
  getPreviewDialogHeader(): string {
    const en = this.isPreviewEnglish();
    if (this.isPreviewExBdLeave())
      return en ? 'Note-Sheet for Ex-BD Leave – Preview' : 'এক্স-বিডি ছুটির মন্তব্যপত্র – প্রাকদর্শন';
    if (this.isPreviewNewPosting())
      return en ? 'Posting Order Note-Sheet – Preview' : 'পোস্টিং অর্ডার মন্তব্যপত্র – প্রাকদর্শন';
    return en ? 'Note Sheet – Preview' : 'মন্তব্যপত্র – প্রাকদর্শন';
  }

  /** Sanitized main text for preview (formal doc uses same content). */
  getPreviewMainTextSafe(): SafeHtml {
    const html = this.previewNoteSheet?.mainText ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  getPreviewReferenceNumberSafe(): SafeHtml {
    const html = this.previewNoteSheet?.referenceNumber ?? '—';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /** Supporting Documents list from filesReferences JSON for preview. */
  getPreviewSupportingDocumentsList(): string[] {
    return this.getPreviewSupportingDocumentsWithIds().map((d) => d.fileName);
  }

  /** Supporting Documents with fileId and fileName for preview dialog (download/preview). */
  getPreviewSupportingDocumentsWithIds(): { fileId: number; fileName: string }[] {
    const json = this.previewNoteSheet?.filesReferences;
    if (!json || typeof json !== 'string') return [];
    try {
      const arr = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((r) => (r.FileId ?? r.fileId) != null)
        .map((r) => ({
          fileId: r.FileId ?? r.fileId ?? 0,
          fileName: (r.fileName ?? r.FileName ?? '').trim() || 'download'
        }))
        .filter((d) => d.fileId > 0);
    } catch {
      return [];
    }
  }

  /** Supporting Documents list for a list row (from filesReferences JSON). Returns file names; if none, empty array. */
  getRowSupportingDocumentsList(row: NoteSheetInfoRow): string[] {
    return this.getRowSupportingDocumentsWithIds(row).map((d) => d.fileName);
  }

  /** Supporting Documents with fileId and fileName for download/preview. */
  getRowSupportingDocumentsWithIds(row: NoteSheetInfoRow): { fileId: number; fileName: string }[] {
    const json = row?.filesReferences;
    if (!json || typeof json !== 'string') return [];
    try {
      const arr = JSON.parse(json) as { FileId?: number; fileId?: number; fileName?: string; FileName?: string }[];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((r) => (r.FileId ?? r.fileId) != null)
        .map((r) => ({
          fileId: r.FileId ?? r.fileId ?? 0,
          fileName: (r.fileName ?? r.FileName ?? '').trim() || 'download'
        }))
        .filter((d) => d.fileId > 0);
    } catch {
      return [];
    }
  }

  onDownloadSupportingDoc(fileId: number, fileName: string): void {
    this.empService.downloadFile(fileId).subscribe({
      next: (blob) => this.empService.triggerFileDownload(blob, fileName),
      error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file.' })
    });
  }

  onPreviewSupportingDoc(fileId: number, fileName: string): void {
    this.empService.downloadFile(fileId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to open file.' })
    });
  }

  /** Open edit main text modal: fetch full note-sheet, show editor. */
  openEditMainText(row: NoteSheetInfoRow): void {
    this.editMainTextNoteSheet = null;
    this.mainTextEditValue = '';
    this.showEditMainTextDialog = true;
    this.http.get<NoteSheetInfoFull[]>(`${this.api}/GetFilteredByKeysAsyn/${row.noteSheetId}`).subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : [];
        const full = list[0] ?? null;
        this.editMainTextNoteSheet = full;
        this.mainTextEditValue = full?.mainText ?? '';
      },
      error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load note-sheet.' })
    });
  }

  /** Save main text from modal (PATCH full model with new mainText via UpdateAsyn). */
  saveMainText(): void {
    if (!this.editMainTextNoteSheet) return;
    this.savingMainText = true;
    const payload = { ...this.editMainTextNoteSheet, mainText: this.mainTextEditValue };
    this.http.post<{ statusCode?: number }>(`${this.api}/UpdateAsyn`, payload).subscribe({
      next: (res) => {
        this.savingMainText = false;
        if (res?.statusCode === 200) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Main text updated.' });
          this.showEditMainTextDialog = false;
          this.loadAll();
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Notice', detail: 'Update failed.' });
        }
      },
      error: (err: any) => {
        this.savingMainText = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Update failed.' });
      }
    });
  }

  /** Fetch draft, cache it, then navigate to the correct form so the form has data even if its API returns empty. */
  goToUpdate(row: NoteSheetInfoRow): void {
    this.http.get<any>(`${this.api}/GetFilteredByKeysAsyn/${row.noteSheetId}`).subscribe({
      next: (data) => {
        const raw = data != null && typeof data === 'object' ? (data.data ?? data.value ?? data) : data;
        const list = Array.isArray(raw) ? raw : raw != null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : [];
        const full = list[0] ?? null;
        if (full) this.noteSheetEditCache.set(row.noteSheetId, full);
        const noteSheetType = full?.noteSheetType ?? full?.NoteSheetType ?? row.noteSheetType;
        let route = '/notesheet-generate';
        if (noteSheetType === NoteSheetType.ExBDLeave) route = '/notesheet-ex-bd-leave';
        else if (noteSheetType === NoteSheetType.NewPosting) route = '/posting/notesheet-generate';
        else if (noteSheetType === NoteSheetType.InterPosting) route = '/posting/inter-posting-notesheet-generate';
        this.router.navigate([route], { queryParams: { id: row.noteSheetId } });
      },
      error: (err: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load note sheet for update.' });
        this.router.navigate(['/notesheet-generate'], { queryParams: { id: row.noteSheetId } });
      }
    });
  }

  // ─── General notesheet export helpers ─────────────────────────

  private readonly stepTranslations: Record<string, string> = {
    'Prepared by': 'প্রস্তুতকারী',
    'Initiator': 'সূচনাকারী',
    'Final Approver': 'চূড়ান্ত অনুমোদনকারী'
  };

  private translateStep(step: string): string {
    if (this.isPreviewEnglish()) return step;
    if (step.startsWith('Recommender')) {
      const suffix = step.replace('Recommender', '').trim();
      return suffix ? `সুপারিশকারী ${suffix}` : 'সুপারিশকারী';
    }
    return this.stepTranslations[step] ?? step;
  }

  protected stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) { array[i] = binary.charCodeAt(i); }
    return array;
  }

  // ─── General notesheet exports ──────────────────────────────

  async exportGeneralWord(): Promise<void> {
    const ns = this.previewNoteSheet;
    if (!ns) return;
    const bn = !this.isPreviewEnglish();
    const font = bn ? 'SutonnyMJ' : 'Times New Roman';

    const titlePara = new Paragraph({
      children: [new TextRun({ text: bn ? 'মন্তব্যপত্র' : 'NOTE SHEET', bold: true, size: 32, font })],
      alignment: AlignmentType.CENTER, spacing: { after: 200 }
    });

    const metaParts: string[] = [];
    if (ns.noteSheetNo) metaParts.push(`${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'} ${ns.noteSheetNo}`);
    if (ns.noteSheetDate) metaParts.push(`${bn ? 'তারিখ:' : 'Date:'} ${this.formatDate(ns.noteSheetDate)}`);
    if (ns.referenceNumber) metaParts.push(`${bn ? 'সুত্র:' : 'Reference:'} ${ns.referenceNumber}`);
    const metaPara = new Paragraph({
      children: [new TextRun({ text: metaParts.join('    '), size: 20, font })],
      spacing: { after: 200 }
    });

    const children: Paragraph[] = [titlePara, metaPara];

    if (ns.subject) {
      children.push(new Paragraph({
        children: [new TextRun({ text: ns.subject, bold: true, size: 24, font })],
        alignment: AlignmentType.CENTER, spacing: { after: 200 }
      }));
    }

    const mainTextPlain = this.stripHtml(ns.mainText ?? '');
    if (mainTextPlain) {
      children.push(new Paragraph({
        children: [new TextRun({ text: mainTextPlain, size: 22, font })],
        spacing: { after: 200 }
      }));
    }

    // Closing
    children.push(new Paragraph({
      children: [new TextRun({ text: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.', italics: true, size: 20, font })],
      spacing: { before: 200, after: 300 }
    }));

    // Helper: build sig paragraphs
    const buildSigParas = (detail: any, roleLabel: string, align: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph[] => {
      const paras: Paragraph[] = [];
      if (!detail) return paras;
      const showSig = detail.signatureDataUrl && this.shouldShowSignature(detail.step ?? roleLabel);
      if (showSig) {
        paras.push(new Paragraph({
          children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(detail.signatureDataUrl), transformation: { width: 150, height: 50 } })],
          alignment: align, spacing: { before: 200 }
        }));
      }
      paras.push(new Paragraph({
        children: [new TextRun({ text: '______________________________', size: 20, font })],
        alignment: align, spacing: showSig ? {} : { before: 200 }
      }));
      paras.push(new Paragraph({
        children: [new TextRun({ text: roleLabel, bold: true, size: 20, font })],
        alignment: align
      }));
      const lines = [
        detail.name,
        detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
        detail.rank && detail.rank !== '-' ? detail.rank : '',
        detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
      ].filter((l: string) => l && l !== '-' && l !== '—');
      lines.forEach((line: string) => {
        paras.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: align }));
      });
      return paras;
    };

    // Initiator (right)
    if (this.initiatorDetails) {
      children.push(...buildSigParas(this.initiatorDetails, this.translateStep(this.initiatorDetails.step), AlignmentType.RIGHT));
      children.push(new Paragraph({ spacing: { before: 300 } }));
    }
    // Recommender(s) + Final Approver (left)
    for (const approver of this.approversDetails) {
      children.push(...buildSigParas(approver, this.translateStep(approver.step), AlignmentType.LEFT));
      children.push(new Paragraph({ spacing: { before: 200 } }));
    }

    const doc = new Document({
      sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } }, children }]
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `NoteSheet_${ns.noteSheetNo ?? 'export'}.docx`);
  }

  async exportGeneralPdf(): Promise<void> {
    const ns = this.previewNoteSheet;
    if (!ns) return;
    const bn = !this.isPreviewEnglish();
    const fontFamily = bn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', serif";
    const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

    const metaParts: string[] = [];
    if (ns.noteSheetNo) metaParts.push(`<span><strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(ns.noteSheetNo)}</span>`);
    if (ns.noteSheetDate) metaParts.push(`<span><strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(ns.noteSheetDate))}</span>`);
    if (ns.referenceNumber) metaParts.push(`<span><strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(ns.referenceNumber)}</span>`);

    const sigHtml = this.buildGeneralSignatoriesHtml();
    const subjectHtml = ns.subject ? `<div style="text-align:center;font-weight:700;font-size:12pt;margin-bottom:10px;padding:6px;background:#f8fafc;border-radius:4px">${this.escapeHtml(ns.subject)}</div>` : '';
    const closingText = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';

    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:760px;padding:30px;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
    container.innerHTML = `
      <style>
        .ns-pdf-wrap, .ns-pdf-wrap * { word-wrap:break-word!important; overflow-wrap:break-word!important; white-space:normal!important; max-width:100%!important; box-sizing:border-box!important; }
        .ns-pdf-wrap img { max-width:100%!important; height:auto!important; }
      </style>
      <div class="ns-pdf-wrap" style="font-family:${fontFamily};font-size:11pt;color:#000;line-height:1.6;width:100%">
        <h1 style="font-size:16pt;text-align:center;margin:0 0 10px 0">${this.escapeHtml(title)}</h1>
        <div style="font-size:10pt;margin-bottom:12px;display:flex;gap:24px;flex-wrap:wrap">${metaParts.join('')}</div>
        ${subjectHtml}
        <div style="margin-bottom:12px">${ns.mainText ?? ''}</div>
        <p style="font-style:italic;color:#64748b;margin-top:16px;padding-top:10px;border-top:1px dashed #ccc">${this.escapeHtml(closingText)}</p>
        ${sigHtml}
      </div>`;
    document.body.appendChild(container);

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false, scrollY: -window.scrollY, height: container.scrollHeight, windowHeight: container.scrollHeight });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20;
      const pdfPageHeight = pdf.internal.pageSize.getHeight() - 20;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      if (scaledHeight <= pdfPageHeight) {
        pdf.addImage(imgData, 'JPEG', 10, 10, pdfWidth, scaledHeight);
      } else {
        let remainingHeight = imgHeight;
        let srcY = 0;
        let page = 0;
        const sliceHeight = Math.floor(pdfPageHeight / ratio);
        while (remainingHeight > 0) {
          if (page > 0) pdf.addPage();
          const currentSlice = Math.min(sliceHeight, remainingHeight);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = imgWidth;
          sliceCanvas.height = currentSlice;
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, srcY, imgWidth, currentSlice, 0, 0, imgWidth, currentSlice);
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 10, 10, pdfWidth, currentSlice * ratio);
          srcY += currentSlice;
          remainingHeight -= currentSlice;
          page++;
        }
      }
      pdf.save(`NoteSheet_${ns.noteSheetNo ?? 'export'}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  }

  printGeneralPreview(): void {
    const ns = this.previewNoteSheet;
    if (!ns) return;
    const bn = !this.isPreviewEnglish();
    const fontFamily = bn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', serif";
    const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

    const metaParts: string[] = [];
    if (ns.noteSheetNo) metaParts.push(`<strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(ns.noteSheetNo)}`);
    if (ns.noteSheetDate) metaParts.push(`<strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(ns.noteSheetDate))}`);
    if (ns.referenceNumber) metaParts.push(`<strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(ns.referenceNumber)}`);

    const sigHtml = this.buildGeneralSignatoriesHtml();
    const subjectHtml = ns.subject ? `<div style="text-align:center;font-weight:700;font-size:12pt;margin-bottom:12px;padding:6px;background:#f8fafc;border-radius:4px">${this.escapeHtml(ns.subject)}</div>` : '';
    const closingText = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: ${fontFamily}; font-size: 11pt; margin: 0; padding: 20px; color: #000; line-height: 1.6; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 12px 0; }
  .meta { font-size: 10pt; margin-bottom: 14px; display: flex; gap: 28px; flex-wrap: wrap; }
  .content { margin-bottom: 14px; }
  .content p { margin: 0 0 0.5rem 0; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="meta">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>
  ${subjectHtml}
  <div class="content">${ns.mainText ?? ''}</div>
  <p style="font-style:italic;color:#64748b;margin-top:16px;padding-top:10px;border-top:1px dashed #ccc">${this.escapeHtml(closingText)}</p>
  ${sigHtml}
</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  }

  private buildGeneralSignatoriesHtml(): string {
    const marginCenter = 'margin-left:auto;margin-right:auto';
    const sigImg = (detail: any, align: string) => detail?.signatureDataUrl && this.shouldShowSignature(detail.step)
      ? `<img src="${detail.signatureDataUrl}" style="width:150px;height:50px;object-fit:contain;display:block;${align === 'right' ? 'margin-left:auto' : align === 'center' ? marginCenter : ''}" />`
      : '';
    const sigBlock = (detail: any, align: string) => {
      if (!detail) return '';
      const lineMargin = align === 'right' ? 'margin-left:auto' : align === 'center' ? marginCenter : '';
      const lines = [
        detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
        detail.rank && detail.rank !== '-' ? detail.rank : '',
        detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
      ].filter(Boolean);
      return `<div style="text-align:${align};margin-top:20px;line-height:1.6">
        ${sigImg(detail, align)}
        <div style="width:160px;border-bottom:1.5px solid #000;margin-bottom:4px;${lineMargin}"></div>
        <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#000">${this.escapeHtml(this.translateStep(detail.step))}</div>
        <div><strong>${this.escapeHtml(detail.name)}</strong></div>
        ${lines.map((l: string) => `<div style="font-size:10pt">${this.escapeHtml(l)}</div>`).join('')}
      </div>`;
    };

    let rightHtml = '';
    if (this.initiatorDetails) {
      rightHtml += sigBlock(this.initiatorDetails, 'right');
    }
    let centerHtml = '';
    for (const approver of this.approversDetails) {
      centerHtml += sigBlock(approver, 'center');
    }

    if (!centerHtml && !rightHtml) return '';
    return `<div style="margin-top:30px">
      ${rightHtml ? `<div>${rightHtml}</div>` : ''}
      ${centerHtml ? `<div style="margin-top:24px">${centerHtml}</div>` : ''}
    </div>`;
  }

  ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();

    if (this.sectionInput) {
      this.section = this.sectionInput;
      this.loadLookups();
      this.loadSection();
    } else {
      this.route.data.subscribe((data) => {
        this.section = (data['section'] as NoteSheetSection) || 'draft';
        this.noteSheetTypeFilter = data['noteSheetTypeFilter'] || null;
        this.loadLookups();
        this.loadSection();
      });
    }
    const userId = this.sharedService.getCurrentUserId?.();
    if (userId) {
      this.http.get<any[]>(`${environment.apis.core}/IdentityUserMapping/GetMappings`).subscribe({
        next: (list) => {
          const me = (Array.isArray(list) ? list : []).find(
            (m: any) => m.userId === userId
          );
          if (me?.employeeId) this.currentUserEmployeeId = me.employeeId;
        },
        error: (err: any) => {}
      });
    }
  }

  /** Extract list from API response (handles raw array or wrapped { data: [...] }). */
  private parseListResponse(data: unknown): NoteSheetInfoRow[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data))
      return (data as { data: NoteSheetInfoRow[] }).data;
    return [];
  }

  /** Load only the current section's data. */
  loadSection(): void {
    this.loading = true;
    const onNext = (data: unknown) => {
      const list = this.parseListResponse(data);
      this._fullList = list;
      this.filterDateFrom = null;
      this.filterDateTo = null;
      this.setCurrentList(list);
      this.loading = false;
    };
    const onErr = () => {
      this._fullList = [];
      this.setCurrentList([]);
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note-sheet list.' });
      this.loading = false;
    };

    // "My Approval" lists: GetMyPending returns only the system-generate note sheets currently
    // waiting on the logged-in user, already filtered by type — so no status map is applied.
    if (this.section === NOTE_SHEET_SECTIONS.MY_PENDING) {
      const myParams: Record<string, string> = {};
      if (this.noteSheetTypeFilter) myParams['noteSheetType'] = this.noteSheetTypeFilter;
      this.http.get<unknown>(`${this.api}/GetMyPending`, { params: myParams }).subscribe({ next: onNext, error: onErr });
      return;
    }

    const base = `${this.api}/GetByStatus`;
    const statusMap: Record<NoteSheetSection, string> = {
      draft:    '',
      pending:  '',
      approved: NoteSheetCurrentStatus.FinalApproval,
      declined: NoteSheetCurrentStatus.Cancel,
      all: '',
      'my-pending': ''
    };
    let params: Record<string, string> = {};
    if (statusMap[this.section]) {
      params['currentStatus'] = statusMap[this.section];
    }
    if (this.noteSheetTypeFilter) {
      params['noteSheetType'] = this.noteSheetTypeFilter;
    }
    this.http.get<unknown>(base, { params }).subscribe({ next: onNext, error: onErr });
  }

  /** Used when a single-section action (e.g. submit) needs to refresh current list. */
  private loadAll(): void {
    this.loadSection();
  }

  /** Apply date range filter on current section list. */
  applyDateFilter(): void {
    const from = this.filterDateFrom;
    const to = this.filterDateTo;
    let filtered = [...this._fullList];
    if (from) {
      const fromTime = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
      filtered = filtered.filter((r) => {
        const d = r.noteSheetDate ? new Date(r.noteSheetDate) : null;
        return d ? d.getTime() >= fromTime : false;
      });
    }
    if (to) {
      const toTime = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
      filtered = filtered.filter((r) => {
        const d = r.noteSheetDate ? new Date(r.noteSheetDate) : null;
        return d ? d.getTime() <= toTime : false;
      });
    }
    this.setCurrentList(filtered);
  }

  /** Clear date filters and restore full list. */
  clearDateFilter(): void {
    this.filterDateFrom = null;
    this.filterDateTo = null;
    this.setCurrentList([...this._fullList]);
  }

  /** Global search on table. */
  onGlobalFilter(table: Table, event: Event): void {
    table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
  }

  private setCurrentList(list: NoteSheetInfoRow[]): void {
    if (this.noteSheetTypeFilter) {
      list = list.filter(r => r.noteSheetType === this.noteSheetTypeFilter);
    } else {
      list = list.filter(r => r.noteSheetType !== NoteSheetType.NewPosting && r.noteSheetType !== NoteSheetType.InterPosting && r.noteSheetType !== NoteSheetType.ExBDLeave);
    }
    switch (this.section) {
      case 'draft':
        // System-generate drafts show to their creator here until submitted; once submitted they
        // move to the approver's My-Approval list. Manual keeps the draft/initiator/recommender view.
        this.draftList = list.filter(r =>
          r.noteSheetOperationType === NoteSheetOperationType.SystemGenerate
            ? r.currentStatus === NoteSheetCurrentStatus.Draft
            : (r.currentStatus === NoteSheetCurrentStatus.Draft ||
               r.currentStatus === NoteSheetCurrentStatus.Initiator ||
               r.currentStatus === NoteSheetCurrentStatus.Recommender)
        );
        break;
      case 'pending':
        // The everyone-pending list stays manual-only; system-generate approvals live in My-Approval.
        this.pendingList = list.filter(r =>
          r.noteSheetOperationType !== NoteSheetOperationType.SystemGenerate &&
          (r.currentStatus === NoteSheetCurrentStatus.Initiator ||
           r.currentStatus === NoteSheetCurrentStatus.Recommender ||
           (r.currentStatus === NoteSheetCurrentStatus.FinalApproval && r.finalApprovalStatus !== ApprovalStatus.Approve))
        );
        break;
      case 'approved':
        this.approvedList = list.filter(r =>
          r.currentStatus === NoteSheetCurrentStatus.FinalApproval &&
          r.finalApprovalStatus === ApprovalStatus.Approve
        );
        break;
      case 'declined': this.declinedList = list; break;
      case 'all': this.allList = list; break;
      case NOTE_SHEET_SECTIONS.MY_PENDING:
        // Server already returns exactly the items waiting on me; reuse the pending table to render them.
        this.pendingList = list;
        break;
    }
  }


  readonly noteSheetTypeLabels: Record<string, string> = {
    General: 'General',
    ExBDLeave: 'Ex-BD Leave',
    NewPosting: 'New Posting',
    InterPosting: 'Inter Posting'
  };

  noteSheetTypeLabel(row: NoteSheetInfoRow): string {
    return this.noteSheetTypeLabels[row.noteSheetType ?? ''] ?? row.noteSheetType ?? '-';
  }

  readonly operationTypeLabels: Record<string, string> = {
    [NoteSheetOperationType.Manual]: 'Manual',
    [NoteSheetOperationType.SystemGenerate]: 'System Generate'
  };

  operationTypeLabel(row: NoteSheetInfoRow): string {
    return this.operationTypeLabels[row.noteSheetOperationType ?? ''] ?? row.noteSheetOperationType ?? '-';
  }

  presentStatus(row: NoteSheetInfoRow): string {
    return this.statusLabels[row.currentStatus ?? ''] ?? '-';
  }

  statusLabel(row: NoteSheetInfoRow): string {
    if (row.currentStatus === NoteSheetCurrentStatus.FinalApproval && row.finalApprovalStatus === ApprovalStatus.Approve) {
      return 'Approved';
    }
    return this.statusLabels[row.currentStatus ?? ''] ?? '-';
  }

  private loadLookups(): void {
    this.masterBasicSetup.getAllByType('RabUnit').subscribe({
      next: (list) => this.buildUnitAndWingMaps(list),
      error: (err: any) =>
        this.masterBasicSetup.getAllByType('RABUNIT').subscribe({
          next: (list) => this.buildUnitAndWingMaps(list),
          error: (err: any) => {}
        })
    });
    this.masterBasicSetup.getAllByType('RabBranch').subscribe({
      next: (list) => {
        this.branchLabelMap = {};
        (list || []).forEach((c: CommonCode) => {
          const id = c.codeId;
          if (id != null) this.branchLabelMap[id] = (c.codeValueEN ?? c.displayCodeValueEN ?? '').trim() || '-';
        });
      },
      error: (err: any) => {}
    });
    this.commonCodeService.getAllActiveCommonCodesType('VisitType').subscribe({
      next: (list) => {
        this.purposeLabelMap = {};
        (list || []).forEach((c: any) => {
          const id = c.codeId;
          if (id != null) this.purposeLabelMap[id] = (c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || '').trim() || '-';
        });
      },
      error: (err: any) => {}
    });
    this.commonCodeService.getAllActiveCommonCodesType('Country').subscribe({
      next: (list) => {
        this.countryLabelMap = {};
        (list || []).forEach((c: any) => {
          const id = c.codeId;
          if (id != null) this.countryLabelMap[id] = (c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || '').trim() || '-';
        });
      },
      error: (err: any) => {}
    });
  }

  private buildUnitAndWingMaps(units: CommonCode[]): void {
    this.unitLabelMap = {};
    this.wingLabelMap = {};
    (units || []).forEach((c: CommonCode) => {
      const id = c.codeId;
      if (id == null) return;
      const label = (c.codeValueEN ?? c.displayCodeValueEN ?? '').trim() || '-';
      const parentId = c.parentCodeId ?? (c as any).parentId;
      if (parentId == null || parentId === 0) this.unitLabelMap[id] = label;
      else this.wingLabelMap[id] = label;
    });
  }

  getUnitLabel(id: number | null | undefined): string {
    return id != null ? (this.unitLabelMap[id] ?? '-') : '-';
  }
  getWingLabel(id: number | null | undefined): string {
    return id != null ? (this.wingLabelMap[id] ?? '-') : '-';
  }
  getBranchLabel(id: number | null | undefined): string {
    return id != null ? (this.branchLabelMap[id] ?? '-') : '-';
  }
  getPurposeLabel(id: number | null | undefined): string {
    return id != null ? (this.purposeLabelMap[id] ?? `${id}`) : '-';
  }
  getCountryLabel(id: number | null | undefined): string {
    return id != null ? (this.countryLabelMap[id] ?? `${id}`) : '-';
  }

  formatDate(d: string | null | undefined): string {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return d;
    }
  }

  openRemarkDialog(row: NoteSheetInfoRow, action: NoteSheetRemarkAction): void {
    this.selectedRow = row;
    this.remarkAction = action;
    this.remarkText = '';
    this.showRemarkDialog = true;
  }

  submitRemark(): void {
    if (!this.selectedRow || !this.remarkAction) return;
    if (this.remarkAction === NoteSheetRemarkAction.Decline && !this.remarkText?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Remark Required', detail: 'Please provide a remark before declining.' });
      return;
    }
    if (this.remarkAction === NoteSheetRemarkAction.Back && !this.remarkText?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Remark Required', detail: 'Please provide a remark before sending back.' });
      return;
    }

    // Posting: validate transfer unit before approval
    const row = this.selectedRow;
    if (this.remarkAction === NoteSheetRemarkAction.Approve
        && (row.noteSheetType === NoteSheetType.InterPosting || row.noteSheetType === NoteSheetType.NewPosting)
        && row.draftPostingMasterId) {
      const employees$ = row.noteSheetType === NoteSheetType.InterPosting
          ? this.postingService.getDraftInterPostingEmployees(row.draftPostingMasterId)
          : this.postingService.getDraftPostingEmployees(row.draftPostingMasterId);
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
    if (!this.selectedRow || !this.remarkAction) return;
    const url = `${this.api}/${this.remarkAction.charAt(0).toUpperCase() + this.remarkAction.slice(1)}`;
    const body = {
      NoteSheetId: this.selectedRow.noteSheetId,
      EmployeeId: this.currentUserEmployeeId,
      Remark: this.remarkText,
      LastUpdatedBy: this.sharedService.getCurrentUser?.() ?? 'system'
    };
    const row = this.selectedRow;
    const isFinalApproval = this.remarkAction === NoteSheetRemarkAction.Approve
        && row.currentStatus === NoteSheetCurrentStatus.FinalApproval;
    const isPostingNoteSheet = row.noteSheetType === NoteSheetType.NewPosting && !!row.draftPostingMasterId;
    const isExBdLeaveNoteSheet = row.noteSheetType === NoteSheetType.ExBDLeave;

    this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(url, body, { observe: 'response' }).subscribe({
      next: (resp) => {
        const res = resp.body;
        const code = res?.statusCode ?? res?.StatusCode;
        const msg = res?.description ?? res?.Description;
        if (code === 200) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
          this.showRemarkDialog = false;

          // After final approval of a posting notesheet: update DraftPostingStatus + EmployeeInfo PostingStatus
          if (isFinalApproval && isPostingNoteSheet) {
            this.onPostingFinalApproval(row);
          }

          this.loadAll();
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Notice', detail: msg || 'Action failed.' });
        }
      },
      error: (err) => {
        const detail = err?.error?.description ?? err?.error?.Description ?? err?.error?.message ?? err?.message ?? 'Request failed.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail });
      }
    });
  }

  /** After final approval of a New Posting notesheet, update DraftPostingMaster status and employees PostingStatus. */
  private onPostingFinalApproval(row: NoteSheetInfoRow): void {
    const masterId = row.draftPostingMasterId!;

    // 1. Update DraftPostingMaster status to 'approved'
    this.postingService.getDraftPostingEmployees(masterId).subscribe({
      next: (employees) => {
        // Use first employee's draftPostingNo/Date for the master update
        const first = employees?.[0];
        if (first) {
          this.postingService.updateDraftNewPosting(
            masterId,
            first.draftPostingNo,
            first.draftPostingDate,
            DraftPostingStatus.Approved
          ).subscribe({
            next: () => {},
            error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to update Draft Posting status.' })
          });
        }

        // NOTE: employees are NOT set to PendingForJoining here. That happens only when the
        // posting order is APPROVED (backend PostingOrderService.ApprovePostingOrderAsync),
        // not on note-sheet final approval.
      },
      error: (err: any) => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: err?.error?.message || 'Failed to load posting employees for status update.' })
    });
  }

  // ── Leave Avail / Not Avail ─────────────────────────────────────────────

  openLeaveAvail(row: NoteSheetInfoRow): void {
    const appId = (row as NoteSheetInfoFull).exBdLeaveApplicationId;
    if (!appId) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No leave application linked to this notesheet.' });
      return;
    }
    this.leaveAvailApp = null;
    this.leaveAvailFromDate = null;
    this.leaveAvailToDate = null;
    this.leaveAvailLoading = true;
    this.showLeaveAvailDialog = true;

    this.exBdLeaveApplicationService.getById(appId).subscribe({
      next: (app) => {
        if (!app) {
          this.leaveAvailLoading = false;
          this.showLeaveAvailDialog = false;
          this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No leave application found.' });
          return;
        }
        this.leaveAvailApp = app;
        if (app.availStatus) {
          this.leaveAvailLoading = false;
          this.showLeaveAvailDialog = false;
          this.messageService.add({ severity: 'info', summary: 'Info', detail: `This leave is already marked as "${app.availStatus}".` });
          return;
        }
        this.leaveAvailFromDate = app.fromDate ? new Date(app.fromDate) : null;
        this.leaveAvailToDate = app.toDate ? new Date(app.toDate) : null;
        this.leaveAvailLoading = false;
      },
      error: () => {
        this.leaveAvailLoading = false;
        this.showLeaveAvailDialog = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load application data.' });
      }
    });
  }

  getLeaveAvailTotalDays(): number {
    if (!this.leaveAvailFromDate || !this.leaveAvailToDate) return 0;
    const from = new Date(this.leaveAvailFromDate.getFullYear(), this.leaveAvailFromDate.getMonth(), this.leaveAvailFromDate.getDate());
    const to = new Date(this.leaveAvailToDate.getFullYear(), this.leaveAvailToDate.getMonth(), this.leaveAvailToDate.getDate());
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  submitLeaveAvail(): void {
    if (!this.leaveAvailApp || !this.leaveAvailFromDate || !this.leaveAvailToDate) return;
    this.leaveAvailSaving = true;
    const currentUser = this.sharedService.getCurrentUser?.() ?? 'system';
    const startDate = this.leaveAvailFromDate.toISOString().split('T')[0];
    const endDate = this.leaveAvailToDate.toISOString().split('T')[0];

    this.exBdLeaveApplicationService.availLeave({
      exBdLeaveApplicationId: this.leaveAvailApp.exBdLeaveApplicationId,
      availStatus: 'Availed',
      availStartDate: startDate,
      availEndDate: endDate,
      currentUser
    }).subscribe({
      next: (res: any) => {
        this.leaveAvailSaving = false;
        if (res?.statusCode === 200) {
          this.showLeaveAvailDialog = false;
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Leave availed successfully. Foreign visit record created.' });
          this.loadAll();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description || 'Failed.' });
        }
      },
      error: (err: any) => {
        this.leaveAvailSaving = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to avail leave.' });
      }
    });
  }

  openLeaveNotAvail(row: NoteSheetInfoRow): void {
    const appId = (row as NoteSheetInfoFull).exBdLeaveApplicationId;
    if (!appId) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No leave application linked to this notesheet.' });
      return;
    }
    this.leaveNotAvailApp = null;
    this.leaveNotAvailReason = '';
    this.leaveNotAvailSaving = false;

    this.exBdLeaveApplicationService.getById(appId).subscribe({
      next: (app) => {
        if (!app) {
          this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'No leave application found.' });
          return;
        }
        if (app.availStatus) {
          this.messageService.add({ severity: 'info', summary: 'Info', detail: `This leave is already marked as "${app.availStatus}".` });
          return;
        }
        this.leaveNotAvailApp = app;
        this.showLeaveNotAvailDialog = true;
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load application data.' });
      }
    });
  }

  submitLeaveNotAvail(): void {
    if (!this.leaveNotAvailApp) return;
    this.leaveNotAvailSaving = true;
    const currentUser = this.sharedService.getCurrentUser?.() ?? 'system';

    this.exBdLeaveApplicationService.availLeave({
      exBdLeaveApplicationId: this.leaveNotAvailApp.exBdLeaveApplicationId,
      availStatus: 'NotAvailed',
      remarks: this.leaveNotAvailReason || undefined,
      currentUser
    }).subscribe({
      next: (res: any) => {
        this.leaveNotAvailSaving = false;
        if (res?.statusCode === 200) {
          this.showLeaveNotAvailDialog = false;
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Leave marked as not availed.' });
          this.loadAll();
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: res?.description || 'Failed.' });
        }
      },
      error: (err: any) => {
        this.leaveNotAvailSaving = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description || 'Failed to update status.' });
      }
    });
  }

  submitForApproval(row: NoteSheetInfoRow): void {
    this.confirmationService.confirm({
      message: 'Do you want to submit this note-sheet for approval process?',
      header: 'Submit for Approval',
      acceptLabel: 'Submit',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-success',
      accept: () => this.doSubmitForApproval(row)
    });
  }

  private doSubmitForApproval(row: NoteSheetInfoRow): void {
    const req = { NoteSheetId: row.noteSheetId, LastUpdatedBy: this.sharedService.getCurrentUser?.() ?? 'system' };
    this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(
      `${this.api}/SubmitForApproval`, req, { observe: 'response' }
    ).subscribe({
      next: (resp) => {
        const resBody = resp.body;
        const code = resBody?.statusCode ?? resBody?.StatusCode;
        const msg  = resBody?.description ?? resBody?.Description;
        if (resp.status >= 200 && resp.status < 300 && (code == null || code === 200)) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Submitted for approval.' });
          this.loadAll();
        } else {
          this.messageService.add({ severity: 'warn', summary: 'Submit for approval', detail: msg || 'Submit failed.' });
        }
      },
      error: (err) => {
        const detail = err?.error?.description ?? err?.error?.Description ?? err?.error?.message ?? err?.message ?? 'Submit failed.';
        this.messageService.add({ severity: 'error', summary: 'Error', detail });
      }
    });
  }

  // ── Approval Log ────────────────────────────────────────────────────

  openApprovalLog(row: NoteSheetInfoRow): void {
    this.approvalLogEntries = [];
    this.approvalLogLoading = true;
    this.approvalLogNoteSheetNo = row.noteSheetNo || '';
    this.showApprovalLogDialog = true;

    // Fetch full notesheet + back history in parallel
    forkJoin({
      noteSheet: this.http.get<NoteSheetInfoFull[]>(`${this.api}/GetFilteredByKeysAsyn/${row.noteSheetId}`).pipe(
        map(data => (Array.isArray(data) ? data[0] : null) as NoteSheetInfoFull | null),
        catchError(() => of(null as NoteSheetInfoFull | null))
      ),
      backHistory: this.http.get<{ id: number; backedByEmployeeId: number; backedFromStatus: string; backedToStatus: string; backReason: string | null; backedDate: string; createdBy: string }[]>(
        `${this.api}/GetBackHistory`, { params: { noteSheetId: row.noteSheetId.toString() } }
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
    ns: NoteSheetInfoFull,
    backHistory: { backedByEmployeeId: number; backedFromStatus: string; backedToStatus: string; backReason: string | null; backedDate: string }[]
  ): void {
    const entries: ApprovalLogEntry[] = [];

    // 0. Prepared By
    if (ns.preparedByEmployeeId && ns.preparedByEmployeeId > 0) {
      entries.push({
        step: 'Prepared By',
        action: ApprovalLogAction.Approve,
        date: ns.createdDate ?? null,
        remark: null,
        employeeId: ns.preparedByEmployeeId
      });
    }

    // 1. Initiator
    if (ns.initiatorId) {
      entries.push({
        step: 'Initiator',
        action: (ns.initiatorStatus as ApprovalLogAction) ?? ApprovalLogAction.Pending,
        date: ns.initiatorApprovedDate ?? null,
        remark: ns.initiatorApproveRemark || ns.initiatorCancelRemark || null,
        employeeId: ns.initiatorId
      });
    }

    // 2. Recommenders
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

    // 3. Final Approval
    if (ns.finalApprovalId) {
      entries.push({
        step: 'Final Approver',
        action: (ns.finalApprovalStatus as ApprovalLogAction) ?? ApprovalLogAction.Pending,
        date: ns.finalApprovalApprovedDate ?? null,
        remark: ns.finalApprovalRemark || ns.finalApprovalCancelRemark || null,
        employeeId: ns.finalApprovalId
      });
    }

    // 4. Back history entries (interleaved by date, shown separately)
    for (const bh of backHistory) {
      entries.push({
        step: `Back: ${this.getApprovalStatusLabel(bh.backedFromStatus)} → ${this.getApprovalStatusLabel(bh.backedToStatus)}`,
        action: ApprovalLogAction.Back,
        date: bh.backedDate,
        remark: bh.backReason,
        employeeId: bh.backedByEmployeeId
      });
    }

    // Sort: entries with dates first (chronological), then pending at end
    entries.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    this.approvalLogEntries = entries;

    // Resolve employee details
    const empIds = [...new Set(entries.filter(e => e.employeeId).map(e => e.employeeId!))];
    if (empIds.length === 0) { this.approvalLogLoading = false; return; }

    forkJoin(
      empIds.map(id =>
        this.servingMembersService.getEmployeePersonalServiceOverview(id).pipe(
          catchError(() => of(null))
        )
      )
    ).subscribe({
      next: (results) => {
        const empMap = new Map<number, { serviceId: string; name: string; rank: string }>();
        results.forEach((emp, idx) => {
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

  getActionSeverity(action: ApprovalLogAction): string {
    switch (action) {
      case ApprovalLogAction.Approve: return 'success';
      case ApprovalLogAction.Cancel:  return 'danger';
      case ApprovalLogAction.Back:    return 'warn';
      default:                        return 'info';
    }
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
}
