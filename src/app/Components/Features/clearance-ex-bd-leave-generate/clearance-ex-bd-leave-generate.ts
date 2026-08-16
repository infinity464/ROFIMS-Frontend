import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { EditorModule } from 'primeng/editor';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { ExBdLeaveClearanceService } from '@/services/ex-bd-leave-clearance.service';
import { IdentityService } from '@/services/identity.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { buildApprovalPersonOptions } from '@/shared/utils/approval-person-options.util';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApprovedNoteSheetItem } from '@/models/posting.model';
import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { CodeType, PostingType } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import { buildUploadOwnerTag } from '@/shared/utils/upload-file-name.util';
import { EmployeeSearchInfoModel } from '@/models/EmpModel';
import { ExBdLeaveApplicationService, ExBdLeaveNoteSheetBodyData } from '@/services/ex-bd-leave-application.service';
import { OnulipiItem } from '@/Components/basic-setup/shared/models/onulipi-config';
import { CommonCodeService } from '@/services/common-code-service';
import { CommonCodeModel } from '@/models/common-code-model';
import { formatDateEnglishDMY } from '@/Core/i18n/bangla-numerals';

/** Reference No paragraph entry. */
interface ReferenceNoEntry {
    serial: string;
    text: string;
}

/** Onulipi paragraph entry (same as PostingOrder footer paragraph). */
interface OnulipiParagraph {
    text: string;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
}

/** Attachment entry — plain text, rendered above the Onulipi. */
interface AttachmentEntry {
    text: string;
}

@Component({
    selector: 'app-clearance-ex-bd-leave-generate',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        InputTextModule,
        TextareaModule,
        EditorModule,
        Toast,
        ConfirmDialogModule,
        TooltipModule,
        FileReferencesFormComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './clearance-ex-bd-leave-generate.html',
    styleUrl: './clearance-ex-bd-leave-generate.scss'
})
export class ClearanceExBdLeaveGenerateComponent implements OnInit {
    @ViewChild('fileReferencesForm') fileReferencesForm!: FileReferencesFormComponent;

    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private sharedService = inject(SharedService);
    private memberTypeAccess = inject(IdentityUserMemberTypeAccessService);

    /** Logged-in user for createdBy / updatedBy. Falls back to 'system' only when nobody is signed in. */
    private get auditUser(): string {
        return this.sharedService.getCurrentUser() ?? 'system';
    }

    allowedMemberTypeIds: number[] | null = null;
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    private route = inject(ActivatedRoute);
    private noteSheetApi = `${environment.apis.core}/NoteSheetInfo`;

    // --- Edit mode ------------------------------------------------
    editMode = false;
    editId: number | null = null;

    // --- NoteSheet selection --------------------------------------
    approvedNoteSheets: ApprovedNoteSheetItem[] = [];
    selectedNoteSheetId: number | null = null;
    loadingNoteSheets = false;
    selectedNoteSheetNo: string | null = null;
    selectedNoteSheetApprovedDate: string | null = null;

    // --- Number Config dropdown -----------------------------------
    configOptions: { label: string; value: number }[] = [];
    postingOrderNumberConfigId: number | null = null;
    private allConfigs: PostingOrderNumberConfigModel[] = [];
    private memberTypeMap: Record<number, string> = {};

    // --- Approval Person dropdown ---------------------------------
    approvalEmployees: { label: string; value: number }[] = [];
    selectedApprovalEmployeeId: number | null = null;
    loadingApprovalEmployees = false;

    // --- Applicant info (shown when notesheet selected) -------------
    applicantInfo: EmployeeSearchInfoModel | null = null;
    loadingApplicant = false;

    // --- Form fields ----------------------------------------------
    manualLetterNo = '';
    letterDate: Date | null = null;
    selectedTextType = 'en';
    subject = '';
    addressTo = '';  // Rich text HTML
    referenceEntries: ReferenceNoEntry[] = [];
    bodyText = '';
    fileRows: FileRowData[] = [];
    onulipiParagraphs: OnulipiParagraph[] = [];
    attachmentEntries: AttachmentEntry[] = [];
    remarks = '';
    saving = false;

    get isBangla(): boolean {
        return false;
    }

    /** Default Remarks text loaded on a new clearance — becomes paragraph 2 of the letter. */
    private defaultRemarks(): string {
        return 'Forward for your kind information and further necessary action please.';
    }

