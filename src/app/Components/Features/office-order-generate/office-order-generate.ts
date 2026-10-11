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
import { OfficeOrderService } from '@/services/office-order.service';
import { IdentityService } from '@/services/identity.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { buildApprovalPersonOptions } from '@/shared/utils/approval-person-options.util';
import { MainTextBlock, parseMainTextBlocks } from '@/shared/utils/notesheet-main-text';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApprovedNoteSheetItem } from '@/models/posting.model';
import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { CodeType, NoteSheetType, OrderFormat, PostingType, SubjectCategory } from '@/models/enums';
import { buildOfficeOrderLetterNoOptions, toOfficeOrderBodyJson, OFFICE_ORDER_WITHOUT_NOTESHEET } from '@/shared/utils/office-order.util';
import { NoteSheetSubjectService, NoteSheetSubjectModel } from '@/Components/basic-setup/shared/services/NoteSheetSubjectService';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { MembersEditorComponent } from '@/Components/Shared/members-editor/members-editor';
import { UnitHierarchySelectComponent } from '@/Components/Shared/unit-hierarchy-select/unit-hierarchy-select';
import { MembersJsonData } from '@/Components/Features/notesheet-generate/notesheet-generate';
import { GeneralNotesheetOfficeOrderWithDetailsDto, OfficeOrderOwnFields } from '@/models/office-order.model';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';
import '@/shared/utils/quill-keep-tabs'; // keep Tab gaps when saved HTML is reloaded into the editor

/** Reference No paragraph entry. */
interface ReferenceNoEntry {
    serial: string;
    text: string;
}

/** Body paragraph entry — one numbered paragraph of the office order, seeded from
 *  the note sheet (Main Text blocks, Note, then the extra paragraphs) and freely
 *  editable / removable afterwards. Stored in GeneralNotesheetOfficeOrder.Body as a
 *  JSON array of { text }, the same convention as NoteSheetInfo.MainText. */
interface BodyParagraph {
    text: string;
}

/** Attachment (সংযুক্ত) entry — plain text, rendered above the Onulipi, same as the
 *  ex-BD leave office order. Stored in GeneralNotesheetOfficeOrder.Attachments as a
 *  JSON array of { text }. */
interface AttachmentEntry {
    text: string;
}

/** Onulipi paragraph entry (same as PostingOrder footer paragraph). */
interface OnulipiParagraph {
    text: string;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
}

@Component({
    selector: 'app-office-order-generate',
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
        FileReferencesFormComponent,
        MultiSelectModule,
        CheckboxModule,
        MembersEditorComponent,
        UnitHierarchySelectComponent
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './office-order-generate.html',
    styleUrl: './office-order-generate.scss'
})
export class OfficeOrderGenerateComponent implements OnInit {
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

    // ─── Edit mode ────────────────────────────────────────
    editMode = false;
    editId: number | null = null;

    // ─── NoteSheet selection ──────────────────────────────
    approvedNoteSheets: ApprovedNoteSheetItem[] = [];
    selectedNoteSheetId: number | null = null;
    loadingNoteSheets = false;
    selectedNoteSheetNo: string | null = null;
    selectedNoteSheetApprovedDate: string | null = null;

    // ─── Number Config dropdown ──────────────────────────
    configOptions: { label: string; value: number }[] = [];
    postingOrderNumberConfigId: number | null = null;
    private allConfigs: PostingOrderNumberConfigModel[] = [];
    private memberTypeMap: Record<number, string> = {};

    // ─── Approval Person dropdown ─────────────────────────
    approvalEmployees: { label: string; value: number }[] = [];
    selectedApprovalEmployeeId: number | null = null;
    loadingApprovalEmployees = false;

    // ─── Form fields ─────────────────────────────────────
    manualLetterNo = '';
    letterDate: Date | null = null;
    selectedTextType = 'en';
    subject = '';
    addressTo = '';  // Rich text HTML
    referenceEntries: ReferenceNoEntry[] = [];
    bodyParagraphs: BodyParagraph[] = [];
    fileRows: FileRowData[] = [];
    onulipiParagraphs: OnulipiParagraph[] = [];
    attachmentEntries: AttachmentEntry[] = [];
    remarks = '';
    saving = false;

