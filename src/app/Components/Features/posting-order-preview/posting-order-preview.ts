import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService, ConfirmationService, TreeNode } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { TreeSelectModule } from 'primeng/treeselect';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TableModule } from 'primeng/table';
import { EditorModule } from 'primeng/editor';
import { PostingService } from '@/services/posting.service';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { EmployeeListService } from '@/services/employee-list.service';
import { PostingOrderEmployeeRow, PostingMemberRemovalHistoryDto } from '@/models/posting.model';
import { EmployeeList } from '@/models/employee-list.model';
import { NoteSheetType, IsSendingNotesheetStatus } from '@/models/enums';
import { HttpClient } from '@angular/common/http';
import { environment } from '@/Core/Environments/environment';
import { firstValueFrom } from 'rxjs';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, TabStopType, TabStopPosition, TableLayoutType, VerticalMergeType
} from 'docx';
import { saveAs } from 'file-saver';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

/** A footer paragraph linked to a specific transfer (RAB) unit. */
interface FooterParagraph {
    text: string;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
}

interface TransferUnitOption {
    id: number;
    name: string;
}

@Component({
    selector: 'app-posting-order-preview',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        Toast,
        ConfirmDialogModule,
        TooltipModule,
        SelectModule,
        TreeSelectModule,
        DatePickerModule, FlexibleDateDirective,
        InputTextModule,
        TextareaModule,
        TableModule,
        EditorModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewPageComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    loading = false;
    error = false;
    exportingPdf = false;
    printingPreview = false;
    employees: PostingOrderEmployeeRow[] = [];
    isBangla = false;

    // Master info extracted from first row
    postingOrderNo = '';
    postingOrderDate = '';
    postingType = '';
    get isInterPosting(): boolean { return this.postingType === NoteSheetType.InterPosting; }
    subject = '';
    mainText = '';
    textType = '';
    filesReferences = '';
    status = '';
    masterRemarks = '';
    noteSheetNo = '';
    referenceNumber = '';
    footerParagraphs: FooterParagraph[] = [];
    postingText = '';
    subText = '';

    /** Per-unit filter: null = "All units" (default), otherwise the transferRabUnitId to show. */
    selectedFilterUnitId: number | null = null;

    // Memoized derivations of `employees` / `footerParagraphs` / `selectedFilterUnitId`.
    // Kept as plain fields (not getters) so template bindings don't allocate per CD tick.
    availableTransferUnits: TransferUnitOption[] = [];
    filteredEmployees: PostingOrderEmployeeRow[] = [];
    filteredFooterParagraphs: FooterParagraph[] = [];

    // Raw master data kept for edit-mode re-parsing.
    private currentOrderId: number | null = null;
    private rawFooterText: string | null = null;

    // ─── Removal history ──────────────────────────────────
    removalHistory: PostingMemberRemovalHistoryDto[] = [];
    removalHistoryLoading = false;
    draftPostingMasterId: number | null = null;

    // ─── Edit mode state ──────────────────────────────────
    editing = false;
    saving = false;
    editPostingOrderDate: Date | null = null;
    editRemarks = '';
    editPostingText = '';
    editSubText = '';
    editFooterParagraphs: FooterParagraph[] = [];
    editEmployees: PostingOrderEmployeeRow[] = [];

    // ─── Add member (inline dropdown) ��────────────────
    addMemberList: EmployeeList[] = [];
    addMemberLoading = false;
    addMemberSaving = false;
    selectedAddEmployee: EmployeeList | null = null;
    selectedAddMemberTransferUnitId: number | null = null;
    addMemberRemarks: string = '';
    addMemberUnitTreeNodes: TreeNode[] = [];
    selectedAddUnitNode: TreeNode | null = null;
    addMemberTreeLoading = false;
    private addMemberUnitNodeMap: Record<number, TreeNode> = {};

    // ─── Remove member ──────────────────────────────────
    removingEmployeeId: number | null = null;

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

    // Final approver info
    approverName = '';
    approverNameBN = '';
    approverRank = '';
    approverRankBN = '';
    approverAppointment = '';
    approverAppointmentBN = '';
    approverPhone = '';
    approverSignatureUrl = '';

    // Body text copied verbatim from the linked NoteSheet's Main Text (HTML stripped)
    noteSheetMainText = '';

    // NoteSheet final-approval date (for the "Reference / সূত্র" line)
    noteSheetApprovalDate: string | null = null;

    // Initiator info
    initiatorName = '';
    initiatorNameBN = '';
    initiatorRank = '';
    initiatorRankBN = '';
    initiatorAppointment = '';
    initiatorAppointmentBN = '';
    initiatorPhone = '';
    initiatorSignatureUrl = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private postingService: PostingService,
        private orgService: OrgService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
        private employeeListService: EmployeeListService,
        private http: HttpClient,
        private messageService: MessageService,
        private confirmationService: ConfirmationService
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            if (id) {
                this.currentOrderId = +id;
                this.loadOrder(+id);
            } else {
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No posting order ID provided.' });
            }
        });
    }

    goBack(): void {
        this.router.navigate(['/posting/posting-order-list']);
    }

    private loadOrder(id: number): void {
        this.loading = true;
        this.postingService.getPostingOrderEmployees(id).subscribe({
            next: (rows) => {
                this.employees = rows ?? [];
                if (this.employees.length > 0) {
                    const first = this.employees[0];
                    this.postingOrderNo = first.postingOrderNo ?? '';
                    this.postingOrderDate = first.postingOrderDate ?? '';
                    this.postingType = first.postingType ?? '';
                    this.subject = first.subject ?? '';
                    this.mainText = first.mainText ?? '';
                    this.textType = first.textType ?? '';
                    this.filesReferences = first.filesReferences ?? '';
                    this.status = first.status ?? '';
                    this.masterRemarks = first.masterRemarks ?? '';
                    this.noteSheetNo = first.noteSheetNo ?? '';
                    this.referenceNumber = first.referenceNumber ?? '';
                    this.isBangla = first.nsTextType === 1 || this.textType === 'bn' || this.textType === '1' || this.textType === 'Bangla';

                    // Posting text (mainText) – plain single-paragraph string.
                    // Legacy records may contain a JSON array; join them into one block.
                    if (first.mainText) {
                        const raw = first.mainText;
                        try {
                            const parsedMain = JSON.parse(raw);
                            if (Array.isArray(parsedMain)) {
                                this.postingText = parsedMain
                                    .map((item: any) =>
                                        typeof item === 'string'
                                            ? item
                                            : (item && typeof item.text === 'string' ? item.text : String(item ?? ''))
                                    )
                                    .filter((s: string) => s.trim().length > 0)
                                    .join('\n\n');
                            } else {
                                this.postingText = String(parsedMain);
                            }
                        } catch {
                            this.postingText = raw;
                        }
                    } else {
                        this.postingText = '';
                    }

                    this.subText = first.subText ?? '';
                    this.rawFooterText = first.footerText ?? null;

                    // Parse footer paragraphs into FooterParagraph objects (keeps unit linkage for per-unit filtering).
                    this.footerParagraphs = this.parseFooterParagraphs(this.rawFooterText);

                    // Reset per-unit filter whenever a new order is loaded, then prime the memoized caches.
                    this.selectedFilterUnitId = null;
                    this.availableTransferUnits = this.computeTransferUnits(this.employees);
                    this.applyFilter();

                    this.draftPostingMasterId = first.draftPostingMasterId ?? null;

                    // Load final approver info from notesheet
                    if (first.noteSheetId) {
                        this.loadApproverInfo(first.noteSheetId);
                    }

                    // Load removal history
                    this.loadRemovalHistory();

                    // Keep edit table in sync when reloading during edit mode (e.g. after add/remove member).
                    if (this.editing) this.editEmployees = [...this.employees];
                } else {
                    // View returned no rows — fall back to PostingOrderById to get master + details.
                    // This populates header fields AND builds a minimal employee list from PostingOrderDetail
                    // so the edit table and preview document are usable even if the SQL view hasn't been refreshed.
                    this.postingService.getPostingOrderById(id).subscribe({
                        next: (master) => {
                            if (master) {
                                this.postingOrderNo   = master.postingOrderNo ?? '';
                                this.postingOrderDate = master.postingOrderDate ?? '';
                                this.postingType      = master.postingType ?? '';
                                this.subject          = master.subject ?? '';
                                this.mainText         = master.mainText ?? '';
                                this.textType         = master.textType ?? '';
                                this.filesReferences  = master.filesReferences ?? '';
                                this.status           = master.status ?? '';
                                this.masterRemarks    = master.remarks ?? '';
                                this.noteSheetNo      = master.noteSheetNo ?? '';
                                this.referenceNumber  = master.referenceNumber ?? '';
                                this.isBangla         = this.textType === 'bn' || this.textType === '1' || this.textType === 'Bangla';
                                this.postingText      = master.mainText ?? '';
                                this.subText          = master.subText ?? '';
                                this.rawFooterText    = master.footerText ?? null;
                                this.footerParagraphs = this.parseFooterParagraphs(this.rawFooterText);

                                // Map PostingOrderDetail rows → minimal PostingOrderEmployeeRow so the
                                // edit table shows existing employees and the preview doc can render.
                                if (master.details?.length) {
                                    this.employees = master.details.map(d => ({
                                        postingOrderMasterId: id,
                                        postingOrderNo:  master.postingOrderNo ?? '',
                                        postingOrderDate: master.postingOrderDate ?? '',
                                        postingType:      master.postingType ?? '',
                                        noteSheetId:      master.noteSheetId,
                                        noteSheetNo:      master.noteSheetNo ?? null,
                                        refPostingOrderMasterId: master.refPostingOrderMasterId ?? null,
                                        referenceNumber:  master.referenceNumber ?? null,
                                        subject:          master.subject ?? null,
                                        mainText:         master.mainText ?? null,
                                        subText:          master.subText ?? null,
                                        textType:         master.textType ?? null,
                                        filesReferences:  master.filesReferences ?? null,
                                        status:           master.status ?? null,
                                        masterRemarks:    master.remarks ?? null,
                                        footerText:       null,
                                        createdBy:        master.createdBy ?? '',
                                        createdDate:      master.createdDate ?? '',
                                        nsTextType:       null,
                                        draftPostingMasterId: null,
                                        postingOrderDetailId: d.id,
                                        employeeId:       d.employeeId,
                                        detailRemarks:    d.remarks ?? null,
                                        noteSheetRemarks: null,
                                        sendingRemark:    null,
                                        transferRabUnitId:   null,
                                        transferRabUnitName: null,
                                        transferRabUnitNameBN: null,
                                        serviceId:        d.serviceId ?? null,
                                        prefixName:       null,
                                        prefixNameBN:     null,
                                        fullNameEN:       d.name ?? null,
                                        fullNameBN:       null,
                                        rabID:            null,
                                        rankName:         d.rank ?? null,
                                        rankNameBN:       null,
                                        corpsName:        d.corps ?? null,
                                        corpsNameBN:      null,
                                        tradeName:        d.trade ?? null,
                                        tradeNameBN:      null,
                                        tradeRemarks:     null,
                                        specialQualifications: null,
                                        specialQualificationsBN: null,
                                        motherUnitName:   d.motherUnit ?? null,
                                        motherUnitNameBN: null,
                                        joiningDateInRAB: d.rabJoingdate ?? null,
                                        rankSortOrder:    null,
                                        motherOrgSortOrder: null,
                                        permanentDistrictName: null,
                                        permanentDistrictNameBN: null,
                                        presentDistrictName: null,
                                        presentDistrictNameBN: null,
                                        spousePresentDistrictName: null,
                                        spousePresentDistrictNameBN: null,
                                        motherOrgLocationName: null,
                                        motherOrgLocationNameBN: null,
                                        previousMotherOrgName: null,
                                        previousMotherOrgNameBN: null,
                                        previousRabUnits: null,
                                        previousRabUnitsBN: null
                                    } as PostingOrderEmployeeRow));

                                    this.availableTransferUnits = this.computeTransferUnits(this.employees);
                                    this.applyFilter();
                                }

                                if (master.noteSheetId) {
                                    this.loadApproverInfo(master.noteSheetId);
                                    this.loadRemovalHistory();
                                }
                            }
                            this.loading = false;
                        },
                        error: () => { this.loading = false; }
                    });
                    return; // loading = false handled in inner subscribe
                }
                this.loading = false;
            },
            error: (err: any) => {
                this.loading = false;
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load posting order.' });
            }
        });
    }

    private loadApproverInfo(noteSheetId: number): void {
        const nsApi = `${environment.apis.core}/NoteSheetInfo`;
        this.http.get<any[]>(`${nsApi}/GetFilteredByKeysAsyn/${noteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                // Copy body text verbatim from the notesheet's Main Text (HTML → plain text)
                this.noteSheetMainText = this.htmlToPlainText(ns?.mainText ?? '');
                // NoteSheet no + final approval date for the Reference / সূত্র line
                if (ns?.noteSheetNo) this.noteSheetNo = ns.noteSheetNo;
                this.noteSheetApprovalDate = ns?.finalApprovalApprovedDate ?? null;
                // Load initiator info
                if (ns?.initiatorId) {
                    this.servingMembersService.getEmployeePersonalServiceOverview(ns.initiatorId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.initiatorName = emp.nameEnglish ?? '';
                                this.initiatorNameBN = emp.nameBN ?? '';
                                this.initiatorRank = emp.armyRank ?? '';
                                this.initiatorRankBN = emp.armyRankBN ?? '';
                                this.initiatorAppointment = emp.appointment ?? '';
                                this.initiatorAppointmentBN = emp.appointmentBN ?? '';
                                this.initiatorPhone = emp.mobileNo ?? '';
                            }
                        }
                    });
                    this.empService.getSignatureBlob(ns.initiatorId).subscribe({
                        next: (blob) => {
                            if (blob && blob.size > 0) {
                                const reader = new FileReader();
                                reader.onloadend = () => { this.initiatorSignatureUrl = reader.result as string; };
                                reader.readAsDataURL(blob);
                            }
                        },
                        error: (err: any) => { /* no signature */ }
                    });
                }

                if (ns?.finalApprovalId) {
                    this.servingMembersService.getEmployeePersonalServiceOverview(ns.finalApprovalId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.approverName = emp.nameEnglish ?? '';
                                this.approverNameBN = emp.nameBN ?? '';
                                this.approverRank = emp.armyRank ?? '';
                                this.approverRankBN = emp.armyRankBN ?? '';
                                this.approverAppointment = emp.appointment ?? '';
                                this.approverAppointmentBN = emp.appointmentBN ?? '';
                                this.approverPhone = emp.mobileNo ?? '';
                            }
                        }
                    });
                    // Load signature image
                    this.empService.getSignatureBlob(ns.finalApprovalId).subscribe({
                        next: (blob) => {
                            if (blob && blob.size > 0) {
                                const reader = new FileReader();
                                reader.onloadend = () => { this.approverSignatureUrl = reader.result as string; };
                                reader.readAsDataURL(blob);
                            }
                        },
                        error: (err: any) => { /* no signature available */ }
                    });
                }
            }
        });
    }

    loadRemovalHistory(): void {
        if (!this.draftPostingMasterId) { this.removalHistory = []; return; }
        this.removalHistoryLoading = true;
        const isInter = this.postingType === NoteSheetType.InterPosting;
        this.postingService.getPostingMemberRemovalHistory(this.draftPostingMasterId, isInter).subscribe({
            next: (list) => { this.removalHistory = list ?? []; this.removalHistoryLoading = false; },
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

    // ─── Body text (verbatim from the linked NoteSheet's Main Text) ──

    get bodyText(): string {
        return this.noteSheetMainText;
    }

    /**
     * Convert the NoteSheet `mainText` HTML to a plain text paragraph,
     * preserving line breaks at `<br>`, `</p>`, `</div>` and heading tags.
     */
    private htmlToPlainText(html: string): string {
        if (!html) return '';
        const withBreaks = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n');
        const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
        return (doc.body.textContent ?? '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // ─── Display helpers ──────────────────────────────────

    get previewDate(): string {
        if (!this.postingOrderDate) return '';
        return this.isBangla
            ? this.formatDateBangla(this.postingOrderDate)
            : this.formatDate(this.postingOrderDate);
    }

    /** NoteSheet number + final approval date, shown after the bold "সূত্রঃ / Reference:" label. */
    get referenceLine(): string {
        const no = (this.noteSheetNo ?? '').trim();
        if (!no) return '';
        const dateStr = this.noteSheetApprovalDate
            ? (this.isBangla ? this.formatDateBangla(this.noteSheetApprovalDate) : this.formatDate(this.noteSheetApprovalDate))
            : '';
        return dateStr ? `${no}, ${dateStr}` : no;
    }

    formatDate(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return String(value); }
    }

    formatDateBangla(value: string | null | undefined): string {
        if (value == null || value === '') return '-';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
            return `${this.toBanglaDigits(String(d.getDate()))} ${months[d.getMonth()]} ${this.toBanglaDigits(String(d.getFullYear()))}`;
        } catch { return String(value); }
    }

    toBanglaDigits(input: string): string {
        return input.replace(/[0-9]/g, d => String.fromCharCode(0x09E6 + parseInt(d)));
    }

    empServiceId(emp: PostingOrderEmployeeRow): string {
        const prefix = this.isBangla ? (emp.prefixNameBN || emp.prefixName) : emp.prefixName;
        let sid = emp.serviceId || '-';
        if (this.isBangla && sid !== '-') sid = this.toBanglaDigits(sid);
        return prefix ? `${prefix}-${sid}` : sid;
    }

    empRank(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.rankNameBN || emp.rankName) : emp.rankName) || '-';
    }

    empTrade(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.tradeNameBN || emp.tradeName) : emp.tradeName) || 'N/A';
    }

    empName(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.fullNameBN || emp.fullNameEN) : emp.fullNameEN) || '-';
    }

    empDistrict(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.presentDistrictNameBN || emp.presentDistrictName) : emp.presentDistrictName) || '';
    }

    empPrevWorkplace(emp: PostingOrderEmployeeRow): string {
        if (this.postingType === NoteSheetType.InterPosting) {
            return (this.isBangla ? (emp.previousRabUnitsBN || emp.previousRabUnits) : emp.previousRabUnits) || '';
        }
        const rabUnit = (this.isBangla ? (emp.motherOrgLocationNameBN || emp.motherOrgLocationName) : emp.motherOrgLocationName) || '';
        const motherOrg = (this.isBangla ? (emp.previousMotherOrgNameBN || emp.previousMotherOrgName) : emp.previousMotherOrgName) || '';
        if (motherOrg && rabUnit) return motherOrg + '\n(' + rabUnit + ')';
        if (motherOrg) return motherOrg;
        if (rabUnit) return rabUnit;
        return '';
    }

    empTransferUnit(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.transferRabUnitNameBN || emp.transferRabUnitName) : emp.transferRabUnitName) || '-';
    }

    empRabId(emp: PostingOrderEmployeeRow): string {
        const id = emp.rabID || '';
        return this.isBangla && id ? this.toBanglaDigits(id) : id;
    }

    // ─── Per-unit filter (preview & export) ──────────────

    /** Shared helper: collect unique transfer (RAB) units from a list of employees. */
    private computeTransferUnits(rows: PostingOrderEmployeeRow[]): TransferUnitOption[] {
        const map = new Map<number, string>();
        for (const e of rows) {
            if (e.transferRabUnitId != null && !map.has(e.transferRabUnitId)) {
                const name = this.isBangla
                    ? (e.transferRabUnitNameBN || e.transferRabUnitName || '')
                    : (e.transferRabUnitName || '');
                map.set(e.transferRabUnitId, name);
            }
        }
        return Array.from(map, ([id, name]) => ({ id, name }));
    }

    get hasMultipleTransferUnits(): boolean {
        return this.availableTransferUnits.length > 1;
    }

    /** Recompute `filteredEmployees` and `filteredFooterParagraphs` from the current filter. */
    private applyFilter(): void {
        if (this.selectedFilterUnitId == null) {
            this.filteredEmployees = this.employees;
            this.filteredFooterParagraphs = this.footerParagraphs;
            return;
        }
        const unitId = this.selectedFilterUnitId;
        this.filteredEmployees = this.employees.filter(e => e.transferRabUnitId === unitId);
        // Paragraphs without a linked unit (`transferRabUnitId` null) are always shown.
        this.filteredFooterParagraphs = this.footerParagraphs.filter(p =>
            p.transferRabUnitId == null || p.transferRabUnitId === unitId
        );
    }

    selectFilterUnit(unitId: number | null): void {
        this.selectedFilterUnitId = unitId;
        this.applyFilter();
    }

    /** Label of the currently selected unit, used in filenames and the chip bar. */
    get selectedFilterUnitName(): string {
        if (this.selectedFilterUnitId == null) return '';
        const match = this.availableTransferUnits.find(u => u.id === this.selectedFilterUnitId);
        return match?.name ?? '';
    }

    /** Slug-ified version of the selected unit name for export filenames. */
    private get exportFileSuffix(): string {
        const name = this.selectedFilterUnitName;
        if (!name) return '';
        // Keep it safe for filenames – strip anything that isn't a letter, digit, dash or underscore.
        return '_' + name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    }

    // ─── Edit mode ────────────────────────────────────────

    get canEdit(): boolean {
        return true;
    }

    /** Unique transfer (RAB) units from currently-loaded edit employees. */
    get editAvailableTransferUnits(): TransferUnitOption[] {
        return this.computeTransferUnits(this.editEmployees);
    }

    get editHasMultipleTransferUnits(): boolean {
        return this.editAvailableTransferUnits.length > 1;
    }

    /** Enter edit mode. Populates edit fields from the currently-loaded order. */
    toggleEdit(): void {
        if (!this.canEdit) return;

        this.editPostingOrderDate = this.postingOrderDate ? new Date(this.postingOrderDate) : null;
        this.editRemarks = this.masterRemarks || '';
        this.editPostingText = this.postingText || '';
        this.editSubText = this.subText || '';
        this.editEmployees = [...this.employees];
        this.selectedAddEmployee = null;
        this.selectedAddMemberTransferUnitId = null;
        this.selectedAddUnitNode = null;

        // Re-parse the raw footerText into full FooterParagraph objects (with unit linkage).
        this.editFooterParagraphs = this.parseFooterParagraphs(this.rawFooterText);

        this.loadAddMemberList();
        this.loadAddMemberUnitTree();
        this.editing = true;
    }

    cancelEdit(): void {
        this.editing = false;
        this.editPostingOrderDate = null;
        this.editRemarks = '';
        this.editPostingText = '';
        this.editSubText = '';
        this.editFooterParagraphs = [];
        this.editEmployees = [];
        this.selectedAddEmployee = null;
        this.selectedAddMemberTransferUnitId = null;
        this.selectedAddUnitNode = null;
        this.addMemberRemarks = '';
        this.addMemberList = [];
    }

    private loadAddMemberUnitTree(): void {
        if (this.addMemberUnitTreeNodes.length > 0) return;
        this.addMemberTreeLoading = true;
        this.orgService.getAll(0).subscribe({
            next: (roots) => {
                this.addMemberUnitNodeMap = {};
                this.addMemberUnitTreeNodes = roots
                    .filter((r: any) => r.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((r: any) => this.toAddMemberTreeNode(r, null));
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
            next: (children: any[]) => {
                node.children = children
                    .filter((c: any) => c.status === 1)
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((c: any) => this.toAddMemberTreeNode(c, node));
                if (node.children.length === 0) node.leaf = true;
                this.addMemberUnitTreeNodes = [...this.addMemberUnitTreeNodes];
            },
            error: () => {}
        });
    }

    onAddMemberNodeSelect(event: any): void {
        this.selectedAddUnitNode = event.node;
        this.selectedAddMemberTransferUnitId = this.addMemberTransferUnitId;
    }

    onAddMemberNodeClear(): void {
        this.selectedAddUnitNode = null;
        this.selectedAddMemberTransferUnitId = null;
    }

    private loadAddMemberList(): void {
        this.addMemberLoading = true;
        const isInter = this.postingType === NoteSheetType.InterPosting;
        const obs = isInter
            ? this.employeeListService.getEmployeesMarkedForInterPosting()
            : this.employeeListService.getEmployeesByIsSendingNotesheetStatus(IsSendingNotesheetStatus.Draft);
        obs.subscribe({
            next: (list) => { this.addMemberList = list ?? []; this.addMemberLoading = false; },
            error: () => { this.addMemberLoading = false; }
        });
    }

    addMemberToList(): void {
        const emp = this.selectedAddEmployee;
        if (!emp || !this.currentOrderId) return;
        const empId = emp.employeeID;
        if (this.addMemberSaving) return;

        this.addMemberSaving = true;
        this.postingService.addPostingOrderEmployee(
            this.currentOrderId,
            empId,
            this.addMemberTransferUnitId,
            'system',
            this.draftPostingMasterId,
            this.postingType || null,
            this.addMemberRemarks || null
        ).subscribe({
            next: (res) => {
                this.addMemberSaving = false;
                if (res.statusCode === 200) {
                    this.selectedAddEmployee = null;
                    this.selectedAddUnitNode = null;
                    this.selectedAddMemberTransferUnitId = null;
                    this.addMemberRemarks = '';
                    this.messageService.add({ severity: 'success', summary: 'Added', detail: `${emp.fullNameEN} added to posting order.` });
                    this.loadOrder(this.currentOrderId!);
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to add employee.' });
                }
            },
            error: (err) => {
                this.addMemberSaving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to add employee.' });
            }
        });
    }

    /** Parse footerText JSON into full FooterParagraph objects for edit mode. */
    private parseFooterParagraphs(raw: string | null): FooterParagraph[] {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((item: any) => {
                    if (typeof item === 'string') {
                        return { text: item, transferRabUnitId: null, transferRabUnitName: null };
                    }
                    return {
                        text: item?.text ?? '',
                        transferRabUnitId: item?.transferRabUnitId ?? null,
                        transferRabUnitName: item?.transferRabUnitName ?? null
                    };
                });
            }
        } catch {
            /* fallthrough */
        }
        return raw.split('\n').filter(l => l.trim()).map(t => ({
            text: t,
            transferRabUnitId: null,
            transferRabUnitName: null
        }));
    }

    addEditFooterParagraph(): void {
        const units = this.editAvailableTransferUnits;
        const onlyUnit = units.length === 1 ? units[0] : null;
        this.editFooterParagraphs.push({
            text: '',
            transferRabUnitId: onlyUnit ? onlyUnit.id : null,
            transferRabUnitName: onlyUnit ? onlyUnit.name : null
        });
    }

    removeEditFooterParagraph(index: number): void {
        this.editFooterParagraphs.splice(index, 1);
    }

    onEditFooterUnitChange(index: number): void {
        const para = this.editFooterParagraphs[index];
        if (!para) return;
        const match = this.editAvailableTransferUnits.find(u => u.id === para.transferRabUnitId);
        para.transferRabUnitName = match ? match.name : null;
    }

    removeEditEmployee(emp: PostingOrderEmployeeRow): void {
        const name = this.empName(emp);
        this.confirmationService.confirm({
            message: `"${name}" কে তালিকা থেকে সরাতে চান?`,
            header: 'নিশ্চিত করুন',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'হ্যাঁ',
            rejectLabel: 'না',
            accept: () => {
                if (!this.currentOrderId || this.removingEmployeeId) return;
                this.removingEmployeeId = emp.employeeId;

                this.postingService.removePostingOrderEmployee(
                    this.currentOrderId,
                    emp.employeeId,
                    'system',
                    this.draftPostingMasterId,
                    this.postingType || null
                ).subscribe({
                    next: (res) => {
                        this.removingEmployeeId = null;
                        if (res.statusCode === 200) {
                            this.messageService.add({ severity: 'success', summary: 'Removed', detail: `${name} removed from posting order.` });
                            this.loadOrder(this.currentOrderId!);
                        } else {
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to remove employee.' });
                        }
                    },
                    error: (err) => {
                        this.removingEmployeeId = null;
                        this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to remove employee.' });
                    }
                });
            }
        });
    }

    trackByIndex(index: number): number {
        return index;
    }

    private formatDateToString(value: Date | null): string {
        if (!value) {
            const t = new Date();
            return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        }
        const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    saveChanges(): void {
        if (this.saving || !this.currentOrderId) return;

        if (this.editEmployees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'At least one employee is required.' });
            return;
        }

        this.saving = true;

        const nonEmptyFooter = this.editFooterParagraphs
            .filter(p => p.text.trim().length > 0)
            .map(p => ({
                text: p.text.trim(),
                transferRabUnitId: p.transferRabUnitId,
                transferRabUnitName: p.transferRabUnitName
            }));
        const footerText = nonEmptyFooter.length > 0 ? JSON.stringify(nonEmptyFooter) : null;

        const trimmedPostingText = this.editPostingText.trim();
        const mainText = trimmedPostingText.length > 0 ? trimmedPostingText : null;
        const trimmedSubText = this.editSubText.trim();
        const subText = trimmedSubText.length > 0 ? trimmedSubText : null;

        const postingOrderDateStr = this.editPostingOrderDate
            ? this.formatDateToString(this.editPostingOrderDate)
            : (this.postingOrderDate || this.formatDateToString(new Date()));

        this.postingService.updatePostingOrder({
            id: this.currentOrderId,
            postingOrderNo: this.postingOrderNo,
            postingOrderDate: postingOrderDateStr,
            postingType: this.postingType,
            referenceNumber: this.referenceNumber || null,
            subject: this.subject || null,
            mainText: mainText,
            subText: subText,
            textType: this.textType || (this.isBangla ? 'bn' : 'en'),
            status: this.status || null,
            remarks: this.editRemarks || null,
            footerText: footerText,
            employeeIds: this.editEmployees.map(e => e.employeeId),
            updatedBy: 'system'
        }).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting order updated successfully.' });
                    this.editing = false;
                    if (this.currentOrderId) this.loadOrder(this.currentOrderId);
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to update.' });
                }
            },
            error: (err) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to update posting order.' });
            }
        });
    }

    // ─── Export Word ──────────────────────────────────────

    async exportWord(): Promise<void> {
        if (this.filteredEmployees.length === 0) return;
        const doc = this.buildWordDocument();
        saveAs(await Packer.toBlob(doc), `PostingOrder_${this.postingOrderNo || 'export'}${this.exportFileSuffix}.docx`);
    }

    // ─── Export PDF (backend Word-to-PDF conversion) ──────

    async exportPdf(): Promise<void> {
        if (this.filteredEmployees.length === 0) return;
        this.exportingPdf = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            saveAs(pdfBlob, `PostingOrder_${this.postingOrderNo || 'export'}${this.exportFileSuffix}.pdf`);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate PDF.' });
        } finally {
            this.exportingPdf = false;
        }
    }

    // ─── Print Preview (backend Word-to-PDF, open in new tab) ──

    async printPreview(): Promise<void> {
        if (this.filteredEmployees.length === 0) return;
        this.printingPreview = true;
        try {
            const doc = this.buildWordDocument();
            const docxBlob = await Packer.toBlob(doc);
            const form = new FormData();
            form.append('file', docxBlob, 'document.docx');
            const pdfBlob = await firstValueFrom(
                this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
            );
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Preview Error', detail: 'Failed to generate print preview.' });
        } finally {
            this.printingPreview = false;
        }
    }

    // ─── Shared Word Document Builder ─────────────────────

    private buildWordDocument(): Document {
        const bn = this.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 20 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Government Header (11pt, bold, centered) ──
        const headerLines = bn
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‌্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা']
            : ['Government of the Peoples Republic of Bangladesh', 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka'];

        const headerParas = headerLines.map(line => new Paragraph({
            children: [new TextRun({ text: line, bold: true, size: 22, sizeComplexScript: bn ? 22 : undefined, font, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 }
        }));

        // ── Title (14pt, bold, underlined, centered) ──
        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'প্রজ্ঞাপন' : 'NOTIFICATION', bold: true, size: 28, sizeComplexScript: bn ? 28 : undefined, font, underline: {}, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });

        // ── Order No & Date (10pt, space-between via tab stop) ──
        const orderLine = new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
                new TextRun({ text: bn ? 'ফোর্স অর্ডার নং: ' : 'Force Order No: ', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.postingOrderNo, size: 20, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: '\t', font }),
                new TextRun({ text: bn ? 'তারিখ: ' : 'Date: ', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.previewDate, size: 20, sizeComplexScript: csSize, font, language: lang })
            ],
            spacing: { after: 80 }
        });

        // ── Reference / সূত্র : linked Note-Sheet No + final approval date ──
        const referenceParas: Paragraph[] = this.referenceLine ? [new Paragraph({
            children: [
                new TextRun({ text: bn ? 'সূত্রঃ ' : 'Reference: ', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.referenceLine, size: 20, sizeComplexScript: csSize, font, language: lang })
            ],
            spacing: { after: 160 }
        })] : [];

        // ── Body Text (10pt, justified) – split on blank lines into paragraphs ──
        const bodyParas = (this.bodyText || '')
            .split(/\n{2,}/)
            .map(block => block.trim())
            .filter(t => t.length > 0)
            .map(block => new Paragraph({
                children: block.split('\n').flatMap((line, idx) => {
                    const run = new TextRun({ text: line, size: 20, sizeComplexScript: csSize, font, language: lang });
                    return idx === 0 ? [run] : [new TextRun({ text: '', break: 1, font }), run];
                }),
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 160 }
            }));

        // ── Employee Table (header 8.5pt, data 9pt) ──
        const cols = bn
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'নিজ জেলা', 'পূর্ববতী কর্মস্থল', 'বদলিকৃত কর্মস্থল', 'র‌্যাব আইডি']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Own District', 'Previous Workplace', 'Transfer Unit', 'RAB ID'];
        // Column widths in DXA – must sum to full content width (page 12240 - margins 567*2 = 11106)
        //         Ser  SvcID  Rank  Trade  Name   OwnDist PrevWk TrUnit RabID
        const colW = [580, 1100, 860, 924, 2474, 1260, 1374, 1374, 1160];

        const hdrPara = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true, size: 17, sizeComplexScript: bn ? 17 : undefined, font, language: lang })], alignment: AlignmentType.CENTER });
        const hdrCell = (text: string, ci: number, extra?: Partial<ConstructorParameters<typeof TableCell>[0]>) => new TableCell({
            children: [hdrPara(text)], borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }, ...extra
        });

        let headerRows: TableRow[];
        if (this.isInterPosting) {
            headerRows = [
                new TableRow({ tableHeader: true, children: [
                    ...cols.slice(0, 6).map((c, ci) => hdrCell(c, ci, { verticalMerge: VerticalMergeType.RESTART })),
                    new TableCell({
                        children: [hdrPara(bn ? 'বদলিকৃত কর্মস্থল' : 'Transfer Station')],
                        columnSpan: 2, borders: cellBorders, width: { size: colW[6] + colW[7], type: WidthType.DXA }
                    }),
                    ...cols.slice(8).map((c, ci) => hdrCell(c, ci + 8, { verticalMerge: VerticalMergeType.RESTART }))
                ]}),
                new TableRow({ tableHeader: true, children: [
                    ...[0,1,2,3,4,5].map(ci => new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA } })),
                    hdrCell(bn ? 'হইতে' : 'From', 6),
                    hdrCell(bn ? 'প্রতি' : 'To', 7),
                    new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: colW[8], type: WidthType.DXA } })
                ]})
            ];
        } else {
            headerRows = [new TableRow({ tableHeader: true, children: cols.map((col, ci) => hdrCell(col, ci)) })];
        }

        const dataRows = this.filteredEmployees.map((emp, i) => new TableRow({
            children: [
                bn ? this.toBanglaDigits(String(i + 1)) : String(i + 1),
                this.empServiceId(emp), this.empRank(emp), this.empTrade(emp), this.empName(emp),
                this.empDistrict(emp), this.empPrevWorkplace(emp), this.empTransferUnit(emp),
                this.empRabId(emp)
            ].map((val, ci) => {
                const lines = val.split('\n');
                const cellParas = lines.map(line => new Paragraph({
                    children: [new TextRun({ text: line, size: 18, sizeComplexScript: bn ? 18 : undefined, font, language: lang })],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 20 }
                }));
                return new TableCell({
                    children: cellParas,
                    borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }
                });
            })
        }));

        const allRows = [...headerRows, ...dataRows];

        const empTable = new Table({
            width: { size: 11106, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            indent: { size: 0, type: WidthType.DXA },
            rows: allRows,
            columnWidths: colW
        });

        // Helper: HTML string → plain paragraphs for Word
        const htmlToParas = (html: string) =>
            this.htmlToPlainText(html).split(/\n{2,}/).map(t => t.trim()).filter(t => t.length > 0)
                .map(t => new Paragraph({
                    children: [new TextRun({ text: t, size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.JUSTIFIED,
                    spacing: { before: 100, after: 100 }
                }));

        // ── Main Text (masterRemarks, after reference), Posting Text, Sub Text ──
        const masterRemarksParas = this.masterRemarks ? htmlToParas(this.masterRemarks) : [];
        const postingTextParas = this.postingText ? htmlToParas(this.postingText) : [];
        const subTextParas     = this.subText ? htmlToParas(this.subText) : [];

        // ── Signature Block (right-aligned block using borderless table) ──
        const approverNameText = (bn ? this.approverNameBN : this.approverName) || this.approverName || '...................................';
        const approverRankText = (bn ? this.approverRankBN : this.approverRank) || this.approverRank || '............................';
        const approverApptText = (bn ? this.approverAppointmentBN : this.approverAppointment) || this.approverAppointment || '............................';
        const approverPhoneText = this.approverPhone || '...............';
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

        const sigCellChildren: Paragraph[] = [];
        sigCellChildren.push(new Paragraph({
            children: [new TextRun({ text: 'স্বাক্ষরিত/-', size: 20, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: 200 }
        }));
        sigCellChildren.push(
            new Paragraph({ children: [new TextRun({ text: approverNameText, size: 20, sizeComplexScript: csSize, font, language: lang })] }),
            new Paragraph({ children: [new TextRun({ text: approverRankText, size: 20, sizeComplexScript: csSize, font, language: lang })] }),
            new Paragraph({ children: [new TextRun({ text: approverApptText, size: 20, sizeComplexScript: csSize, font, language: lang })] }),
            new Paragraph({ children: [new TextRun({ text: `${bn ? 'টেলিঃ' : 'Tel:'} ${approverPhoneText}`, size: 20, sizeComplexScript: csSize, font, language: lang })] }),
            new Paragraph({ children: [new TextRun({ text: bn ? `তারিখঃ ${this.previewDate}` : `Date: ${this.previewDate}`, size: 20, sizeComplexScript: csSize, font, language: lang })], spacing: { before: 100 } })
        );

        const sigTable = new Table({
            alignment: AlignmentType.RIGHT,
            width: { size: 3500, type: WidthType.DXA },
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
            rows: [new TableRow({ children: [new TableCell({ borders: noBorders, width: { size: 3500, type: WidthType.DXA }, children: sigCellChildren })] })]
        });
        const sigParas = [new Paragraph({ spacing: { before: 600 } }), sigTable] as any[];

        // ── Copy Distribution (10pt, bold) ──
        const copyPara = new Paragraph({
            children: [new TextRun({ text: bn ? 'অনুলিপি (জ্যেষ্ঠতার ভিত্তিতে নহে)' : 'Copy (not in order of seniority):', bold: true, size: 20, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: 300 }
        });

        // ── Footer paragraphs (10pt) – only those linked to the selected unit (or all if no filter) ──
        const footerParas = this.filteredFooterParagraphs.map((p, i) => new Paragraph({
            children: [new TextRun({ text: `${bn ? this.toBanglaDigits(String(i + 1)) : (i + 1)}। ${p.text}`, size: 20, sizeComplexScript: csSize, font, language: lang })],
            spacing: { after: 100 }
        }));

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        // A4 portrait: 11906 × 16838 DXA (210mm × 297mm)
                        size: { orientation: PageOrientation.PORTRAIT, width: 11906, height: 16838 },
                        margin: { top: 567, right: 567, bottom: 567, left: 567 },
                    }
                },
                children: [...headerParas, titlePara, orderLine, ...referenceParas, ...masterRemarksParas, ...bodyParas, empTable, ...postingTextParas, ...subTextParas, ...sigParas, copyPara, ...footerParas]
            }]
        });
    }

}
