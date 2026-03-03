import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
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
import { NoteSheetType, NoteSheetStatus, NoteSheetApprovalStep } from '@/models/enums';
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
  noteSheetStatusId?: number;
  /** Type string: General, ExBDLeave, NewPosting, InterPosting; used to route Update and Preview */
  noteSheetType?: string;
  currentApprovalStep?: number;
  approvedByEmployeeId?: number;
  approvedDate?: string;
  declinedByEmployeeId?: number;
  declinedDate?: string;
  remark?: string;
  referenceNumber?: string;
  draftPostingMasterId?: number | null;
  /** JSON array of { FileId, fileName } from API */
  filesReferences?: string;
}

/** Full model for single note-sheet (get by id, preview, update). */
export interface NoteSheetInfoFull extends NoteSheetInfoRow {
  mainText?: string;
  referenceNumber?: string;
  preparedBy?: string;
  textType?: number; // 0 = English, 1 = Bangla
  unitId?: number;
  employeeId?: number;
  initiatorId?: number;
  recommenderIdsJson?: string;
  finalApproverId?: number;
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
    NotesheetSignatoryComponent
  ],
  providers: [MessageService],
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
  remarkAction: 'approve' | 'decline' | 'back' | null = null;
  remarkText = '';
  selectedRow: NoteSheetInfoRow | null = null;
  currentUserEmployeeId = 0;

  /** Preview dialog */
  showPreviewDialog = false;
  previewNoteSheet: NoteSheetInfoFull | null = null;
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

  readonly statusLabels: Record<number, string> = {
    [NoteSheetStatus.Draft]: 'Draft',
    [NoteSheetStatus.Pending]: 'Pending',
    [NoteSheetStatus.Approved]: 'Approved',
    [NoteSheetStatus.Declined]: 'Declined'
  };
  readonly stepLabels: Record<number, string> = {
    [NoteSheetApprovalStep.Initiator]: 'Pending with Initiator',
    [NoteSheetApprovalStep.Recommender]: 'Pending with Recommender',
    [NoteSheetApprovalStep.FinalApprover]: 'Pending with Final Approver'
  };

  constructor(
    private http: HttpClient,
    private messageService: MessageService,
    private sharedService: SharedService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private empService: EmpService,
    private noteSheetEditCache: NoteSheetEditCacheService,
    private masterBasicSetup: MasterBasicSetupService,
    private postingService: PostingService,
    private commonCodeService: CommonCodeService
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
    const finalApproverEmpId = (ns.approvedByEmployeeId && ns.approvedByEmployeeId > 0)
      ? ns.approvedByEmployeeId
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
    return (this.previewNoteSheet?.noteSheetStatusId ?? 0) === NoteSheetStatus.Draft;
  }

  shouldShowSignature(step: string): boolean {
    const statusId = this.previewNoteSheet?.noteSheetStatusId ?? NoteSheetStatus.Draft;
    const currentStep = this.previewNoteSheet?.currentApprovalStep ?? NoteSheetApprovalStep.Initiator;

    if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;
    if (step === 'Initiator') return (statusId === NoteSheetStatus.Pending && currentStep >= NoteSheetApprovalStep.Recommender) || statusId >= NoteSheetStatus.Approved;
    if (step.startsWith('Recommender')) return (statusId === NoteSheetStatus.Pending && currentStep >= NoteSheetApprovalStep.Recommender) || statusId >= NoteSheetStatus.Approved;
    if (step === 'Final Approver') return statusId === NoteSheetStatus.Approved;
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

  private stripHtml(html: string): string {
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
    const sigImg = (detail: any, align: string) => detail?.signatureDataUrl && this.shouldShowSignature(detail.step)
      ? `<img src="${detail.signatureDataUrl}" style="width:150px;height:50px;object-fit:contain;display:block;${align === 'right' ? 'margin-left:auto' : ''}" />`
      : '';
    const sigBlock = (detail: any, align: string) => {
      if (!detail) return '';
      const lines = [
        detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '',
        detail.rank && detail.rank !== '-' ? detail.rank : '',
        detail.appointment && detail.appointment !== '-' ? detail.appointment : ''
      ].filter(Boolean);
      return `<div style="text-align:${align};margin-top:20px;line-height:1.6">
        ${sigImg(detail, align)}
        <div style="width:160px;border-bottom:1.5px solid #000;margin-bottom:4px;${align === 'right' ? 'margin-left:auto' : ''}"></div>
        <div style="font-weight:600;font-size:9pt;text-transform:uppercase;color:#000">${this.escapeHtml(this.translateStep(detail.step))}</div>
        <div><strong>${this.escapeHtml(detail.name)}</strong></div>
        ${lines.map((l: string) => `<div style="font-size:10pt">${this.escapeHtml(l)}</div>`).join('')}
      </div>`;
    };

    let rightHtml = '';
    if (this.initiatorDetails) {
      rightHtml += sigBlock(this.initiatorDetails, 'right');
    }
    let leftHtml = '';
    for (const approver of this.approversDetails) {
      leftHtml += sigBlock(approver, 'left');
    }

    if (!leftHtml && !rightHtml) return '';
    return `<div style="margin-top:30px">
      ${rightHtml ? `<div>${rightHtml}</div>` : ''}
      ${leftHtml ? `<div style="margin-top:24px">${leftHtml}</div>` : ''}
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
    const user = this.sharedService.getCurrentUser?.();
    if (user) {
      this.http.get<any[]>(`${environment.apis.core}/EmployeeInfo/GetAll`).subscribe({
        next: (list) => {
          const me = (Array.isArray(list) ? list : []).find(
            (e: any) => (e.fullNameEN || e.FullNameEN || '') === user || (e.rabid || e.Rabid || '') === user
          );
          if (me) this.currentUserEmployeeId = me.employeeID ?? me.EmployeeID ?? 0;
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
      draft: `?noteSheetStatusId=${NoteSheetStatus.Draft}`,
      pending: `?noteSheetStatusId=${NoteSheetStatus.Pending}`,
      approved: `?noteSheetStatusId=${NoteSheetStatus.Approved}`,
      declined: `?noteSheetStatusId=${NoteSheetStatus.Declined}`,
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
      case 'draft': this.draftList = list; break;
      case 'pending': this.pendingList = list; break;
      case 'approved': this.approvedList = list; break;
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

  presentStatus(row: NoteSheetInfoRow): string {
    if (row.noteSheetStatusId !== NoteSheetStatus.Pending) return '-';
    const step = row.currentApprovalStep ?? 1;
    return this.stepLabels[step] ?? `Step ${step}`;
  }

  statusLabel(row: NoteSheetInfoRow): string {
    const id = row.noteSheetStatusId ?? 0;
    return this.statusLabels[id] ?? '-';
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

  openRemarkDialog(row: NoteSheetInfoRow, action: 'approve' | 'decline' | 'back'): void {
    this.selectedRow = row;
    this.remarkAction = action;
    this.remarkText = '';
    this.showRemarkDialog = true;
  }

  submitRemark(): void {
    if (!this.selectedRow || !this.remarkAction) return;
    const url = `${this.api}/${this.remarkAction.charAt(0).toUpperCase() + this.remarkAction.slice(1)}`;
    // Backend expects ApproveDeclineBackRequest with PascalCase
    const body = {
      NoteSheetId: this.selectedRow.noteSheetId,
      EmployeeId: this.currentUserEmployeeId,
      Remark: this.remarkText
    };
    this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(url, body, { observe: 'response' }).subscribe({
      next: (resp) => {
        const res = resp.body;
        const code = res?.statusCode ?? res?.StatusCode;
        const msg = res?.description ?? res?.Description;
        if (code === 200) {
          this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Action completed.' });
          this.showRemarkDialog = false;
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

  submitForApproval(row: NoteSheetInfoRow): void {
    // Backend expects SubmitForApprovalRequest; send PascalCase for compatibility
    const req = { NoteSheetId: row.noteSheetId };
    this.http.post<{ statusCode?: number; StatusCode?: number; description?: string; Description?: string }>(`${this.api}/SubmitForApproval`, req, { observe: 'response' }).subscribe({
      next: (resp) => {
        const resBody = resp.body;
        const code = resBody?.statusCode ?? resBody?.StatusCode;
        const msg = resBody?.description ?? resBody?.Description;
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
}
