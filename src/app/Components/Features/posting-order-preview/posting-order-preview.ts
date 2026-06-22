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
import { OrgService } from '@/Components/basic-setup/org-tree/org.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { EmployeeListService } from '@/services/employee-list.service';
import { PostingOrderEmployeeRow, EmployeeRemovalInfo, CancelledInterPostingInfo } from '@/models/posting.model';
import { EmployeeList } from '@/models/employee-list.model';
import { NoteSheetType, IsSendingNotesheetStatus, ApprovalStatus } from '@/models/enums';
import { HttpClient } from '@angular/common/http';
import { JsReportService } from '@/services/jsreport.service';
import { environment } from '@/Core/Environments/environment';
import { firstValueFrom } from 'rxjs';
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
        { label: 'A4', value: 'A4' },
        { label: 'Legal', value: 'Legal' }
    ];
    selectedPageSize = 'A4';

    // ── অনুলিপি paragraph checkboxes ────────────────────────
    showOnulipiFilter = false;
    paragraphChecked: boolean[] = [];

    // ── পূর্ববতী কর্মস্থল unit visibility ───────────────────
    showPrevWorkplaceFilter = false;
    showPrevWorkplaceUnit = true;
    showTransferUnitsCopy = true;

    // ── নিজ জেলা column visibility ───────────────────
    showOwnDistrict = true;
    showRemarks = true;
    showUpperSignature = true;

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
        private jsreportService: JsReportService
    ) {}

    ngOnInit(): void {
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
        return (this.isBangla ? (emp.permanentDistrictNameBN || emp.permanentDistrictName) : emp.permanentDistrictName) || '';
    }

    empPrevWorkplace(emp: PostingOrderEmployeeRow): string {
        return (this.isBangla ? (emp.motherUnitNameBN || emp.motherUnitName) : emp.motherUnitName) || '';
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
     * Auto-generated অনুলিপি (copy-to) lines derived from the employees' transfer
     * destination units. Hard-coded RAB rules:
     *   • র‍্যাব সদর দপ্তর (HQ) → show the WING name (segment under HQ), not "সদর দপ্তর",
     *     prefixed "পরিচালক/" — this line comes FIRST.
     *   • র‍্যাব-N battalions → prefixed "অধিনায়ক/", slash-joined — comes next.
     *   • Any other unit → shown plainly (top-level name), comma-joined.
     * Each group is de-duplicated; empty groups are omitted.
     */
    get autoCopyLines(): string[] {
        const bn = this.isBangla;
        const hqWings: string[] = [];
        const hqSeen = new Set<string>();
        const rabUnits: string[] = [];
        const rabSeen = new Set<string>();
        const others: string[] = [];
        const otherSeen = new Set<string>();

        for (const emp of this.filteredEmployees) {
            const full = (bn ? (emp.transferRabUnitNameBN || emp.transferRabUnitName) : emp.transferRabUnitName) || '';
            if (!full) continue;
            const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
            if (!parts.length) continue;
            const top = parts[0];

            // HQ comes straight from the view (TransferIsHq); name heuristic is only a
            // fallback if the view hasn't been refreshed with the flag yet.
            if (emp.transferIsHq ?? this.isRabHq(top)) {
                const wing = parts[1] || top; // segment directly under HQ
                if (!hqSeen.has(wing)) { hqSeen.add(wing); hqWings.push(wing); }
            } else if (this.isRabBattalion(top)) {
                if (!rabSeen.has(top)) { rabSeen.add(top); rabUnits.push(top); }
            } else {
                if (!otherSeen.has(top)) { otherSeen.add(top); others.push(top); }
            }
        }

        const lines: string[] = [];
        if (hqWings.length) lines.push(`${bn ? 'পরিচালক' : 'Director'}/ ${hqWings.join('/ ')}`);
        if (rabUnits.length) lines.push(`${bn ? 'অধিনায়ক' : 'Commanding Officer'}/ ${rabUnits.join('/ ')}`);
        if (others.length) lines.push(others.join(', '));
        return lines;
    }

    /** Number of auto copy-lines actually rendered (0 when hidden) — footer paragraphs continue after this. */
    get autoCopyOffset(): number {
        return this.showTransferUnitsCopy ? this.autoCopyLines.length : 0;
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

        this.editApprovalEmployeeId = this.approvalEmployeeId;
        this.loadApprovalEmployees();
        this.loadAddMemberList();
        this.loadAddMemberUnitTree();
        this.editing = true;
    }

    private loadApprovalEmployees(): void {
        if (this.approvalEmployees.length > 0) return;
        this.loadingApprovalEmployees = true;
        this.postingService.getApprovalEmployees().subscribe({
            next: (list) => {
                this.approvalEmployees = list ?? [];
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
        // The "previous posting cancelled" note refers to an EARLIER order, so
        // skip it when the cancelled order is the one being previewed.
        const cancelled = this.cancelledInterMap[emp.employeeId];
        let cancelNote = '';
        if (cancelled?.postingOrderNo && cancelled.postingOrderNo !== this.postingOrderNo) {
            cancelNote = this.isInterPosting
                ? (this.isBangla ? 'পূর্ববর্তী বদলির আদেশ বাতিল করা হলো।' : 'Previous transfer order cancelled.')
                : (this.isBangla ? 'পূর্ববর্তী পোস্টিং থেকে বাদ দেওয়া হয়েছে।' : 'Removed from previous posting.');
        }
        return [base, emp.noteSheetRemarks, this.getRemovalRemark(emp), cancelNote]
            .filter(s => s?.trim()).join(', ');
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
            referenceNumber: this.referenceNumber || null,
            subject: this.subject || null,
            mainText: mainText,
            subText: subText,
            textType: this.textType || (this.isBangla ? 'bn' : 'en'),
            status: this.status || null,
            remarks: this.editRemarks || null,
            footerText: footerText,
            employeeIds: this.editEmployees.map(e => e.employeeId),
            updatedBy: 'system',
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
            const { html, chrome } = this.buildJsReportPdf();
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
            const { html, chrome } = this.buildJsReportPdf();
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
    private buildJsReportPdf(): { html: string; chrome: Record<string, unknown> } {
        const styles = this.collectDocumentStyles();
        const body = this.legalPaper.nativeElement.innerHTML;
        const isLegal = this.selectedPageSize === 'Legal';
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
    font-family: 'Times New Roman', 'Noto Sans Bengali', 'SolaimanLipi', Times, serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #000;
}
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
                for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
            } catch { /* cross-origin — skip */ }
        }
        return out.join('\n');
    }

    // ─── Shared Word Document Builder ─────────────────────

    private buildWordDocument(): Document {
        const bn = this.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 16 : undefined;   // 8pt for order context
        const hdrSize = 18;                     // 9pt for header
        const hdrCsSize = bn ? 18 : undefined;
        const tblSize = 14;                     // 7pt for table content
        const tblCsSize = bn ? 14 : undefined;
        const ctxSize = 16;                     // 8pt for order context
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Government Header (11pt, bold, centered) ──
        const headerLines = bn
            ? ['গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', 'বাংলাদেশ পুলিশ', 'র‌্যাব ফোর্সেস সদর দপ্তর', 'কুর্মিটোলা, ঢাকা']
            : ['Government of the Peoples Republic of Bangladesh', 'Bangladesh Police', 'RAB Forces Headquarters', 'Kurmitola, Dhaka'];

        const headerParas = headerLines.map(line => new Paragraph({
            children: [new TextRun({ text: line, bold: true, size: hdrSize, sizeComplexScript: hdrCsSize, font, language: lang })],
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
                new TextRun({ text: bn ? 'ফোর্স অর্ডার নং: ' : 'Force Order No: ', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.postingOrderNo, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: '\t', font }),
                new TextRun({ text: bn ? 'তারিখ: ' : 'Date: ', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.previewDate, size: ctxSize, sizeComplexScript: csSize, font, language: lang })
            ],
            spacing: { after: 80 }
        });

        // ── Reference / সূত্র : linked Note-Sheet No + final approval date ──
        const referenceParas: Paragraph[] = this.referenceLine ? [new Paragraph({
            children: [
                new TextRun({ text: bn ? 'সূত্রঃ ' : 'Reference: ', bold: true, size: ctxSize, sizeComplexScript: csSize, font, language: lang }),
                new TextRun({ text: this.referenceLine, size: ctxSize, sizeComplexScript: csSize, font, language: lang })
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
        const cols = isInter
            ? (bn ? ['ক্রমিক', 'ব্যক্তিগত নং', 'পদবি', 'নাম', ...(sd ? ['নিজ জেলা'] : []), ...(sp ? ['পূর্ববতী কর্মস্থল'] : []), 'বদলিকৃত কর্মস্থল', ...(sr ? ['মন্তব্য'] : [])]
                   : ['Ser', 'Service ID', 'Rank', 'Name', ...(sd ? ['Own District'] : []), ...(sp ? ['Previous Workplace'] : []), 'Transfer Station', ...(sr ? ['Remarks'] : [])])
            : (bn ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', ...(sd ? ['নিজ জেলা'] : []), ...(sp ? ['পূর্ববতী কর্মস্থল'] : []), 'বদলিকৃত কর্মস্থল', 'র‌্যাব আইডি', ...(sr ? ['মন্তব্য'] : [])]
                   : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', ...(sd ? ['Own District'] : []), ...(sp ? ['Previous Workplace'] : []), 'Transfer Unit', 'RAB ID', ...(sr ? ['Remarks'] : [])]);
        // Column widths in DXA – must sum to full content width (page 12240 - margins 567*2 = 11106)
        const buildColW = (): number[] => {
            if (isInter) {
                const base = [500, 1050, 900];
                const rem = 11106 - 500 - 1050 - 900;
                const optCols = (sd ? 1 : 0) + (sp ? 1 : 0) + (sr ? 1 : 0);
                const nameW = 2200;
                const transferW = 1500;
                const distW = sd ? 1200 : 0;
                const prevW = sp ? 1500 : 0;
                const remW = sr ? 1200 : 0;
                const fixedW = nameW + transferW + distW + prevW + remW;
                const adjust = rem - fixedW;
                return [...base, nameW + adjust, ...(sd ? [distW] : []), ...(sp ? [prevW] : []), transferW, ...(sr ? [remW] : [])];
            }
            const base = [580, 1100, 860, 924];
            const fixedSum = 580 + 1100 + 860 + 924;
            const nameW = 2800;
            const transferW = 1374;
            const rabIdW = 1160;
            const distW = sd ? 1200 : 0;
            const prevW = sp ? 1374 : 0;
            const remW = sr ? 1100 : 0;
            const usedW = fixedSum + nameW + transferW + rabIdW + distW + prevW + remW;
            const adjust = 11106 - usedW;
            return [...base, nameW + adjust, ...(sd ? [distW] : []), ...(sp ? [prevW] : []), transferW, rabIdW, ...(sr ? [remW] : [])];
        };
        const colW = buildColW();

        const hdrPara = (text: string) => new Paragraph({ children: [new TextRun({ text, bold: true, size: tblSize, sizeComplexScript: tblCsSize, font, language: lang })], alignment: AlignmentType.CENTER });
        const hdrCell = (text: string, ci: number, extra?: Partial<ConstructorParameters<typeof TableCell>[0]>) => new TableCell({
            children: [hdrPara(text)], borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }, ...extra
        });

        const headerRows = [new TableRow({ tableHeader: true, children: cols.map((col, ci) => hdrCell(col, ci)) })];

        const nameIdx = isInter ? 3 : 4;   // নাম column index (left-aligned)
        const dataRows = this.filteredEmployees.map((emp, i) => {
            const serial = bn ? this.toBanglaDigits(String(i + 1)) : String(i + 1);
            const vals = isInter
                ? [
                    serial, this.empServiceId(emp), this.empRank(emp), this.empName(emp),
                    ...(sd ? [this.empDistrict(emp)] : []),
                    ...(sp ? [this.empPrevWorkplace(emp)] : []),
                    this.empTransferUnit(emp),
                    ...(sr ? [this.empCombinedRemarks(emp)] : [])
                ]
                : [
                    serial, this.empServiceId(emp), this.empRank(emp), this.empTrade(emp), this.empName(emp),
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
                        alignment: ci === nameIdx ? AlignmentType.LEFT : AlignmentType.CENTER,
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
            width: { size: 11106, type: WidthType.DXA },
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
        const approverPhoneText = this.approverPhone || '...............';
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
        const contentWidth = this.selectedPageSize === 'Legal' ? 11106 : 10772;
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
        const autoLines = this.showTransferUnitsCopy ? this.autoCopyLines : [];
        autoLines.forEach((line, i) => {
            const serial = i + 1;
            leftCellChildren.push(new Paragraph({
                children: [new TextRun({ text: `${bn ? this.toBanglaDigits(String(serial)) : serial}। ${line}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                spacing: { after: 100 }
            }));
        });
        this.exportFooterParagraphs.forEach((p, i) => {
            const serial = i + 1 + autoLines.length;
            leftCellChildren.push(new Paragraph({
                children: [new TextRun({ text: `${bn ? this.toBanglaDigits(String(serial)) : serial}। ${p.text}`, size: ctxSize, sizeComplexScript: csSize, font, language: lang })],
                spacing: { after: 100 }
            }));
        });

        // Right cell: approval person's digital signature + name/rank/appointment
        const approvalPersonNameText = (bn ? this.approvalPersonNameBN : this.approvalPersonName) || this.approvalPersonName || '...................................';
        const approvalPersonRankText = (bn ? this.approvalPersonRankBN : this.approvalPersonRank) || this.approvalPersonRank || '............................';
        const approvalPersonApptText = (bn ? this.approvalPersonAppointmentBN : this.approvalPersonAppointment) || this.approvalPersonAppointment || '............................';
        const sigCellChildren: Paragraph[] = [];

        // Embed approval person's digital signature image if available
        if (this.approvalPersonSignatureUrl) {
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

        const pageWidth = this.selectedPageSize === 'Legal' ? 12240 : 11906;
        const pageHeight = this.selectedPageSize === 'Legal' ? 20160 : 16838;

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