    getReferenceSerial(index: number): string {
        return String.fromCharCode(65 + index);  // A, B, C...
    }

    private subjectTypes: CommonCodeModel[] = [];

    constructor(
        private exBdLeaveClearanceService: ExBdLeaveClearanceService,
        private exBdLeaveAppService: ExBdLeaveApplicationService,
        private masterBasicSetupService: MasterBasicSetupService,
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService,
        private commonCodeService: CommonCodeService,
        private empService: EmpService,
        private http: HttpClient,
        private router: Router,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();

        this.letterDate = new Date();
        this.loadApprovalEmployees();
        this.loadNumberConfigs();
        this.loadApprovedNoteSheets();
        this.commonCodeService.getAllActiveCommonCodesType('SubjectType').subscribe(list => this.subjectTypes = list ?? []);

        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (id) {
            this.editMode = true;
            this.editId = id;
            this.loadClearanceForEdit(id);
        }
    }

    private loadClearanceForEdit(id: number): void {
        this.exBdLeaveClearanceService.getClearanceById(id).subscribe({
            next: (data) => {
                if (!data) return;
                this.selectedTextType = 'en';
                this.letterDate = data.letterDate ? new Date(data.letterDate) : new Date();
                this.manualLetterNo = data.letterNo ?? '';
                this.subject = data.subject ?? '';
                this.addressTo = data.addressTo ?? '';
                this.bodyText = data.body ?? '';
                this.remarks = data.remarks ?? '';
                this.selectedApprovalEmployeeId = data.approvalEmployeeId ?? null;

                // NoteSheet -- add to dropdown if not already present, then select
                if (data.noteSheetId) {
                    this.selectedNoteSheetId = data.noteSheetId;
                    this.selectedNoteSheetNo = data.noteSheetNo ?? null;
                    const existing = this.approvedNoteSheets.find(ns => ns.noteSheetId === data.noteSheetId);
                    if (!existing) {
                        this.approvedNoteSheets = [
                            { noteSheetId: data.noteSheetId, noteSheetNo: data.noteSheetNo ?? `#${data.noteSheetId}` } as ApprovedNoteSheetItem,
                            ...this.approvedNoteSheets
                        ];
                    }
                    // Load applicant info for edit mode
                    this.http.get<any>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${data.noteSheetId}`).subscribe({
                        next: (nsData) => {
                            const ns = Array.isArray(nsData) ? nsData[0] : nsData;
                            const appId = ns?.exBdLeaveApplicationId ?? ns?.ExBdLeaveApplicationId;
                            if (appId) this.loadApplicantInfo(appId);
                        }
                    });
                }

                // Reference entries
                try { this.referenceEntries = data.referenceNo ? JSON.parse(data.referenceNo) : []; } catch { this.referenceEntries = []; }

                // Onulipi
                try { this.onulipiParagraphs = data.onulipi ? JSON.parse(data.onulipi) : []; } catch { this.onulipiParagraphs = []; }

                // Attachments
                try {
                    const atts = data.attachments ? JSON.parse(data.attachments) : [];
                    this.attachmentEntries = Array.isArray(atts) ? atts.map((a: any) => ({ text: a?.text ?? '' })) : [];
                } catch { this.attachmentEntries = []; }

                // File references
                try {
                    const files = data.filesReferences ? JSON.parse(data.filesReferences) : [];
                    this.fileRows = files.map((f: any) => ({
                        fileId: f.FileId ?? f.fileId,
                        fileName: f.fileName ?? f.FileName ?? '',
                        displayName: f.fileName ?? f.FileName ?? '',
                        file: null
                    }));
                } catch { this.fileRows = []; }

                this.rebuildConfigOptions();
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load clearance for editing.' });
            }
        });
    }

    loadApprovalEmployees(): void {
        this.loadingApprovalEmployees = true;
        forkJoin({
            users: this.identityService.getAllUsers(),
            mappings: this.identityMappingService.getMappings()
        }).subscribe({
            next: ({ users, mappings }) => {
                this.approvalEmployees = buildApprovalPersonOptions(
                    Array.isArray(users) ? users : [],
                    Array.isArray(mappings) ? mappings : []
                );
                this.loadingApprovalEmployees = false;
            },
            error: () => { this.loadingApprovalEmployees = false; }
        });
    }

    loadApprovedNoteSheets(): void {
        this.loadingNoteSheets = true;
        this.exBdLeaveClearanceService.getApprovedExBdLeaveNoteSheets().subscribe({
            next: (list) => {
                this.approvedNoteSheets = list ?? [];
                this.loadingNoteSheets = false;
            },
            error: (err) => {
                this.loadingNoteSheets = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load notesheets.' });
            }
        });
    }

    loadNumberConfigs(): void {
        forkJoin({
            configs: this.masterBasicSetupService.getAllPostingOrderNumberConfig(),
            memberTypes: this.masterBasicSetupService.getAllByType(CodeType.EmployeeType)
        }).subscribe({
            next: ({ configs, memberTypes }) => {
                this.memberTypeMap = {};
                (memberTypes ?? []).forEach((t) => { this.memberTypeMap[t.codeId] = t.codeValueEN; });
                this.allConfigs = configs ?? [];
                this.rebuildConfigOptions();
            },
            error: () => {}
        });
    }

    private rebuildConfigOptions(): void {
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;
        this.configOptions = this.allConfigs
            .filter((c) => c.postingType === PostingType.ExBdLeaveClearance && c.status)
            .map((c) => {
                const prefixLabel = c.prefix;
                const yearReset = c.currentYear !== nowYear || c.currentMonth !== nowMonth;
                const nextNum = yearReset ? c.startNumber : c.currentNumber + 1;
                const yearStr = String(nowYear);
                const monthStr = String(nowMonth).padStart(2, '0');
                const numStr = String(nextNum);
                const previewNo = c.includeDate
                    ? `${prefixLabel}/${yearStr}/${monthStr}/${numStr}`
                    : `${prefixLabel}/${numStr}`;
                const memberTypeLabel = (c.memberTypeIds ?? '').split(',').filter(Boolean)
                    .map(id => this.memberTypeMap[+id]).filter(Boolean).join(', ');
                return {
                    label: memberTypeLabel ? `${previewNo}  ${memberTypeLabel}` : previewNo,
                    value: c.configId
                };
            });
        // Auto-select if only one config; force refresh display if already selected
        const currentVal = this.postingOrderNumberConfigId;
        if (this.configOptions.length === 1) {
            this.postingOrderNumberConfigId = this.configOptions[0].value;
        } else if (currentVal != null && this.configOptions.some(o => o.value === currentVal)) {
            this.postingOrderNumberConfigId = currentVal;
        }
    }

    get noteSheetDropdownOptions() {
        return this.approvedNoteSheets
            .filter(ns => this.memberTypeAccess.isAccessible(ns.employeeTypeIds, this.allowedMemberTypeIds))
            .map(ns => ({
                label: ns.noteSheetNo,
                value: ns.noteSheetId
            }));
    }

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

    /** When a notesheet is selected, auto-fill Subject, Body, Onulipi, and load applicant info. */
    onNoteSheetChange(): void {
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.subject = '';
        this.onulipiParagraphs = [];
        this.attachmentEntries = [];  // Attachment has no default — user adds entries on demand
        this.applicantInfo = null;
        if (!this.selectedNoteSheetId) return;

        this.http.get<any>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) return;

                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                this.selectedTextType = 'en';
                const subjectId = ns.exBdLeaveSubjectId ?? ns.ExBdLeaveSubjectId;
                if (subjectId) {
                    const code = this.subjectTypes.find(c => c.codeId === subjectId);
                    this.subject = code ? code.codeValueEN : (ns.subject ?? '');
                } else {
                    this.subject = ns.subject ?? '';
                }
                this.remarks = this.defaultRemarks();
                this.postingOrderNumberConfigId = null;
                this.rebuildConfigOptions();
                this.loadOnulipiFromConfig();

                const appId = ns.exBdLeaveApplicationId ?? ns.ExBdLeaveApplicationId;
                if (appId) {
                    this.loadApplicantInfo(appId);
                    this.buildEnglishBody(appId);
                }
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load notesheet details.' });
            }
        });
    }

    private buildEnglishBody(exBdLeaveApplicationId: number): void {
        this.exBdLeaveAppService.getNoteSheetBodyData(exBdLeaveApplicationId).subscribe({
            next: (bd) => {
                if (!bd) return;
                this.empService.getEmployeeSearchInfo(bd.applicantEmployeeId).subscribe({
                    next: (emp) => {
                        const name = bd.empNameEN || '';
                        const prefix = bd.prefixEN || '';
                        const serviceId = emp?.ServiceId || emp?.serviceId || '';
                        const identity = [prefix, serviceId].filter(Boolean).join('-');
                        const rank = emp?.rank || emp?.Rank || '';
                        const corps = bd.corpsEN || '';
                        const corpsClause = corps ? `, ${corps}` : '';
                        const purpose = bd.visitTypeNameEN || '';
                        const countries = bd.countriesDisplayEN || '';
                        const totalDays = bd.totalDays ?? 0;
                        const fromDate = formatDateEnglishDMY(bd.fromDate ? new Date(bd.fromDate) : null);
                        const toDate = formatDateEnglishDMY(bd.toDate ? new Date(bd.toDate) : null);
                        // Backend returns family as "Relation-Name" entries joined by ", "
                        // (e.g. "Spouse-Rudvi Furat Nikita"). Turn the FIRST "-" of each entry
                        // into ": " so it reads "(Spouse: Rudvi Furat Nikita)".
                        let family = '';
                        if (bd.familyMembersDisplayEN) {
                            const members = bd.familyMembersDisplayEN
                                .split(',')
                                .map(s => s.trim().replace('-', ': '))
                                .join(', ');
                            family = ` including his/her family (${members})`;
                        }

                        // e.g. "Pursuant to the letter at reference B security clearance of BA-10015 Major
                        // M. Sadman Sakib, Infantry including his/her family (Spouse: Rudvi Furat Nikita) has
                        // been sanctioned with effect from 10 October 2026 to 24 October 2026 total 15 days
                        // which is to be availed in Indonesia for recreation purpose."
                        const identName = [identity, rank, name].filter(Boolean).join(' ');
                        this.bodyText = `Pursuant to the letter at reference B security clearance of ${identName}${corpsClause}${family} has been sanctioned with effect from ${fromDate} to ${toDate} total ${totalDays} days which is to be availed in ${countries} for ${purpose} purpose.`;
                    }
                });
            }
        });
    }

    private loadApplicantInfo(exBdLeaveApplicationId: number): void {
        this.loadingApplicant = true;
        this.exBdLeaveAppService.getNoteSheetBodyData(exBdLeaveApplicationId).subscribe({
            next: (bodyData) => {
                if (!bodyData?.applicantEmployeeId) { this.loadingApplicant = false; return; }
                this.empService.getEmployeeSearchInfo(bodyData.applicantEmployeeId).subscribe({
                    next: (info) => { this.applicantInfo = info; this.loadingApplicant = false; },
                    error: () => { this.loadingApplicant = false; }
                });
            },
            error: () => { this.loadingApplicant = false; }
        });
    }

    private loadOnulipiFromConfig(): void {
        this.masterBasicSetupService.getOnulipiConfigByPostingType(PostingType.ExBdLeaveClearance).subscribe({
            next: (configs) => {
                const match = (configs ?? [])[0];
                if (!match) return;
                const json = match.onulipiJsonEN;
                if (!json) return;
                try {
                    const items: OnulipiItem[] = JSON.parse(json);
                    this.onulipiParagraphs = items
                        .sort((a, b) => a.serial - b.serial)
                        .map(item => ({ text: item.text, transferRabUnitId: null, transferRabUnitName: null }));
                } catch { /* ignore parse errors */ }
            }
        });
    }

    // --- Reference No entries ------------------------------------
    addReferenceEntry(): void {
        const serial = this.getReferenceSerial(this.referenceEntries.length);
        this.referenceEntries.push({ serial, text: '' });
    }

    removeReferenceEntry(index: number): void {
        this.referenceEntries.splice(index, 1);
        // Re-generate serials
        this.referenceEntries.forEach((e, i) => {
            e.serial = this.getReferenceSerial(i);
        });
    }

    // --- File References -----------------------------------------
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

    // --- Onulipi paragraphs --------------------------------------
    addOnulipiParagraph(): void {
        this.onulipiParagraphs.push({ text: '', transferRabUnitId: null, transferRabUnitName: null });
    }

    removeOnulipiParagraph(index: number): void {
        this.onulipiParagraphs.splice(index, 1);
    }

    moveOnulipiUp(index: number): void {
        if (index <= 0) return;
        [this.onulipiParagraphs[index - 1], this.onulipiParagraphs[index]] =
            [this.onulipiParagraphs[index], this.onulipiParagraphs[index - 1]];
    }

    moveOnulipiDown(index: number): void {
        if (index >= this.onulipiParagraphs.length - 1) return;
        [this.onulipiParagraphs[index], this.onulipiParagraphs[index + 1]] =
            [this.onulipiParagraphs[index + 1], this.onulipiParagraphs[index]];
    }

    // --- Attachments ---------------------------------------------
    addAttachmentEntry(): void {
        this.attachmentEntries.push({ text: '' });
    }

    removeAttachmentEntry(index: number): void {
        this.attachmentEntries.splice(index, 1);
    }

    moveAttachmentUp(index: number): void {
        if (index <= 0) return;
        [this.attachmentEntries[index - 1], this.attachmentEntries[index]] =
            [this.attachmentEntries[index], this.attachmentEntries[index - 1]];
    }

    moveAttachmentDown(index: number): void {
        if (index >= this.attachmentEntries.length - 1) return;
        [this.attachmentEntries[index], this.attachmentEntries[index + 1]] =
            [this.attachmentEntries[index + 1], this.attachmentEntries[index]];
    }

    trackByIndex(index: number): number {
        return index;
    }

    // --- Generate ------------------------------------------------
    private formatDateToString(value: Date | null): string {
        if (!value) {
            const today = new Date();
            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    onGenerate(): void {
        // Guard against double submission while a save is already in flight.
        if (this.saving) return;
        if (!this.selectedNoteSheetId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a notesheet.' });
            return;
        }
        if (!this.editMode && !this.postingOrderNumberConfigId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select a Letter No pattern.' });
            return;
        }
        if (!this.selectedApprovalEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please select an approval person.' });
            return;
        }
        if (!this.addressTo?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Address To is required.' });
            return;
        }
        if (!this.subject?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Subject is required.' });
            return;
        }
        if (!this.bodyText?.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Body is required.' });
            return;
        }

        this.saving = true;

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const refJson = this.referenceEntries.filter(e => e.text.trim()).length > 0
                ? JSON.stringify(this.referenceEntries.filter(e => e.text.trim()))
                : null;
            const onulipiJson = this.onulipiParagraphs.filter(p => p.text.trim()).length > 0
                ? JSON.stringify(this.onulipiParagraphs.filter(p => p.text.trim()).map(p => ({
                    text: p.text.trim(),
                    transferRabUnitId: p.transferRabUnitId,
                    transferRabUnitName: p.transferRabUnitName
                })))
                : null;
            const attachmentsJson = this.attachmentEntries.filter(a => a.text.trim()).length > 0
                ? JSON.stringify(this.attachmentEntries.filter(a => a.text.trim()).map(a => ({ text: a.text.trim() })))
                : null;

            const saveObs = this.editMode && this.editId
                ? this.exBdLeaveClearanceService.updateClearance({
                    id: this.editId,
                    letterNo: this.manualLetterNo || '',
                    letterDate: this.formatDateToString(this.letterDate),
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyText?.trim() || null,
                    onulipi: onulipiJson,
                    attachments: attachmentsJson,
                    textType: 'en',
                    filesReferences: filesReferencesJson,
                    remarks: this.remarks || null,
                    updatedBy: this.auditUser,
                    approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
                })
                : this.exBdLeaveClearanceService.createClearance({
                    letterNo: '',
                    letterDate: this.formatDateToString(this.letterDate),
                    noteSheetId: this.selectedNoteSheetId!,
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyText?.trim() || null,
                    onulipi: onulipiJson,
                    attachments: attachmentsJson,
                    textType: 'en',
                    filesReferences: filesReferencesJson,
                    remarks: this.remarks || null,
                    createdBy: this.auditUser,
                    postingOrderNumberConfigId: this.postingOrderNumberConfigId ?? null,
                    approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
                });

            saveObs.subscribe({
                next: (res) => {
                    this.saving = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: this.editMode ? 'Clearance updated successfully.' : 'Clearance generated successfully.' });
                        this.router.navigate(['/clearance-ex-bd-leave-list']);
                    } else {
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed.' });
                    }
                },
                error: (err) => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed.' });
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) =>
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name, buildUploadOwnerTag(this.applicantInfo?.rabID ?? this.applicantInfo?.RABID, this.applicantInfo?.employeeID ?? this.applicantInfo?.EmployeeID))
            );
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs = [
                        ...existingRefs.map((r) => ({ FileId: r.FileId, fileName: r.fileName })),
                        ...newRefs
                    ];
                    doSave(allRefs.length > 0 ? JSON.stringify(allRefs) : null);
                },
                error: (err: any) => {
                    this.saving = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to upload one or more files.' });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
            return String(value);
        }
    }

}
