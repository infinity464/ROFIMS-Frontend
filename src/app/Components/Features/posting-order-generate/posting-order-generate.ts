import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
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
import { MessageService, ConfirmationService } from 'primeng/api';
import { environment } from '@/Core/Environments/environment';
import { PostingService } from '@/services/posting.service';
import { ApprovedNoteSheetItem, PostingOrderMasterDto } from '@/models/posting.model';
import { NoteSheetType } from '@/models/enums';
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
    spousePresentDistrictName: string | null;
    spousePresentDistrictNameBN: string | null;
    motherOrgLocationName: string | null;
    motherOrgLocationNameBN: string | null;
    previousRabUnits: string | null;
    previousRabUnitsBN: string | null;
    transferRabUnitId: number | null;
    transferRabUnitName: string | null;
    transferRabUnitNameBN: string | null;
    remarks: string | null;
    joiningDateInRAB: string | null;
}

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
        TooltipModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './posting-order-generate.html',
    styleUrl: './posting-order-generate.scss'
})
export class PostingOrderGenerateComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    private noteSheetApi = `${environment.apis.core}/NoteSheetInfo`;

    postingTypeOptions = [
        { label: 'New Posting', value: NoteSheetType.NewPosting },
        { label: 'Inter Posting', value: NoteSheetType.InterPosting }
    ];

    selectedPostingType: string | null = null;
    approvedNoteSheets: ApprovedNoteSheetItem[] = [];
    selectedNoteSheetId: number | null = null;
    employees: NoteSheetEmployee[] = [];
    loadingNoteSheets = false;
    loadingEmployees = false;
    saving = false;

    // ─── Generated Posting Orders list (toggleable) ──────
    showGeneratedList = false;
    generatedOrders: PostingOrderMasterDto[] = [];
    loadingGeneratedOrders = false;

    /** NoteSheet info displayed above employee table. */
    selectedNoteSheetNo: string | null = null;
    selectedNoteSheetApprovedDate: string | null = null;

    // ─── New form fields ──────────────────────────────────
    postingOrderDate: Date | null = null;
    remarks = '';
    selectedTextType = 'en';
    /** Single plain-text paragraph that appears below the employee table and above the Onulipi section. */
    postingText = '';
    footerParagraphs: FooterParagraph[] = [];

    /** true = Bangla, false = English */
    get isBangla(): boolean {
        return this.selectedTextType === 'bn';
    }

    /** Convert ASCII digits in a string to Bangla digits. */
    toBanglaDigits(s: string): string {
        return s.replace(/\d/g, d => String.fromCharCode(0x09E6 + Number(d)));
    }

    /** RAB ID — Bangla digits when text type is Bangla, else as-is. */
    empRabId(row: NoteSheetEmployee): string {
        const id = row.rabID || '';
        if (!id) return '-';
        return this.isBangla ? this.toBanglaDigits(id) : id;
    }

    /** Unique transfer (RAB) units derived from currently loaded employees. */
    get availableTransferUnits(): TransferUnitOption[] {
        const map = new Map<number, string>();
        for (const e of this.employees) {
            if (e.transferRabUnitId != null && !map.has(e.transferRabUnitId)) {
                map.set(e.transferRabUnitId, e.transferRabUnitName ?? '');
            }
        }
        return Array.from(map, ([id, name]) => ({ id, name }));
    }

    /** True when more than one unique transfer unit exists across employees. */
    get hasMultipleTransferUnits(): boolean {
        return this.availableTransferUnits.length > 1;
    }

    constructor(
        private postingService: PostingService,
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

        this.postingOrderDate = new Date();
    }

    /** When posting type dropdown changes, load approved notesheets of that type
     *  (backend already excludes notesheets with a generated Posting Order). */
    onPostingTypeChange(): void {
        this.approvedNoteSheets = [];
        this.selectedNoteSheetId = null;
        this.employees = [];

        if (!this.selectedPostingType) return;

        this.loadingNoteSheets = true;
        this.postingService.getApprovedNoteSheetsByType(this.selectedPostingType).subscribe({
            next: (notesheets) => {
                this.approvedNoteSheets = notesheets ?? [];
                this.loadingNoteSheets = false;
                if (this.approvedNoteSheets.length === 0) {
                    this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No approved notesheets found for this type.' });
                }
            },
            error: (err) => {
                this.loadingNoteSheets = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'Failed to load notesheets.' });
            }
        });
    }

    /** Dropdown options for notesheet select. */
    get noteSheetDropdownOptions() {
        return this.approvedNoteSheets.map(ns => ({
            label: ns.noteSheetNo,
            value: ns.noteSheetId
        }));
    }

    /** When a notesheet is selected, load its employees and set textType from notesheet. */
    onNoteSheetChange(): void {
        this.employees = [];
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
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
                // Set textType from notesheet (TextType: 1 = Bangla, else English)
                this.selectedTextType = (ns.textType === 1 || ns.textType === '1') ? 'bn' : 'en';

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
                                spousePresentDistrictName: e.spousePresentDistrictName,
                                spousePresentDistrictNameBN: e.spousePresentDistrictNameBN,
                                motherOrgLocationName: e.motherOrgLocationName,
                                motherOrgLocationNameBN: e.motherOrgLocationNameBN,
                                previousRabUnits: e.previousRabUnits ?? null,
                                previousRabUnitsBN: e.previousRabUnitsBN ?? null,
                                transferRabUnitId: e.transferRabUnitId,
                                transferRabUnitName: e.transferRabUnitName,
                                transferRabUnitNameBN: e.transferRabUnitNameBN ?? null,
                                remarks: e.remarks,
                                joiningDateInRAB: e.joiningDateInRAB
                            }));
                            this.loadingEmployees = false;
                            // Reset footer paragraphs + posting text when a new notesheet is loaded
                            this.footerParagraphs = [];
                            this.postingText = '';
                        },
                        error: (err: any) => {
                            this.loadingEmployees = false;
                            this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load employees.' });
                        }
                    });
                } else {
                    this.loadingEmployees = false;
                    this.messageService.add({ severity: 'info', summary: 'Info', detail: 'No draft posting linked to this notesheet.' });
                }
            },
            error: (err: any) => {
                this.loadingEmployees = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load notesheet details.' });
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

    /** Add a new footer paragraph. If only one transfer unit exists, auto-link it. */
    addFooterParagraph(): void {
        const units = this.availableTransferUnits;
        const onlyUnit = units.length === 1 ? units[0] : null;
        this.footerParagraphs.push({
            text: '',
            transferRabUnitId: onlyUnit ? onlyUnit.id : null,
            transferRabUnitName: onlyUnit ? onlyUnit.name : null
        });
    }

    removeFooterParagraph(index: number): void {
        this.footerParagraphs.splice(index, 1);
    }

    /** Keep transferRabUnitName in sync when the user picks a unit from the dropdown. */
    onFooterUnitChange(index: number): void {
        const para = this.footerParagraphs[index];
        if (!para) return;
        const match = this.availableTransferUnits.find(u => u.id === para.transferRabUnitId);
        para.transferRabUnitName = match ? match.name : null;
    }

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
        if (!this.selectedPostingType || !this.selectedNoteSheetId || this.employees.length === 0) {
            this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Select posting type, notesheet and ensure employees exist.' });
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

        this.postingService.createPostingOrder({
            postingOrderNo: '',  // auto-generated by backend
            postingOrderDate: this.formatDateToString(this.postingOrderDate),
            postingType: this.selectedPostingType!,
            noteSheetId: this.selectedNoteSheetId,
            textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
            mainText: mainText,
            remarks: this.remarks || null,
            footerText: footerText,
            employeeIds: this.employees.map(e => e.employeeId),
            createdBy: 'system'
        }).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Posting Order generated successfully.' });
                    // Reset form
                    this.employees = [];
                    this.selectedNoteSheetId = null;
                    this.selectedNoteSheetNo = null;
                    this.selectedNoteSheetApprovedDate = null;
                    this.remarks = '';
                    this.footerParagraphs = [];
                    this.postingText = '';
                    this.postingOrderDate = new Date();
                    // Refresh the generated list if it's currently visible
                    if (this.showGeneratedList) {
                        this.loadGeneratedOrders();
                    }
                    // Navigate to the preview page for the newly created posting order
                    const newId = (res as any)?.data;
                    if (newId != null) {
                        this.router.navigate(['/posting/posting-order-preview'], { queryParams: { id: newId } });
                    }
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to generate posting order.' });
                }
            },
            error: (err) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to generate posting order.' });
            }
        });
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
                this.generatedOrders = (data ?? []).slice().sort((a, b) => {
                    const ad = a.createdDate ? new Date(a.createdDate).getTime() : 0;
                    const bd = b.createdDate ? new Date(b.createdDate).getTime() : 0;
                    return bd - ad;
                });
                this.loadingGeneratedOrders = false;
            },
            error: (err: any) => {
                this.loadingGeneratedOrders = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load generated posting orders.' });
            }
        });
    }

    viewGeneratedOrder(order: PostingOrderMasterDto): void {
        this.router.navigate(['/posting/posting-order-preview'], { queryParams: { id: order.id } });
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
}
