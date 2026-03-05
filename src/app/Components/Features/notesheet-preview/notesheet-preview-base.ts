import { inject, Injectable, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { catchError, of } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmpService } from '@/services/emp-service';
import { NoteSheetType, NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, ApprovalStatus } from '@/models/enums';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SignatoryDetail } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { PostingService } from '@/services/posting.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation, ImageRun
} from 'docx';
import { saveAs } from 'file-saver';

export interface NoteSheetInfoFull {
    noteSheetId: number;
    noteSheetNo: string;
    noteSheetDate: string;
    wingBattalionId?: number;
    branchId?: number;
    subject: string;
    noteSheetType?: string;
    referenceNumber?: string;
    draftPostingMasterId?: number | null;
    filesReferences?: string;
    mainText?: string;
    preparedBy?: string;
    textType?: number;
    unitId?: number;
    employeeId?: number;
    isSecret?: boolean;
    noteSheetOperationType?: string;
    // ── Initiator ──────────────────────────────────────────────────────
    initiatorId?: number;
    initiatorStatus?: string;
    initiatorApproveRemark?: string;
    initiatorCancelRemark?: string;
    initiatorApprovedDate?: string;
    // ── Recommenders (JSON array of objects) ───────────────────────────
    recommendersJson?: string;
    // ── Final Approval ─────────────────────────────────────────────────
    finalApprovalId?: number;
    finalApprovalStatus?: string;
    finalApprovalRemark?: string;
    finalApprovalCancelRemark?: string;
    finalApprovalApprovedDate?: string;
    // ── Workflow state ─────────────────────────────────────────────────
    currentStatus?: string;
    // ── Audit ──────────────────────────────────────────────────────────
    familyInfoJson?: string;
    createdBy?: string;
    lastUpdatedBy?: string;
    createdDate?: string;
    lastupdate?: string;
    isDeleted?: boolean;
    deletedBy?: string;
    // ── Leave (ExBD) ───────────────────────────────────────────────────
    purposeOfExBdLeaveId?: number | null;
    destinationCountryId?: number | null;
    dateOfVisitFrom?: string | null;
    dateOfVisitTo?: string | null;
    totalDays?: number | null;
    note?: string | null;
    preparedByEmployeeId?: number | null;
    // ── Legacy (kept for old cached data) ─────────────────────────────
    /** @deprecated use finalApprovalId */
    finalApproverId?: number;
    /** @deprecated use recommendersJson */
    recommenderIdsJson?: string;
    remark?: string;
}

export interface BackHistoryRow {
    id: number;
    noteSheetId: number;
    backedByEmployeeId: number;
    backedFromStatus: string;
    backedToStatus: string;
    backReason: string | null;
    backedDate: string;
    createdBy: string;
    /** Resolved at runtime */
    backedByName?: string;
}

@Injectable()
export abstract class NotesheetPreviewBase implements OnInit {

    protected readonly http           = inject(HttpClient);
    protected readonly route          = inject(ActivatedRoute);
    protected readonly router         = inject(Router);
    protected readonly messageService = inject(MessageService);
    protected readonly sanitizer      = inject(DomSanitizer);
    protected readonly empService          = inject(EmpService);
    protected readonly masterBasicSetup    = inject(MasterBasicSetupService);
    protected readonly postingService      = inject(PostingService);
    protected readonly servingMembersService = inject(ServingMembersService);

    protected readonly api = `${environment.apis.core}/NoteSheetInfo`;

    noteSheetId: number | null = null;
    noteSheet: NoteSheetInfoFull | null = null;
    loading = false;
    error = false;

    backHistory: BackHistoryRow[] = [];
    loadingBackHistory = false;

    initiatorDetails: SignatoryDetail | null = null;
    approversDetails: SignatoryDetail[] = [];
    preparedByDetails: SignatoryDetail | null = null;

    postingEmployees: DraftPostingEmployeeRow[] = [];
    loadingEmployees = false;

    purposeLabelMap: Record<number, string> = {};
    countryLabelMap: Record<number, string> = {};
    unitLabelMap: Record<number, string> = {};

    ngOnInit(): void {
        this.loadLookups();
        this.route.queryParams.subscribe(params => {
            const id = params['id'];
            if (id) {
                this.noteSheetId = +id;
                this.loadNoteSheet();
            } else {
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No note-sheet ID provided.' });
            }
        });
    }