    // ─── Office Order without notesheet ──────────────────
    // Picked from the note-sheet dropdown: the inputs a General note sheet would carry
    // (language, unit, member types, subject, members) are taken right here instead.
    readonly OFFICE_ORDER_WITHOUT_NOTESHEET = OFFICE_ORDER_WITHOUT_NOTESHEET;
    readonly OrderFormat = OrderFormat;
    @ViewChild(MembersEditorComponent) membersEditor?: MembersEditorComponent;
    @ViewChild(UnitHierarchySelectComponent) unitSelect?: UnitHierarchySelectComponent;
    readonly textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    private subjectPickList: NoteSheetSubjectModel[] = [];
    subjectOptions: { label: string; value: number }[] = [];
    noteSheetSubjectId: number | null = null;
    /** Subject typed by hand instead of picked from the subject master (no subject id then). */
    subjectManual = false;
    /** Tracking-only tag under the Subject: Formal | Clearance | null (one or none). */
    orderFormat: string | null = null;
    private allMemberTypes: { value: number; en: string; bn: string }[] = [];
    memberTypeIds: number[] = [];
    showMembersTable = true;
    membersData: MembersJsonData = { columns: [], members: [] };

    get isWithoutNoteSheet(): boolean {
        return this.selectedNoteSheetId === OFFICE_ORDER_WITHOUT_NOTESHEET;
    }

/** Bangla serial letters */
    private banglaSerials = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন'];

    get isBangla(): boolean {
        return this.selectedTextType === 'bn';
    }

    toBanglaDigits(s: string): string {
        return s.replace(/\d/g, d => String.fromCharCode(0x09E6 + Number(d)));
    }

    getReferenceSerial(index: number): string {
        return this.isBangla
            ? (this.banglaSerials[index] ?? String(index + 1))
            : String.fromCharCode(65 + index);  // A, B, C...
    }

    /** Body paragraphs are numbered ১। ২। … (Bangla) / 1. 2. … (English), matching how
     *  the office-order preview numbers them. */
    getParagraphSerial(index: number): string {
        const n = String(index + 1);
        return this.isBangla ? `${this.toBanglaDigits(n)}।` : `${n}.`;
    }

    constructor(
        private officeOrderService: OfficeOrderService,
        private masterBasicSetupService: MasterBasicSetupService,
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService,
        private empService: EmpService,
        private http: HttpClient,
        private router: Router,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private noteSheetSubjectService: NoteSheetSubjectService
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

        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (id) {
            this.editMode = true;
            this.editId = id;
            this.loadOrderForEdit(id);
        }
    }

