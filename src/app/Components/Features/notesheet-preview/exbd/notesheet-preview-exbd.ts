import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, ViewChild, inject } from '@angular/core';
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
import { NotesheetApproverSelectComponent } from '@/Components/Common/notesheet-approver-select/notesheet-approver-select';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { FamilyInfoService, FamilyInfoByEmployeeView } from '@/services/family-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import {
    NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, NoteSheetOperationTypeOptions,
    ApprovalStatus, NoteSheetRemarkAction, NoteSheetPreviewFrom,
    ApprovalLogAction, ApprovalLogActionOptions
} from '@/models/enums';
import { SharedService } from '@/shared/services/shared-service';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { environment } from '@/Core/Environments/environment';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SafeHtml } from '@angular/platform-browser';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, ImageRun,
    VerticalAlign, TableLayoutType, HeightRule, PageOrientation
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
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule, FlexibleDateDirective,
        NotesheetSignatoryComponent, RichEditorComponent, NotesheetApproverSelectComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './notesheet-preview-exbd.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewExbdComponent extends NotesheetPreviewBase implements AfterViewChecked {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;


    @ViewChild('contentMeasure') contentMeasure!: ElementRef<HTMLDivElement>;
    @ViewChild('pagesContainer') pagesContainer!: ElementRef<HTMLDivElement>;

    private readonly familyInfoService = inject(FamilyInfoService);
    private readonly commonCodeService = inject(CommonCodeService);
    private readonly confirmationService = inject(ConfirmationService);
    private readonly sharedService = inject(SharedService);
    private cdr = inject(ChangeDetectorRef);

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
    familyMembers: FamilyInfoByEmployeeView[] = [];

    // ── Edit state ─────────────────────────────────────────────
    editing = false;
    saving = false;
    employeeOptions: { label: string; value: number }[] = [];
    purposeOptions: { label: string; value: number }[] = [];
    countryOptions: { label: string; value: number }[] = [];
    subjectTypeOptions: { label: string; labelBN: string; value: number }[] = [];
    familyMemberEditOptions: { label: string; value: number }[] = [];

    // ── Submit for approval state ─────────────────────────────
    submitting = false;
    readonly NoteSheetCurrentStatus = NoteSheetCurrentStatus;

    // ── Pending-list inline actions ───────────────────────────
    fromPending = false;
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
    editReferenceNumber = '';
    editMainText = '';
    editNote = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;
    editEmployeeId: number | null = null;
    editPurposeId: number | null = null;
    editCountryId: number | null = null;
    editDateFrom: Date | null = null;
    editDateTo: Date | null = null;
    editFamilyMemberIds: number[] = [];

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

    // ── Data loading ──────────────────────────────────────────
    protected override loadApprovalChain(): void {
        super.loadApprovalChain();
        this.loadExbdDetails();
    }

    private loadExbdDetails(): void {
        const ns = this.noteSheet;
        if (!ns) return;

        this.loadSubjectTypeOptions();

        if (ns.employeeId && ns.employeeId > 0) {
            this.servingMembersService.getEmployeePersonalServiceOverview(ns.employeeId)
                .pipe(catchError(() => of(null)))
                .subscribe(emp => { this.leaveEmployee = emp; });
        }

        if (ns.wingBattalionId && ns.wingBattalionId > 0 && ns.unitId && ns.unitId > 0) {
            this.masterBasicSetup.getByParentId(ns.unitId)
                .pipe(catchError(() => of([])))
                .subscribe(list => {
                    const found = (list ?? []).find(c => c.codeId === ns.wingBattalionId);
                    if (found) {
                        this.wingName = found.codeValueEN || '';
                        this.wingNameBN = found.codeValueBN || '';
                    }
                });
        }

        if (ns.employeeId && ns.employeeId > 0 && ns.familyInfoJson) {
            try {
                const famIds = JSON.parse(ns.familyInfoJson) as { employeeId?: number; familyMemberId?: number; FamilyMemberId?: number }[];
                if (Array.isArray(famIds) && famIds.length > 0) {
                    this.familyInfoService.getFamilyInfoByEmployeeView(ns.employeeId)
                        .pipe(catchError(() => of([])))
                        .subscribe(allFam => {
                            const selectedIds = famIds.map(f => f.familyMemberId ?? f.FamilyMemberId ?? 0);
                            this.familyMembers = (allFam ?? []).filter(f => selectedIds.includes(f.ser));
                        });
                }
            } catch { /* ignore */ }
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
        const bn = !this.isEnglish();
        const emp = this.leaveEmployee;

        // Unit name: prefer employee's own rabUnitBN/rabUnit, then fall back to the
        // RabUnit lookup map (which is populated from CommonCode and has BN values).
        const unitFromMap = emp?.rabUnitId
            ? (bn ? (this.unitLabelMapBN[emp.rabUnitId] || this.unitLabelMap[emp.rabUnitId]) : this.unitLabelMap[emp.rabUnitId])
            : '';
        const unitName = emp
            ? ((bn ? (emp.rabUnitBN || emp.rabUnit) : emp.rabUnit) || unitFromMap || '')
            : '';
        const wing = bn ? (this.wingNameBN || this.wingName) : this.wingName;
        const rawRabId = emp?.rabId || '';
        const rabId = bn ? this.toBanglaDigits(rawRabId) : rawRabId;
        const empName = emp ? (bn ? (emp.nameBN || emp.nameEnglish) : emp.nameEnglish) || '' : '';
        const rank = emp ? (bn ? (emp.armyRankBN || emp.armyRank) : emp.armyRank) || '' : '';

        let familyText = '';
        if (this.familyMembers.length > 0) {
            const parts = this.familyMembers.map(f => {
                const rel = bn ? (f.relationBN || f.relation) : f.relation;
                const name = bn ? (f.nameBN || f.name) : f.name;
                return rel && name ? `${rel} ${name}` : (name || rel || '');
            }).filter(Boolean);
            familyText = parts.join(', ');
        }

        const country = ns.destinationCountryId != null ? this.getCountryLabel(ns.destinationCountryId) : '';
        const purposeId = ns.purposeOfExBdLeaveId ?? (ns as any).purposeId ?? null;
        const purpose = purposeId != null ? this.getPurposeLabel(purposeId) : '';
        const visitFrom = ns.dateOfVisitFrom ?? (ns as any).fromDate ?? null;
        const visitTo = ns.dateOfVisitTo ?? (ns as any).toDate ?? null;
        const fromDate = visitFrom ? this.formatMonthYear(visitFrom) : '';
        const toDate = visitTo ? this.formatMonthYear(visitTo) : '';
        let totalDays = ns.totalDays ?? (ns as any).totalDays ?? 0;
        if (!totalDays && visitFrom && visitTo) {
            try {
                const f = new Date(visitFrom), t = new Date(visitTo);
                if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
                    totalDays = Math.max(0, Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                }
            } catch { /* ignore */ }
        }
        const totalDaysDisplay = bn ? this.toBanglaDigits(totalDays) : String(totalDays);

        let text = '';
        if (bn) {
            text = 'বর্তমানে';
            if (unitName) text += ` ${unitName}`;
            if (wing) text += `, ${wing}`;
            text += `-এ কর্মরত, ${rabId}: ${rank} ${empName}`;
            if (familyText) text += `, তাঁর পরিবারের সদস্য ${familyText}-এর`;
            if (country) text += ` ${country}-তে`;
            if (purpose) text += ` ${purpose}-এর জন্য`;
            text += ' নিরাপত্তা ছাড়পত্রের আবেদন জমা দিয়েছেন';
            if (fromDate && toDate) text += ` ${fromDate} থেকে ${toDate} পর্যন্ত`;
            if (totalDays > 0) text += `, অথবা ভ্রমণের তারিখ থেকে ${totalDaysDisplay} দিনের মধ্যে`;
            text += '।';
        } else {
            text = `Currently, working at the ${unitName}`;
            if (wing) text += `, ${wing}`;
            text += `, ${rabId}: ${rank} ${empName}`;
            text += `, has submitted a request for a security clearance`;
            if (familyText) text += ` for his family ${familyText}`;
            if (country) text += ` to travel to ${country}`;
            if (purpose) text += ` for ${purpose}`;
            if (fromDate && toDate) text += ` from ${fromDate} to ${toDate}`;
            if (totalDays > 0) text += `, or within ${totalDays} days from the date of travel`;
            text += '.';
        }

        const mainText = ns.mainText?.trim();
        if (mainText) {
            const inline = mainText.replace(/^<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '');
            text += ' ' + inline;
        }

        return text;
    }

    // ── Toggle edit mode ──────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        const ns = this.noteSheet;

        this.editSubject = ns.subject ?? '';
        this.editExBdLeaveSubjectId = ns.exBdLeaveSubjectId ?? null;
        this.editReferenceNumber = ns.referenceNumber ?? '';
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

        // ExBD-specific fields
        this.editEmployeeId = ns.employeeId ?? null;
        this.editPurposeId = ns.purposeOfExBdLeaveId ?? (ns as any).purposeId ?? null;
        this.editCountryId = ns.destinationCountryId ?? (ns as any).DestinationCountryId ?? null;
        const rawFrom = ns.dateOfVisitFrom ?? (ns as any).fromDate ?? null;
        const rawTo = ns.dateOfVisitTo ?? (ns as any).toDate ?? null;
        this.editDateFrom = rawFrom ? new Date(rawFrom) : null;
        this.editDateTo = rawTo ? new Date(rawTo) : null;
        this.editFamilyMemberIds = this.parseFamilyMemberIds();

        if (this.employeeOptions.length === 0) this.loadEmployeeOptions();
        this.loadPurposeOptions();
        this.loadCountryOptions();
        if (this.editEmployeeId) this.loadFamilyMemberOptions(this.editEmployeeId);
    }

    cancelEdit(): void {
        this.editing = false;
        this.lastMeasuredHeight = 0;
    }

    // ── Load dropdown options ─────────────────────────────────
    private loadEmployeeOptions(): void {
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
            error: (err: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employee list.' })
        });
    }

    private loadPurposeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('VisitType')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.purposeOptions = (list ?? []).map((c: any) => ({ label: c.codeValueEN || c.displayCodeValueEN || '', value: c.codeId }));
            });
    }

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

    private loadCountryOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Country')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.countryOptions = (list ?? []).map((c: any) => ({ label: c.codeValueEN || c.displayCodeValueEN || '', value: c.codeId }));
            });
    }

    private loadFamilyMemberOptions(employeeId: number): void {
        this.familyInfoService.getFamilyInfoByEmployeeView(employeeId)
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.familyMemberEditOptions = (list ?? []).map(f => ({
                    label: `${f.relation || ''} - ${f.name || ''}`.trim(),
                    value: f.ser
                }));
            });
    }

    // ── Save changes ──────────────────────────────────────────
    saveChanges(): void {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const recommendersJson = this.buildRecommendersJson();
        const familyInfoJson = this.editFamilyMemberIds.length > 0
            ? JSON.stringify(this.editFamilyMemberIds.map(id => ({ employeeId: this.editEmployeeId, familyMemberId: id })))
            : null;
        const now = new Date().toISOString();

        const resolvedSubject = this.getSubjectLabel(this.editExBdLeaveSubjectId) || this.editSubject;
        const payload: Record<string, unknown> = {
            ...this.noteSheet,
            subject: resolvedSubject,
            exBdLeaveSubjectId: this.editExBdLeaveSubjectId,
            referenceNumber: this.editReferenceNumber,
            mainText: this.editMainText,
            note: this.editNote || null,
            textType: this.editTextType === 'bn' ? 1 : 0,
            noteSheetOperationType: this.editOperationType,
            noteSheetDate: this.editNoteSheetDate ? this.formatDateOnly(this.editNoteSheetDate) : this.noteSheet.noteSheetDate,
            initiatorId: this.editInitiatorId ?? 0,
            recommendersJson,
            finalApprovalId: this.editFinalApproverId ?? null,
            employeeId: this.editEmployeeId ?? null,
            purposeId: this.editPurposeId ?? null,
            destinationCountryId: this.editCountryId ?? null,
            fromDate: this.editDateFrom ? this.formatDateOnly(this.editDateFrom) : null,
            toDate: this.editDateTo ? this.formatDateOnly(this.editDateTo) : null,
            familyInfoJson,
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

    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.preparedByDetails = null;
        this.leaveEmployee = null;
        this.familyMembers = [];
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
                    this.router.navigate(['/notesheet-list/pending-ex-bd-leave']);
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

    private parseFamilyMemberIds(): number[] {
        if (!this.noteSheet?.familyInfoJson) return [];
        try {
            const arr = JSON.parse(this.noteSheet.familyInfoJson) as any[];
            return Array.isArray(arr) ? arr.map(f => f.familyMemberId ?? f.FamilyMemberId ?? 0).filter(Boolean) : [];
        } catch { return []; }
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

    private buildDocumentModel(): NotesheetDocumentModel {
        if (!this.noteSheet) throw new Error('No noteSheet');
        const bn = !this.isEnglish();

        const refHtml = this.fixBanglaWordBreaks(this.noteSheet.referenceNumber ?? '');
        const refBlocks = refHtml ? this.parseHtmlToContentBlocks(refHtml) : [];

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

        // Reference / Date — label + first content block merged inline
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

        // Merge serial (১।) with first text block so they appear inline
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

        // Initiator — right-positioned via left indent, keep block together
        if (model.initiator) {
            const initIndent = { left: 5500 };
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
                children: [new TextRun({ text: model.initiator.nameLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
            }));

            if (model.initiator.rankLine) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.rankLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.LEFT, indent: initIndent, keepNext: true
                }));
            }

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

        // Title paragraphs — placed at top of the main cell, INSIDE the outer border
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
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
        const thickBorder = { style: BorderStyle.SINGLE, size: 12, color: '000000' } as const;
        const rowHeight = 19200;

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
}
