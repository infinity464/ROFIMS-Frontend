import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
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
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { CheckboxModule } from 'primeng/checkbox';
import { PostingService } from '@/services/posting.service';
import { IdentityService } from '@/services/identity.service';
import { IdentityUserMappingService } from '@/services/identity-user-mapping.service';
import { buildApprovalPersonOptions } from '@/shared/utils/approval-person-options.util';
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { EmployeeListService } from '@/services/employee-list.service';
import { SharedService } from '@/shared/services/shared-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { PostingOrderEmployeeRow, EmployeeRemovalInfo, CancelledInterPostingInfo, ReferenceEntry } from '@/models/posting.model';
import { EmployeeList } from '@/models/employee-list.model';
import { NoteSheetType, IsSendingNotesheetStatus, ApprovalStatus } from '@/models/enums';
import { HttpClient } from '@angular/common/http';
import { JsReportService } from '@/services/jsreport.service';
import { environment } from '@/Core/Environments/environment';
import { firstValueFrom, forkJoin } from 'rxjs';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { CorpsOfficeService } from '@/services/corps-office.service';
import { MotherOrgOfficeHeadService } from '@/Components/basic-setup/mother-org-office-head/mother-org-office-head-service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';
import { decodeOrderId } from '@/shared/utils/order-id-codec';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
    WidthType, BorderStyle, AlignmentType, PageOrientation, TabStopType, TabStopPosition, TableLayoutType, VerticalAlign
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
        EditorModule,
        DialogModule,
        TagModule,
        CheckboxModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posting-order-preview.html',
    styleUrl: './posting-order-preview.scss'
})
export class PostingOrderPreviewPageComponent implements OnInit {
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

    // ── Page size for export ──────────────────────────────────
    pageSizeOptions = [
        { label: 'A4', value: 'a4' },
        { label: 'Legal', value: 'legal' }
    ];
    selectedPageSize: 'a4' | 'legal' = 'a4';

    // ── Whole-order font size ─────────────────────────────────
    /** Point offset applied to every text size of the order — header lines, title,
     *  meta, reference, body, the employee table, the posting/sub texts, note,
     *  footer paragraphs, signature, memo, initiator and অনুলিপি blocks.
     *
     *  Those tiers are deliberately unequal (12 / 10 / 9pt), so no single
     *  absolute size can drive the document; the dropdown offers a shared offset
     *  instead, which moves them together and keeps the proportions. 0 is the
     *  order's normal sizing.
     *
     *  Applied as the --ns-fs-delta custom property on the component host — see
     *  applyFontDelta(), the fs() function in the component SCSS, and the
     *  .pdf-flow restatement in buildJsReportPdf(). */
    fontDelta = 0;
    /** +2.00 … 0 … -2.00 pt in 0.25 steps, largest first (like the page-size list). */
    readonly fontDeltaOptions = Array.from({ length: 17 }, (_, i) => {
        const value = +(2 - i * 0.25).toFixed(2);
        return { label: this.fontDeltaLabel(value), value };
    });

    /** e.g. "Font: -0.25 pt" — the sign is the point of the label, so it is always
     *  shown; the 0 step is named rather than numbered since it is the document's
     *  own sizing. */
    private fontDeltaLabel(value: number): string {
        if (value === 0) return 'Default Font Size';
        return `Font: ${value > 0 ? '+' : '-'}${Math.abs(value).toFixed(2)} pt`;
    }

    /** Font-size dropdown changed. The offset goes on the host element, which every
     *  font size in the paper is expressed against; the PDF restates it on
     *  .pdf-flow because the snapshot is the paper's innerHTML, not the host.
     *  Unitless — the SCSS multiplies it by 1pt, which keeps a negative offset a
     *  plain multiplication instead of a signed operand inside calc(). */
    onFontDeltaChange(): void {
        this.hostEl.nativeElement.style.setProperty('--ns-fs-delta', `${this.fontDelta}`);
    }

    // ── অনুলিপি paragraph checkboxes ────────────────────────
    showOnulipiFilter = false;
    paragraphChecked: boolean[] = [];

    // ── পূর্ববতী কর্মস্থল unit visibility ───────────────────
    showPrevWorkplaceFilter = false;
    showPrevWorkplaceUnit = true;
    showTransferUnitsCopy = true;
    // অনুলিপি line listing the distinct Corps Offices of the employees' corps.
    showCorpsOfficeCopy = true;
    // অনুলিপি lines from Mother Org Office Head setup, matched by the employees' units.
    showMotherOrgOfficeHeadCopy = true;

    // ── Column visibility ───────────────────
    /** Show/hide the whole Trade column (new-posting only) across preview / Word / PDF / print. */
    showTradeColumn = true;
    showOwnDistrict = true;
    showRemarks = true;
    showUpperSignature = true;
    // Name-suffix toggles (on by default) — Gallantry / Professional Qual. / Corps
    showGallantryAwards = true;
    showProfQualification = true;
    showCorps = true;

    private syncParagraphChecked(): void {
        const paras = this.filteredFooterParagraphs;
        if (this.paragraphChecked.length !== paras.length) {
            this.paragraphChecked = paras.map((_, i) => this.paragraphChecked[i] ?? true);
        }
    }

    get exportFooterParagraphs(): FooterParagraph[] {
        this.syncParagraphChecked();
        return this.filteredFooterParagraphs.filter((_, i) => this.paragraphChecked[i] !== false);
    }

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

    draftPostingMasterId: number | null = null;

    // ─── Edit mode state ──────────────────────────────────
    editing = false;
    saving = false;
    editPostingOrderDate: Date | null = null;
    editRemarks = '';
    editPostingText = '';
    editSubText = '';
    editFooterParagraphs: FooterParagraph[] = [];
    editReferences: ReferenceEntry[] = [];
    editEmployees: PostingOrderEmployeeRow[] = [];

    // ─── Add member (inline dropdown) ��────────────────
    addMemberList: EmployeeList[] = [];
    /** Member type ids the logged-in user may access (null = unresolved / no restriction). */
    allowedMemberTypeIds: number[] | null = null;
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

    // ─── Removal history (shows previous posting order no in remarks) ──
    removalHistoryMap: Record<number, EmployeeRemovalInfo> = {};
    /** Last cancelled inter posting per employee — drives the "previous transfer order cancelled" note. */
    cancelledInterMap: Record<number, CancelledInterPostingInfo> = {};

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

    // Expose enum to template
    readonly ApprovalStatus = ApprovalStatus;

    // ─── Posting Order Approval ──────────────────────────
    approvalEmployeeId: number | null = null;
    approvalEmployeeName: string | null = null;
    approvalStatus: string | null = null;
    approvalNote: string | null = null;
    cancelReason: string | null = null;
    approvalDate: string | null = null;
    // Approval person full details (for bottom Onulipi signature)
    approvalPersonName = '';
    approvalPersonNameBN = '';
    approvalPersonRank = '';
    approvalPersonRankBN = '';
    approvalPersonAppointment = '';
    approvalPersonAppointmentBN = '';
    approvalPersonSignatureUrl = '';
    // Edit-mode approval person
    editApprovalEmployeeId: number | null = null;
    approvalEmployees: { value: number; label: string }[] = [];
    loadingApprovalEmployees = false;
    // Approval modal state
    showApprovalModal = false;
    approvalModalAction: ApprovalStatus.Approve | ApprovalStatus.Cancel | null = null;
    approvalModalRemarks = '';
    savingApproval = false;

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

    @ViewChild('legalPaper') legalPaper!: ElementRef<HTMLDivElement>;

    constructor(
        /** Host element — carries the --ns-fs-delta font-size offset for the paper. */
        private hostEl: ElementRef<HTMLElement>,
        private route: ActivatedRoute,
        private router: Router,
        private postingService: PostingService,
        private orgService: OrgService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
        private employeeListService: EmployeeListService,
        private http: HttpClient,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private jsreportService: JsReportService,
        private masterBasicSetupService: MasterBasicSetupService,
        private corpsOfficeService: CorpsOfficeService,
        private motherOrgOfficeHeadService: MotherOrgOfficeHeadService,
        private organizationService: OrganizationService,
        private sharedService: SharedService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService
    ) {}

