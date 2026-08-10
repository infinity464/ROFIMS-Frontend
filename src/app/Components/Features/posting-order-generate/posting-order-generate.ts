import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { encodeOrderId } from '@/shared/utils/order-id-codec';
import { forkJoin } from 'rxjs';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { EditorModule } from 'primeng/editor';
import { Toast } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { IdentityService } from '@/services/identity.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { buildApprovalPersonOptions } from '@/shared/utils/approval-person-options.util';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApprovedNoteSheetItem, PostingOrderMasterDto, EmployeeRemovalInfo, CancelledInterPostingInfo, ReferenceEntry } from '@/models/posting.model';
import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { NoteSheetType, CodeType, ApprovalStatus, PostingType } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

interface NoteSheetEmployee {
    employeeId: number;
    serviceId: string | null;
    rabID: string | null;
    prefixName: string | null;
    prefixNameBN: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
    rankName: string | null;
    rankNameBN: string | null;
    corpsName: string | null;
    corpsNameBN: string | null;
    tradeName: string | null;
    tradeNameBN: string | null;
    motherUnitName: string | null;
    motherUnitNameBN: string | null;
    permanentDistrictName: string | null;
    permanentDistrictNameBN: string | null;
    spousePermanentDistrictName: string | null;
    spousePermanentDistrictNameBN: string | null;
    motherOrgLocationName: string | null;
    motherOrgLocationNameBN: string | null;
    previousRabUnits: string | null;
    previousRabUnitsBN: string | null;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    transferRabUnitNameBN: string | null;
    remarks: string | null;
    interPostingRemark: string | null;
    sendingRemark: string | null;
    joiningDateInRAB: string | null;
}

/** A footer paragraph linked to a specific transfer (RAB) unit. */
interface FooterParagraph {
    text: string;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
}

@Component({
    selector: 'app-posting-order-generate',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        DatePickerModule, FlexibleDateDirective,
        InputTextModule,
        TextareaModule,
        EditorModule,
        Toast,
        ConfirmDialogModule,
        TagModule,
        TooltipModule,
        DialogModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posting-order-generate.html',
    styleUrl: './posting-order-generate.scss'
})
export class PostingOrderGenerateComponent implements OnInit {
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

    private noteSheetApi = `${environment.apis.core}/NoteSheetInfo`;

    postingTypeOptions = [
        { label: 'New Posting', value: NoteSheetType.NewPosting },
        { label: 'Inter Posting', value: NoteSheetType.InterPosting }
    ];

    /** Fixed by route data — null means show the dropdown selector. */
    fixedPostingType: string | null = null;
    selectedPostingType: string | null = null;
    approvedNoteSheets: ApprovedNoteSheetItem[] = [];
    selectedNoteSheetId: number | null = null;
    employees: NoteSheetEmployee[] = [];
    /** Per-employee extras for the combined remark (same as note-sheet preview). */
    removalHistoryMap: Record<number, EmployeeRemovalInfo> = {};
    cancelledInterMap: Record<number, CancelledInterPostingInfo> = {};
    loadingNoteSheets = false;
    loadingEmployees = false;
    saving = false;

    // ─── Posting Order Number Config dropdown ────────────
    configOptions: { label: string; value: number }[] = [];
    postingOrderNumberConfigId: number | null = null;
    private allConfigs: PostingOrderNumberConfigModel[] = [];
    private memberTypeMap: Record<number, string> = {};

    // Expose enum to template
    readonly ApprovalStatus = ApprovalStatus;

    // ─── Approval Person dropdown ─────────────────────────
    approvalEmployees: { label: string; value: number }[] = [];
    selectedApprovalEmployeeId: number | null = null;
    loadingApprovalEmployees = false;

    // ─── Generated Posting Orders list (toggleable) ──────
    showGeneratedList = false;
    generatedOrders: PostingOrderMasterDto[] = [];
    loadingGeneratedOrders = false;

    // ─── Approval Modal ──────────────────────────────────
    showApprovalModal = false;
    approvalModalOrder: PostingOrderMasterDto | null = null;
    approvalModalAction: ApprovalStatus.Approve | ApprovalStatus.Cancel | null = null;
    approvalModalRemarks = '';
    savingApproval = false;

