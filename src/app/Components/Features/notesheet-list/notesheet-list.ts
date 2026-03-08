import { Component, Input, OnInit } from '@angular/core';
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
import { FluidModule } from 'primeng/fluid';
import { ActivatedRoute, Router } from '@angular/router';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EmpService } from '@/services/emp-service';
import { NoteSheetEditCacheService } from '@/services/note-sheet-edit-cache.service';
import { NoteSheetType, NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, ApprovalStatus, NoteSheetRemarkAction, ApprovalLogAction, ApprovalLogActionOptions, NoteSheetOperationType, DraftPostingStatus, PostingStatus } from '@/models/enums';
import { ServingMembersService } from '@/services/serving-members.service';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CommonCode } from '@/Components/basic-setup/shared/models/common-code';
import { CommonCodeService } from '@/services/common-code-service';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Table } from 'primeng/table';
import { PostingService } from '@/services/posting.service';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
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
  familyInfoJson?: string;
  filesReferences?: string;
  createdBy?: string;
  lastUpdatedBy?: string;
  createdDate?: string;
  lastupdate?: string;
  /** Ex-BD Leave specific */
  purposeOfExBdLeaveId?: number | null;
  destinationCountryId?: number | null;
  dateOfVisitFrom?: string | null;
  dateOfVisitTo?: string | null;
  totalDays?: number | null;
  /** New Posting specific */
  draftPostingMasterId?: number | null;
  note?: string | null;
  preparedByEmployeeId?: number | null;
}

export type NoteSheetSection = 'draft' | 'pending' | 'approved' | 'declined' | 'all';

export const NOTE_SHEET_SECTIONS = {
  DRAFT: 'draft' as NoteSheetSection,
  PENDING: 'pending' as NoteSheetSection,
  APPROVED: 'approved' as NoteSheetSection,
  DECLINED: 'declined' as NoteSheetSection,
  ALL: 'all' as NoteSheetSection,
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
    DatePickerModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    PostingOrderPreviewComponent,
    NotesheetSignatoryComponent,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './notesheet-list.html',
  styleUrl: './notesheet-list.scss'
})
export class NotesheetListComponent implements OnInit {
  private api = `${environment.apis.core}/NoteSheetInfo`;

