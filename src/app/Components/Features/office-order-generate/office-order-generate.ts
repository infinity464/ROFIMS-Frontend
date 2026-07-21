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
import { mainTextBlocksToHtml } from '@/shared/utils/notesheet-main-text';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { ApprovedNoteSheetItem } from '@/models/posting.model';
import { PostingOrderNumberConfigModel } from '@/Components/basic-setup/shared/models/posting-order-number-config';
import { CodeType, PostingType } from '@/models/enums';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { FileReferencesFormComponent, FileRowData } from '@/Components/Common/file-references-form/file-references-form';
import { EmpService } from '@/services/emp-service';

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
        FileReferencesFormComponent
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
    bodyText = '';
    fileRows: FileRowData[] = [];
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
        private identityService: IdentityService,
        private identityMappingService: IdentityUserMappingService,
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
                this.selectedTextType = data.textType === 'bn' ? 'bn' : 'en';
                this.letterDate = data.letterDate ? new Date(data.letterDate) : new Date();
                this.manualLetterNo = data.letterNo ?? '';
                this.subject = data.subject ?? '';
                this.addressTo = data.addressTo ?? '';
                this.bodyText = data.body ?? '';
                this.remarks = data.remarks ?? '';
                this.selectedApprovalEmployeeId = data.approvalEmployeeId ?? null;

                // NoteSheet — add to dropdown if not already present, then select
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
                }

                // Reference entries
                try { this.referenceEntries = data.referenceNo ? JSON.parse(data.referenceNo) : []; } catch { this.referenceEntries = []; }

                // Onulipi
                try { this.onulipiParagraphs = data.onulipi ? JSON.parse(data.onulipi) : []; } catch { this.onulipiParagraphs = []; }

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
                this.approvalEmployees = this.buildApprovalOptions(
                    Array.isArray(users) ? users : [],
                    Array.isArray(mappings) ? mappings : []
                );
                this.loadingApprovalEmployees = false;
            },
            error: () => { this.loadingApprovalEmployees = false; }
        });
    }

    private buildApprovalOptions(userList: any[], mappingList: any[]): { label: string; value: number }[] {
        const userEmpMap = new Map<string, number>();
        for (const m of mappingList) {
            const empId = m.employeeId ?? m.EmployeeId;
            const uid = m.userId ?? m.UserId;
            if (uid && typeof empId === 'number' && empId > 0) userEmpMap.set(uid, empId);
        }
        const pick = (o: any, ...keys: string[]): string | null => {
            for (const k of keys) { const v = o?.[k]; if (v != null && String(v).trim() !== '') return String(v); }
            return null;
        };
        const opts: { label: string; value: number }[] = [];
        for (const u of userList) {
            const empId = userEmpMap.get(u.id);
            if (!empId) continue;
            const m = mappingList.find((x: any) => (x.userId ?? x.UserId) === u.id);
            const appointment = pick(m, 'appointment', 'Appointment');
            const norm = (appointment ?? '').trim().toLowerCase();
            if (!norm || norm === 'n/a' || norm === 'na' || norm === 'not applicable') continue;
            const name = pick(m, 'employeeName', 'EmployeeName') || u.userName;
            const rank = pick(m, 'rank', 'Rank');
            const serviceId = pick(m, 'serviceId', 'ServiceId');
            const rabId = pick(m, 'rabID', 'rABID', 'rabid', 'RABID', 'RabID');
            let head = [rank, name].filter(Boolean).join(' ');
            if (appointment) head = head ? `${head} (${appointment})` : `(${appointment})`;
            opts.push({ label: [head, serviceId ? `SVC: ${serviceId}` : '', rabId ? `RAB: ${rabId}` : ''].filter(Boolean).join(' | '), value: empId });
        }
        return opts.sort((a, b) => a.label.localeCompare(b.label));
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
            .filter((c) => c.postingType === PostingType.General && c.status)
            .map((c) => {
                const prefixLabel = isBN ? (c.prefixBN || c.prefix) : c.prefix;
                const yearReset = c.currentYear !== nowYear || c.currentMonth !== nowMonth;
                const nextNum = yearReset ? c.startNumber : c.currentNumber + 1;
                let yearStr = String(nowYear);
                let monthStr = String(nowMonth).padStart(2, '0');
                let numStr = String(nextNum);
                if (isBN) {
                    yearStr = this.toBanglaDigits(yearStr);
                    monthStr = this.toBanglaDigits(monthStr);
                    numStr = this.toBanglaDigits(numStr);
                }
                const previewNo = c.includeDate
                    ? `${prefixLabel}/${yearStr}/${monthStr}/${numStr}`
                    : `${prefixLabel}/${numStr}`;
                const memberTypeLabel = (c.memberTypeIds ?? '').split(',').filter(Boolean)
                    .map(id => this.memberTypeMap[+id]).filter(Boolean).join(', ');
                const memberTypeSuffix = memberTypeLabel ? `  ${memberTypeLabel}` : '';
                return {
                    label: `${previewNo}${memberTypeSuffix}`,
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
                // Main Text is a JSON array of blocks — flatten to combined HTML for the office-order body.
                this.bodyText = mainTextBlocksToHtml(ns.mainText ?? ns.MainText);
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

    onGenerate(): void {
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

            const saveObs = this.editMode && this.editId
                ? this.officeOrderService.updateOfficeOrder({
                    id: this.editId,
                    letterNo: this.manualLetterNo || '',
                    letterDate: this.formatDateToString(this.letterDate),
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyText?.trim() || null,
                    onulipi: onulipiJson,
                    textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
                    filesReferences: filesReferencesJson,
                    remarks: this.remarks || null,
                    updatedBy: 'system',
                    approvalEmployeeId: this.selectedApprovalEmployeeId ?? null
                })
                : this.officeOrderService.createOfficeOrder({
                    letterNo: '',
                    letterDate: this.formatDateToString(this.letterDate),
                    noteSheetId: this.selectedNoteSheetId!,
                    subject: this.subject || null,
                    addressTo: this.addressTo?.trim() || null,
                    referenceNo: refJson,
                    body: this.bodyText?.trim() || null,
                    onulipi: onulipiJson,
                    textType: this.selectedTextType === 'bn' ? 'bn' : 'en',
                    filesReferences: filesReferencesJson,
                    remarks: this.remarks || null,
                    createdBy: 'system',
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