    /** NoteSheet info displayed above employee table. */
    selectedNoteSheetNo: string | null = null;
    selectedNoteSheetApprovedDate: string | null = null;

    // ─── New form fields ──────────────────────────────────
    postingOrderDate: Date | null = null;
    remarks = '';
    selectedTextType = 'en';
    /** Single plain-text paragraph that appears below the employee table and above the Onulipi section. */
    postingText = '';
    subText = '';
    footerParagraphs: FooterParagraph[] = [];
    /** সূত্র (references). Index 0 is auto-filled from the selected note-sheet (its no +
     *  approval date); further entries are added with "+" and are text-only. Serialized
     *  to PostingOrderMaster.ReferenceNumber as a JSON array on generate. */
    references: ReferenceEntry[] = [];

    /** true = Bangla, false = English */
    get isBangla(): boolean {
        return this.selectedTextType === 'bn';
    }

    /** Convert ASCII digits in a string to Bangla digits. */
    toBanglaDigits(s: string): string {
        return s.replace(/\d/g, d => String.fromCharCode(0x09E6 + Number(d)));
    }

    /** Load removal history + last-cancelled-inter maps for the combined remark. */
    private loadRemarkExtras(emps: NoteSheetEmployee[], isInter: boolean): void {
        const ids = emps.map(e => e.employeeId).filter(Boolean);
        if (!ids.length) return;
        this.postingService.getRemovalHistoryByEmployeeIds(ids).subscribe({
            next: (list) => {
                this.removalHistoryMap = {};
                for (const it of (list ?? [])) {
                    if (it.postingOrderNo || it.draftPostingNo) this.removalHistoryMap[it.employeeId] = it;
                }
            },
            error: () => {}
        });
        this.postingService.getLastCancelledInterPostingByEmployeeIds(ids, isInter ? NoteSheetType.InterPosting : NoteSheetType.NewPosting).subscribe({
            next: (list) => {
                this.cancelledInterMap = {};
                for (const it of (list ?? [])) {
                    if (it.postingOrderNo) this.cancelledInterMap[it.employeeId] = it;
                }
            },
            error: () => {}
        });
    }

    /** Combined remark — same content as the note-sheet preview. */
    getEmployeeRemarks(emp: NoteSheetEmployee): string {
        const isInter = this.selectedPostingType === NoteSheetType.InterPosting;
        const history = this.removalHistoryMap[emp.employeeId];
        const removalRemark = this.isBangla
            ? (history?.removalRemarkBN || history?.removalRemark || '')
            : (history?.removalRemark || '');
        const base = isInter ? emp.interPostingRemark : emp.sendingRemark;
        let cancelNote = '';
        const cancelledNo = this.cancelledInterMap[emp.employeeId]?.postingOrderNo;
        if (cancelledNo) {
            cancelNote = this.isBangla
                ? `${cancelledNo} এর মাধ্যমে জারিকৃত বদলি আদেশ বাতিল করা হলো।`
                : `The transfer order issued vide ${cancelledNo} has been cancelled.`;
        }
        return [base, emp.remarks, removalRemark, cancelNote].filter(s => s?.trim()).join(', ');
    }

    /** RAB ID — Bangla digits when text type is Bangla, else as-is. */
    empRabId(row: NoteSheetEmployee): string {
        const id = row.rabID || '';
        if (!id) return '-';
        return this.isBangla ? this.toBanglaDigits(id) : id;
    }