    private loadLookups(): void {
        this.masterBasicSetup.getAllByType('PurposeOfExBDLeave').subscribe({
            next: (list) => {
                this.purposeLabelMap = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueEN; return acc; }, {} as Record<number, string>);
            }
        });
        this.masterBasicSetup.getAllByType('Country').subscribe({
            next: (list) => {
                this.countryLabelMap = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueEN; return acc; }, {} as Record<number, string>);
            }
        });
        this.masterBasicSetup.getAllByType('RabUnit').subscribe({
            next: (list) => {
                this.unitLabelMap = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueEN; return acc; }, {} as Record<number, string>);
            }
        });
    }

    protected loadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.loading = true;
        this.http.get<NoteSheetInfoFull[]>(`${this.api}/GetFilteredByKeysAsyn/${this.noteSheetId}`).subscribe({
            next: (data) => {
                const list = Array.isArray(data) ? data : [];
                this.noteSheet = list[0] ?? null;
                if (this.noteSheet) {
                    this.loadApprovalChain();
                    this.loadBackHistory();
                    if (this.isNewPosting() && this.noteSheet.draftPostingMasterId) {
                        this.loadPostingEmployees();
                    }
                } else {
                    this.error = true;
                }
                this.loading = false;
            },
            error: () => {
                this.error = true;
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load note-sheet.' });
            }
        });
    }

    private loadPostingEmployees(): void {
        if (!this.noteSheet?.draftPostingMasterId) return;
        this.loadingEmployees = true;
        this.postingService.getDraftPostingEmployees(this.noteSheet.draftPostingMasterId).subscribe({
            next: (list) => { this.postingEmployees = list ?? []; this.loadingEmployees = false; },
            error: () => { this.loadingEmployees = false; }
        });
    }

    protected loadApprovalChain(): void {
        if (!this.noteSheet) return;

        const preparedByEmpId = this.noteSheet.preparedByEmployeeId && this.noteSheet.preparedByEmployeeId > 0
            ? this.noteSheet.preparedByEmployeeId : null;
        const initiatorId = this.noteSheet.initiatorId && this.noteSheet.initiatorId > 0
            ? this.noteSheet.initiatorId : null;
        const approverIds: { empId: number; step: string }[] = [];

        try {
            // New format: recommendersJson (array of objects); legacy: recommenderIdsJson (array of IDs)
            const json = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
            if (json && typeof json === 'string') {
                const arr = JSON.parse(json) as any[];
                if (Array.isArray(arr)) {
                    arr.forEach((r, i) => {
                        const id = typeof r === 'number'
                            ? r
                            : (r.recomender_id ?? r.recomenderId ?? r.EmployeeId ?? r.employeeId);
                        if (id && id > 0) approverIds.push({ empId: id, step: `Recommender ${arr.length > 1 ? i + 1 : ''}`.trim() });
                    });
                }
            }
        } catch { /* ignore */ }

        const finalApproverEmpId = (this.noteSheet.finalApprovalId && this.noteSheet.finalApprovalId > 0)
            ? this.noteSheet.finalApprovalId
            : (this.noteSheet.finalApproverId && this.noteSheet.finalApproverId > 0 ? this.noteSheet.finalApproverId : null);
        if (finalApproverEmpId) approverIds.push({ empId: finalApproverEmpId, step: 'Final Approver' });

        const allIds = [
            ...(preparedByEmpId ? [{ empId: preparedByEmpId, step: 'Prepared by' }] : []),
            ...(initiatorId     ? [{ empId: initiatorId,     step: 'Initiator'    }] : []),
            ...approverIds
        ];

        if (allIds.length === 0) return;

        allIds.forEach(({ empId, step }) => {
            this.servingMembersService.getEmployeePersonalServiceOverview(empId)
                .pipe(catchError(() => of(null)))
                .subscribe({
                    next: (emp) => {
                        const detail: SignatoryDetail = {
                            step,
                            name:          emp?.nameEnglish  ?? '-',
                            nameBN:        emp?.nameBN       ?? '',
                            rabId:         emp?.rabId        ?? '-',
                            rank:          emp?.armyRank     ?? '-',
                            rankBN:        emp?.armyRankBN   ?? '',
                            serviceRank:   emp?.armyRank     ?? '-',
                            appointment:   emp?.appointment  ?? '',
                            appointmentBN: emp?.appointmentBN ?? '',
                            employeeId: empId
                        };

                        if (step === 'Prepared by') this.preparedByDetails = detail;
                        else if (step === 'Initiator') this.initiatorDetails = detail;
                        else this.approversDetails.push(detail);

                        this.loadSignature(detail);
                    }
                });
        });
    }

    private loadSignature(detail: SignatoryDetail): void {
        if (!detail.employeeId) return;
        this.empService.getSignatureBlob(detail.employeeId).subscribe({
            next: (blob) => {
                if (blob && blob.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => { detail.signatureDataUrl = reader.result as string; };
                    reader.readAsDataURL(blob);
                }
            },
            error: () => { /* no signature */ }
        });
    }

    // ─── Type Checks ─────────────────────────────────────────────────

    isEnglish(): boolean { return (this.noteSheet?.textType ?? 0) === 0; }
    isExBdLeave(): boolean { return this.noteSheet?.noteSheetType === NoteSheetType.ExBDLeave; }
    isNewPosting(): boolean { return this.noteSheet?.noteSheetType === NoteSheetType.NewPosting; }
    isApproved(): boolean {
        return this.noteSheet?.finalApprovalStatus === ApprovalStatus.Approve;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    getApproverRemark(step: string): string {
        if (!this.noteSheet) return '';
        if (step === 'Final Approver')
            return this.noteSheet.finalApprovalRemark ?? this.noteSheet.finalApprovalCancelRemark ?? '';
        if (step === 'Initiator')
            return this.noteSheet.initiatorApproveRemark ?? this.noteSheet.initiatorCancelRemark ?? '';
        return '';
    }

    serial(n: number): string {
        if (this.isEnglish()) return `${n}.`;
        const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
        return String(n).replace(/\d/g, d => bn[+d]) + '।';
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '—';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const locale = this.isEnglish() ? 'en-GB' : 'bn-BD';
            return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return String(value); }
    }

    getMainTextSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(
            this.fixBanglaWordBreaks(this.noteSheet?.mainText ?? '')
        );
    }

    getReferenceNumberSafe(): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(
            this.fixBanglaWordBreaks(this.noteSheet?.referenceNumber ?? '')
        );
    }

    /**
     * Fix word-breaking in rich-editor HTML for preview rendering.
     *
     * Quill converts every space to `&nbsp;` (non-breaking space).  This tells
     * the browser "never break the line here", so the entire paragraph becomes
     * one unbreakable run.  When it overflows, `overflow-wrap: break-word`
     * splits at an arbitrary glyph — right in the middle of a Bangla word.
     *
     * The fix: replace `&nbsp;` with a normal space so the browser can find
     * real word boundaries and wrap correctly.
     */
    private fixBanglaWordBreaks(html: string): string {
        if (!html) return html;
        // 1. Replace &nbsp; (and its raw Unicode char U+00A0) with a normal space
        html = html.replace(/&nbsp;/gi, ' ');
        html = html.replace(/\u00A0/g, ' ');
        // 2. Remove Zero-Width Spaces (U+200B) inserted by Quill for cursor positioning
        html = html.replace(/\u200B/g, '');
        return html;
    }

    getPurposeLabel(id: number | null | undefined): string {
        if (id == null) return '';
        return this.purposeLabelMap[id] ?? '';
    }

    getCountryLabel(id: number | null | undefined): string {
        if (id == null) return '';
        return this.countryLabelMap[id] ?? '';
    }

    getFamilySummary(): string {
        const json = this.noteSheet?.familyInfoJson;
        if (!json || typeof json !== 'string') return '';
        try {
            const arr = JSON.parse(json) as unknown[];
            if (Array.isArray(arr) && arr.length > 0) return `${arr.length} member(s)`;
        } catch { /* ignore */ }
        return '';
    }

    shouldShowSignature(step: string): boolean {
        const cs = this.noteSheet?.currentStatus;
        if (step === 'Prepared by' || step === 'প্রস্তুতকারী') return true;
        if (step === 'Initiator') return true;
        if (step.startsWith('Recommender'))
            return cs === NoteSheetCurrentStatus.FinalApproval || cs === NoteSheetCurrentStatus.Cancel || this.isApproved();
        if (step === 'Final Approver') return this.isApproved();
        return false;
    }

    translateStep(step: string): string {
        if (this.isEnglish()) return step;
        const t: Record<string, string> = {
            'Prepared by':    'প্রস্তুতকারী',
            'Initiator':      'সূচনাকারী',
            'Recommender':    'সুপারিশকারী',
            'Final Approver': 'চূড়ান্ত অনুমোদনকারী'
        };
        if (step.startsWith('Recommender')) {
            const suffix = step.replace('Recommender', '').trim();
            return suffix ? `সুপারিশকারী ${suffix}` : 'সুপারিশকারী';
        }
        return t[step] || step;
    }

    // ─── Back History ───────────────────────────────────────────

    loadBackHistory(): void {
        if (!this.noteSheetId) return;
        this.loadingBackHistory = true;
        this.http.get<BackHistoryRow[]>(`${this.api}/GetBackHistory`, { params: { noteSheetId: this.noteSheetId.toString() } })
            .pipe(catchError(() => of([] as BackHistoryRow[])))
            .subscribe({
                next: (list) => {
                    this.backHistory = list ?? [];
                    this.loadingBackHistory = false;
                    // resolve employee names
                    for (const row of this.backHistory) {
                        this.servingMembersService.getEmployeePersonalServiceOverview(row.backedByEmployeeId)
                            .pipe(catchError(() => of(null)))
                            .subscribe({ next: (emp) => { row.backedByName = emp?.nameEnglish ?? 'Unknown'; } });
                    }
                },
                error: () => { this.loadingBackHistory = false; }
            });
    }

    getStatusLabel(status: string): string {
        return NoteSheetCurrentStatusOptions.find(o => o.value === status)?.label ?? status;
    }

    goBack(): void { this.router.navigate(['/notesheet-list/draft']); }
    printPage(): void { window.print(); }

    // ─── Export ──────────────────────────────────────────────────────

    async exportWord(): Promise<void> {
        if (!this.noteSheet) return;
        const bn   = !this.isEnglish();
        const font = bn ? 'Nirmala UI' : 'Times New Roman';
        const thinBorder  = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        const titlePara = new Paragraph({
            children: [new TextRun({ text: bn ? 'মন্তব্যপত্র' : 'NOTE SHEET', bold: true, size: 32, font })],
            alignment: AlignmentType.CENTER, spacing: { after: 200 }
        });
        const metaParts: string[] = [];
        if (this.noteSheet.noteSheetNo)     metaParts.push(`${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'} ${this.noteSheet.noteSheetNo}`);
        if (this.noteSheet.noteSheetDate)   metaParts.push(`${bn ? 'তারিখ:' : 'Date:'} ${this.formatDate(this.noteSheet.noteSheetDate)}`);
        if (this.noteSheet.referenceNumber) metaParts.push(`${bn ? 'সুত্র:' : 'Reference:'} ${this.noteSheet.referenceNumber}`);
        const metaPara = new Paragraph({ children: [new TextRun({ text: metaParts.join('    '), size: 20, font })], spacing: { after: 200 } });
        const subjectPara = new Paragraph({
            children: [new TextRun({ text: this.noteSheet.subject ?? '', bold: true, size: 24, font })],
            alignment: AlignmentType.CENTER, spacing: { after: 200 }
        });
        const mainTextParas = this.htmlToDocxChildren(this.noteSheet.mainText ?? '', font, 22, cellBorders);
        const children: (Paragraph | Table)[] = [titlePara, metaPara, subjectPara, ...mainTextParas];

        if (this.isExBdLeave()) {
            const parts: string[] = [];
            if (this.noteSheet.purposeOfExBdLeaveId != null)  parts.push(`${bn ? 'উদ্দেশ্য:' : 'Purpose:'} ${this.getPurposeLabel(this.noteSheet.purposeOfExBdLeaveId)}`);
            if (this.noteSheet.destinationCountryId  != null)  parts.push(`${bn ? 'গন্তব্য দেশ:' : 'Destination:'} ${this.getCountryLabel(this.noteSheet.destinationCountryId)}`);
            if (this.noteSheet.dateOfVisitFrom || this.noteSheet.dateOfVisitTo) parts.push(`${bn ? 'সফরকাল:' : 'Visit Period:'} ${this.formatDate(this.noteSheet.dateOfVisitFrom)} - ${this.formatDate(this.noteSheet.dateOfVisitTo)}`);
            if (this.noteSheet.totalDays && this.noteSheet.totalDays > 0) parts.push(`${bn ? 'মোট দিন:' : 'Total Days:'} ${this.noteSheet.totalDays}`);
            if (parts.length > 0) children.push(new Paragraph({ children: [new TextRun({ text: parts.join(' | '), size: 20, font })], spacing: { after: 200 } }));
        }

        if (this.isNewPosting() && this.postingEmployees.length > 0) {
            const cols = bn
                ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','বদলি কর্মস্থল','মন্তব্য']
                : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Transfer Unit','Remarks'];
            const cellWidth = Math.floor(14000 / cols.length);
            const headerRow = new TableRow({ tableHeader: true, children: cols.map(col => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 14, font })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: cellWidth, type: WidthType.DXA }
            })) });
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                String(i + 1), emp.serviceId ?? '',
                bn ? (emp.rankNameBN || emp.rankName || '') : (emp.rankName ?? ''),
                bn ? (emp.tradeNameBN || emp.tradeName || '') : (emp.tradeName ?? ''),
                bn ? (emp.fullNameBN || emp.fullNameEN || '') : (emp.fullNameEN ?? ''),
                bn ? (emp.motherUnitNameBN || emp.motherUnitName || '') : (emp.motherUnitName ?? ''),
                emp.transferRabUnitName ?? '', emp.remarks ?? ''
            ].map(val => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: val, size: 14, font })], spacing: { after: 20 } })], borders: cellBorders, width: { size: cellWidth, type: WidthType.DXA } })) }));
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
        }

        if (this.noteSheet.note) {
            children.push(new Paragraph({ children: [new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 20, font }), new TextRun({ text: this.noteSheet.note, size: 20, font })], spacing: { before: 200, after: 200 } }));
        }
        children.push(new Paragraph({ children: [new TextRun({ text: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.', italics: true, size: 20, font })], spacing: { before: 400 } }));

        const buildSigParas = (detail: SignatoryDetail, roleLabel: string, align: 'left' | 'right'): Paragraph[] => {
            const paras: Paragraph[] = [];
            if (!detail) return paras;
            const showSig = detail.signatureDataUrl && this.shouldShowSignature(detail.step);
            if (showSig && detail.signatureDataUrl) {
                paras.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: this.dataUrlToUint8Array(detail.signatureDataUrl), transformation: { width: 150, height: 50 } })], alignment: align, spacing: { before: 200 } }));
            }
            paras.push(new Paragraph({ children: [new TextRun({ text: '______________________________', size: 20, font })], alignment: align, spacing: showSig ? {} : { before: 200 } }));
            paras.push(new Paragraph({ children: [new TextRun({ text: roleLabel, bold: true, size: 20, font })], alignment: align }));
            [detail.name, detail.rabId && detail.rabId !== '-' ? `RAB ID: ${detail.rabId}` : '', detail.rank && detail.rank !== '-' ? detail.rank : '']
                .filter(l => l && l !== '-')
                .forEach(line => paras.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], alignment: align })));
            return paras;
        };

        if (this.initiatorDetails) {
            children.push(...buildSigParas(this.initiatorDetails, this.translateStep(this.initiatorDetails.step), AlignmentType.RIGHT));
            children.push(new Paragraph({ spacing: { before: 300 } }));
        }
        for (const approver of this.approversDetails) {
            children.push(...buildSigParas(approver, this.translateStep(approver.step), AlignmentType.LEFT));
            children.push(new Paragraph({ spacing: { before: 200 } }));
        }

        const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } }, children }] });
        saveAs(await Packer.toBlob(doc), `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.docx`);
    }

    exportPdf(): void {
        if (!this.noteSheet) return;
        const bn = !this.isEnglish();
        const fontFamily = bn ? "'Noto Sans Bengali', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        const metaParts: string[] = [];
        if (this.noteSheet.noteSheetNo)     metaParts.push(`<strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(this.noteSheet.noteSheetNo)}`);
        if (this.noteSheet.noteSheetDate)   metaParts.push(`<strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}`);
        if (this.noteSheet.referenceNumber) metaParts.push(`<strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber)}`);

        let extraHtml = '';
        if (this.isExBdLeave()) {
            const parts: string[] = [];
            if (this.noteSheet.purposeOfExBdLeaveId != null) parts.push(`${bn ? 'উদ্দেশ্য:' : 'Purpose:'} ${this.getPurposeLabel(this.noteSheet.purposeOfExBdLeaveId)}`);
            if (this.noteSheet.destinationCountryId  != null) parts.push(`${bn ? 'গন্তব্য দেশ:' : 'Destination:'} ${this.getCountryLabel(this.noteSheet.destinationCountryId)}`);
            if (this.noteSheet.dateOfVisitFrom || this.noteSheet.dateOfVisitTo) parts.push(`${bn ? 'সফরকাল:' : 'Visit:'} ${this.formatDate(this.noteSheet.dateOfVisitFrom)} - ${this.formatDate(this.noteSheet.dateOfVisitTo)}`);
            if (this.noteSheet.totalDays && this.noteSheet.totalDays > 0) parts.push(`${bn ? 'মোট দিন:' : 'Total Days:'} ${this.noteSheet.totalDays}`);
            if (parts.length > 0) extraHtml = `<div class="exbd-info">${parts.join(' | ')}</div>`;
        }

        if (this.isNewPosting() && this.postingEmployees.length > 0) {
            const cols = bn ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','বদলি কর্মস্থল','মন্তব্য'] : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Transfer Unit','Remarks'];
            const headerCells = cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('');
            const bodyRows = this.postingEmployees.map((emp, i) => {
                const vals = [String(i+1), emp.serviceId??'', bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''), bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''), bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''), bn?(emp.motherUnitNameBN||emp.motherUnitName||''):(emp.motherUnitName??''), emp.transferRabUnitName??'', emp.remarks??''];
                return `<tr>${vals.map(v => `<td>${this.escapeHtml(v)}</td>`).join('')}</tr>`;
            }).join('');
            extraHtml += `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        }

        const noteText   = this.noteSheet.note ? `<p class="note"><strong>${bn?'নোট:':'Note:'}</strong> ${this.escapeHtml(this.noteSheet.note)}</p>` : '';
        const closing    = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';
        const sigHtml    = this.buildSignaturesHtml();

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 10pt; margin: 0; padding: 0; color: #000; }
    .a4-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm; border: 2px solid #000; background: #fff; }
    .title { font-size: 16pt; text-align: center; font-weight: bold; text-decoration: underline; margin: 0 0 4px; }
    .title-bn { font-size: 12pt; text-align: center; text-decoration: underline; margin: 0 0 12px; }
    .doc-box { border: 1.5px solid #000; }
    .box-header { display: flex; border-bottom: 1.5px solid #000; }
    .box-subject { flex: 1; padding: 7px 12px; font-weight: bold; text-decoration: underline; font-size: 12pt; }
    .box-sanglagni { border-left: 1.5px solid #000; padding: 6px 10px; text-align: center; min-width: 55px; font-size: 10pt; }
    .ref-line { padding: 5px 12px; font-size: 11pt; border-bottom: 1px solid #ccc; }
    .para { display: flex; gap: 8px; padding: 10px 12px; font-size: 11pt; line-height: 1.85; }
    .para-no { font-weight: 600; min-width: 28px; flex-shrink: 0; }
    .exbd-info { padding: 6px 12px 10px 40px; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9pt; }
    th, td { border: 1px solid #000; padding: 5px 7px; text-align: left; }
    th { font-weight: bold; background: #f5f5f5; font-size: 8pt; text-transform: uppercase; }
    .note { padding: 6px 12px; font-size: 10pt; border-top: 1px dashed #aaa; }
    .closing { margin-top: 14px; font-size: 11pt; text-indent: 2em; }
    .initiator-sig { margin-top: 10px; text-align: center; display: flex; flex-direction: column; align-items: flex-end; padding-right: 12px; }
    .sig-img { max-width: 160px; max-height: 60px; object-fit: contain; display: block; margin-bottom: 4px; }
    .approver-section { border-top: 1.5px solid #000; padding: 10px 12px 20px; min-height: 90px; }
    .approver-role { text-decoration: underline; font-size: 11pt; margin-bottom: 6px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 20px; }
    .sig-block { text-align: center; width: 45%; }
</style></head><body>
<div class="a4-page">
    <div class="title">${this.escapeHtml(title)}</div>
    <div class="title-bn">মন্তব্য পত্র</div>
    <div class="doc-box">
        <div class="box-header"><div class="box-subject">${this.escapeHtml(this.noteSheet.subject??'')}</div><div class="box-sanglagni">সংলগ্নী<br>নং</div></div>
        <div class="ref-line"><strong>${bn?'সূত্রঃ':'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber??'')} &nbsp;&nbsp; <strong>${bn?'তারিখঃ':'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}</div>
        <div class="para"><span class="para-no">১।</span><div>${this.fixBanglaWordBreaks(this.noteSheet.mainText??'')}</div></div>
        ${extraHtml}${noteText}
        <div class="closing">${closing}</div>
        ${sigHtml}
    </div>
</div>
</body></html>`;

        const win = window.open('', '_blank', 'width=1100,height=700');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
    }

    private buildSignaturesHtml(): string {
        const buildSig = (detail: SignatoryDetail | null): string => {
            if (!detail) return '';
            const showSig = detail.signatureDataUrl && this.shouldShowSignature(detail.step);
            const sigImg  = showSig && detail.signatureDataUrl ? `<img src="${detail.signatureDataUrl}" class="sig-img" />` : '';
            return `<div class="approver-section"><div class="approver-role">${this.translateStep(detail.step)}</div>${sigImg}</div>`;
        };
        let html = '';
        if (this.initiatorDetails) html += buildSig(this.initiatorDetails);
        for (const a of this.approversDetails) html += buildSig(a);
        return html;
    }

    /**
     * Parse rich-editor HTML into an array of docx Paragraphs / Tables,
     * preserving paragraph breaks and table structure so Word can wrap
     * Bangla text at real word boundaries instead of mid-glyph.
     */
    private htmlToDocxChildren(
        html: string, font: string, size: number,
        cellBorders: Record<string, { style: typeof BorderStyle.SINGLE; size: number; color: string }>
    ): (Paragraph | Table)[] {
        if (!html) return [new Paragraph({ spacing: { after: 200 } })];
        // Replace &nbsp; BEFORE DOM parsing so no \u00A0 enters text nodes
        html = this.fixBanglaWordBreaks(html);
        const container = document.createElement('div');
        container.innerHTML = html;
        const result: (Paragraph | Table)[] = [];

        const cleanText = (el: Element | ChildNode): string =>
            (el.textContent || '').replace(/\u00A0/g, ' ').trim();

        for (const node of Array.from(container.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
                if (text) {
                    result.push(new Paragraph({
                        children: [new TextRun({ text, size, font })],
                        spacing: { after: 100 }
                    }));
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();

                if (tag === 'table') {
                    const rows = Array.from(el.querySelectorAll('tr'));
                    if (rows.length > 0) {
                        const cellWidth = Math.floor(14000 / Math.max(
                            ...rows.map(r => r.querySelectorAll('td, th').length), 1
                        ));
                        const tableRows = rows.map(row => new TableRow({
                            children: Array.from(row.querySelectorAll('td, th')).map(cell => new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({
                                        text: cleanText(cell) || ' ',
                                        size: size - 2, font,
                                        bold: cell.tagName.toLowerCase() === 'th'
                                    })]
                                })],
                                borders: cellBorders,
                                width: { size: cellWidth, type: WidthType.DXA }
                            }))
                        }));
                        result.push(new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: tableRows
                        }));
                    }
                } else {
                    // <p>, <div>, <li>, etc. → one Paragraph per block element
                    const text = cleanText(el);
                    if (text) {
                        result.push(new Paragraph({
                            children: [new TextRun({ text, size, font })],
                            spacing: { after: 100 }
                        }));
                    }
                }
            }
        }

        return result.length ? result : [new Paragraph({ spacing: { after: 200 } })];
    }

    protected stripHtml(html: string): string {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        // textContent converts &nbsp; → \u00A0; replace with normal space
        return (tmp.textContent || tmp.innerText || '').replace(/\u00A0/g, ' ');
    }

    protected escapeHtml(text: string): string {
        if (!text) return '';
        return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }

    private dataUrlToUint8Array(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}
