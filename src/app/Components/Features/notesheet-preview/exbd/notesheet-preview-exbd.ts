import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { FieldsetModule } from 'primeng/fieldset';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { CommonCodeService } from '@/services/common-code-service';
import { JsReportService } from '@/services/jsreport.service';
import { ExBdLeaveApplicationService, ExBdLeaveApplicationModel, DestinationCountryItem, FamilyMemberItem } from '@/services/ex-bd-leave-application.service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import {
    NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions,
    ApprovalStatus, NoteSheetRemarkAction, NoteSheetPreviewFrom,
    ApprovalLogAction, ApprovalLogActionOptions
} from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { environment } from '@/Core/Environments/environment';
import { forkJoin, of, firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SafeHtml } from '@angular/platform-browser';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, ImageRun,
    VerticalAlign, TableLayoutType, HeightRule, PageOrientation, TabStopType, TabStopPosition
} from 'docx';
import { saveAs } from 'file-saver';
import type { NotesheetDocumentModel, ContentBlock } from '../notesheet-document-model';

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
    selector: 'app-notesheet-preview-exbd',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, ConfirmDialogModule, DialogModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, DatePickerModule, FlexibleDateDirective, FieldsetModule,
        NotesheetSignatoryComponent, RichEditorComponent, NotesheetApproverSelectComponent, FileReferencesFormComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-exbd.html',
    styleUrls: ['../notesheet-preview.scss', './notesheet-preview-exbd.scss']
})
export class NotesheetPreviewExbdComponent extends NotesheetPreviewBase implements AfterViewChecked {


    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private readonly commonCodeService = inject(CommonCodeService);
    private readonly confirmationService = inject(ConfirmationService);
    private readonly sharedService = inject(SharedService);
    private readonly exBdLeaveAppService = inject(ExBdLeaveApplicationService);
    private cdr = inject(ChangeDetectorRef);
    private jsreportService = inject(JsReportService);

    // ── Page size for jsReport export (Legal default, A4 optional) ──
    selectedPageSize = 'A4';
    pageSizeOptions = [
        { label: 'Legal', value: 'Legal' },
        { label: 'A4', value: 'A4' }
    ];

    // ── Pagination ────────────────────────────────────────────
    pageOffsets: number[] = [0];
    pageContentHeightPx = 0;
    titleBlockHeightPx = 0;
    private pageInsetPx = 0;
    private lastMeasuredHeight = 0;

    // ── ExBD-specific data ─────────────────────────────────────
    leaveEmployee: EmployeePersonalServiceOverview | null = null;
    wingName = '';
    wingNameBN = '';
    exBdApplication: ExBdLeaveApplicationModel | null = null;
    appCountries: DestinationCountryItem[] = [];
    appFamilyMembers: FamilyMemberItem[] = [];
    /** Pre-resolved data from vw_NoteSheetExBdLeavePreview */
    previewData: any = null;

