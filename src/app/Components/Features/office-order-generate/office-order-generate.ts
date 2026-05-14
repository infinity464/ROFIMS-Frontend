import { Component, OnInit, inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
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
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApprovedNoteSheetItem } from '@/models/posting.model';
import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { CodeType } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

/** Reference No paragraph entry. */
interface ReferenceNoEntry {
    serial: string;
    text: string;
}

/** Attachment paragraph entry. */
interface AttachmentEntry {
    serial: number;
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
        TooltipModule
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './office-order-generate.html',
    styleUrl: './office-order-generate.scss'
})
export class OfficeOrderGenerateComponent implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    private noteSheetApi = `${environment.apis.core}/NoteSheetInfo`;

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
    bodyText = '';
    attachmentEntries: AttachmentEntry[] = [];
    onulipiParagraphs: OnulipiParagraph[] = [];
    remarks = '';
    saving = false;

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

    constructor(
        private officeOrderService: OfficeOrderService,
        private masterBasicSetupService: MasterBasicSetupService,
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

        this.letterDate = new Date();
        this.loadApprovalEmployees();
        this.loadNumberConfigs();
        this.loadApprovedNoteSheets();
    }

    loadApprovalEmployees(): void {
        this.loadingApprovalEmployees = true;
        this.officeOrderService.getApprovalEmployees().subscribe({
            next: (list) => {
                this.approvalEmployees = list ?? [];
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
                this.allConfigs = configs ?? [];
                this.rebuildConfigOptions();
            },
            error: () => {}
        });
    }

    private rebuildConfigOptions(): void {
        const isBN = this.selectedTextType === 'bn';
        const now = new Date();
        const nowYear = now.getFullYear();
        const nowMonth = now.getMonth() + 1;
        this.configOptions = this.allConfigs
            .filter((c) => c.postingType === 'OfficeOrder' && c.status)
            .map((c) => {
                const prefixLabel = isBN ? (c.prefixBN || c.prefix) : c.prefix;
                const yearReset = c.currentYear !== nowYear || c.currentMonth !== nowMonth;
                const nextNum = yearReset ? c.startNumber : c.currentNumber + 1;
                const yearStr = String(nowYear);
                const monthStr = String(nowMonth).padStart(2, '0');
                const previewNo = c.includeDate
                    ? `${prefixLabel}/${yearStr}/${monthStr}/${nextNum}`
                    : `${prefixLabel}/${nextNum}`;
                const memberTypeLabel = this.memberTypeMap[c.memberTypeId] ? ` — ${this.memberTypeMap[c.memberTypeId]}` : '';
                return {
                    label: `${previewNo}${memberTypeLabel}`,
                    value: c.configId
                };
            });
    }

    get noteSheetDropdownOptions() {
        return this.approvedNoteSheets.map(ns => ({
            label: ns.noteSheetNo,
            value: ns.noteSheetId
        }));
    }

    /** When a notesheet is selected, auto-fill Subject and TextType. */
    onNoteSheetChange(): void {
        this.selectedNoteSheetNo = null;
        this.selectedNoteSheetApprovedDate = null;
        this.subject = '';
        if (!this.selectedNoteSheetId) return;

        this.http.get<any>(`${this.noteSheetApi}/GetFilteredByKeysAsyn/${this.selectedNoteSheetId}`).subscribe({
            next: (data) => {
                const ns = Array.isArray(data) ? data[0] : data;
                if (!ns) return;

                this.selectedNoteSheetNo = ns.noteSheetNo;
                this.selectedNoteSheetApprovedDate = ns.finalApprovalApprovedDate ?? ns.lastupdate;
                this.selectedTextType = (ns.textType === 1 || ns.textType === '1') ? 'bn' : 'en';
                this.subject = ns.subject ?? '';
                this.postingOrderNumberConfigId = null;
                this.rebuildConfigOptions();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load notesheet details.' });
            }
        });
    }

    // ─── Reference No entries ───────────────────────────
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

    // ─── Attachment entries ─────────────────────────────
    addAttachmentEntry(): void {
        this.attachmentEntries.push({ serial: this.attachmentEntries.length + 1, text: '' });
    }

    removeAttachmentEntry(index: number): void {
        this.attachmentEntries.splice(index, 1);
        this.attachmentEntries.forEach((e, i) => { e.serial = i + 1; });
    }

    // ─── Onulipi paragraphs ────────────────────────────
    addOnulipiParagraph(): void {
        this.onulipiParagraphs.push({ text: '', transferRabUnitId: null, transferRabUnitName: null });
    }

    removeOnulipiParagraph(index: number): void {
        this.onulipiParagraphs.splice(index, 1);
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

    onGenerate(): void {
        if (!this.selectedNoteSheetId) {
            this.messageService.add({ severity: 'warn', summary: this.isBangla ? 'সতর্কতা' : 'Warning', detail: this.isBangla ? 'নোটশীট নির্বাচন করুন।' : 'Please select a notesheet.' });
            return;
        }
        if (!this.selectedApprovalEmployeeId) {
            this.messageService.add({ severity: 'warn', summary: this.isBangla ? 'সতর্কতা' : 'Warning', detail: this.isBangla ? 'অনুমোদনকারী নির্বাচন করুন।' : 'Please select an approval person.' });
            return;
        }

        this.saving = true;

        const refJson = this.referenceEntries.filter(e => e.text.trim()).length > 0
            ? JSON.stringify(this.referenceEntries.filter(e => e.text.trim()))
            : null;
        const attachJson = this.attachmentEntries.filter(e => e.text.trim()).length > 0
            ? JSON.stringify(this.attachmentEntries.filter(e => e.text.trim()))
            : null;
        const onulipiJson = this.onulipiParagraphs.filter(p => p.text.trim()).length > 0
            ? JSON.stringify(this.onulipiParagraphs.filter(p => p.text.trim()).map(p => ({
                text: p.text.trim(),
                transferRabUnitId: p.transferRabUnitId,
                transferRabUnitName: p.transferRabUnitName
            })))
            : null;

        this.officeOrderService.createOfficeOrder({
            letterNo: this.manualLetterNo.trim(),
            letterDate: this.formatDateToString(this.letterDate),
            noteSheetId: this.selectedNoteSheetId,
            subject: this.subject || null,
            addressTo: this.addressTo?.trim() || null,
            referenceNo: refJson,
            body: this.bodyText?.trim() || null,
            attachment: attachJson,
            onulipi: onulipiJson,
            textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
            remarks: this.remarks || null,
            createdBy: 'system',
            postingOrderNumberConfigId: this.postingOrderNumberConfigId ?? null,
            approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
        }).subscribe({
            next: (res) => {
                this.saving = false;
                if (res.statusCode === 200) {
                    this.messageService.add({ severity: 'success', summary: this.isBangla ? 'সফল' : 'Success', detail: this.isBangla ? 'অফিস আদেশ সফলভাবে তৈরি হয়েছে।' : 'Office Order generated successfully.' });
                    // Reset form
                    this.manualLetterNo = '';
                    this.selectedNoteSheetId = null;
                    this.selectedNoteSheetNo = null;
                    this.selectedNoteSheetApprovedDate = null;
                    this.subject = '';
                    this.addressTo = '';
                    this.referenceEntries = [];
                    this.bodyText = '';
                    this.attachmentEntries = [];
                    this.onulipiParagraphs = [];
                    this.remarks = '';
                    this.letterDate = new Date();
                    this.postingOrderNumberConfigId = null;
                    this.selectedApprovalEmployeeId = null;
                    const newId = (res as any)?.data;
                    if (newId != null) {
                        this.router.navigate(['/office-order/preview'], { queryParams: { id: newId } });
                    }
                } else {
                    this.messageService.add({ severity: 'error', summary: 'Error', detail: res.description ?? 'Failed to generate office order.' });
                }
            },
            error: (err) => {
                this.saving = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.description ?? 'Failed to generate office order.' });
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

}