    /** Logged-in user for createdBy / updatedBy. Falls back to 'system' only when nobody is signed in. */
    private get auditUser(): string {
        return this.sharedService.getCurrentUser() ?? 'system';
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

    /** True if an employee's member type is within the user's accessible set (no restriction when unresolved). */
    private isAccessibleMemberType(id: number | null | undefined): boolean {
        if (this.allowedMemberTypeIds == null) return true;
        if (id == null) return false;
        return this.allowedMemberTypeIds.includes(id);
    }

    ngOnInit(): void {
        this.loadCurrentUserMemberTypePermissions();
        this.loadUnitSortOrders();
        this.loadCorpsOfficeMap();
        this.loadMotherOrgOfficeHeadMap();
        this.route.queryParams.subscribe(params => {
            // The URL carries an obfuscated token (see order-id-codec); decode to the
            // real id. Plain numeric ids still resolve for backward-compat.
            const id = decodeOrderId(params['id']);
            if (id) {
                this.currentOrderId = id;
                this.loadOrder(id);
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
                    this.masterRemarks = this.fixBanglaWordBreaks(first.masterRemarks ?? '');
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
                    this.postingText = this.fixBanglaWordBreaks(this.postingText);

                    this.subText = this.fixBanglaWordBreaks(first.subText ?? '');
                    this.rawFooterText = first.footerText ?? null;

                    // Parse footer paragraphs into FooterParagraph objects (keeps unit linkage for per-unit filtering).
                    this.footerParagraphs = this.parseFooterParagraphs(this.rawFooterText);

                    // Reset per-unit filter whenever a new order is loaded, then prime the memoized caches.
                    this.selectedFilterUnitId = null;
                    this.copyOrder = null;   // ephemeral অনুলিপি reorder — starts fresh per order
                    this.availableTransferUnits = this.computeTransferUnits(this.employees);
                    this.applyFilter();

                    this.draftPostingMasterId = first.draftPostingMasterId ?? null;

                    // Load removal history + last-cancelled-inter for মন্তব্য column
                    this.loadRemovalHistory(this.employees);
                    this.loadCancelledInterPosting(this.employees);

                    // Approval fields from the view
                    this.approvalEmployeeId = first.approvalEmployeeId ?? null;
                    this.approvalStatus = first.approvalStatus ?? null;
                    this.approvalNote = first.approvalNote ?? null;
                    this.cancelReason = first.cancelReason ?? null;
                    this.approvalDate = first.approvalDate ?? null;
                    this.loadApprovalPerson(this.approvalEmployeeId);

                    // Load final approver info from notesheet
                    if (first.noteSheetId) {
                        this.loadApproverInfo(first.noteSheetId);
                    }

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
                                this.masterRemarks    = this.fixBanglaWordBreaks(master.remarks ?? '');
                                this.noteSheetNo      = master.noteSheetNo ?? '';
                                this.referenceNumber  = master.referenceNumber ?? '';
                                this.isBangla         = this.textType === 'bn' || this.textType === '1' || this.textType === 'Bangla';
                                this.postingText      = this.fixBanglaWordBreaks(master.mainText ?? '');
                                this.subText          = this.fixBanglaWordBreaks(master.subText ?? '');
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
                                        approvalEmployeeId: master.approvalEmployeeId ?? null,
                                        approvalStatus:   master.approvalStatus ?? null,
                                        approvalNote:     master.approvalNote ?? null,
                                        cancelReason:     master.cancelReason ?? null,
                                        approvalDate:     master.approvalDate ?? null,
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
                                        motherUnitName:   d.motherUnit ?? null,
                                        motherUnitNameBN: null,
                                        joiningDateInRAB: d.rabJoingdate ?? null,
                                        rankSortOrder:    null,
                                        motherOrgSortOrder: null,
                                        permanentDistrictName: null,
                                        permanentDistrictNameBN: null
                                    } as PostingOrderEmployeeRow));

                                    this.availableTransferUnits = this.computeTransferUnits(this.employees);
                                    this.applyFilter();
                                }

                                // Set approval fields from master DTO (fallback path)
                                this.approvalEmployeeId = master.approvalEmployeeId ?? null;
                                this.approvalEmployeeName = master.approvalEmployeeName ?? null;
                                this.approvalStatus = master.approvalStatus ?? null;
                                this.approvalNote = master.approvalNote ?? null;
                                this.cancelReason = master.cancelReason ?? null;
                                this.approvalDate = master.approvalDate ?? null;
                                this.loadApprovalPerson(this.approvalEmployeeId);

                                if (master.noteSheetId) {
                                    this.loadApproverInfo(master.noteSheetId);
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

    private loadApprovalPerson(employeeId: number | null): void {
        if (!employeeId) return;
        this.servingMembersService.getEmployeeBriefProfile(employeeId).subscribe({
            next: (emp) => {
                if (emp) {
                    this.approvalPersonName = emp.nameEN ?? '';
                    this.approvalPersonNameBN = emp.nameBN ?? '';
                    this.approvalPersonRank = emp.rankEN ?? '';
                    this.approvalPersonRankBN = emp.rankBN ?? '';
                    this.approvalPersonAppointment = emp.appointmentEN ?? '';
                    this.approvalPersonAppointmentBN = emp.appointmentBN ?? '';
                }
            }
        });
        this.empService.getSignatureBlob(employeeId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => { this.approvalPersonSignatureUrl = reader.result as string; };
                    reader.readAsDataURL(blob);
                }
            },
            error: () => {}
        });
    }

    approvalStatusLabel(status: string | null | undefined): string {
        const bn = this.isBangla;
        switch (status) {
            case ApprovalStatus.Approve: return 'Approved';
            case ApprovalStatus.Cancel: return 'Cancelled';
            case ApprovalStatus.Pending:
            default: return 'Pending';
        }
    }

    approvalStatusSeverity(status: string | null | undefined): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        switch (status) {
            case ApprovalStatus.Approve: return 'success';
            case ApprovalStatus.Cancel: return 'danger';
            case ApprovalStatus.Pending:
            default: return 'warn';
        }
    }

    openApprovalModal(): void {
        this.approvalModalAction = null;
        this.approvalModalRemarks = '';
        this.showApprovalModal = true;
    }

    selectApprovalAction(action: ApprovalStatus.Approve | ApprovalStatus.Cancel): void {
        this.approvalModalAction = action;
        this.approvalModalRemarks = '';
    }

    async saveApproval(): Promise<void> {
        if (!this.currentOrderId || !this.approvalModalAction) return;

        this.savingApproval = true;
        const id = this.currentOrderId;
        const bn = this.isBangla;

        // If in edit mode, save edits first before approving/cancelling
        if (this.editing) {
            if (this.editEmployees.length === 0) {
                this.savingApproval = false;
                this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'At least one employee is required.' });
                return;
            }
            try {
                const saveRes = await firstValueFrom(this.postingService.updatePostingOrder(this.buildSavePayload()));
                if (saveRes.statusCode !== 200) {
                    this.savingApproval = false;
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: saveRes.description ?? 'Failed to save changes.' });
                    return;
                }
            } catch (err: any) {
                this.savingApproval = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to save changes.' });
                return;
            }
        }

        if (this.approvalModalAction === ApprovalStatus.Approve) {
            this.postingService.approvePostingOrder(id, this.approvalModalRemarks, 'system').subscribe({
                next: (res) => {
                    this.savingApproval = false;
                    if (res.statusCode === 200) {
                        this.messageService.add({ severity: 'success', summary: bn ? 'সফল' : 'Success', detail: bn ? 'পোস্টিং অর্ডার অনুমোদিত হয়েছে।' : 'Posting Order approved.' });
                        this.showApprovalModal = false;
                        this.editing = false;
                        this.loadOrder(id);
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
                        this.editing = false;
                        this.loadOrder(id);
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
                    this.servingMembersService.getEmployeeBriefProfile(ns.initiatorId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.initiatorName = emp.nameEN ?? '';
                                this.initiatorNameBN = emp.nameBN ?? '';
                                this.initiatorRank = emp.rankEN ?? '';
                                this.initiatorRankBN = emp.rankBN ?? '';
                                this.initiatorAppointment = emp.appointmentEN ?? '';
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
                    this.servingMembersService.getEmployeeBriefProfile(ns.finalApprovalId).subscribe({
                        next: (emp) => {
                            if (emp) {
                                this.approverName = emp.nameEN ?? '';
                                this.approverNameBN = emp.nameBN ?? '';
                                this.approverRank = emp.rankEN ?? '';
                                this.approverRankBN = emp.rankBN ?? '';
                                this.approverAppointment = emp.appointmentEN ?? '';
                                this.approverAppointmentBN = emp.appointmentBN ?? '';
                                this.approverPhone = emp.mobileNoOfficial ?? '';
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

    /** Replace &nbsp; / \u00A0 with regular spaces so Bangla text wraps at word boundaries. */
    private fixBanglaWordBreaks(html: string): string {
        if (!html) return html;
        html = html.replace(/&nbsp;/gi, ' ');
        html = html.replace(/&#160;/gi, ' ');
        html = html.replace(/&#xa0;/gi, ' ');
        html = html.replace(/&#x00a0;/gi, ' ');
        const div = document.createElement('div');
        div.innerHTML = html;
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            if (node.textContent) {
                node.textContent = node.textContent
                    .replace(/\u00A0/g, ' ')
                    .replace(/\u200B/g, '');
            }
        }
        return div.innerHTML;
    }

    // ─── Display helpers ──────────────────────────────────

    get previewDate(): string {
        if (!this.postingOrderDate) return '';
        return this.isBangla
            ? this.formatDateBangla(this.postingOrderDate)
            : this.formatDate(this.postingOrderDate);
    }

    get noteSheetPrefix(): string {
        const no = (this.noteSheetNo ?? '').trim();
        if (!no) return '';
        const lastSlash = no.lastIndexOf('/');
        return lastSlash > 0 ? no.substring(0, lastSlash) : no;
    }

    /** Parsed সূত্র entries. New orders store a JSON array in referenceNumber; a legacy
     *  order holds a plain string (→ one entry, no date), and an order with no reference
     *  falls back to the linked note-sheet's no + approval date (pre-feature behaviour). */
    get referenceEntries(): ReferenceEntry[] {
        const raw = (this.referenceNumber ?? '').trim();
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const entries = parsed
                        .map((e: any) => ({
                            referenceNo: (typeof e === 'string' ? e : (e?.referenceNo ?? '')) as string,
                            date: (typeof e === 'string' ? null : (e?.date ?? null)) as string | null
                        }))
                        .filter(e => (e.referenceNo ?? '').trim().length > 0);
                    if (entries.length) return entries;
                }
            } catch { /* not JSON — treat as a legacy plain string below */ }
            return [{ referenceNo: raw, date: null }];
        }
        const no = (this.noteSheetNo ?? '').trim();
        return no ? [{ referenceNo: no, date: this.noteSheetApprovalDate }] : [];
    }

    get hasMultipleReferences(): boolean { return this.referenceEntries.length > 1; }

    /** One সূত্র line as "<no>, তারিখঃ <date>" (date omitted when absent). */
    referenceEntryText(entry: ReferenceEntry): string {
        const no = (entry.referenceNo ?? '').trim();
        if (!no) return '';
        const dateStr = entry.date
            ? (this.isBangla ? this.formatDateBangla(entry.date) : this.formatDate(entry.date))
            : '';
        if (!dateStr) return no;
        const dateLabel = this.isBangla ? 'তারিখঃ' : 'Date:';
        return `${no}, ${dateLabel} ${dateStr}`;
    }

    /** The single-line সূত্র (first entry) — used for the one-reference layout and Word. */
    get referenceLine(): string {
        const first = this.referenceEntries[0];
        return first ? this.referenceEntryText(first) : '';
    }

    /** Serialize an edit list of references to the JSON stored in ReferenceNumber
     *  (blank lines dropped; null when empty). */
    private serializeReferences(list: ReferenceEntry[]): string | null {
        const refs = list
            .map(r => ({ referenceNo: (r.referenceNo ?? '').trim(), date: r.date }))
            .filter(r => r.referenceNo.length > 0);
        return refs.length > 0 ? JSON.stringify(refs) : null;
    }

    /** Add a text-only সূত্র line in edit mode. */
    addEditReference(): void { this.editReferences.push({ referenceNo: '', date: null }); }
    /** Remove a সূত্র line in edit mode. */
    removeEditReference(index: number): void { this.editReferences.splice(index, 1); }

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

    /** Approver's Tel value for the signature block — Bangla digits in the Bangla
     *  document, so it matches the তারিখ line right below it. Falls back to the
     *  dotted placeholder when no number is on file. */
    get approverPhoneText(): string {
        if (!this.approverPhone) return '...............';
        return this.isBangla ? this.toBanglaDigits(this.approverPhone) : this.approverPhone;
    }

    empServiceId(emp: PostingOrderEmployeeRow): string {
        const prefix = this.isBangla ? (emp.prefixNameBN || emp.prefixName) : emp.prefixName;
        let sid = emp.serviceId || '-';
        if (this.isBangla && sid !== '-') sid = this.toBanglaDigits(sid);
        if (!prefix) return sid;
        const full = `${prefix}-${sid}`;
        // Long IDs: put the prefix (with dash) on its own line, number on the next.
        return full.length > 10 ? `${prefix}-\n${sid}` : full;
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

    /** ", decoration, professional qualification, corps" suffix appended after the name —
     *  same sequence the member profile shows. "N/A"/"অপ্রযোজ্য"/empty values are skipped. */
    empNameQuals(emp: PostingOrderEmployeeRow): string {
        const bn = this.isBangla;
        const pick = (en?: string | null, bnv?: string | null): string => (bn ? (bnv || en || '') : (en || '')).trim();
        const na = (v: string): boolean => {
            const t = v.trim().toLowerCase();
            return t === '' || t === 'n/a' || t === 'na' || t === 'অপ্রযোজ্য' || t === '(অপ্রযোজ্য)';
        };
        const parts = [
            this.showGallantryAwards ? pick(emp.gallantryAwardsDecoration, emp.gallantryAwardsDecorationBN) : '',
            this.showProfQualification ? pick(emp.professionalQualification, emp.professionalQualificationBN) : '',
            this.showCorps ? pick(emp.corpsName, emp.corpsNameBN) : '',
        ].filter(v => !na(v));
        return parts.length ? ', ' + parts.join(', ') : '';
    }

    empDistrict(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.permanentDistrictNameBN || emp.permanentDistrictName) : emp.permanentDistrictName) || '';
    }

    empPrevWorkplace(emp: PostingOrderEmployeeRow): string {
        const bn = this.isBangla;
        const unit = (bn ? (emp.motherUnitNameBN || emp.motherUnitName) : emp.motherUnitName) || '';
        // Mother unit's district (EmployeeInfo.LastMotherUnitDistrictId) after a
        // comma: "বানৌজা হাজী মহসীন, চট্টগ্রাম" — matches the posting notesheet.
        const district = (bn ? (emp.motherUnitDistrictNameBN || emp.motherUnitDistrictName) : emp.motherUnitDistrictName) || '';
        const motherUnit = unit && district ? unit + ', ' + district : (unit || district);
        if (!this.isInterPosting) return motherUnit;
        // Inter-posting: mother unit + only the DEEPEST node of the present RAB
        // hierarchy, not every level of it (matches the notesheet's
        // getInterPrevWorkplace) — "৮ ফিল্ড রেজিঃ আর্টিঃ যশোর/ ইন্ট উইং", not
        // "…/ র‌্যাব সদর দপ্তর/ ইন্ট উইং". Outermost-first, so the last filled level is
        // the one the member actually sits at.
        const rabLevels = [
            bn ? (emp.presentRabUnitNameBN || emp.presentRabUnitName || '') : (emp.presentRabUnitName || ''),
            bn ? (emp.presentRabWingNameBN || emp.presentRabWingName || '') : (emp.presentRabWingName || ''),
            bn ? (emp.presentRabBranchNameBN || emp.presentRabBranchName || '') : (emp.presentRabBranchName || ''),
            bn ? (emp.presentRabSubBranchNameBN || emp.presentRabSubBranchName || '') : (emp.presentRabSubBranchName || ''),
            bn ? (emp.presentRabSectionNameBN || emp.presentRabSectionName || '') : (emp.presentRabSectionName || ''),
            bn ? (emp.presentRabSubSectionNameBN || emp.presentRabSubSectionName || '') : (emp.presentRabSubSectionName || ''),
        ].filter(p => p);

        return [motherUnit, rabLevels[rabLevels.length - 1] ?? ''].filter(p => p).join('/ ');
    }

    empTransferUnit(emp: PostingOrderEmployeeRow): string {
        const full = (this.isBangla ? (emp.transferRabUnitNameBN || emp.transferRabUnitName) : emp.transferRabUnitName) || '';
        if (!full) return '-';
        const parts = full.split(',');
        return parts[parts.length - 1].trim();
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

    /** Strip zero-width joiners/spaces so Bangla unit names match reliably. */
    private stripZeroWidth(s: string): string {
        return (s || '').replace(/[​‌‍﻿]/g, '').trim();
    }

    /**
     * Name-heuristic fallback for HQ detection, used only when the view's TransferIsHq
     * flag is unavailable (e.g. before the updated view is deployed).
     */
    private isRabHq(name: string): boolean {
        const n = this.stripZeroWidth(name);
        return n.includes('সদর দপ্তর') || /head\s*quarter/i.test(n) || /\bHQ\b/i.test(n);
    }

    /** True if the top-level unit segment is a RAB battalion (র‍্যাব-১ … / RAB-1 …). */
    private isRabBattalion(name: string): boolean {
        const n = this.stripZeroWidth(name);
        return /যাব\s*[-–—]\s*[০-৯0-9]/.test(n) || /^RAB\s*[-–—]\s*\d+/i.test(n);
    }

    /**
     * Hard-coded special case: RAB Forces Training School (র‍্যাব ফোর্সেস ট্রেনিং স্কুল).
     * It must NOT sit under the পরিচালক wing group — it gets its own অনুলিপি line
     * prefixed "কমান্ড্যান্ট, " (its head is a Commandant, not a Director).
     */
    private isRabTrainingSchool(name: string): boolean {
        const n = this.stripZeroWidth(name);
        return n.includes('ফোর্সেস ট্রেনিং স্কুল') || /forces\s+training\s+school/i.test(n);
    }

    /**
     * Auto-generated অনুলিপি (copy-to) lines derived from the employees' RAB units.
     * For NEW posting this is the transfer destination only; for INTER posting the
     * member's PRESENT (from) unit is included as well, so both the previous and the
     * transferred unit land in the copy list. Hard-coded RAB rules:
     *   • র‍্যাব সদর দপ্তর (HQ) → show the WING name (segment under HQ), not "সদর দপ্তর",
     *     prefixed "পরিচালক, " — this line comes FIRST.
     *   • র‍্যাব-N battalions → prefixed "অধিনায়ক, ", units slash-joined — comes next.
     *   • Any other unit → shown plainly (top-level name), comma-joined.
     * From- and to-units feed the SAME groups, so they are merged and de-duplicated;
     * empty groups are omitted.
     */
    get autoCopyLines(): string[] {
        const bn = this.isBangla;
        const hqWings: string[] = [];
        const hqSeen = new Set<string>();
        const rabUnits: string[] = [];
        const rabSeen = new Set<string>();
        const commandant: string[] = [];       // RAB Forces Training School — its own কমান্ড্যান্ট line
        const commandantSeen = new Set<string>();
        const others: string[] = [];
        const otherSeen = new Set<string>();

        // Sort one unit hierarchy (outermost-first parts) into the copy buckets:
        // HQ → পরিচালক of the wing (segment under HQ); র‍্যাব-N battalion → অধিনায়ক of
        // the unit; anything else → plain. Each bucket is de-duplicated, so the same
        // unit reached from both the from- and to-side collapses to one entry.
        const classify = (parts: string[], isHq: boolean): void => {
            if (!parts.length) return;
            const top = parts[0];
            if (isHq) {
                const wing = parts[1] || top; // segment directly under HQ
                // Hard-coded: RAB Forces Training School is its own কমান্ড্যান্ট line, not a পরিচালক wing.
                if (this.isRabTrainingSchool(wing)) {
                    if (!commandantSeen.has(wing)) { commandantSeen.add(wing); commandant.push(wing); }
                } else if (!hqSeen.has(wing)) { hqSeen.add(wing); hqWings.push(wing); }
            } else if (this.isRabBattalion(top)) {
                if (!rabSeen.has(top)) { rabSeen.add(top); rabUnits.push(top); }
            } else if (this.isRabTrainingSchool(top)) {
                if (!commandantSeen.has(top)) { commandantSeen.add(top); commandant.push(top); }
            } else {
                if (!otherSeen.has(top)) { otherSeen.add(top); others.push(top); }
            }
        };

        for (const emp of this.filteredEmployees) {
            // বদলিকৃত কর্মস্থল (transfer destination). HQ comes straight from the view
            // (TransferIsHq); the name heuristic is only a fallback.
            const transferFull = (bn ? (emp.transferRabUnitNameBN || emp.transferRabUnitName) : emp.transferRabUnitName) || '';
            const transferParts = transferFull.split(',').map((s) => s.trim()).filter(Boolean);
            classify(transferParts, emp.transferIsHq ?? this.isRabHq(transferParts[0] || ''));

            // Inter posting: also address the member's PRESENT (from) unit, so the
            // previous RAB unit shows in the অনুলিপি alongside the transfer one. The
            // present hierarchy is already on the row (outermost-first: unit → … →
            // sub-section); no HQ flag exists for it, so the name heuristic decides
            // পরিচালক vs অধিনায়ক.
            if (this.isInterPosting) {
                const presentParts = [
                    bn ? (emp.presentRabUnitNameBN || emp.presentRabUnitName) : emp.presentRabUnitName,
                    bn ? (emp.presentRabWingNameBN || emp.presentRabWingName) : emp.presentRabWingName,
                    bn ? (emp.presentRabBranchNameBN || emp.presentRabBranchName) : emp.presentRabBranchName,
                    bn ? (emp.presentRabSubBranchNameBN || emp.presentRabSubBranchName) : emp.presentRabSubBranchName,
                    bn ? (emp.presentRabSectionNameBN || emp.presentRabSectionName) : emp.presentRabSectionName,
                    bn ? (emp.presentRabSubSectionNameBN || emp.presentRabSubSectionName) : emp.presentRabSubSectionName,
                ].map((s) => (s || '').trim()).filter(Boolean);
                classify(presentParts, this.isRabHq(presentParts[0] || ''));
            }
        }

        const lines: string[] = [];
        if (hqWings.length) lines.push(`${bn ? 'পরিচালক' : 'Director'}, ${this.sortUnitsNaturally(hqWings).join('/ ')}`);
        if (commandant.length) lines.push(`${bn ? 'কমান্ড্যান্ট' : 'Commandant'}, ${this.sortUnitsNaturally(commandant).join('/ ')}`);
        if (rabUnits.length) lines.push(`${bn ? 'অধিনায়ক' : 'Commanding Officer'}, ${this.sortUnitsNaturally(rabUnits).join('/ ')}`);
        if (others.length) lines.push(this.sortUnitsNaturally(others).join(', '));
        return lines;
    }

    /** DB-maintained serial (CommonCode.SortOrder) per RAB unit / wing name, EN & BN keyed. */
    private unitSortOrderMap = new Map<string, number>();

    private normalizeUnitName(s: string): string {
        return this.stripZeroWidth(s || '').toLowerCase();
    }

    /**
     * Load the DB serial (SortOrder) for RAB units and wings from their CommonCode
     * setup (basic-setup/rab-unit & rab-wing), so the অনুলিপি list orders by the
     * SAME serial the user maintains there.
     */
    private loadUnitSortOrders(): void {
        forkJoin([
            this.masterBasicSetupService.getAllByType('RabUnit'),
            this.masterBasicSetupService.getAllByType('RabWing')
        ]).subscribe({
            next: ([units, wings]) => {
                this.unitSortOrderMap.clear();
                for (const c of [...(units ?? []), ...(wings ?? [])]) {
                    if (c.sortOrder == null) continue;
                    if (c.codeValueEN) this.unitSortOrderMap.set(this.normalizeUnitName(c.codeValueEN), c.sortOrder);
                    if (c.codeValueBN) this.unitSortOrderMap.set(this.normalizeUnitName(c.codeValueBN), c.sortOrder);
                }
            },
            error: () => { /* fall back to numeric sort below */ }
        });
    }

    /**
     * Order unit/wing names by the DB-maintained serial (SortOrder) from rab-unit /
     * rab-wing setup. Falls back to the trailing number in the name (Bangla ০-৯ or
     * ASCII) when a name isn't in the map yet, then alphabetically.
     */
    private sortUnitsNaturally(units: string[]): string[] {
        const key = (s: string): number => {
            const mapped = this.unitSortOrderMap.get(this.normalizeUnitName(s));
            if (mapped != null) return mapped;
            const ascii = (s || '').replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x09E6));
            const m = ascii.match(/\d+/);
            return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
        };
        return [...units].sort((a, b) => {
            const ka = key(a), kb = key(b);
            if (ka !== kb) return ka - kb;
            return a.localeCompare(b, 'bn');
        });
    }

    // ── Corps Office অনুলিপি (Member Type first, then Corps, scoped to the org) ──
    /** Every Corps Office with its member type, mother org and assigned corps codes. */
    private offices: { orgId: number | null; memberTypeId: number | null; corpsCodeIds: number[]; en: string; bn: string }[] = [];

    /** Load the Corps Office setup (basic-setup/corps-office) once for the অনুলিপি lookup. */
    private loadCorpsOfficeMap(): void {
        this.corpsOfficeService.getAll().subscribe({
            next: (offices) => {
                this.offices = (offices ?? []).map((o) => ({
                    orgId: o.orgId,
                    memberTypeId: o.memberTypeId,
                    corpsCodeIds: (o.assignedCorps ?? []).map((a) => a.corpsCodeId),
                    en: o.officeNameEN,
                    bn: o.officeNameBN
                }));
            },
            error: () => { /* no corps-office copy line if the lookup fails */ }
        });
    }

    /**
     * অনুলিপি lines: the distinct Corps Offices for the employees in this order.
     * Gating order — MEMBER TYPE first, then CORPS:
     *   1. keep only offices whose Member Type matches the employee's;
     *   2. of those, the office(s) whose assigned corps includes the employee's EXACT
     *      corps code (EmployeeInfo.Branch);
     *   3. fallback — if no corps match (e.g. corps is অপ্রযোজ্য), every member-type
     *      office under the employee's OWN mother organization.
     * An employee with no member type produces no line. Bilingual; de-duplicated.
     */
    get corpsOfficeCopyLines(): string[] {
        const bn = this.isBangla;
        const seen = new Set<string>();
        const names: string[] = [];
        for (const emp of this.filteredEmployees) {
            if (emp.memberTypeId == null) continue; // member type must match first
            const mtOffices = this.offices.filter((o) => o.memberTypeId === emp.memberTypeId);
            let chosen = emp.corpsId != null ? mtOffices.filter((o) => o.corpsCodeIds.includes(emp.corpsId!)) : [];
            if (chosen.length === 0 && emp.motherOrgId != null) chosen = mtOffices.filter((o) => o.orgId === emp.motherOrgId);
            for (const off of chosen) {
                const label = ((bn ? (off.bn || off.en) : off.en) || '').trim();
                if (!label) continue;
                const dk = label.toLowerCase();
                if (seen.has(dk)) continue;
                seen.add(dk);
                names.push(label);
            }
        }
        return names;
    }

    /** The Corps-Office অনুলিপি lines actually rendered (empty when toggled off). */
    get shownCorpsOfficeCopyLines(): string[] {
        return this.showCorpsOfficeCopy ? this.corpsOfficeCopyLines : [];
    }

    /** How many Corps-Office lines are shown — offsets the transfer-unit numbering in the filter list. */
    get corpsOfficeCopyCount(): number {
        return this.shownCorpsOfficeCopyLines.length;
    }

    // ── Mother Org Office Head অনুলিপি (generated from THIS order's units) ────
    // Onulipi is NOT taken from the setup; it is built here from the units actually
    // in the order, grouped by the office head that presides over them, so an
    // employee only ever contributes their OWN unit — not the head's full list.
    /** normalized unit name (EN & BN) → the unit record (id + both names). */
    private orgUnitByNameKey = new Map<string, { id: number; en: string; bn: string }>();
    /** unit id → the office head presiding over it (name + police flag). */
    private headByUnitId = new Map<number, { key: string; en: string; bn: string; police: boolean }>();

    private normalizeUnitKey(s: string): string {
        return this.stripZeroWidth(s || '').toLowerCase();
    }

    /**
     * Load Mother Org Office Head setups + all org units (+ mother orgs, to flag
     * Police). The employee row carries the unit NAME, so units are keyed by name
     * to their record, and each head's unit-ids are mapped to the head. The actual
     * onulipi text is built per order in motherOrgOfficeHeadCopyLines.
     */
    private loadMotherOrgOfficeHeadMap(): void {
        forkJoin([
            this.motherOrgOfficeHeadService.getAll(),
            this.organizationService.GetAllOrgUnit(),
            this.organizationService.getAllActiveMotherOrgs()
        ]).subscribe({
            next: ([heads, units, motherOrgs]) => {
                this.orgUnitByNameKey.clear();
                for (const u of units ?? []) {
                    const rec = { id: u.orgId, en: u.orgNameEN ?? '', bn: u.orgNameBN ?? '' };
                    if (u.orgNameEN) this.orgUnitByNameKey.set(this.normalizeUnitKey(u.orgNameEN), rec);
                    if (u.orgNameBN) this.orgUnitByNameKey.set(this.normalizeUnitKey(u.orgNameBN), rec);
                }
                const policeOrgIds = new Set<number>();
                for (const mo of motherOrgs ?? []) {
                    if ((mo.orgNameEN ?? '').toLowerCase().includes('police') || (mo.orgNameBN ?? '').includes('পুলিশ'))
                        policeOrgIds.add(mo.orgId);
                }
                this.headByUnitId.clear();
                for (const h of heads ?? []) {
                    if (h.status === false) continue;
                    const head = {
                        key: String(h.orgHeadId),
                        en: (h.headNameEN ?? '').trim(),
                        bn: (h.headNameBN ?? '').trim(),
                        police: h.motherOrgId != null && policeOrgIds.has(h.motherOrgId)
                    };
                    for (const u of h.units ?? []) this.headByUnitId.set(u.unitOrgId, head);
                }
            },
            error: () => { /* no office-head copy line if the lookup fails */ }
        });
    }

    /**
     * অনুলিপি line per office head: HeadName + ' ' + the head's units THAT ARE IN
     * THIS order (grouped), so a member only brings their own unit — not the head's
     * full assigned list. For Police the units are collapsed on their shared prefix
     * ("জেলা পুলিশ রাজবাড়ী/শরিয়তপুর"); otherwise comma-joined. Bangla in Bangla docs.
     */
    get motherOrgOfficeHeadCopyLines(): string[] {
        const bn = this.isBangla;
        const order: string[] = [];
        const groups = new Map<string, { head: { en: string; bn: string; police: boolean }; names: string[]; seen: Set<string> }>();
        for (const emp of this.filteredEmployees) {
            const empUnit = emp.motherUnitName ?? emp.motherUnitNameBN;
            if (!empUnit) continue;
            const unit = this.orgUnitByNameKey.get(this.normalizeUnitKey(empUnit));
            if (!unit) continue;
            const head = this.headByUnitId.get(unit.id);
            if (!head) continue;
            let g = groups.get(head.key);
            if (!g) { g = { head, names: [], seen: new Set() }; groups.set(head.key, g); order.push(head.key); }
            const unitName = (bn ? (unit.bn || unit.en) : (unit.en || unit.bn)) || '';
            const nk = this.normalizeUnitKey(unitName);
            if (unitName && !g.seen.has(nk)) { g.seen.add(nk); g.names.push(unitName); }
        }
        const lines: string[] = [];
        for (const key of order) {
            const g = groups.get(key)!;
            const headName = (bn ? (g.head.bn || g.head.en) : (g.head.en || g.head.bn)) || '';
            const unitsText = g.head.police ? this.collapseByPrefix(g.names) : g.names.join(', ');
            const line = [headName, unitsText].filter(x => (x ?? '').trim()).join(' ').trim();
            if (line) lines.push(line);
        }
        return lines;
    }

    /**
     * Group names by their shared prefix and join the differing tails with "/".
     * Split point: the first comma if present (Bangla "জেলা পুলিশ, রাজবাড়ী"), else the
     * last space (English "District Police Rajbari"); single-token names stay whole.
     * Groups keep first-appearance order and are joined by ", ".
     */
    private collapseByPrefix(names: string[]): string {
        const groups: { prefix: string; suffixes: string[] }[] = [];
        for (const raw of names) {
            const name = (raw ?? '').trim();
            if (!name) continue;
            let prefix = name;
            let suffix = '';
            const comma = name.indexOf(',');
            if (comma >= 0) {
                prefix = name.slice(0, comma).trim();
                suffix = name.slice(comma + 1).trim();
            } else {
                const space = name.lastIndexOf(' ');
                if (space > 0) {
                    prefix = name.slice(0, space).trim();
                    suffix = name.slice(space + 1).trim();
                }
            }
            const group = groups.find(g => g.prefix === prefix);
            if (group) {
                if (suffix) group.suffixes.push(suffix);
            } else {
                groups.push({ prefix, suffixes: suffix ? [suffix] : [] });
            }
        }
        return groups
            .map(g => g.suffixes.length ? `${g.prefix} ${g.suffixes.join('/')}` : g.prefix)
            .join(', ');
    }

    /** The office-head অনুলিপি lines actually rendered (empty when toggled off). */
    get shownMotherOrgOfficeHeadCopyLines(): string[] {
        return this.showMotherOrgOfficeHeadCopy ? this.motherOrgOfficeHeadCopyLines : [];
    }

    /** Lines shown before the office-head group — offsets its numbering in the filter list. */
    get motherOrgOfficeHeadCopyOffset(): number {
        return this.corpsOfficeCopyCount + (this.showTransferUnitsCopy ? this.autoCopyLines.length : 0);
    }

    // ── Per-line অনুলিপি checkboxes (every auto line is individually toggleable) ──
    /** Auto lines the user has unchecked in the Copy Filter, tracked by their text. */
    private hiddenAutoLines = new Set<string>();

    /**
     * Every auto-generated অনুলিপি line in document order: Corps Office → transfer
     * units (পরিচালক / কমান্ড্যান্ট / অধিনায়ক / others) → Mother Org Office Head.
     */
    get allAutoLines(): string[] {
        return [...this.corpsOfficeCopyLines, ...this.autoCopyLines, ...this.motherOrgOfficeHeadCopyLines];
    }

    /**
     * Auto অনুলিপি lines actually rendered: every auto line except the ones the user
     * unchecked. Shared by preview/PDF (copyLines) and the Word export.
     */
    private get autoCopyAllLines(): string[] {
        return this.allAutoLines.filter(l => !this.hiddenAutoLines.has(l));
    }

    /**
     * One row per অনুলিপি line for the Copy Filter — EVERY line (auto + system/footer)
     * has its own checkbox. `no` is the running document number of the checked lines
     * (blank for unchecked, so it's clear they won't appear).
     */
    get onulipiFilterRows(): { text: string; checked: boolean; no: string; kind: 'auto' | 'para'; paraIndex: number }[] {
        this.syncParagraphChecked();
        const rows: { text: string; checked: boolean; no: string; kind: 'auto' | 'para'; paraIndex: number }[] = [];
        let n = 0;
        const fmt = (v: number) => (this.isBangla ? this.toBanglaDigits('' + v) : String(v));
        for (const line of this.allAutoLines) {
            const checked = !this.hiddenAutoLines.has(line);
            if (checked) n++;
            rows.push({ text: line, checked, no: checked ? fmt(n) : '', kind: 'auto', paraIndex: -1 });
        }
        this.filteredFooterParagraphs.forEach((para, pi) => {
            const checked = this.paragraphChecked[pi] !== false;
            if (checked) n++;
            rows.push({ text: para.text, checked, no: checked ? fmt(n) : '', kind: 'para', paraIndex: pi });
        });
        return rows;
    }

    /** trackBy for the Copy Filter rows — positional identity keeps the p-checkboxes
     *  from being destroyed/recreated every change-detection tick (the getter returns a
     *  fresh array each time), which otherwise loops CD and hangs the browser. */
    trackFilterRowByIndex = (index: number): number => index;

    /** Toggle a single অনুলিপি line (auto or footer) from the Copy Filter. */
    onFilterRowToggle(row: { kind: 'auto' | 'para'; text: string; paraIndex: number }, checked: boolean): void {
        if (row.kind === 'auto') {
            if (checked) this.hiddenAutoLines.delete(row.text);
            else this.hiddenAutoLines.add(row.text);
        } else {
            this.paragraphChecked[row.paraIndex] = checked;
        }
    }

    /**
     * Every অনুলিপি line as one numbered list: the auto transfer-unit lines (when
     * shown) followed by the footer paragraphs.
     *
     * The template renders one table row per line and pairs the LAST line with the
     * approver signature (see copyLinesHead / copyLineLast). That is what lets the
     * list break across pages — it starts right under the স্বাক্ষরিত/- block instead of
     * being pushed to a page of its own — while the signature still ends level with
     * the final line, wherever the list happens to end. The list is dynamic, so
     * nothing here assumes a line count.
     */
    /** User-chosen অনুলিপি order (line texts) for THIS view only — ephemeral, reset on
     *  every load (see loadOrder). null = the natural computed order. Set from the Copy
     *  Filter panel's reorder controls; reconciled against the current computed lines so
     *  show/hide toggles and the per-unit filter keep working. */
    private copyOrder: string[] | null = null;

    /** Apply the ephemeral `copyOrder` to freshly-computed line texts: kept lines follow
     *  the user's order; any new line (a toggle re-enabled, a filter change) is appended
     *  at the end. Pure — never mutates state. Matches each text once, so duplicate
     *  lines are handled positionally. */
    private orderCopyTexts(computed: string[]): string[] {
        if (!this.copyOrder) return computed;
        const remaining = [...computed];
        const result: string[] = [];
        for (const t of this.copyOrder) {
            const at = remaining.indexOf(t);
            if (at !== -1) { result.push(t); remaining.splice(at, 1); }
        }
        result.push(...remaining);   // lines not in the saved order (new / re-enabled)
        return result;
    }

    get copyLines(): { no: string; text: string; idx: number }[] {
        const raw = [...this.autoCopyAllLines, ...this.exportFooterParagraphs.map((p) => p.text)];
        return this.orderCopyTexts(raw).map((text, i) => ({
            no: this.isBangla ? this.toBanglaDigits('' + (i + 1)) : String(i + 1),
            text,
            idx: i
        }));
    }

    /** Effective অনুলিপি line count — drives the "move down" disabled state. */
    get copyLinesCount(): number { return this.copyLines.length; }

    /** View-only reorder of an অনুলিপি line (for print/export). `idx` is the line's
     *  position in copyLines; the new order flows to the preview, PDF and Word. */
    moveCopyLineUp(idx: number): void { this.swapCopyLine(idx, idx - 1); }
    moveCopyLineDown(idx: number): void { this.swapCopyLine(idx, idx + 1); }
    private swapCopyLine(from: number, to: number): void {
        const texts = this.copyLines.map((l) => l.text);
        if (from < 0 || to < 0 || from >= texts.length || to >= texts.length) return;
        [texts[from], texts[to]] = [texts[to], texts[from]];
        this.copyOrder = texts;
    }

    /**
     * How many trailing copy lines are held on one page with the signature.
     *
     * The signature is anchored to the bottom of the last line's row and drawn
     * UPWARD over the rows above it. Those rows must be on the same page, or the
     * part that reaches past the page edge prints on the previous one — the
     * signature splits in two. Six lines covers the tallest form of the block
     * (signature image + name + rank + appointment); the cost is at most six lines
     * of white space at the foot of the previous page.
     */
    private readonly copyTailLineCount = 6;

    /** Line ১, which prints with the স্বাক্ষরিত/- block above it — that block must never
     *  end up on a page with no অনুলিপি under it. null when the list is empty. */
    get copyLineFirst(): { no: string; text: string } | null {
        return this.copyLines[0] ?? null;
    }

    /** Everything after line ১ — line ১ is spoken for by the opening block, so the
     *  splits below never reach back into it. */
    private get copyRestLines(): { no: string; text: string }[] {
        return this.copyLines.slice(1);
    }

    /** Copy lines between line ১ and the kept-together tail — free to break anywhere. */
    get copyLinesMiddle(): { no: string; text: string }[] {
        const rest = this.copyRestLines;
        return rest.slice(0, Math.max(0, rest.length - this.copyTailLineCount));
    }

    /** The trailing lines that ride with the signature, EXCLUDING the last one. */
    get copyLinesTail(): { no: string; text: string }[] {
        const rest = this.copyRestLines;
        return rest.slice(Math.max(0, rest.length - this.copyTailLineCount), Math.max(0, rest.length - 1));
    }

    /** The final copy line, which shares its row with the approver signature. null when
     *  the list is empty or holds only line ১ — the signature row still renders. */
    get copyLineLast(): { no: string; text: string } | null {
        const rest = this.copyRestLines;
        return rest.length ? rest[rest.length - 1] : null;
    }

    /** Recompute `filteredEmployees` and `filteredFooterParagraphs` from the current filter. */
    private applyFilter(): void {
        if (this.selectedFilterUnitId == null) {
            this.filteredEmployees = this.employees;
            this.filteredFooterParagraphs = this.footerParagraphs;
        } else {
            const unitId = this.selectedFilterUnitId;
            this.filteredEmployees = this.employees.filter(e => e.transferRabUnitId === unitId);
            this.filteredFooterParagraphs = this.footerParagraphs.filter(p =>
                p.transferRabUnitId == null || p.transferRabUnitId === unitId
            );
        }
        // Reset paragraph checkboxes when filter changes
        this.paragraphChecked = this.filteredFooterParagraphs.map(() => true);
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

    get isApproved(): boolean {
        return this.approvalStatus === ApprovalStatus.Approve;
    }

    // ─── Edit mode ────────────────────────────────────────

    get canEdit(): boolean {
        // Editable only while pending — approved or cancelled orders are locked.
        return this.approvalStatus !== ApprovalStatus.Approve
            && this.approvalStatus !== ApprovalStatus.Cancel;
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

        // References for edit — cloned from the parsed entries (includes the note-sheet
        // fallback for pre-feature orders, so editing persists it as JSON).
        this.editReferences = this.referenceEntries.map(e => ({ ...e }));

        this.editApprovalEmployeeId = this.approvalEmployeeId;
        this.loadApprovalEmployees();
        this.loadAddMemberList();
        this.loadAddMemberUnitTree();
        this.editing = true;
    }

    private loadApprovalEmployees(): void {
        if (this.approvalEmployees.length > 0) return;
        this.loadingApprovalEmployees = true;
        // Same source + filter as the generate screens (identity users + mappings →
        // buildApprovalPersonOptions), so edit mode offers the exact same full dropdown.
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

    cancelEdit(): void {
        this.editing = false;
        this.editPostingOrderDate = null;
        this.editRemarks = '';
        this.editPostingText = '';
        this.editSubText = '';
        this.editFooterParagraphs = [];
        this.editReferences = [];
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
            next: (list) => {
                // Scope the add-member dropdown to the user's accessible member types.
                this.addMemberList = (list ?? []).filter((e) => this.isAccessibleMemberType(e.memberTypeId));
                this.addMemberLoading = false;
            },
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

    /** Reorder অনুলিপি rows in edit mode. Order is the array order, which buildSavePayload
     *  serializes into footerText, so the new order persists to the DB on save. */
    moveEditFooterUp(index: number): void {
        if (index <= 0) return;
        [this.editFooterParagraphs[index - 1], this.editFooterParagraphs[index]] =
            [this.editFooterParagraphs[index], this.editFooterParagraphs[index - 1]];
    }

    moveEditFooterDown(index: number): void {
        if (index >= this.editFooterParagraphs.length - 1) return;
        [this.editFooterParagraphs[index], this.editFooterParagraphs[index + 1]] =
            [this.editFooterParagraphs[index + 1], this.editFooterParagraphs[index]];
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
                            // If no members remain after removal, navigate back
                            const remaining = this.editEmployees.filter(e => e.employeeId !== emp.employeeId);
                            if (remaining.length === 0) {
                                this.messageService.add({ severity: 'info', summary: 'Empty', detail: 'No members remaining. Returning to previous page.' });
                                setTimeout(() => window.history.back(), 800);
                                return;
                            }
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

    private loadRemovalHistory(emps: PostingOrderEmployeeRow[]): void {
        const ids = emps.map(e => e.employeeId).filter(Boolean);
        if (ids.length === 0) return;
        this.postingService.getRemovalHistoryByEmployeeIds(ids).subscribe({
            next: (list) => {
                this.removalHistoryMap = {};
                for (const item of (list ?? [])) {
                    if (item.postingOrderNo || item.draftPostingNo) {
                        this.removalHistoryMap[item.employeeId] = item;
                    }
                }
            },
            error: () => {}
        });
    }

    private loadCancelledInterPosting(emps: PostingOrderEmployeeRow[]): void {
        const ids = emps.map(e => e.employeeId).filter(Boolean);
        if (ids.length === 0) return;
        this.postingService.getLastCancelledInterPostingByEmployeeIds(ids, this.isInterPosting ? NoteSheetType.InterPosting : NoteSheetType.NewPosting).subscribe({
            next: (list) => {
                this.cancelledInterMap = {};
                for (const item of (list ?? [])) {
                    if (item.postingOrderNo) this.cancelledInterMap[item.employeeId] = item;
                }
            },
            error: () => {}
        });
    }

    getRemovalRemark(emp: PostingOrderEmployeeRow): string {
        const history = this.removalHistoryMap[emp.employeeId];
        if (!history) return '';
        return this.isBangla
            ? (history.removalRemarkBN || history.removalRemark || '')
            : (history.removalRemark || '');
    }

    /** Combined remark — same content as the note-sheet preview / order generate. */
    empCombinedRemarks(emp: PostingOrderEmployeeRow): string {
        const base = this.isInterPosting ? emp.interPostingRemark : emp.sendingRemark;
        // TEMPORARILY HIDDEN (per request): the auto-generated notes — "removed from the
        // previous note-sheet" (getRemovalRemark) and "previous transfer order cancelled"
        // (cancelledInterMap) — are no longer appended; only the manual remarks show.
        // To restore, add `this.getRemovalRemark(emp)` and the cancel note back to the list.
        return [base, emp.noteSheetRemarks].filter(s => s?.trim()).join(', ');
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

    private buildSavePayload() {
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

        return {
            id: this.currentOrderId!,
            postingOrderNo: this.postingOrderNo,
            postingOrderDate: postingOrderDateStr,
            postingType: this.postingType,
            referenceNumber: this.serializeReferences(this.editReferences),
            subject: this.subject || null,
            mainText: mainText,
            subText: subText,
            textType: this.textType || (this.isBangla ? 'bn' : 'en'),
            status: this.status || null,
            remarks: this.editRemarks || null,
            footerText: footerText,
            employeeIds: this.editEmployees.map(e => e.employeeId),
            updatedBy: this.auditUser,
            approvalEmployeeId: this.editApprovalEmployeeId ?? null
        };
    }

    saveChanges(): void {
        if (this.saving || !this.currentOrderId) return;

        if (this.editEmployees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'At least one employee is required.' });
            return;
        }

        this.saving = true;

        this.postingService.updatePostingOrder(this.buildSavePayload()).subscribe({
            next: (res: { statusCode: number; description: string }) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting order updated successfully.' });
                    this.editing = false;
                    if (this.currentOrderId) this.loadOrder(this.currentOrderId);
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to update.' });
                }
            },
            error: (err: any) => {
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

    // ─── PDF download via JsReport (chrome-pdf, exact web view) ──
    async exportPdf(): Promise<void> {
        if (this.filteredEmployees.length === 0 || !this.legalPaper) return;
        this.exportingPdf = true;
        try {
            const { html, chrome } = await this.buildJsReportPdf();
            await this.jsreportService.downloadPdf(
                html, {}, `PostingOrder_${this.postingOrderNo || 'export'}${this.exportFileSuffix}.pdf`, chrome,
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

    // ─── Print Preview via JsReport (chrome-pdf, open in new tab) ──
    async printPreview(): Promise<void> {
        if (this.filteredEmployees.length === 0 || !this.legalPaper) return;
        this.printingPreview = true;
        try {
            const { html, chrome } = await this.buildJsReportPdf();
            await this.jsreportService.previewPdfInNewTab(
                html, {}, `PostingOrder_${this.postingOrderNo || 'export'}`, chrome,
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

    /**
     * Build the chrome-pdf HTML + chrome options shared by the PDF download and
     * the Print Preview, so both produce output identical to the on-screen
     * `.legal-paper`. Snapshots the rendered paper's inner HTML and ships every
     * same-origin stylesheet so Chromium reproduces the exact styling; @page
     * insets mirror `.legal-paper`'s padding so the text column matches the web
     * view (A4 210 − 2×10 = 190mm).
     */
    private async buildJsReportPdf(): Promise<{ html: string; chrome: Record<string, unknown> }> {
        const styles = this.collectDocumentStyles();
        const fontCss = await this.embedBanglaFontCss();
        const body = this.legalPaper.nativeElement.innerHTML;
        const isLegal = this.selectedPageSize === 'legal';
        const pageWidth = isLegal ? '215.9mm' : '210mm';
        const pageHeight = isLegal ? '355.6mm' : '297mm';
        const colWidth = isLegal ? '195.9mm' : '190mm';
        const padX = 10;     // mm — .legal-paper horizontal padding
        const padTop = 14;   // mm — .legal-paper top padding
        const padBottom = 20; // mm — .legal-paper bottom padding

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

/* @page insets mirror .legal-paper's padding so the text column width matches
   the web view exactly. */
@page { size: ${pageWidth} ${pageHeight}; margin: ${padTop}mm ${padX}mm ${padBottom}mm ${padX}mm; }
html, body { margin: 0; padding: 0; background: transparent; }

/* Hide app chrome that may sneak through the global styles */
.no-print, .preview-header, .preview-actions, .approval-header-right, .unit-filter-bar { display: none !important; }

/* Source container — lock the exact .legal-paper text column + typography so
   Chromium wraps lines identically to the screen. */
.pdf-flow {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    width: ${colWidth};
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif;
    /* Font-size offset picked in the header bar. The web view carries it on the
       component host, which is outside this snapshot (the body is the paper's
       innerHTML), so it is restated here — the scoped .po-doc-* rules that ride
       along in the clone are all written against it. */
    --ns-fs-delta: ${this.fontDelta};
    font-size: calc(9pt + var(--ns-fs-delta, 0) * 1pt);
    line-height: 1.7;
    color: #000;
}

/* The rich-text blocks get their size from a ":host ::ng-deep" rule, which Angular
   compiles to "[_nghost-…] .po-doc-…" — the host element is not in this snapshot
   (the body is the paper's innerHTML), so that rule cannot match here and the text
   would fall back to .pdf-flow's 9pt. Restated so the print matches the screen. */
.pdf-flow .po-doc-posting-text,
.pdf-flow .po-doc-posting-text *,
.pdf-flow .po-doc-sub-text,
.pdf-flow .po-doc-sub-text *,
.pdf-flow .po-doc-master-remarks,
.pdf-flow .po-doc-master-remarks * {
    font-size: calc(10pt + var(--ns-fs-delta, 0) * 1pt);
    line-height: 1.8;
}

/* ── অনুলিপি block ──────────────────────────────────────────────────────────
   The list is one table row per line so it can break across pages, in three parts:
   the opening block (স্বাক্ষরিত/- signature + head + line ১) prints as a unit so the
   signature always has a copy line under it; the middle rows break anywhere; the tail
   (last lines + approver signature) prints as a unit. The approver signature shares
   the LAST line's row and is anchored to that row's bottom edge (position:absolute —
   see the component SCSS), so it ends level with the final line and grows upward
   beside the rows above, which is why those rows have to share its page. */
.pdf-flow .po-doc-copy-open,
.pdf-flow .po-doc-copy-table tr,
.pdf-flow .po-doc-copy-tail,
.pdf-flow .po-doc-copy-sig { page-break-inside: avoid; break-inside: avoid; }
.pdf-flow .po-doc-copy-last-row .po-doc-copy-right { position: relative; }
.pdf-flow .po-doc-copy-last-row .po-doc-copy-sig { position: absolute; right: 0; bottom: 0; width: 100%; }

/* ── Multi-page employee table (same treatment as the note-sheet PDF) ──
   Chromium fragments the table across pages by itself, but without these rules
   it breaks THROUGH a row: a cell whose text wraps leaves its first line(s) at
   the bottom of one page and the rest under the repeated header on the next, so
   the row reads as two half-empty ones. Holding each row together moves the
   whole row to the next page instead, and the bordered cells then close the
   columns at the page boundary.

   .po-doc-box is a flex column with overflow:hidden on screen; both can stop a
   table from fragmenting and suppress <thead> repetition in print, so they are
   relaxed to normal block flow here. */
.pdf-flow .po-doc-box { display: block !important; overflow: visible !important; }
.pdf-flow .po-doc-table { overflow: visible !important; border-collapse: collapse; }
.pdf-flow .po-doc-table thead { display: table-header-group !important; }
.pdf-flow .po-doc-table tr,
.pdf-flow .po-doc-table th,
.pdf-flow .po-doc-table td { page-break-inside: avoid; break-inside: avoid; }
</style>
</head>
<body>
<div class="pdf-flow">${body}</div>
</body>
</html>`;

        const chrome: Record<string, unknown> = {
            format: null,
            width: pageWidth,
            height: pageHeight,
            landscape: false,
            marginTop: '0', marginBottom: '0', marginLeft: '0', marginRight: '0',
            printBackground: true,
            displayHeaderFooter: false,
            headerTemplate: '', footerTemplate: ''
        };

        return { html, chrome };
    }

    /** Concatenate every same-origin stylesheet loaded into the page (cross-origin
     *  sheets throw on cssRules access and are skipped). */
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
     * without the font being installed on the JsReport server.
     *
     * A face that cannot be fetched is skipped rather than failing the export:
     * Chromium then falls back to a system Bangla font, as it did before the
     * font was bundled.
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
            } catch { /* font asset unavailable — fall back to a system Bangla face */ }
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

    // ─── Shared Word Document Builder ─────────────────────

    private buildWordDocument(): Document {
        const bn = this.isBangla;
        const font = bn
            ? { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'SolaimanLipi', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 20 : undefined;   // 10pt for order context (complex script)
        const hdrSize = 20;                     // 10pt for org header
        const hdrCsSize = bn ? 20 : undefined;
        const tblSize = 18;                     // 9pt for table content
        const tblCsSize = bn ? 18 : undefined;
        const tblHdrSize = 18;                  // 9pt for table header
        const tblHdrCsSize = bn ? 18 : undefined;
        const ctxSize = 20;                     // 10pt for order context
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Government Header (9pt, bold, centered) ──
        const headerLines = bn
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‌্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা']
            : ['Government of the Peoples Republic of Bangladesh', 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka'];

        const headerParas = headerLines.map(line => new Paragraph({
            children: [new TextRun({ text: line, bold: true, size: hdrSize, sizeComplexScript: hdrCsSize, font, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 }
        }));

        // ── Title (11pt, bold, underlined, centered) ──
        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'প্রজ্ঞাপন' : 'NOTIFICATION', bold: true, size: 22, sizeComplexScript: bn ? 22 : undefined, font, underline: {}, language: lang })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 }
        });

        // ── Order No & Date (9pt, space-between via tab stop) ──
        const orderLine = new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
                new TextRun({ text: this.postingOrderNo, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: '\t', font }),
                new TextRun({ text: bn ? 'তারিখ: ' : 'Date: ', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.previewDate, size: ctxSize, sizeComplexScript: csSize, font, language: lang })
            ],
            spacing: { after: 80 }
        });

        // ── Reference / সূত্র : one line, or a numbered list when multiple ──
        const refEntries = this.referenceEntries;
        const referenceParas: Paragraph[] = refEntries.length === 0 ? [] :
            refEntries.length === 1 ? [new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'সূত্রঃ ' : 'Reference: ', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: this.referenceEntryText(refEntries[0]), size: ctxSize, sizeComplexScript: csSize, font, language: lang })
                ],
                spacing: { after: 160 }
            })] : [
                new Paragraph({
                    children: [new TextRun({ text: bn ? 'সূত্রঃ' : 'Reference:', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                    spacing: { after: 40 }
                }),
                ...refEntries.map((ref, i) => new Paragraph({
                    children: [new TextRun({ text: `${bn ? this.toBanglaDigits(String(i + 1)) : (i + 1)}। ${this.referenceEntryText(ref)}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                    spacing: { after: i === refEntries.length - 1 ? 160 : 40 },
                    tabStops: [{ type: TabStopType.LEFT, position: 400 }]
                }))
            ];

        // ── Body Text (10pt, justified) – split on blank lines into paragraphs ──
        const bodyParas = (this.bodyText || '')
            .split(/\n{2,}/)
            .map(block => block.trim())
            .filter(t => t.length > 0)
            .map(block => new Paragraph({
                children: block.split('\n').flatMap((line, idx) => {
                    const run = new TextRun({ text: line, size: ctxSize, sizeComplexScript: csSize, font, language: lang });
                    return idx === 0 ? [run] : [new TextRun({ text: '', break: 1, font }), run];
                }),
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 160 }
            }));

        // ── Employee Table (header 8.5pt, data 9pt) ──
        const isInter = this.isInterPosting;
        const sd = this.showOwnDistrict;
        const sp = this.showPrevWorkplaceUnit;
        const sr = this.showRemarks;
        const st = this.showTradeColumn;   // Trade column (both order types)
        const cols = isInter
            ? (bn ? ['ক্রমিক', 'ব্যক্তিগত নং', 'পদবি', ...(st ? ['ট্রেড'] : []), 'নাম', ...(sd ? ['নিজ জেলা'] : []), ...(sp ? ['পূর্ববতী কর্মস্থল'] : []), 'বদলিকৃত কর্মস্থল', ...(sr ? ['মন্তব্য'] : [])]
                   : ['Ser', 'Service ID', 'Rank', ...(st ? ['Trade'] : []), 'Name', ...(sd ? ['Own District'] : []), ...(sp ? ['Previous Workplace'] : []), 'Transfer Station', ...(sr ? ['Remarks'] : [])])
            : (bn ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', ...(st ? ['ট্রেড'] : []), 'নাম', ...(sd ? ['নিজ জেলা'] : []), ...(sp ? ['পূর্ববতী কর্মস্থল'] : []), 'বদলিকৃত কর্মস্থল', 'র‌্যাব আইডি', ...(sr ? ['মন্তব্য'] : [])]
                   : ['Ser', 'Service ID', 'Rank', ...(st ? ['Trade'] : []), 'Name', ...(sd ? ['Own District'] : []), ...(sp ? ['Previous Workplace'] : []), 'Transfer Unit', 'RAB ID', ...(sr ? ['Remarks'] : [])]);
        // Column widths in DXA – must sum to full content width.
        // Legal: page 12240 − margins 567*2 = 11106. A4: page 11906 − margins 567*2 = 10772.
        const tblContentWidth = this.selectedPageSize === 'legal' ? 11106 : 10772;
        const buildColW = (): number[] => {
            if (isInter) {
                const tradeW = st ? 924 : 0;      // ট্রেড — same width as the new-posting order's
                const base = st ? [600, 1300, 1000, tradeW] : [600, 1300, 1000];   // ক্রমিক / ব্যক্তিগত নং / পদবি — wider
                const rem = tblContentWidth - base.reduce((a, b) => a + b, 0);
                const nameW = 2200;
                const transferW = 1200;            // বদলিকৃত কর্মস্থল — smaller
                const distW = sd ? 1000 : 0;       // নিজ জেলা — smaller
                const prevW = sp ? 1200 : 0;       // পূর্ববতী কর্মস্থল — smaller
                const remW = sr ? 1000 : 0;        // মন্তব্য — smaller
                const fixedW = nameW + transferW + distW + prevW + remW;
                const adjust = rem - fixedW;
                return [...base, nameW + adjust, ...(sd ? [distW] : []), ...(sp ? [prevW] : []), transferW, ...(sr ? [remW] : [])];
            }
            const base = st ? [580, 1100, 860, 924] : [580, 1100, 860];
            const fixedSum = base.reduce((a, b) => a + b, 0);
            const nameW = 2800;
            const transferW = 1374;
            const rabIdW = 1160;
            const distW = sd ? 1200 : 0;
            const prevW = sp ? 1374 : 0;
            const remW = sr ? 1100 : 0;
            const usedW = fixedSum + nameW + transferW + rabIdW + distW + prevW + remW;
            const adjust = tblContentWidth - usedW;
            return [...base, nameW + adjust, ...(sd ? [distW] : []), ...(sp ? [prevW] : []), transferW, rabIdW, ...(sr ? [remW] : [])];
        };
        const colW = buildColW();

        const hdrPara = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true, size: tblHdrSize, sizeComplexScript: tblHdrCsSize, font, language: lang })], alignment: AlignmentType.CENTER });
        const hdrCell = (text: string, ci: number, extra?: Partial<ConstructorParameters<typeof TableCell>[0]>) => new TableCell({
            children: [hdrPara(text)], borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }, ...extra
        });

        const headerRows = [new TableRow({ tableHeader: true, children: cols.map((col, ci) => hdrCell(col, ci)) })];

        const dataRows = this.filteredEmployees.map((emp, i) => {
            const serial = bn ? this.toBanglaDigits(String(i + 1)) + '।' : String(i + 1);
            const vals = isInter
                ? [
                    serial, this.empServiceId(emp), this.empRank(emp), ...(st ? [this.empTrade(emp)] : []), this.empName(emp),
                    ...(sd ? [this.empDistrict(emp)] : []),
                    ...(sp ? [this.empPrevWorkplace(emp)] : []),
                    this.empTransferUnit(emp),
                    ...(sr ? [this.empCombinedRemarks(emp)] : [])
                ]
                : [
                    serial, this.empServiceId(emp), this.empRank(emp), ...(st ? [this.empTrade(emp)] : []), this.empName(emp),
                    ...(sd ? [this.empDistrict(emp)] : []),
                    ...(sp ? [this.empPrevWorkplace(emp)] : []),
                    this.empTransferUnit(emp),
                    this.empRabId(emp),
                    ...(sr ? [this.empCombinedRemarks(emp)] : [])
                ];
            return new TableRow({
                children: vals.map((val, ci) => {
                    const lines = val.split('\n');
                    const cellParas = lines.map(line => new Paragraph({
                        children: [new TextRun({ text: line, size: tblSize, sizeComplexScript: tblCsSize, font, language: lang })],
                        // Every value starts at the left edge, as in the preview;
                        // only the column headers stay centered (see hdrPara).
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 20 }
                    }));
                    return new TableCell({
                        children: cellParas,
                        borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }
                    });
                })
            });
        });

        const allRows = [...headerRows, ...dataRows];

        const empTable = new Table({
            width: { size: tblContentWidth, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            indent: { size: 0, type: WidthType.DXA },
            rows: allRows,
            columnWidths: colW
        });

        // Helper: rich HTML → Word paragraphs (preserves bold/italic/underline, bullets, line breaks)
        const htmlToParas = (html: string): Paragraph[] => {
            if (!html) return [];
            html = this.fixBanglaWordBreaks(html);
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            const result: Paragraph[] = [];

            interface RunStyle { bold?: boolean; italic?: boolean; underline?: boolean; }

            const extractRuns = (node: Node, style: RunStyle): TextRun[] => {
                const runs: TextRun[] = [];
                node.childNodes.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        const text = child.textContent || '';
                        if (text) {
                            runs.push(new TextRun({
                                text,
                                size: ctxSize, sizeComplexScript: csSize, font, language: lang,
                                bold: style.bold || undefined,
                                italics: style.italic || undefined,
                                underline: style.underline ? {} : undefined,
                            }));
                        }
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        const el = child as HTMLElement;
                        const tag = el.tagName.toLowerCase();
                        if (tag === 'br') {
                            runs.push(new TextRun({ break: 1, size: ctxSize, font, language: lang }));
                        } else {
                            const next: RunStyle = { ...style };
                            if (tag === 'strong' || tag === 'b') next.bold = true;
                            if (tag === 'em' || tag === 'i') next.italic = true;
                            if (tag === 'u') next.underline = true;
                            runs.push(...extractRuns(el, next));
                        }
                    }
                });
                return runs;
            };

            const processNode = (node: Node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    const text = (node.textContent || '').trim();
                    if (text) {
                        result.push(new Paragraph({
                            children: [new TextRun({ text, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                            spacing: { before: 50, after: 50 }
                        }));
                    }
                    return;
                }
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();

                if (tag === 'ul' || tag === 'ol') {
                    el.querySelectorAll(':scope > li').forEach(li => {
                        const runs = extractRuns(li, {});
                        result.push(new Paragraph({
                            children: [
                                new TextRun({ text: '• ', size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                                ...runs
                            ],
                            spacing: { before: 50, after: 50 },
                            indent: { left: 360 }
                        }));
                    });
                } else if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)) {
                    const runs = extractRuns(el, {});
                    const isEmpty = runs.length === 0 ||
                        (el.innerHTML.trim() === '' || el.innerHTML.trim() === '<br>');
                    if (isEmpty) {
                        result.push(new Paragraph({ spacing: { before: 50, after: 50 } }));
                    } else {
                        result.push(new Paragraph({
                            children: runs,
                            alignment: AlignmentType.JUSTIFIED,
                            spacing: { before: 50, after: 50 }
                        }));
                    }
                } else {
                    el.childNodes.forEach(c => processNode(c));
                }
            };

            parsed.body.childNodes.forEach(n => processNode(n));
            return result;
        };

        // ── Main Text (masterRemarks, after reference), Posting Text, Sub Text ──
        const masterRemarksParas = this.masterRemarks ? htmlToParas(this.masterRemarks) : [];
        const postingTextParas = this.postingText ? htmlToParas(this.postingText) : [];
        const subTextParas     = this.subText ? htmlToParas(this.subText) : [];

        // ── Standalone Signature Block (right-aligned, above অনুলিপি) ──
        const approverNameText = (bn ? this.approverNameBN : this.approverName) || this.approverName || '...................................';
        const approverRankText = (bn ? this.approverRankBN : this.approverRank) || this.approverRank || '............................';
        const approverApptText = (bn ? this.approverAppointmentBN : this.approverAppointment) || this.approverAppointment || '............................';
        const approverPhoneText = this.approverPhoneText;
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
        const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

        const standaloneSigChildren: Paragraph[] = [
            new Paragraph({ children: [new TextRun({ text: 'স্বাক্ষরিত/-', size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: approverNameText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: approverRankText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: approverApptText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: `${bn ? 'টেলিঃ' : 'Tel:'} ${approverPhoneText}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true })
        ];
        // DXA widths: both tables are identical 100%-wide structures → exact same column positions
        // contentWidth = page width − left margin − right margin (DXA units)
        const contentWidth = this.selectedPageSize === 'legal' ? 11106 : 10772;
        const sigWidth  = Math.round(contentWidth * 0.20);   // right 20%
        const leftWidth = contentWidth - sigWidth;            // left  80%
        const zeroMargins = { top: 0, bottom: 0, left: 0, right: 0 };
        const sigCellMargins = { top: 0, bottom: 0, left: 250, right: 0 };
        // Standalone sig: same 100% / 85-15 structure — empty left + sig right
        const sigTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: [leftWidth, sigWidth],
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
            rows: [new TableRow({ cantSplit: true, children: [
                new TableCell({ borders: noBorders, width: { size: leftWidth, type: WidthType.DXA }, margins: zeroMargins, children: [new Paragraph({})] }),
                new TableCell({ borders: noBorders, width: { size: sigWidth,  type: WidthType.DXA }, margins: sigCellMargins, children: standaloneSigChildren })
            ] })]
        });
        const sigParas = [new Paragraph({ spacing: { before: 600 }, keepNext: true }), sigTable] as any[];

        // ── অনুলিপি head: prefix + title (left) and তারিখ (right, top-aligned) ──
        // The signature block above keeps its place; only the তারিখ line drops down
        // here so it lands exactly level with the prefix line (mirrors the preview).
        const nsPrefix = this.noteSheetPrefix;
        const headLeftChildren: Paragraph[] = [];
        if (nsPrefix) {
            headLeftChildren.push(new Paragraph({
                children: [new TextRun({ text: nsPrefix, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                spacing: { before: 200, after: 60 }
            }));
        }
        headLeftChildren.push(new Paragraph({
            children: [new TextRun({ text: bn ? 'অনুলিপি (জ্যেষ্ঠতার ভিত্তিতে নহে)' : 'Copy (not in order of seniority):', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: nsPrefix ? 0 : 200 }
        }));
        const headDateChildren: Paragraph[] = [
            // before:200 matches the prefix paragraph's top spacing so the তারিখ line
            // sits exactly level with the prefix (top) line, not the অনুলিপি title.
            new Paragraph({ children: [new TextRun({ text: bn ? `তারিখঃ ${this.previewDate}` : `Date: ${this.previewDate}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], spacing: { before: 200 }, keepLines: true })
        ];
        const copyHeadTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: [leftWidth, sigWidth],
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
            rows: [new TableRow({ cantSplit: true, children: [
                new TableCell({ borders: noBorders, width: { size: leftWidth, type: WidthType.DXA }, margins: zeroMargins, children: headLeftChildren }),
                new TableCell({ borders: noBorders, width: { size: sigWidth, type: WidthType.DXA }, margins: sigCellMargins, verticalAlign: VerticalAlign.TOP, children: headDateChildren })
            ] })]
        });

        // ── Copy list + approval-person signature (two-column borderless table) ──
        // Left cell: অনুলিপি list only (prefix + title moved to the head above).
        const leftCellChildren: Paragraph[] = [];
        // One numbered list in the user-chosen অনুলিপি order (auto + footer merged) —
        // the exact order the on-screen preview and PDF use, so all three stay in step.
        this.copyLines.forEach((l) => {
            leftCellChildren.push(new Paragraph({
                children: [new TextRun({ text: `${l.no}।\t${l.text}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                spacing: { after: 40 },
                tabStops: [{ type: TabStopType.LEFT, position: 400 }]
            }));
        });

        // Right cell: approval person's digital signature + name/rank/appointment
        const approvalPersonNameText = (bn ? this.approvalPersonNameBN : this.approvalPersonName) || this.approvalPersonName || '...................................';
        const approvalPersonRankText = (bn ? this.approvalPersonRankBN : this.approvalPersonRank) || this.approvalPersonRank || '............................';
        const approvalPersonApptText = (bn ? this.approvalPersonAppointmentBN : this.approvalPersonAppointment) || this.approvalPersonAppointment || '............................';
        const sigCellChildren: Paragraph[] = [];

        // Embed approval person's digital signature image — ONLY after the order is approved.
        if (this.approvalPersonSignatureUrl && this.isApproved) {
            try {
                const base64Data = this.approvalPersonSignatureUrl.split(',')[1];
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                    bytes[j] = binaryString.charCodeAt(j);
                }
                sigCellChildren.push(new Paragraph({
                    children: [new ImageRun({ data: bytes, transformation: { width: 130, height: 40 }, type: 'png' })],
                    keepNext: true, keepLines: true
                }));
            } catch (e) {
                console.warn('Failed to embed approval person signature image in Word export', e);
            }
        }

        sigCellChildren.push(
            new Paragraph({ children: [new TextRun({ text: approvalPersonNameText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: approvalPersonRankText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepNext: true, keepLines: true }),
            new Paragraph({ children: [new TextRun({ text: approvalPersonApptText, size: ctxSize, sizeComplexScript: csSize, font, language: lang })], keepLines: true })
        );

        const copySigTable = new Table({
            width: { size: contentWidth, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: [leftWidth, sigWidth],
            borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
            rows: [new TableRow({ cantSplit: true, children: [
                new TableCell({ borders: noBorders, width: { size: leftWidth, type: WidthType.DXA }, margins: zeroMargins, children: leftCellChildren }),
                new TableCell({ borders: noBorders, width: { size: sigWidth,  type: WidthType.DXA }, margins: sigCellMargins, verticalAlign: VerticalAlign.BOTTOM, children: sigCellChildren })
            ] })]
        });

        const pageWidth = this.selectedPageSize === 'legal' ? 12240 : 11906;
        const pageHeight = this.selectedPageSize === 'legal' ? 20160 : 16838;

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: {
                    page: {
                        size: { orientation: PageOrientation.PORTRAIT, width: pageWidth, height: pageHeight },
                        margin: { top: 567, right: 567, bottom: 567, left: 567 },
                    }
                },
                children: [
                    ...headerParas, titlePara, orderLine, ...referenceParas,
                    ...postingTextParas,
                    new Paragraph({ spacing: { before: 100 } }),
                    empTable,
                    new Paragraph({ spacing: { before: 100 } }),
                    ...masterRemarksParas,
                    ...(masterRemarksParas.length > 0 && subTextParas.length > 0
                        ? [new Paragraph({ spacing: { before: 100 } })]
                        : []),
                    ...subTextParas,
                    ...sigParas, new Paragraph({ spacing: { before: 300 }, keepNext: true }), copyHeadTable, copySigTable
                ]
            }]
        });
    }

}