    constructor(
        private postingService: PostingService,
        private masterBasicSetupService: MasterBasicSetupService,
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService,
        private http: HttpClient,
        private router: Router,
        private route: ActivatedRoute,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;
        this.loadCurrentUserMemberTypePermissions();

        this.postingOrderDate = new Date();
        this.loadApprovalEmployees();

        // Lock posting type from route data if provided — must be set BEFORE loadPostingOrderNumberConfigs
        const routePostingType = this.route.snapshot.data['postingType'] as string | undefined;
        if (routePostingType) {
            this.fixedPostingType = routePostingType;
            this.selectedPostingType = routePostingType;
        }

        this.loadPostingOrderNumberConfigs();

        if (this.fixedPostingType) {
            this.onPostingTypeChange(false, true);
        }
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

    /** When posting type dropdown changes, load approved notesheets of that type
     *  (backend already excludes notesheets with a generated Posting Order). */
    onPostingTypeChange(showEmptyToast = true, skipConfigReload = false): void {
        this.approvedNoteSheets = [];
        this.selectedNoteSheetId = null;
        this.employees = [];
        this.postingOrderNumberConfigId = null;
        if (!skipConfigReload) this.loadPostingOrderNumberConfigs();

        if (!this.selectedPostingType) return;

        this.loadingNoteSheets = true;
        this.postingService.getApprovedNoteSheetsByType(this.selectedPostingType).subscribe({
            next: (notesheets) => {
                this.approvedNoteSheets = notesheets ?? [];
                this.loadingNoteSheets = false;
                if (showEmptyToast && this.approvedNoteSheets.length === 0) {
                    this.messageService.add({ severity: 'info', summary: this.isBangla ? 'তথ্য' : 'Info', detail: this.isBangla ? 'এই ধরনের জন্য কোনো অনুমোদিত নোটশীট পাওয়া যায়নি।' : 'No approved notesheets found for this type.' });
                }
            },
            error: (err) => {
                this.loadingNoteSheets = false;
                this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: err?.error?.message ?? (this.isBangla ? 'নোটশীট লোড ব্যর্থ হয়েছে।' : 'Failed to load notesheets.') });
            }
        });
    }

    loadPostingOrderNumberConfigs(): void {
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
        const postingType = this.fixedPostingType ?? this.selectedPostingType;
        const isBN = this.selectedTextType === 'bn';
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;
        this.configOptions = this.allConfigs
            .filter((c) => (!postingType || c.postingType === postingType) && c.status)
            .map((c) => {
                const prefixLabel = isBN ? (c.prefixBN || c.prefix) : c.prefix;
                const yearReset = c.currentYear !== nowYear || c.currentMonth !== nowMonth;
                const nextNum = yearReset ? c.startNumber : c.currentNumber + 1;
                const yearStr = String(nowYear);
                const monthStr = String(nowMonth).padStart(2, '0');
                const previewNo = c.includeDate
                    ? `${prefixLabel} ${yearStr}/${monthStr}/${nextNum}`
                    : `${prefixLabel} ${nextNum}`;
                const memberLabel = (c.memberTypeIds ?? '').split(',').filter(Boolean)
                    .map(id => this.memberTypeMap[+id]).filter(Boolean).join(', ');
                return { label: memberLabel ? `${previewNo}  ${memberLabel}` : previewNo, value: c.configId };
            });
    }

    /** Dropdown options for notesheet select — scoped to the user's accessible member types. */
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

    /** When a notesheet is selected, load its employees and set textType from notesheet. */
    onNoteSheetChange(): void {
        this.employees = [];
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.references = [];
        if (!this.selectedNoteSheetId) return;

        this.loadingEmployees = true;

        this.http.get<any[]>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) {
                    this.loadingEmployees = false;
                    return;
                }

                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                // Auto first সূত্র = this note-sheet's number + approval date (index 0).
                this.references = [{ referenceNo: ns.noteSheetNo ?? '', date: this.selectedNoteSheetApprovedDate }];
                // Set textType from notesheet (TextType: 1 = Bangla, else English)
                this.selectedTextType = (ns.textType === 1 || ns.textType === '1') ? 'bn' : 'en';
                this.postingOrderNumberConfigId = null;
                this.rebuildConfigOptions();

                const draftPostingMasterId = ns.draftPostingMasterId;
                if (draftPostingMasterId) {
                    const isInterPosting = this.selectedPostingType === NoteSheetType.InterPosting;
                    const empObs = isInterPosting
                        ? this.postingService.getDraftInterPostingEmployees(draftPostingMasterId)
                        : this.postingService.getDraftPostingEmployees(draftPostingMasterId);

                    empObs.subscribe({
                        next: (emps) => {
                            this.employees = (emps ?? []).map(e => ({
                                employeeId: e.employeeId,
                                serviceId: e.serviceId,
                                rabID: e.rabID,
                                prefixName: e.prefixName,
                                prefixNameBN: e.prefixNameBN,
                                fullNameEN: e.fullNameEN,
                                fullNameBN: e.fullNameBN,
                                rankName: e.rankName,
                                rankNameBN: e.rankNameBN,
                                corpsName: e.corpsName,
                                corpsNameBN: e.corpsNameBN,
                                tradeName: e.tradeName,
                                tradeNameBN: e.tradeNameBN,
                                motherUnitName: e.motherUnitName,
                                motherUnitNameBN: e.motherUnitNameBN,
                                permanentDistrictName: e.permanentDistrictName,
                                permanentDistrictNameBN: e.permanentDistrictNameBN,
                                spousePermanentDistrictName: e.spousePermanentDistrictName,
                                spousePermanentDistrictNameBN: e.spousePermanentDistrictNameBN,
                                motherOrgLocationName: e.motherOrgLocationName,
                                motherOrgLocationNameBN: e.motherOrgLocationNameBN,
                                previousRabUnits: e.previousRabUnits ?? null,
                                previousRabUnitsBN: e.previousRabUnitsBN ?? null,
                                transferRabUnitId: e.transferRabUnitId,
                                transferRabUnitName: e.transferRabUnitName,
                                transferRabUnitNameBN: e.transferRabUnitNameBN ?? null,
                                remarks: e.remarks ?? null,
                                interPostingRemark: e.interPostingRemark ?? null,
                                sendingRemark: e.sendingRemark ?? null,
                                joiningDateInRAB: e.joiningDateInRAB
                            }));
                            this.loadingEmployees = false;
                            // Same combined remark as the note-sheet preview (incl. removal +
                            // "previous transfer order cancelled" note).
                            this.loadRemarkExtras(this.employees, isInterPosting);
                            // Pre-fill onulipi from this page's posting-type onulipi-config
                            this.footerParagraphs = [];
                            this.loadOnulipiFromConfig();
                            this.postingText = ns.mainText ?? '';
                            this.remarks = '';
                        },
                        error: (err: any) => {
                            this.loadingEmployees = false;
                            this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: err?.error?.message || (this.isBangla ? 'কর্মচারী লোড ব্যর্থ হয়েছে।' : 'Failed to load employees.') });
                        }
                    });
                } else {
                    this.loadingEmployees = false;
                    this.messageService.add({ severity: 'info', summary: this.isBangla ? 'তথ্য' : 'Info', detail: this.isBangla ? 'এই নোটশীটের সাথে কোনো খসড়া পোস্টিং সংযুক্ত নেই।' : 'No draft posting linked to this notesheet.' });
                }
            },
            error: (err: any) => {
                this.loadingEmployees = false;
                this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: err?.error?.message || (this.isBangla ? 'নোটশীট বিবরণ লোড ব্যর্থ হয়েছে।' : 'Failed to load notesheet details.') });
            }
        });
    }

    /** Remove employee from the list after confirmation. */
    removeEmployee(emp: NoteSheetEmployee): void {
        const name = (this.isBangla ? emp.fullNameBN : emp.fullNameEN) || emp.fullNameEN || emp.serviceId || '';
        this.confirmationService.confirm({
            message: `"${name}" কে তালিকা থেকে সরাতে চান?`,
            header: 'নিশ্চিত করুন',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'হ্যাঁ',
            rejectLabel: 'না',
            accept: () => {
                this.employees = this.employees.filter(e => e.employeeId !== emp.employeeId);
            }
        });
    }

    // ─── Footer paragraphs ────────────────────────────────

    /** Pre-fill onulipi paragraphs from this page's posting-type onulipi-config (language-aware).
     *  Inter Posting → 'InterPosting' config, New Posting → 'NewPosting' config. */
    private loadOnulipiFromConfig(): void {
        const onulipiPostingType = this.fixedPostingType ?? this.selectedPostingType ?? PostingType.NewPosting;
        this.masterBasicSetupService.getOnulipiConfigByPostingType(onulipiPostingType).subscribe({
            next: (configs) => {
                const match = (configs ?? [])[0];
                if (!match) { this.footerParagraphs = []; return; }
                const json = this.isBangla ? (match.onulipiJsonBN || match.onulipiJsonEN) : match.onulipiJsonEN;
                if (!json) { this.footerParagraphs = []; return; }
                try {
                    const items: { serial: number; text: string }[] = JSON.parse(json);
                    this.footerParagraphs = items
                        .sort((a, b) => a.serial - b.serial)
                        .map(item => ({ text: item.text, transferRabUnitId: null, transferRabUnitName: null }));
                } catch { this.footerParagraphs = []; }
            },
            error: () => { this.footerParagraphs = []; }
        });
    }

    /** Add a new (empty) footer paragraph. */
    addFooterParagraph(): void {
        // New অনুলিপি line goes to the TOP (auto-loaded config lines stay below).
        this.footerParagraphs.unshift({ text: '', transferRabUnitId: null, transferRabUnitName: null });
    }

    removeFooterParagraph(index: number): void {
        this.footerParagraphs.splice(index, 1);
    }

    moveFooterUp(index: number): void {
        if (index <= 0) return;
        [this.footerParagraphs[index - 1], this.footerParagraphs[index]] =
            [this.footerParagraphs[index], this.footerParagraphs[index - 1]];
    }

    moveFooterDown(index: number): void {
        if (index >= this.footerParagraphs.length - 1) return;
        [this.footerParagraphs[index], this.footerParagraphs[index + 1]] =
            [this.footerParagraphs[index + 1], this.footerParagraphs[index]];
    }

    /** Add an extra (text-only) সূত্র line. */
    addReference(): void { this.references.push({ referenceNo: '', date: null }); }
    /** Remove a সূত্র line (the auto first one re-populates when a note-sheet is re-selected). */
    removeReference(index: number): void { this.references.splice(index, 1); }

    trackByIndex(index: number): number {
        return index;
    }

    // ─── Generate ─────────────────────────────────────────

    private formatDateToString(value: Date | null): string {
        if (!value) {
            const today = new Date();
            return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }
        const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    onGeneratePostingOrder(): void {
        if (this.saving) return;
        if (!this.selectedPostingType || !this.selectedNoteSheetId || this.employees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: this.isBangla ? 'সতর্কতা' : 'Warning', detail: this.isBangla ? 'পোস্টিং ধরন, নোটশীট নির্বাচন করুন এবং কর্মচারী আছে কিনা নিশ্চিত করুন।' : 'Select posting type, notesheet and ensure employees exist.' });
            return;
        }
        if (!this.postingOrderNumberConfigId) {
            this.messageService.add({ severity: 'warn', summary: this.isBangla ? 'সতর্কতা' : 'Warning', detail: this.isBangla ? 'অর্ডার নম্বর কনফিগ নির্বাচন করুন।' : 'Please select an Order No Config.' });
            return;
        }
        if (!this.selectedApprovalEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: this.isBangla ? 'সতর্কতা' : 'Warning', detail: this.isBangla ? 'অনুমোদনকারী নির্বাচন করুন।' : 'Please select an approval person.' });
            return;
        }

        this.saving = true;

        // Build footerText JSON from non-empty paragraphs (each linked to a transfer unit).
        const nonEmptyParagraphs = this.footerParagraphs
            .filter(p => p.text.trim().length > 0)
            .map(p => ({
                text: p.text.trim(),
                transferRabUnitId: p.transferRabUnitId,
                transferRabUnitName: p.transferRabUnitName
            }));
        const footerText = nonEmptyParagraphs.length > 0 ? JSON.stringify(nonEmptyParagraphs) : null;

        // Single posting-text paragraph stored as plain string.
        const trimmedPostingText = this.postingText.trim();
        const mainText = trimmedPostingText.length > 0 ? trimmedPostingText : null;

        // সূত্র → JSON array; drop blank lines. null when nothing entered.
        const refs = this.references
            .map(r => ({ referenceNo: (r.referenceNo ?? '').trim(), date: r.date }))
            .filter(r => r.referenceNo.length > 0);
        const referenceNumber = refs.length > 0 ? JSON.stringify(refs) : null;

        this.postingService.createPostingOrder({
            postingOrderNo: '',  // auto-generated by backend
            postingOrderDate: this.formatDateToString(this.postingOrderDate),
            postingType: this.selectedPostingType!,
            noteSheetId: this.selectedNoteSheetId,
            referenceNumber: referenceNumber,
            textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
            mainText: mainText,
            subText: this.subText.trim() || null,
            remarks: this.remarks || null,
            footerText: footerText,
            employeeIds: this.employees.map(e => e.employeeId),
            createdBy: this.auditUser,
            postingOrderNumberConfigId: this.postingOrderNumberConfigId ?? null,
            approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
        }).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: this.isBangla ? 'সফল' : 'Success', detail: this.isBangla ? 'পোস্টিং অর্ডার সফলভাবে তৈরি হয়েছে।' : 'Posting Order generated successfully.' });
                    // Reset form
                    this.employees = [];
                    this.selectedNoteSheetId = null;
                    this.selectedNoteSheetNo = null;
                    this.selectedNoteSheetApprovedDate = null;
                    this.references = [];
                    this.remarks = '';
                    this.subText = '';
                    this.footerParagraphs = [];
                    this.postingText = '';
                    this.postingOrderDate = new Date();
                    this.postingOrderNumberConfigId = null;
                    this.selectedApprovalEmployeeId = null;
                    // Refresh the generated list if it's currently visible
                    if (this.showGeneratedList) {
                        this.loadGeneratedOrders();
                    }
                    // Navigate to the preview page for the newly created posting order
                    const newId = (res as any)?.data;
                    if (newId != null) {
                        this.router.navigate(['/posting/posting-order-preview'], { queryParams: { id: encodeOrderId(newId) } });
                    }
                } else {
                    this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: res.description ?? (this.isBangla ? 'পোস্টিং অর্ডার তৈরি ব্যর্থ হয়েছে।' : 'Failed to generate posting order.') });
                }
            },
            error: (err) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: err?.error?.description ?? (this.isBangla ? 'পোস্টিং অর্ডার তৈরি ব্যর্থ হয়েছে।' : 'Failed to generate posting order.') });
            }
        });
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            return `${dd}-${mm}-${d.getFullYear()}`;
        } catch {
            return String(value);
        }
    }

    // ─── Generated Posting Orders list ───────────────────

    /** Toggle the generated posting orders list. Loads on first open. */
    toggleGeneratedList(): void {
        this.showGeneratedList = !this.showGeneratedList;
        if (this.showGeneratedList && this.generatedOrders.length === 0) {
            this.loadGeneratedOrders();
        }
    }

    loadGeneratedOrders(): void {
        this.loadingGeneratedOrders = true;
        this.postingService.getPostingOrderMasters().subscribe({
            next: (data) => {
                const postingType = this.fixedPostingType ?? this.selectedPostingType;
                const byType = postingType ? (data ?? []).filter(o => o.postingType === postingType) : (data ?? []);
                // Scope to the user's accessible member types (via the linked note-sheet's EmployeeTypeIds).
                const filtered = byType.filter(o => this.memberTypeAccess.isAccessible(o.employeeTypeIds, this.allowedMemberTypeIds));
                this.generatedOrders = filtered.slice().sort((a, b) => {
                    const ad = a.createdDate ? new Date(a.createdDate).getTime() : 0;
                    const bd = b.createdDate ? new Date(b.createdDate).getTime() : 0;
                    return bd - ad;
                });
                this.loadingGeneratedOrders = false;
            },
            error: (err: any) => {
                this.loadingGeneratedOrders = false;
                this.messageService.add({ severity: 'error', summary: this.isBangla ? 'ত্রুটি' : 'Error', detail: err?.error?.message || (this.isBangla ? 'তৈরিকৃত পোস্টিং অর্ডার লোড ব্যর্থ হয়েছে।' : 'Failed to load generated posting orders.') });
            }
        });
    }

    viewGeneratedOrder(order: PostingOrderMasterDto): void {
        this.router.navigate(['/posting/posting-order-preview'], { queryParams: { id: encodeOrderId(order.id) } });
    }

    postingTypeLabel(type: string): string {
        switch (type) {
            case 'NewPosting': return 'New Posting';
            case 'InterPosting': return 'Inter Posting';
            default: return type || '-';
        }
    }

    statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        switch ((status ?? '').toLowerCase()) {
            case 'approved':
            case 'published': return 'success';
            case 'draft': return 'warn';
            case 'cancelled': return 'danger';
            default: return 'info';
        }
    }

    approvalStatusSeverity(status: string | null | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        switch (status) {
            case ApprovalStatus.Approve: return 'success';
            case ApprovalStatus.Pending: return 'warn';
            case ApprovalStatus.Cancel: return 'danger';
            default: return 'secondary';
        }
    }

    approvalStatusLabel(status: string | null | undefined): string {
        const bn = this.isBangla;
        switch (status) {
            case ApprovalStatus.Approve: return bn ? 'অনুমোদিত' : 'Approved';
            case ApprovalStatus.Pending: return bn ? 'অপেক্ষমাণ' : 'Pending';
            case ApprovalStatus.Cancel: return bn ? 'বাতিল' : 'Cancelled';
            default: return '-';
        }
    }

    // ─── Approval Modal ──────────────────────────────────

    openApprovalModal(order: PostingOrderMasterDto): void {
        this.approvalModalOrder = order;
        this.approvalModalAction = null;
        this.approvalModalRemarks = '';
        this.showApprovalModal = true;
    }

    selectApprovalAction(action: ApprovalStatus.Approve | ApprovalStatus.Cancel): void {
        this.approvalModalAction = action;
        this.approvalModalRemarks = '';
    }

    saveApproval(): void {
        if (this.savingApproval) return;
        if (!this.approvalModalOrder || !this.approvalModalAction) return;

        this.savingApproval = true;
        const id = this.approvalModalOrder.id;
        const bn = this.isBangla;

        if (this.approvalModalAction === ApprovalStatus.Approve) {
            this.postingService.approvePostingOrder(id, this.approvalModalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: bn ? 'সফল' : 'Success', detail: bn ? 'পোস্টিং অর্ডার অনুমোদিত হয়েছে।' : 'Posting Order approved.' });
                        this.showApprovalModal = false;
                        this.loadGeneratedOrders();
                    } else {
                        this.messageService.add({ severity: 'error', summary: bn ? 'ত্রুটি' : 'Error', detail: res.description ?? (bn ? 'অনুমোদন ব্যর্থ হয়েছে।' : 'Failed to approve.') });
                    }
                },
                error: (err) => {
                    this.savingApproval = false;
                    this.messageService.add({ severity: 'error', summary: bn ? 'ত্রুটি' : 'Error', detail: err?.error?.description ?? (bn ? 'অনুমোদন ব্যর্থ হয়েছে।' : 'Failed to approve.') });
                }
            });
        } else {
            this.postingService.cancelPostingOrder(id, this.approvalModalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: bn ? 'সফল' : 'Success', detail: bn ? 'পোস্টিং অর্ডার বাতিল হয়েছে।' : 'Posting Order cancelled.' });
                        this.showApprovalModal = false;
                        this.loadGeneratedOrders();
                    } else {
                        this.messageService.add({ severity: 'error', summary: bn ? 'ত্রুটি' : 'Error', detail: res.description ?? (bn ? 'বাতিল ব্যর্থ হয়েছে।' : 'Failed to cancel.') });
                    }
                },
                error: (err) => {
                    this.savingApproval = false;
                    this.messageService.add({ severity: 'error', summary: bn ? 'ত্রুটি' : 'Error', detail: err?.error?.description ?? (bn ? 'বাতিল ব্যর্থ হয়েছে।' : 'Failed to cancel.') });
                }
            });
        }
    }
}