    private loadOrderForEdit(id: number): void {
        this.officeOrderService.getOfficeOrderById(id).subscribe({
            next: (data) => {
                if (!data) return;
                if (data.noteSheetId == null) this.applyOwnFieldsForEdit(id, data);
                this.selectedTextType = data.textType === 'bn' ? 'bn' : 'en';
                this.letterDate = data.letterDate ? new Date(data.letterDate) : new Date();
                this.manualLetterNo = data.letterNo ?? '';
                this.subject = data.subject ?? '';
                this.addressTo = data.addressTo ?? '';
                this.bodyParagraphs = this.parseBodyParagraphs(data.body);
                this.remarks = data.remarks ?? '';
                this.selectedApprovalEmployeeId = data.approvalEmployeeId ?? null;

                // NoteSheet — add to dropdown if not already present, then select
                if (data.noteSheetId) {
                    this.selectedNoteSheetId = data.noteSheetId;
                    this.showMembersTable = data.showMembersTable !== false;
                    this.selectedNoteSheetNo = data.noteSheetNo ?? null;
                    const existing = this.approvedNoteSheets.find(ns => ns.noteSheetId === data.noteSheetId);
                    if (!existing) {
                        this.approvedNoteSheets = [
                            { noteSheetId: data.noteSheetId, noteSheetNo: data.noteSheetNo ?? `#${data.noteSheetId}` } as ApprovedNoteSheetItem,
                            ...this.approvedNoteSheets
                        ];
                    }
                }

                // Reference entries
                try { this.referenceEntries = data.referenceNo ? JSON.parse(data.referenceNo) : []; } catch { this.referenceEntries = []; }

                // Onulipi
                try { this.onulipiParagraphs = data.onulipi ? JSON.parse(data.onulipi) : []; } catch { this.onulipiParagraphs = []; }

                // Attachments (সংযুক্ত)
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
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load office order for editing.' });
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
        this.officeOrderService.getApprovedGeneralNoteSheets().subscribe({
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
                this.allMemberTypes = (memberTypes ?? [])
                    .filter((mt: any) => mt.status !== false)
                    .map((mt: any) => ({ value: mt.codeId, en: mt.codeValueEN ?? '', bn: mt.codeValueBN ?? mt.codeValueEN ?? '' }));
                this.allConfigs = configs ?? [];
                this.rebuildConfigOptions();
            },
            error: () => {}
        });
    }

    private rebuildConfigOptions(): void {
        this.configOptions = buildOfficeOrderLetterNoOptions(this.allConfigs, this.memberTypeMap, this.selectedTextType === 'bn');
        // Auto-select if only one config; force refresh display if already selected
        const currentVal = this.postingOrderNumberConfigId;
        if (this.configOptions.length === 1) {
            this.postingOrderNumberConfigId = this.configOptions[0].value;
        } else if (currentVal != null && this.configOptions.some(o => o.value === currentVal)) {
            this.postingOrderNumberConfigId = currentVal;
        }
    }

    get noteSheetDropdownOptions() {
        const noteSheets = this.approvedNoteSheets
            .filter(ns => this.memberTypeAccess.isAccessible(ns.employeeTypeIds, this.allowedMemberTypeIds))
            .map(ns => ({
                label: ns.noteSheetNo,
                value: ns.noteSheetId
            }));
        // First entry: an order with no note sheet behind it — its note-sheet inputs are taken here.
        return [{ label: 'Office Order without notesheet', value: OFFICE_ORDER_WITHOUT_NOTESHEET }, ...noteSheets];
    }

    // ─── Office Order without notesheet ──────────────────
    /** Start a fresh order with no note sheet: clear the note-sheet seeded fields and load the
     *  pick lists the extra inputs need. */
    private startWithoutNoteSheet(): void {
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.selectedTextType = 'bn';   // Bangla by default; Letter No, subjects and Onulipi below follow it
        this.subject = '';
        this.noteSheetSubjectId = null;
        this.subjectManual = false;
        this.orderFormat = null;
        this.memberTypeIds = [];
        this.showMembersTable = true;
        this.membersData = { columns: [], members: [] };
        this.referenceEntries = [];
        this.bodyParagraphs = [{ text: '' }];
        this.attachmentEntries = [];
        this.postingOrderNumberConfigId = null;
        this.rebuildConfigOptions();
        this.loadOnulipiFromConfig();
        this.loadSubjectPickList();
    }

    /** Edit an order that has no note sheet: its own fields fill the extra inputs. */
    private applyOwnFieldsForEdit(id: number, data: GeneralNotesheetOfficeOrderWithDetailsDto): void {
        this.selectedNoteSheetId = OFFICE_ORDER_WITHOUT_NOTESHEET;
        this.noteSheetSubjectId = data.noteSheetSubjectId ?? null;
        // Saved without a subject id → it was typed by hand.
        this.subjectManual = this.noteSheetSubjectId == null && !!(data.subject ?? '').trim();
        this.orderFormat = data.orderFormat ?? null;
        this.memberTypeIds = (data.employeeTypeIds ?? '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        this.showMembersTable = data.showMembersTable !== false;
        this.loadSubjectPickList();
        const deepestId = data.subSectionId ?? data.sectionId ?? data.subBranchId ?? data.branchId ?? data.wingBattalionId ?? data.unitId;
        this.officeOrderService.getOfficeOrderMembers(id).subscribe({
            next: (rows) => {
                // The editors render once the mode flips on — fill them on the next tick.
                setTimeout(() => {
                    this.membersEditor?.loadSavedRows(rows);
                    this.unitSelect?.selectNode(deepestId);
                });
            },
            error: () => setTimeout(() => this.unitSelect?.selectNode(deepestId))
        });
    }

    private loadSubjectPickList(): void {
        if (this.subjectPickList.length > 0) { this.buildSubjectOptions(); return; }
        this.noteSheetSubjectService.getActiveByType(NoteSheetType.General).subscribe({
            next: (list) => {
                this.subjectPickList = Array.isArray(list) ? list : [];
                this.buildSubjectOptions();
            },
            error: () => { this.subjectPickList = []; this.subjectOptions = []; }
        });
    }

    /** Subject labels follow the order's language. */
    private buildSubjectOptions(): void {
        this.subjectOptions = this.subjectPickList.map((s) => ({
            label: (this.isBangla ? s.subjectBN : s.subjectEN) || s.subjectEN || s.subjectBN || '',
            value: s.id
        }));
    }

    /** Mirror the picked subject's text (current language) into the printed subject. */
    onSubjectPicked(): void {
        const picked = this.subjectPickList.find((s) => s.id === this.noteSheetSubjectId);
        this.subject = picked ? ((this.isBangla ? picked.subjectBN : picked.subjectEN) || picked.subjectEN || picked.subjectBN || '') : '';
    }

    /** Switch between searching the subject master and typing the subject by hand. Going manual
     *  keeps the picked text as a starting point; going back to search clears the typed text. */
    setSubjectManual(manual: boolean): void {
        if (this.subjectManual === manual) return;
        this.subjectManual = manual;
        this.noteSheetSubjectId = null;
        if (!manual) this.subject = '';
    }

    /** Clearance subject → members must be posted-out (checked when adding) and at least one is required. */
    get isClearanceSubject(): boolean {
        return this.subjectPickList.find((s) => s.id === this.noteSheetSubjectId)?.subjectCategory === SubjectCategory.Clearance;
    }

    /** Member type options limited to the user's accessible set (label follows language). */
    get memberTypeOptions(): { label: string; value: number }[] {
        const allowed = this.allowedMemberTypeIds;
        return this.allMemberTypes
            .filter((o) => allowed == null || allowed.includes(o.value))
            .map((o) => ({ label: (this.isBangla ? o.bn : o.en) || o.en || o.bn || String(o.value), value: o.value }));
    }

    /** Language switch (without-notesheet mode): relabel pick lists, serials and the subject. */
    onTextTypeChange(): void {
        this.rebuildConfigOptions();
        this.buildSubjectOptions();
        if (!this.subjectManual && this.noteSheetSubjectId != null) this.onSubjectPicked();
        this.referenceEntries.forEach((e, i) => e.serial = this.getReferenceSerial(i));
        if (!this.editMode) this.loadOnulipiFromConfig();
    }

    /** Order Format checkboxes behave like a clearable radio pair: one or none. */
    toggleOrderFormat(value: OrderFormat): void {
        this.orderFormat = this.orderFormat === value ? null : value;
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

    /** When a notesheet is selected, auto-fill Subject, TextType, body and the
     *  সূত্র (Reference No) list. */
    onNoteSheetChange(): void {
        if (this.isWithoutNoteSheet) {
            this.startWithoutNoteSheet();
            return;
        }
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.subject = '';
        this.referenceEntries = [];
        this.bodyParagraphs = [];
        this.attachmentEntries = [];  // সংযুক্ত has no default — the user adds entries on demand
        if (!this.selectedNoteSheetId) return;

        this.http.get<any>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) return;

                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                this.selectedTextType = (ns.textType === 1 || ns.textType === '1') ? 'bn' : 'en';
                this.subject = ns.subject ?? '';
                // সূত্র — carried over from the note sheet as a starting point; the rows stay
                // fully editable and removable, and serials follow the note sheet's language
                // (selectedTextType is set just above, so getReferenceSerial reads the new one).
                this.referenceEntries = this.parseNoteSheetReferences(ns.referenceNumber ?? ns.ReferenceNumber)
                    .map((text, i) => ({ serial: this.getReferenceSerial(i), text }));
                // Body paragraphs — the note sheet's Main Text blocks, then its Note, then its
                // extra paragraphs, in the same order the office-order preview numbers them.
                // Seeded here only; the rows are editable and removable from this point on.
                this.bodyParagraphs = this.buildParagraphsFromNoteSheet(ns);
                this.postingOrderNumberConfigId = null;
                this.rebuildConfigOptions();
                this.loadOnulipiFromConfig();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load notesheet details.' });
            }
        });
    }