  @Input() sectionInput: NoteSheetSection | null = null;
  /** Which section to show (one page per section). */
  section: NoteSheetSection = 'draft';

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
    private postingService: PostingService,
    private commonCodeService: CommonCodeService,
    private servingMembersService: ServingMembersService
  ) {}

  /** Open preview page: navigate to the type-specific preview route */
  openPreview(row: NoteSheetInfoRow): void {
    let route = '/notesheet-preview/general';
    if (row.noteSheetType === NoteSheetType.ExBDLeave) {
      route = '/notesheet-preview/exbd';
    } else if (row.noteSheetType === NoteSheetType.NewPosting || row.noteSheetType === NoteSheetType.InterPosting) {
      route = '/notesheet-preview/posting';
    }
    this.router.navigate([route], { queryParams: { id: row.noteSheetId } });
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
      error: () => {}
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
        error: () => { /* no signature available */ }
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
      error: () => {
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
    this.employeesDialogTitle = `Employees in Posting List – ${row.noteSheetNo || ''}`;
    this.employeesList = [];
    this.loadingEmployees = true;
    this.showEmployeesDialog = true;
    this.postingService.getDraftPostingEmployees(masterId).subscribe({
      next: (list) => {
        this.employeesList = list ?? [];
        this.loadingEmployees = false;
      },
      error: () => {
        this.loadingEmployees = false;
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee list.' });
      }
    });
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

  /** Short summary of family members for Ex-BD preview (e.g. "2 member(s)" or empty). */
  getPreviewExBdFamilySummary(): string {
    const json = this.previewNoteSheet?.familyInfoJson;
    if (!json || typeof json !== 'string') return '';
    try {
      const arr = JSON.parse(json) as unknown[];
      if (Array.isArray(arr) && arr.length > 0) return `${arr.length} member(s)`;
    } catch { /* ignore */ }
    return '';
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
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
    });
  }

  onPreviewSupportingDoc(fileId: number, fileName: string): void {
    this.empService.downloadFile(fileId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to open file.' })
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
      error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note-sheet.' })
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
      error: () => {
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
        this.router.navigate([route], { queryParams: { id: row.noteSheetId } });
      },
      error: () => {
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
    const fontFamily = bn ? "'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', sans-serif" : "'Times New Roman', serif";
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
    const fontFamily = bn ? "'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', sans-serif" : "'Times New Roman', serif";
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
    if (this.sectionInput) {
      this.section = this.sectionInput;
      this.loadLookups();
      this.loadSection();
    } else {
      this.route.data.subscribe((data) => {
        this.section = (data['section'] as NoteSheetSection) || 'draft';
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
        error: () => {}
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
    const base = `${this.api}/GetByStatus`;
    this.loading = true;
    const onError = () => {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note-sheet list.' });
      this.loading = false;
    };
    const statusMap: Record<NoteSheetSection, string> = {
      draft:    '',   // fetch all, filter client-side to show in-progress notesheets
      pending:  '',   // fetch all, filter client-side to show all in-workflow items
      approved: `?currentStatus=${NoteSheetCurrentStatus.FinalApproval}`,
      declined: `?currentStatus=${NoteSheetCurrentStatus.Cancel}`,
      all: ''
    };
    this.http.get<unknown>(`${base}${statusMap[this.section]}`).subscribe({
      next: (data) => {
        const list = this.parseListResponse(data);
        this._fullList = list;
        this.filterDateFrom = null;
        this.filterDateTo = null;
        this.setCurrentList(list);
        this.loading = false;
      },
      error: () => {
        this._fullList = [];
        this.setCurrentList([]);
        onError();
      }
    });
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
    switch (this.section) {
      case 'draft':
        this.draftList = list.filter(r =>
          r.currentStatus === NoteSheetCurrentStatus.Draft ||
          r.currentStatus === NoteSheetCurrentStatus.Initiator ||
          r.currentStatus === NoteSheetCurrentStatus.Recommender
        );
        break;
      case 'pending':
        this.pendingList = list.filter(r =>
          r.currentStatus === NoteSheetCurrentStatus.Initiator ||
          r.currentStatus === NoteSheetCurrentStatus.Recommender ||
          (r.currentStatus === NoteSheetCurrentStatus.FinalApproval && r.finalApprovalStatus !== ApprovalStatus.Approve)
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
      error: () =>
        this.masterBasicSetup.getAllByType('RABUNIT').subscribe({
          next: (list) => this.buildUnitAndWingMaps(list),
          error: () => {}
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
      error: () => {}
    });
    this.commonCodeService.getAllActiveCommonCodesType('VisitType').subscribe({
      next: (list) => {
        this.purposeLabelMap = {};
        (list || []).forEach((c: any) => {
          const id = c.codeId;
          if (id != null) this.purposeLabelMap[id] = (c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || '').trim() || '-';
        });
      },
      error: () => {}
    });
    this.commonCodeService.getAllActiveCommonCodesType('Country').subscribe({
      next: (list) => {
        this.countryLabelMap = {};
        (list || []).forEach((c: any) => {
          const id = c.codeId;
          if (id != null) this.countryLabelMap[id] = (c.codeValueEN || c.displayCodeValueEN || c.codeValueBN || '').trim() || '-';
        });
      },
      error: () => {}
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
            error: () => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Failed to update Draft Posting status.' })
          });
        }

        // 2. Update each employee's PostingStatus to 'PendingForJoining'
        const empIds = (employees ?? []).map(e => e.employeeId).filter(id => id > 0);
        if (empIds.length > 0) {
          this.postingService.updateEmployeesPostingStatus(empIds, PostingStatus.PendingForJoining).subscribe({
            next: () => {},
            error: () => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Failed to update employee posting status.' })
          });
        }
      },
      error: () => this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Failed to load posting employees for status update.' })
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
      error: () => { this.approvalLogLoading = false; }
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
      error: () => { this.approvalLogLoading = false; }
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
