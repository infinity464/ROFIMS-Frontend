import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TableModule } from 'primeng/table';
import { PostingService } from '@/services/posting.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { PostingOrderEmployeeRow } from '@/models/posting.model';
import { NoteSheetType } from '@/models/enums';
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
        DatePickerModule, FlexibleDateDirective,
        InputTextModule,
        TextareaModule,
        TableModule
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

    // ─── Edit mode state ──────────────────────────────────
    editing = false;
    saving = false;
    editPostingOrderDate: Date | null = null;
    editRemarks = '';
    editPostingText = '';
    editFooterParagraphs: FooterParagraph[] = [];
    editEmployees: PostingOrderEmployeeRow[] = [];

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
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
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

                    this.rawFooterText = first.footerText ?? null;

                    // Parse footer paragraphs into FooterParagraph objects (keeps unit linkage for per-unit filtering).
                    this.footerParagraphs = this.parseFooterParagraphs(this.rawFooterText);

                    // Reset per-unit filter whenever a new order is loaded, then prime the memoized caches.
                    this.selectedFilterUnitId = null;
                    this.availableTransferUnits = this.computeTransferUnits(this.employees);
                    this.applyFilter();

                    // Load final approver info from notesheet
                    if (first.noteSheetId) {
                        this.loadApproverInfo(first.noteSheetId);
                    }
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
        return (this.isBangla ? (emp.motherOrgLocationNameBN || emp.motherOrgLocationName) : emp.motherOrgLocationName) || '';
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

    /** Can edit if status is Draft (or empty/unknown). */
    get canEdit(): boolean {
        const s = (this.status ?? '').toLowerCase();
        return s === '' || s === 'draft';
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
        this.editEmployees = [...this.employees];

        // Re-parse the raw footerText into full FooterParagraph objects (with unit linkage).
        this.editFooterParagraphs = this.parseFooterParagraphs(this.rawFooterText);

        this.editing = true;
    }

    cancelEdit(): void {
        this.editing = false;
        this.editPostingOrderDate = null;
        this.editRemarks = '';
        this.editPostingText = '';
        this.editFooterParagraphs = [];
        this.editEmployees = [];
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
                this.editEmployees = this.editEmployees.filter(e => e.employeeId !== emp.employeeId);
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
            ? ['ক্রমিক', 'ব্যক্তিগত নম্বর', 'পদবি', 'ট্রেড', 'নাম', 'নিজ জেলা', 'পূর্ববতী কর্মস্থল', 'বদলিকৃত কর্মস্থল', 'র‌্যাব আইডি', 'মন্তব্য']
            : ['Ser', 'Service ID', 'Rank', 'Trade', 'Name', 'Own District', 'Previous Workplace', 'Transfer Unit', 'RAB ID', 'Remarks'];
        // Column widths in DXA – must sum to full content width (page 12240 - margins 567*2 = 11106)
        //         Ser  SvcID  Rank  Trade  Name   OwnDist PrevWk TrUnit RabID Remarks
        const colW = [580, 1100, 860, 924, 2174, 1060, 1174, 1174, 1030, 1030];

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
                    ...[8,9].map(ci => new TableCell({ children: [new Paragraph({})], verticalMerge: VerticalMergeType.CONTINUE, borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA } }))
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
                this.empRabId(emp), emp.noteSheetRemarks ?? ''
            ].map((val, ci) => {
                const lines = val.split('\n');
                const cellParas = lines.map(line => new Paragraph({
                    children: [new TextRun({ text: line, size: 18, sizeComplexScript: bn ? 18 : undefined, font, language: lang })],
                    alignment: ci === 9 ? AlignmentType.LEFT : AlignmentType.CENTER,
                    spacing: { after: 20 }
                }));
                return new TableCell({
                    children: cellParas,
                    borders: cellBorders, width: { size: colW[ci], type: WidthType.DXA }
                });
            })
        }));

        // Master remarks row (spans all columns, left-aligned)
        const allRows = [...headerRows, ...dataRows];
        if (this.masterRemarks) {
            allRows.push(new TableRow({
                children: [new TableCell({
                    columnSpan: 10,
                    borders: cellBorders,
                    width: { size: 11106, type: WidthType.DXA },
                    children: [new Paragraph({
                        children: [new TextRun({ text: this.masterRemarks, size: 18, sizeComplexScript: bn ? 18 : undefined, font, language: lang })],
                        alignment: AlignmentType.LEFT,
                        spacing: { before: 40, after: 40 }
                    })]
                })]
            }));
        }

        const empTable = new Table({
            width: { size: 11106, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            indent: { size: 0, type: WidthType.DXA },
            rows: allRows,
            columnWidths: colW
        });

        // ── Posting Text (10pt, justified) – single paragraph (split on blank lines) ──
        const postingTextParas = this.postingText
            ? this.postingText.split(/\n{2,}/).filter(t => t.trim().length > 0).map(t => new Paragraph({
                children: [new TextRun({ text: t, size: 20, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 100, after: 100 }
            }))
            : [];

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
                children: [...headerParas, titlePara, orderLine, ...referenceParas, ...bodyParas, empTable, ...postingTextParas, ...sigParas, copyPara, ...footerParas]
            }]
        });
    }

}