    // ─── Reference No entries ───────────────────────────
    /** Note-sheet ReferenceNumber → plain text lines. Stored as a JSON array of
     *  { text } entries; legacy rows hold a single plain string. */
    private parseNoteSheetReferences(raw: string | null | undefined): string[] {
        if (!raw || !raw.trim()) return [];
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                return arr
                    .map((item: any) => (typeof item === 'string' ? item : (item?.text ?? item?.Text ?? '')))
                    .map((t: string) => (t ?? '').trim())
                    .filter((t: string) => t.length > 0);
            }
            return [];
        } catch {
            return [raw.trim()];
        }
    }

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

    // ─── Body paragraphs ────────────────────
    /** Seed the paragraph list from a note sheet: Main Text blocks, then the Note, then
     *  the extra paragraphs (ParagraphText, a JSON array of HTML strings on current rows,
     *  a single HTML string on legacy ones). */
    private buildParagraphsFromNoteSheet(ns: any): BodyParagraph[] {
        const texts: string[] = parseMainTextBlocks(ns.mainText ?? ns.MainText).map((b: MainTextBlock) => b.text);

        const note = (ns.note ?? ns.Note ?? '').trim();
        if (note) texts.push(note);

        const extra = (ns.paragraphText ?? ns.ParagraphText ?? '').trim();
        if (extra) {
            if (extra.startsWith('[')) {
                try {
                    const arr = JSON.parse(extra);
                    if (Array.isArray(arr)) {
                        texts.push(...arr.map((it: any) => (typeof it === 'string' ? it : String(it?.text ?? it?.Text ?? ''))));
                    }
                } catch { texts.push(extra); }
            } else {
                texts.push(extra);
            }
        }

        return texts.map(t => (t ?? '').trim()).filter(t => t !== '').map(text => ({ text }));
    }

    /** Stored Body → paragraph rows. Current rows hold a JSON array of { text }; orders
     *  saved before this list existed hold one plain HTML blob, which becomes one row. */
    private parseBodyParagraphs(raw: string | null | undefined): BodyParagraph[] {
        const s = (raw ?? '').trim();
        if (!s) return [];
        if (s.startsWith('[')) {
            try {
                const arr = JSON.parse(s);
                if (Array.isArray(arr)) {
                    return arr
                        .map((it: any) => ({ text: typeof it === 'string' ? it : String(it?.text ?? it?.Text ?? '') }))
                        .filter(b => b.text.trim() !== '');
                }
            } catch { /* not JSON — treat as one legacy paragraph */ }
        }
        return [{ text: s }];
    }

    addBodyParagraph(): void {
        this.bodyParagraphs.push({ text: '' });
    }

    removeBodyParagraph(index: number): void {
        this.bodyParagraphs.splice(index, 1);
    }

    moveBodyParagraphUp(index: number): void {
        if (index <= 0) return;
        [this.bodyParagraphs[index - 1], this.bodyParagraphs[index]] =
            [this.bodyParagraphs[index], this.bodyParagraphs[index - 1]];
    }

    moveBodyParagraphDown(index: number): void {
        if (index >= this.bodyParagraphs.length - 1) return;
        [this.bodyParagraphs[index], this.bodyParagraphs[index + 1]] =
            [this.bodyParagraphs[index + 1], this.bodyParagraphs[index]];
    }

    /** Non-empty paragraphs as the stored JSON array, or null when there are none.
     *  Quill leaves an empty editor as "<p><br></p>", which must not count as text. */
    private get bodyJson(): string | null {
        return toOfficeOrderBodyJson(this.bodyParagraphs.map(b => b.text));
    }

    // ─── Attachments (সংযুক্ত) ──────────────
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

    // ─── File References ─────────────────────────────────
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

    // ─── Onulipi paragraphs ────────────────────────────
    private loadOnulipiFromConfig(): void {
        this.masterBasicSetupService.getOnulipiConfigByPostingType(PostingType.General).subscribe({
            next: (configs) => {
                const match = (configs ?? [])[0];
                if (!match) return;
                const json = this.isBangla ? (match.onulipiJsonBN || match.onulipiJsonEN) : match.onulipiJsonEN;
                if (!json) return;
                try {
                    const items: { serial: number; text: string }[] = JSON.parse(json);
                    this.onulipiParagraphs = items
                        .sort((a, b) => a.serial - b.serial)
                        .map(item => ({ text: item.text, transferRabUnitId: null, transferRabUnitName: null }));
                } catch { /* ignore parse errors */ }
            }
        });
    }

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

    trackByIndex(index: number): number {
        return index;
    }

    // ─── Generate ───────────────────────────────────────
    private formatDateToString(value: Date | null): string {
        if (!value) {
            const today = new Date();
            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    /** The order's own note-sheet style inputs — only for an order without a note sheet.
     *  The members-table show/hide is the order's own either way (independent of the note sheet's). */
    private buildOwnFields(): OfficeOrderOwnFields {
        if (!this.isWithoutNoteSheet) return { showMembersTable: this.showMembersTable };
        return {
            noteSheetSubjectId: this.noteSheetSubjectId,
            employeeTypeIds: this.memberTypeIds.join(',') || null,
            showMembersTable: this.showMembersTable,
            orderFormat: this.orderFormat,
            ...(this.unitSelect?.getHierarchyIds() ?? {}),
            // null (editor not rendered) leaves saved members untouched on update
            members: this.membersEditor?.toSaveRows() ?? null
        };
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
        if (this.isWithoutNoteSheet) {
            if (this.subjectManual ? !this.subject?.trim() : !this.noteSheetSubjectId) {
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: this.subjectManual ? 'Please write the subject.' : 'Please select a subject.' });
                return;
            }
            if (this.isClearanceSubject && this.membersData.members.length === 0) {
                this.messageService.add({ severity: 'warn', summary: 'Members required', detail: 'This is a clearance subject — add at least one posted-out member.' });
                return;
            }
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
            const ownFields = this.buildOwnFields();

            const saveObs = this.editMode && this.editId
                ? this.officeOrderService.updateOfficeOrder({
                    ...ownFields,
                    id: this.editId,
                    letterNo: this.manualLetterNo || '',
                    letterDate: this.formatDateToString(this.letterDate),
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyJson,
                    onulipi: onulipiJson,
                    attachments: attachmentsJson,
                    textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
                    filesReferences: filesReferencesJson,
                    remarks: this.remarks || null,
                    updatedBy: this.auditUser,
                    approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
                })
                : this.officeOrderService.createOfficeOrder({
                    ...ownFields,
                    letterNo: '',
                    letterDate: this.formatDateToString(this.letterDate),
                    noteSheetId: this.isWithoutNoteSheet ? null : this.selectedNoteSheetId!,
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyJson,
                    onulipi: onulipiJson,
                    attachments: attachmentsJson,
                    textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
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
                        this.messageService.add({ severity: 'success', summary: 'Success', detail: this.editMode ? 'Office Order updated successfully.' : 'Office Order generated successfully.' });
                        this.router.navigate(['/office-order/preview']);
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
                this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name)
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