    // ── Parsed references (from JSON) ────────────────────────
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
            return raw.trim() ? [raw] : [];
        }
    }

    get parsedReferenceFiles(): { fileId: number; fileName: string }[][] {
        const raw = this.noteSheet?.referenceNumber;
        if (!raw) return [];
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return arr.map((item: any) => {
                    const files = item.files ?? item.Files ?? [];
                    return files.map((f: any) => ({
                        fileId: f.FileId ?? f.fileId ?? 0,
                        fileName: f.fileName ?? f.FileName ?? 'File'
                    })).filter((f: any) => f.fileId);
                });
            }
            return [];
        } catch { return []; }
    }

    /** Flat list of all reference files for the "Supporting Documents" section */
    get allReferenceFiles(): { fileId: number; fileName: string }[] {
        return this.parsedReferenceFiles.reduce((acc, files) => acc.concat(files), []);
    }

    refSerialLabel(index: number): string {
        if (!this.isEnglish()) {
            const banglaLetters = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];
            return (banglaLetters[index] ?? String(index + 1)) + '।';
        }
        return String.fromCharCode(97 + index) + '.';
    }

    get approverStartSerial(): number {
        return this.noteSheet?.note ? 3 : 2;
    }

    downloadRefFile(file: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(file.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, file.fileName),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    /** Download every attached reference file (from the bottom Supporting Documents section). */
    downloadAllRefFiles(): void {
        const files = this.allReferenceFiles;
        if (!files.length) {
            this.messageService.add({ severity: 'info', summary: 'No files', detail: 'There are no attached files to download.' });
            return;
        }
        files.forEach(file => this.downloadRefFile(file));
    }

    // ── Edit state ─────────────────────────────────────────────
    editing = false;
    saving = false;
    subjectTypeOptions: { label: string; labelBN: string; value: number }[] = [];

    // ── Submit for approval state ─────────────────────────────
    submitting = false;
    readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;

    // ── Pending-list inline actions ───────────────────────────
    fromPending = false;
    /** The list URL to return to after an approval action (e.g. /notesheet-list/my-approval-ex-bd-leave). */
    returnUrl: string | null = null;
    currentUserEmployeeId = 0;

    // Remark dialog (Approve / Decline / Back)
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

    // ── Edit model fields ──────────────────────────────────────
    editSubject = '';
    editExBdLeaveSubjectId: number | null = null;
    editReferenceParagraphs: { text: string; fileRows: FileRowData[] }[] = [{ text: '', fileRows: [] }];
    editMainText = '';
    editNote = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;

    // ── Dropdown options ───────────────────────────────────────
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly operationTypeOptions = NoteSheetOperationTypeOptions;

    // ── Computed ───────────────────────────────────────────────
    get canEdit(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Draft;
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

    // ── Data loading ──────────────────────────────────────────
    protected override loadApprovalChain(): void {
        super.loadApprovalChain();
        this.loadExbdDetails();
    }

    private loadExbdDetails(): void {
        const ns = this.noteSheet;
        if (!ns) return;

        this.loadSubjectTypeOptions();

        // Load all preview data from the combined view in one call
        const noteSheetId = ns.noteSheetId ?? (ns as any).NoteSheetId;
        if (noteSheetId) {
            this.loadPreviewFromView(noteSheetId);
        } else {
            // Fallback: load employee separately
            this.loadEmployeeFallback(ns);
        }
    }

    private loadPreviewFromView(noteSheetId: number): void {
        const api = `${environment.apis.core}/NoteSheetInfo/GetExBdLeavePreview/${noteSheetId}`;
        this.http.get<any>(api).pipe(catchError(() => of(null))).subscribe(data => {
            if (!data) {
                // Fallback to individual calls
                this.loadEmployeeFallback(this.noteSheet);
                return;
            }
            this.previewData = data;

            // Populate employee-like data from view
            if (!this.leaveEmployee && data.empServiceId) {
                this.leaveEmployee = {
                    serviceId: data.empServiceId,
                    rabId: data.empRABID,
                    nameEnglish: data.empNameEN,
                    nameBN: data.empNameBN,
                    prefix: data.empPrefix,
                    prefixBN: data.empPrefixBN,
                    armyRank: data.empRank,
                    armyRankBN: data.empRankBN,
                    rabUnit: data.empRABUnit,
                    rabUnitBN: data.empRABUnitBN
                } as any;
            }

            // Wing name from view
            if (data.empWingName) this.wingName = data.empWingName;
            if (data.empWingNameBN) this.wingNameBN = data.empWingNameBN;

            // Application data from view
            if (data.appFromDate) {
                this.exBdApplication = {
                    visitTypeId: data.appVisitTypeId,
                    fromDate: data.appFromDate,
                    toDate: data.appToDate,
                    totalDays: data.appTotalDays ?? 0,
                    destinationCountriesJson: data.appDestinationCountriesJson,
                    familyMembersJson: data.appFamilyMembersJson
                } as any;
            }

            // Use pre-resolved display strings from the view
            this._viewCountriesDisplay = data.appCountriesDisplay || '';
            this._viewCountriesDisplayBN = data.appCountriesDisplayBN || '';
            this._viewFamilyDisplay = data.appFamilyMembersDisplay || '';
            this._viewFamilyDisplayBN = data.appFamilyMembersDisplayBN || '';
            this._viewPurposeName = data.appVisitTypeName || '';
            this._viewPurposeNameBN = data.appVisitTypeNameBN || '';

            this._paraCache = null;
            this.cdr.detectChanges();
        });
    }

    /** Pre-resolved display strings from the view */
    _viewCountriesDisplay = '';
    _viewCountriesDisplayBN = '';
    _viewFamilyDisplay = '';
    _viewFamilyDisplayBN = '';
    _viewPurposeName = '';
    _viewPurposeNameBN = '';

    private loadEmployeeFallback(ns: any): void {
        if (ns?.employeeId && ns.employeeId > 0) {
            this.servingMembersService.getEmployeePersonalServiceOverview(ns.employeeId)
                .pipe(catchError(() => of(null)))
                .subscribe(emp => { this.leaveEmployee = emp; });
        }

        if (ns?.wingBattalionId && ns.wingBattalionId > 0 && ns.unitId && ns.unitId > 0) {
            this.masterBasicSetup.getByParentId(ns.unitId)
                .pipe(catchError(() => of([])))
                .subscribe(list => {
                    const found = (list ?? []).find((c: any) => c.codeId === ns.wingBattalionId);
                    if (found) {
                        this.wingName = found.codeValueEN || '';
                        this.wingNameBN = found.codeValueBN || '';
                    }
                });
        }

        // Load ExBdLeaveApplication separately
        const noteSheetId = ns?.noteSheetId ?? (ns as any)?.NoteSheetId;
        if (noteSheetId) {
            this.exBdLeaveAppService.getByNoteSheetId(noteSheetId)
                .pipe(catchError(() => of(null)))
                .subscribe(app => {
                    if (!app) return;
                    this.exBdApplication = app;
                    this.appCountries = ExBdLeaveApplicationService.parseCountries(app.destinationCountriesJson);
                    this.appFamilyMembers = ExBdLeaveApplicationService.parseFamilyMembers(app.familyMembersJson);
                    this._paraCache = null;
                    this.cdr.detectChanges();
                });
        }
    }

    // ── Formatted paragraph (view mode) ───────────────────────
    getFormattedParagraphHtml(): SafeHtml {
        const html = this.buildParagraphHtml();
        if (this._paraCache?.raw === html) return this._paraCache.safe;
        const safe = this.sanitizer.bypassSecurityTrustHtml(html);
        this._paraCache = { raw: html, safe };
        return safe;
    }
    private _paraCache: { raw: string; safe: SafeHtml } | null = null;

    /** Build formatted paragraph as plain text (for export) */
    buildParagraphText(): string {
        return this.stripHtml(this.buildParagraphHtml());
    }

    private buildParagraphHtml(): string {
        const ns = this.noteSheet;
        if (!ns) return '';
        return ns.mainText?.trim() || '';
    }

    // ── Edit info panel display helpers ────────────────────────
    getEditEmployeeDisplay(): string {
        const emp = this.leaveEmployee;
        if (!emp) return '—';
        const name = emp.nameEnglish || emp.nameBN || '';
        const rabId = emp.rabId || emp.serviceId || '';
        return [name, rabId ? `(${rabId})` : ''].filter(Boolean).join(' ') || '—';
    }

    getEditPurposeDisplay(): string {
        return this._viewPurposeName || this._viewPurposeNameBN || '—';
    }

    getEditCountryDisplay(): string {
        return this._viewCountriesDisplay || this._viewCountriesDisplayBN
            || this.appCountries.map(c => c.countryName).filter(Boolean).join(', ')
            || '—';
    }

    getEditFamilyDisplay(): string {
        return this._viewFamilyDisplay
            || this.appFamilyMembers.map(f => {
                const rel = f.relation || '';
                const name = f.nameEN || '';
                return rel && name ? `${rel}-${name}` : (name || rel || '');
            }).filter(Boolean).join(', ');
    }

    formatDateView(date: any): string {
        if (!date) return '—';
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return '—'; }
    }

    // ── Toggle edit mode ──────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        const ns = this.noteSheet;

        this.editSubject = ns.subject ?? '';
        this.editExBdLeaveSubjectId = ns.exBdLeaveSubjectId ?? null;
        this.editReferenceParagraphs = this.parseReferenceParagraphs(ns.referenceNumber);
        this.editMainText = ns.mainText ?? '';
        this.editNote = ns.note ?? '';
        this.editNoteSheetDate = ns.noteSheetDate ? new Date(ns.noteSheetDate) : null;
        this.editTextType = (ns.textType ?? 0) === 1 ? 'bn' : 'en';
        this.editOperationType = ns.noteSheetOperationType ?? null;

        this.editInitiatorId = ns.initiatorId ?? null;
        this.editRecommenderIds = this.parseRecommenderIds();
        this.editFinalApproverId = (ns.finalApprovalId && ns.finalApprovalId > 0)
            ? ns.finalApprovalId
            : (ns.finalApproverId && ns.finalApproverId > 0 ? ns.finalApproverId : null);

    }

    cancelEdit(): void {
        this.editing = false;
        this.lastMeasuredHeight = 0;
    }

    // ── Load dropdown options ─────────────────────────────────
    private loadSubjectTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('SubjectType')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.subjectTypeOptions = (list ?? []).map((c: any) => ({
                    label: c.codeValueEN || c.displayCodeValueEN || '',
                    labelBN: c.codeValueBN || c.displayCodeValueBN || c.codeValueEN || '',
                    value: c.codeId
                }));
            });
    }

    getSubjectLabel(id: number | null | undefined): string {
        if (id == null) return '';
        const o = this.subjectTypeOptions.find(opt => opt.value === id);
        if (!o) return '';
        return this.isEnglish() ? o.label : (o.labelBN || o.label);
    }

    // ── Reference Paragraph helpers ──────────────────────────
    private parseReferenceParagraphs(raw: string | null | undefined): { text: string; fileRows: FileRowData[] }[] {
        if (!raw) return [{ text: '', fileRows: [] }];
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length > 0) {
                return arr.map((item: any) => ({
                    text: item.text ?? item.Text ?? '',
                    fileRows: (item.files ?? item.Files ?? []).map((f: any) => ({
                        displayName: f.fileName ?? f.FileName ?? '',
                        fileId: f.FileId ?? f.fileId ?? null,
                        file: null
                    }))
                }));
            }
            return [{ text: '', fileRows: [] }];
        } catch {
            return [{ text: String(raw), fileRows: [] }];
        }
    }

    addEditReferenceParagraph(): void {
        this.editReferenceParagraphs.push({ text: '', fileRows: [] });
    }

    removeEditReferenceParagraph(index: number): void {
        if (this.editReferenceParagraphs.length > 1) {
            this.editReferenceParagraphs.splice(index, 1);
        }
    }

    getEditSerialLabel(index: number): string {
        if (!this.isEnglish()) {
            const banglaLetters = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];
            return (banglaLetters[index] ?? String(index + 1)) + '.';
        }
        return String.fromCharCode(65 + index) + '.';
    }

    onEditRefFileRowsChange(event: FileRowData[], index: number): void {
        if (event && Array.isArray(event)) {
            this.editReferenceParagraphs[index].fileRows = event;
        }
    }

    onEditRefDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to download file.' })
        });
    }

    // ── Save changes ──────��────────────────────────────────��──
    async saveChanges(): Promise<void> {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const recommendersJson = this.buildRecommendersJson();
        const now = new Date().toISOString();

        const referenceNumberJson = await this.uploadReferenceParagraphFiles();

        const resolvedSubject = this.getSubjectLabel(this.editExBdLeaveSubjectId) || this.editSubject;
        const payload: Record<string, unknown> = {
            ...this.noteSheet,
            subject: resolvedSubject,
            exBdLeaveSubjectId: this.editExBdLeaveSubjectId,
            referenceNumber: referenceNumberJson,
            mainText: this.editMainText,
            note: this.editNote || null,
            textType: this.editTextType === 'bn' ? 1 : 0,
            noteSheetOperationType: this.editOperationType,
            noteSheetDate: this.editNoteSheetDate ? this.formatDateOnly(this.editNoteSheetDate) : this.noteSheet.noteSheetDate,
            initiatorId: this.editInitiatorId ?? 0,
            recommendersJson,
            finalApprovalId: this.editFinalApproverId ?? null,
            employeeId: this.noteSheet.employeeId ?? null,
            exBdLeaveApplicationId: this.exBdApplication?.exBdLeaveApplicationId ?? this.noteSheet.exBdLeaveApplicationId ?? null,
            lastUpdatedBy: this.noteSheet.lastUpdatedBy ?? this.noteSheet.createdBy ?? 'system',
            lastupdate: now
        };

        this.http.post(`${this.api}/UpdateAsyn`, payload).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                this.editing = false;
                this.saving = false;
                this.reloadNoteSheet();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to update note-sheet.' });
                this.saving = false;
            }
        });
    }

    private async uploadReferenceParagraphFiles(): Promise<string> {
        const result: { text: string; files: { FileId: number; fileName: string }[] }[] = [];
        for (const para of this.editReferenceParagraphs) {
            const existingFiles = para.fileRows.filter(r => r.fileId != null).map(r => ({ FileId: r.fileId!, fileName: r.displayName ?? '' }));
            const newFiles = para.fileRows.filter(r => r.file != null);
            if (newFiles.length > 0) {
                const uploads = newFiles.map(r => firstValueFrom(this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)));
                const uploaded = await Promise.all(uploads);
                const uploadedRefs = (uploaded as any[]).map(r => ({ FileId: r.fileId, fileName: r.fileName }));
                result.push({ text: para.text, files: [...existingFiles, ...uploadedRefs] });
            } else {
                result.push({ text: para.text, files: existingFiles });
            }
        }
        return JSON.stringify(result);
    }

    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.preparedByDetails = null;
        this.leaveEmployee = null;
        this.exBdApplication = null;
        this.appCountries = [];
        this.appFamilyMembers = [];
        this._paraCache = null;
        this.lastMeasuredHeight = 0;
        this.pageOffsets = [0];
        this.loadNoteSheet();
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
                    this.router.navigateByUrl(this.returnUrl || '/notesheet-list/pending-ex-bd-leave');
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

    // ── Recommender helpers ───────────────────────────────────
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
        } catch { return []; }
    }

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

    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // ═══════════════════════════════════════════════════════════
    // ── Export: shared document model (follows general notesheet)
    // ═══════════════════════════════════════════════════════════

    // ── Print Preview via JsReport (chrome-pdf, opens in new tab) ──
    async printPreview(): Promise<void> {
        if (!this.noteSheet || !this.contentMeasure) return;
        this.printingPreview = true;
        try {
            const { html, chrome, templateExtras } = await this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}`, chrome, templateExtras,
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
            const { html, chrome, templateExtras } = await this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(
                html, {}, `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.pdf`, chrome, templateExtras,
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
    private async buildJsReportPdf(): Promise<{ html: string; chrome: Record<string, unknown>; templateExtras: Record<string, unknown> }> {
        const styles = this.collectDocumentStyles();
        const fontCss = await this.embedBanglaFontCss();
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

/* SolaimanLipi, inlined as base64. The collected page styles declare the same
   family against /assets/fonts/*.ttf, but JsReport renders this HTML as a bare
   string with no base URL, so that relative reference cannot resolve on the
   server — the embedded copy below is what Chromium actually loads. */
${fontCss}

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
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}

/* Rich-text content keeps the crisp document Bangla font (no faint "japsa" text). */
.pdf-flow .ns-para-text, .pdf-flow .ns-para-text *,
.pdf-flow .ns-ref-content, .pdf-flow .ns-ref-content *,
.pdf-flow .ns-note, .pdf-flow .ns-note * {
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif !important;
    color: #000 !important;
}

.pdf-flow .ns-doc-box { border: none !important; }

/* Match the on-screen gap between the left border and the text
   (see notesheet-preview-exbd.scss → :host .ns-main-col). */
.pdf-flow .ns-main-col { padding-left: 5px; padding-right: 5px; }

/* Uniform body size — everything except the NOTE SHEET title renders at 10pt,
   matching the on-screen preview. The collected page styles pin some blocks
   smaller (7-9pt); these higher-specificity rules restore uniformity. The title
   (.ns-title-*) keeps its own inline size, so it is unaffected. */
.pdf-flow .ns-para, .pdf-flow .ns-para-no,
.pdf-flow .ns-cell-ref, .pdf-flow .ns-note,
.pdf-flow .ns-approver-role, .pdf-flow .ns-approver-left, .pdf-flow .ns-approver-remark,
.pdf-flow .ns-sig-name, .pdf-flow .ns-sig-rank, .pdf-flow .ns-sig-paren,
.pdf-flow .ns-sig-appoint, .pdf-flow .ns-sig-date { font-size: 10pt; }

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
            // Same values as the @page rule above — Chromium sizes the footer band
            // from these params, so a '0' bottom margin would clip the page number.
            marginTop: `${padTop}mm`, marginBottom: `${padBottom}mm`,
            marginLeft: `${padX}mm`, marginRight: `${padX}mm`,
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '', footerTemplate: ''
        };

        const templateExtras = {
            pdfOperations: this.pdfPageNumberOperations({
                multipage: this.pageOffsets.length > 1,
                pageWidth, pageHeight,
                bottomMarginMm: padBottom,
                fontCss,
            }),
        };

        return { html, chrome, templateExtras };
    }

    /** Concatenate every same-origin stylesheet loaded into the page. */
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
            } catch { /* cross-origin — skip */ }
        }
        return out.join('\n');
    }

    /** Cached base64 @font-face CSS — the font is ~200KB per face, so build it once. */
    private banglaFontCss?: string;

    /**
     * SolaimanLipi as self-contained @font-face rules with the TTFs inlined as
     * base64 data URIs, so the PDF renders the same Bangla face as the web view
     * without the font being installed on the JsReport server. A face that can't
     * be fetched is skipped rather than failing the export — Chromium then falls
     * back to whatever Bangla font it has.
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

    private buildDocumentModel(): NotesheetDocumentModel {
        if (!this.noteSheet) throw new Error('No noteSheet');
        const bn = !this.isEnglish();

        // Parse reference paragraphs from JSON array format
        const refBlocks: ContentBlock[] = [];
        const rawRef = this.noteSheet.referenceNumber ?? '';
        if (rawRef.trim()) {
            try {
                const refArr = JSON.parse(rawRef);
                if (Array.isArray(refArr) && refArr.length > 0) {
                    for (let i = 0; i < refArr.length; i++) {
                        const item = refArr[i];
                        const text = (item.text ?? item.Text ?? '').trim();
                        if (text) {
                            const serial = this.refSerialLabel(i);
                            refBlocks.push({ type: 'paragraph', text: `${serial}\t${text}`, runs: [{ text: `${serial}\t${text}` }], indent: 'normal', alignment: 'justify' });
                        }
                    }
                }
            } catch {
                // Not JSON — treat as plain text
                const plain = this.stripHtml(rawRef);
                if (plain.trim()) {
                    refBlocks.push({ type: 'paragraph', text: plain, runs: [{ text: plain }], indent: 'normal', alignment: 'justify' });
                }
            }
        }

        // For ExBD, the main content is the formatted paragraph (plain text)
        const paraText = this.buildParagraphText();
        const mainBlocks: ContentBlock[] = paraText
            ? [{ type: 'paragraph', text: paraText, runs: [{ text: paraText }], indent: 'normal', alignment: 'justify' }]
            : [];

        const model: NotesheetDocumentModel = {
            isBangla: bn,
            subject: this.getSubjectLabel(this.noteSheet.exBdLeaveSubjectId) || this.noteSheet.subject || '',
            referenceBlocks: refBlocks,
            referenceLabel: bn ? 'সূত্রঃ ' : 'Reference: ',
            dateLabel: bn ? 'তারিখঃ ' : 'Date: ',
            dateValue: this.formatDate(this.noteSheet.noteSheetDate),
            mainSerialText: this.serial(1),
            mainBlocks,
            closingText: '',
            approvers: [],
            enclLabel: '',
            enclNoLabel: ''
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
                if (tag === 'table') {
                    const rows: string[][] = [];
                    el.querySelectorAll('tr').forEach(tr => {
                        const cells: string[] = [];
                        tr.querySelectorAll('td, th').forEach(td => cells.push(this.normalizeTextForWord((td.textContent || '').trim())));
                        if (cells.length) rows.push(cells);
                    });
                    if (rows.length) blocks.push({ type: 'table', rows });
                } else {
                    const text = this.normalizeTextForWord((el.textContent || '').trim());
                    if (text) {
                        const bold = ['strong', 'b', 'h1', 'h2', 'h3'].includes(tag);
                        const italic = tag === 'em' || tag === 'i';
                        blocks.push({ type: 'paragraph', text, bold, italic, indent: 'normal' });
                    }
                }
            }
        }
        return blocks;
    }

    private normalizeTextForWord(s: string): string {
        return s.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }

    // ── Word Export ────────────────────────────────────────────
    private async buildWordDocument(): Promise<Document> {
        const model = this.buildDocumentModel();
        const bn = model.isBangla;
        const font = bn
            ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const }
            : 'Times New Roman';
        // Font sizes (half-points). Everything except the NOTE SHEET title is
        // uniform at the body size (10pt), matching the on-screen preview.
        const hdrSize = 20;                   // 10pt - org header
        const contentSize = 20;               // 10pt - body content (uniform base)
        const sigSize = contentSize;          // signature/approver = body size
        const noDateSize = contentSize;       // notesheet no + date = body size
        const titleHdrSize = hdrSize + 2;     // 11pt — NOTE SHEET / মন্তব্য পত্র (header)
        const csContent = bn ? contentSize : undefined;
        const csNoDate = bn ? noDateSize : undefined;
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

        // Notesheet number (left) + Date (right) on same line via tab stop
        if (this.noteSheet?.noteSheetNo || this.noteSheet?.noteSheetDate) {
            const runs: TextRun[] = [];
            if (this.noteSheet?.noteSheetNo) {
                runs.push(new TextRun({ text: this.noteSheet.noteSheetNo, size: noDateSize, sizeComplexScript: csNoDate, font, language: lang }));
            }
            if (this.noteSheet?.noteSheetDate) {
                runs.push(new TextRun({ text: '\t', size: noDateSize, font }));
                const datePrefix = bn ? 'তারিখ : ' : 'Date: ';
                runs.push(new TextRun({ text: `${datePrefix}${model.dateValue}`, size: noDateSize, sizeComplexScript: csNoDate, font, language: lang }));
            }
            mainChildren.push(new Paragraph({
                children: runs,
                tabStops: [{ type: TabStopType.RIGHT, position: 10800 }],
                spacing: { before: 60, after: 40 }
            }));
        }

        // Subject
        if (model.subject) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.subject, bold: true, underline: {}, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                spacing: { before: 20, after: 60 }
            }));
        }

        // Reference — label on its own line, ref items below
        if (model.referenceBlocks.length > 0) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.referenceLabel.trim(), bold: true, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                spacing: { after: 0 }
            }));
            mainChildren.push(...this.contentBlocksToDocx(model.referenceBlocks, font, bn));
        } else if (this.noteSheet?.referenceNumber) {
            const plain = this.stripHtml(this.noteSheet.referenceNumber ?? '');
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.referenceLabel.trim(), bold: true, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                spacing: { after: 0 }
            }));
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: plain, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                spacing: { after: 80 }
            }));
        }

        // Merge serial (১।) with first text block so they appear inline
        if (model.mainBlocks.length > 0 && model.mainBlocks[0].type === 'paragraph' && model.mainBlocks[0].text) {
            const firstBlock = model.mainBlocks[0];
            const serialRun = new TextRun({ text: `${model.mainSerialText}  `, bold: true, size: contentSize, sizeComplexScript: csContent, font, language: lang });
            const contentRuns = (firstBlock.runs && firstBlock.runs.length > 0)
                ? firstBlock.runs.map(r => new TextRun({
                    text: r.text,
                    bold: r.bold,
                    italics: r.italic,
                    underline: r.underline ? {} : undefined,
                    size: contentSize,
                    sizeComplexScript: csContent,
                    font,
                    language: lang
                }))
                : [new TextRun({ text: firstBlock.text!, bold: firstBlock.bold, italics: firstBlock.italic, size: contentSize, sizeComplexScript: csContent, font, language: lang })];
            mainChildren.push(new Paragraph({
                children: [serialRun, ...contentRuns],
                spacing: { before: 160, after: 80 }, alignment: AlignmentType.JUSTIFIED
            }));
            if (model.mainBlocks.length > 1) {
                mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks.slice(1), font, bn));
            }
        } else {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.mainSerialText, bold: true, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                spacing: { before: 160, after: 40 }
            }));
            mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));
        }

        // Note (২।)
        if (model.note) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.serial(2)}  `, bold: true, size: contentSize, sizeComplexScript: csContent, font, language: lang }),
                    new TextRun({ text: model.note, size: contentSize, sizeComplexScript: csContent, font, language: lang })
                ],
                spacing: { before: 80, after: 80 }
            }));
        }

        // Closing text
        if (model.closingText) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.closingText, size: contentSize, sizeComplexScript: csContent, font, language: lang })],
                indent: { firstLine: 480 }, spacing: { before: 200 }
            }));
        }

        // Initiator — right-positioned via left indent, keep block together
        if (model.initiator) {
            const initIndent = { left: 7000 };
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

            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
            }));

            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, spacing: { before: 400 }
                }));
            }
        }

        // Approvers — keep each approver block together
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: sigSize, sizeComplexScript: csSig, font, language: lang })],
                spacing: { before: 280 }, keepNext: true, keepLines: true
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: sigSize, sizeComplexScript: csSig, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, size: sigSize, sizeComplexScript: csSig, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, keepNext: true }));
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

        // Title paragraphs — placed at top of the main cell, INSIDE the outer border
        const titleChildren: Paragraph[] = [
            new Paragraph({
                children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: titleHdrSize, font: 'Times New Roman' })],
                alignment: AlignmentType.CENTER, spacing: { before: 80, after: 40 }, keepNext: true
            }),
            new Paragraph({
                children: [new TextRun({ text: 'মন্তব্য পত্র', bold: true, underline: {}, size: titleHdrSize, font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const } })],
                alignment: AlignmentType.CENTER, spacing: { after: 100 }, keepNext: true
            }),
        ];

        // Outer bordered table: single column (no সংলগ্নী নং column)
        const thickBorder = { style: BorderStyle.SINGLE, size: 12, color: '000000' } as const;
        // ≈ full page content height; smaller for A4 so the border does not overflow.
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
                        margins: { top: 60, bottom: 60, left: 0, right: 0 },
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

    private contentBlocksToDocx(blocks: ContentBlock[], font: any, bn: boolean): (Paragraph | Table)[] {
        const result: (Paragraph | Table)[] = [];
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const contentSize = 20; // 10pt — uniform body size
        const csContent = bn ? 20 : undefined;

        for (const b of blocks) {
            if (b.type === 'table' && b.rows?.length) {
                const rows: TableRow[] = b.rows.map((row, rowIdx) => new TableRow({
                    children: row.map(cell => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({
                                text: cell,
                                bold: rowIdx === 0,
                                size: contentSize,
                                sizeComplexScript: csContent,
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
                const indent = b.indent === 'list' ? { left: 240 } : undefined;
                const children = (b.runs && b.runs.length > 0)
                    ? b.runs.map(r => new TextRun({
                        text: r.text,
                        bold: r.bold,
                        italics: r.italic,
                        underline: r.underline ? {} : undefined,
                        size: contentSize,
                        sizeComplexScript: csContent,
                        font,
                        language: lang
                    }))
                    : [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: contentSize, sizeComplexScript: csContent, font, language: lang })];
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
}
