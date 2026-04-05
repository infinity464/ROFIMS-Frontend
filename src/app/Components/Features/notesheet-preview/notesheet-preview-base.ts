import { inject, Injectable, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { catchError, of } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmpService } from '@/services/emp-service';
import { NoteSheetType, NoteSheetCurrentStatus, NoteSheetCurrentStatusOptions, ApprovalStatus, ApprovalStep } from '@/models/enums';
import { MasterBasicSetupService } from '@/Components/basic-setup/shared/services/MasterBasicSetupService';
import { SignatoryDetail } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { PostingService } from '@/services/posting.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { DraftPostingEmployeeRow } from '@/models/posting.model';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, PageOrientation,
    IRunPropertiesOptions
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
    exBdLeaveSubjectId?: number | null;
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

    // Cached safe-html to avoid re-parsing DOM on every change detection cycle
    private _mainTextCache: { raw: string; safe: SafeHtml } | null = null;
    private _refNumCache:   { raw: string; safe: SafeHtml } | null = null;

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
    unitLabelMapBN: Record<number, string> = {};

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
                this.unitLabelMapBN = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueBN || c.codeValueEN; return acc; }, {} as Record<number, string>);
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
                    } else if (this.isInterPosting() && this.noteSheet.draftPostingMasterId) {
                        this.loadInterPostingEmployees();
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

    private loadInterPostingEmployees(): void {
        if (!this.noteSheet?.draftPostingMasterId) return;
        this.loadingEmployees = true;
        this.postingService.getDraftInterPostingEmployees(this.noteSheet.draftPostingMasterId).subscribe({
            next: (list: any[]) => {
                // Map inter-posting fields to match DraftPostingEmployeeRow shape
                this.postingEmployees = (list ?? []).map(e => ({
                    ...e,
                    draftPostingDetailId: e.draftInterPostingDetailId,
                    draftPostingMasterId: e.draftInterPostingMasterId,
                }));
                this.loadingEmployees = false;
            },
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
                        if (id && id > 0) approverIds.push({ empId: id, step: `${ApprovalStep.Recommender} ${arr.length > 1 ? i + 1 : ''}`.trim() });
                    });
                }
            }
        } catch { /* ignore */ }

        const finalApproverEmpId = (this.noteSheet.finalApprovalId && this.noteSheet.finalApprovalId > 0)
            ? this.noteSheet.finalApprovalId
            : (this.noteSheet.finalApproverId && this.noteSheet.finalApproverId > 0 ? this.noteSheet.finalApproverId : null);
        if (finalApproverEmpId) approverIds.push({ empId: finalApproverEmpId, step: ApprovalStep.FinalApprover });

        const allIds = [
            ...(preparedByEmpId ? [{ empId: preparedByEmpId, step: ApprovalStep.PreparedBy }] : []),
            ...(initiatorId     ? [{ empId: initiatorId,     step: ApprovalStep.Initiator    }] : []),
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

                        if (step === ApprovalStep.PreparedBy) this.preparedByDetails = detail;
                        else if (step === ApprovalStep.Initiator) this.initiatorDetails = detail;
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
    isInterPosting(): boolean { return this.noteSheet?.noteSheetType === NoteSheetType.InterPosting; }
    isPostingType(): boolean { return this.isNewPosting() || this.isInterPosting(); }
    isInitiatorApproved(): boolean {
        return this.noteSheet?.initiatorStatus?.toLowerCase() === ApprovalStatus.Approve;
    }
    isApproved(): boolean {
        return this.noteSheet?.finalApprovalStatus === ApprovalStatus.Approve;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    getApproverRemark(step: string): string {
        if (!this.noteSheet) return '';
        if (step === ApprovalStep.FinalApprover)
            return this.noteSheet.finalApprovalRemark ?? this.noteSheet.finalApprovalCancelRemark ?? '';
        if (step === ApprovalStep.Initiator)
            return this.noteSheet.initiatorApproveRemark ?? this.noteSheet.initiatorCancelRemark ?? '';
        if (step.startsWith(ApprovalStep.Recommender)) {
            try {
                const json = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
                if (json && typeof json === 'string') {
                    const arr = JSON.parse(json) as any[];
                    if (Array.isArray(arr)) {
                        const numPart = step.replace(ApprovalStep.Recommender, '').trim();
                        const idx = numPart ? parseInt(numPart, 10) - 1 : 0;
                        const rec = arr[idx];
                        if (rec) return rec.recomender_approve_remark ?? rec.recomender_cancel_remark ?? '';
                    }
                }
            } catch { /* ignore */ }
        }
        return '';
    }

    getApproverDate(step: string): string {
        if (!this.noteSheet) return '';
        if (step === ApprovalStep.FinalApprover)
            return this.noteSheet.finalApprovalApprovedDate ? this.formatDate(this.noteSheet.finalApprovalApprovedDate) : '';
        if (step === ApprovalStep.Initiator)
            return this.noteSheet.initiatorApprovedDate ? this.formatDate(this.noteSheet.initiatorApprovedDate) : '';
        if (step.startsWith(ApprovalStep.Recommender)) {
            try {
                const json = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
                if (json && typeof json === 'string') {
                    const arr = JSON.parse(json) as any[];
                    if (Array.isArray(arr)) {
                        const numPart = step.replace(ApprovalStep.Recommender, '').trim();
                        const idx = numPart ? parseInt(numPart, 10) - 1 : 0;
                        const rec = arr[idx];
                        if (rec?.recomender_approved_date) return this.formatDate(rec.recomender_approved_date);
                    }
                }
            } catch { /* ignore */ }
        }
        return '';
    }

    /** Returns the organizational header lines for the notesheet (inside the bordered box, centered). */
    getOrgHeaderLine1(): string {
        return this.isEnglish() ? 'RAB Forces Headquarters' : 'র‍্যাব ফোর্সেস সদর দপ্তর';
    }
    getOrgHeaderLine2(): string {
        return this.isEnglish() ? 'Administration & Finance Wing (Personnel Branch)' : 'প্রশাসন ও অর্থ উইং (পার্সোনেল শাখা)';
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
        const raw = this.noteSheet?.mainText ?? '';
        if (this._mainTextCache?.raw === raw) return this._mainTextCache.safe;
        const safe = this.sanitizer.bypassSecurityTrustHtml(this.fixBanglaWordBreaks(raw));
        this._mainTextCache = { raw, safe };
        return safe;
    }

    getReferenceNumberSafe(): SafeHtml {
        const raw = this.noteSheet?.referenceNumber ?? '';
        if (this._refNumCache?.raw === raw) return this._refNumCache.safe;
        const safe = this.sanitizer.bypassSecurityTrustHtml(this.fixBanglaWordBreaks(raw));
        this._refNumCache = { raw, safe };
        return safe;
    }

    /**
     * Fix word-breaking in rich-editor HTML.
     *
     * Quill converts every space to `&nbsp;` (non-breaking space).  The browser
     * sees the entire paragraph as one unbreakable run and `overflow-wrap:
     * break-word` then splits at an arbitrary glyph — mid-Bangla-word.
     *
     * Two-pass fix:
     *  1. String-level: replace HTML entities (&nbsp; &#160; &#xa0;)
     *  2. DOM-level: walk every text node and replace any surviving \u00A0
     *     (the browser may create these from entities we didn't catch)
     */
    protected fixBanglaWordBreaks(html: string): string {
        if (!html) return html;
        // Pass 1 — string-level entity replacement
        html = html.replace(/&nbsp;/gi, ' ');
        html = html.replace(/&#160;/gi, ' ');
        html = html.replace(/&#xa0;/gi, ' ');
        html = html.replace(/&#x00a0;/gi, ' ');
        // Pass 2 — DOM-level: catch any raw \u00A0 the browser decoded
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
        if (step === ApprovalStep.PreparedBy || step === 'প্রস্তুতকারী') return true;
        if (step === ApprovalStep.Initiator) return this.noteSheet?.initiatorStatus?.toLowerCase() === ApprovalStatus.Approve;
        if (step.startsWith(ApprovalStep.Recommender))
            return cs === NoteSheetCurrentStatus.FinalApproval || cs === NoteSheetCurrentStatus.Cancel || this.isApproved();
        if (step === ApprovalStep.FinalApprover) return this.isApproved();
        return false;
    }

    translateStep(step: string): string {
        if (this.isEnglish()) return step;
        const t: Record<string, string> = {
            [ApprovalStep.PreparedBy]:    'প্রস্তুতকারী',
            [ApprovalStep.Initiator]:     'সূচনাকারী',
            [ApprovalStep.Recommender]:   'সুপারিশকারী',
            [ApprovalStep.FinalApprover]: 'চূড়ান্ত অনুমোদনকারী'
        };
        if (step.startsWith(ApprovalStep.Recommender)) {
            const suffix = step.replace(ApprovalStep.Recommender, '').trim();
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

    /**
     * Print via a clean new window so @page rules work
     * (Angular view encapsulation blocks @page in component CSS).
     */
    printPage(): void {
        const paper = document.querySelector('.a4-paper');
        if (!paper) { window.print(); return; }

        const clone = paper.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.ns-edit-field, .ns-approval-edit').forEach(el => el.remove());

        // Collect all CSS from the page (Angular scoped + global)
        const chunks: string[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
            try { chunks.push(Array.from(sheet.cssRules).map(r => r.cssText).join('\n')); }
            catch { /* skip cross-origin */ }
        }

        const win = window.open('', '_blank', 'width=950,height=700');
        if (!win) { window.print(); return; }

        win.document.write(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print</title>` +
            `<style>${chunks.join('\n')}\n` +
            `@page { margin: 5mm 8mm; }\n` +
            `html, body { margin: 0; padding: 0; background: #fff; }\n` +
            `.print-page-frame { position: relative; }\n` +
            `.print-page-frame::before {\n` +
            `  content: ''; position: fixed; top: 5mm; left: 8mm; right: 8mm; bottom: 5mm;\n` +
            `  border: 1.5px solid #000; pointer-events: none; box-sizing: border-box;\n` +
            `}\n` +
            `.a4-paper {\n` +
            `  width: 100% !important; min-height: auto !important;\n` +
            `  padding: 5mm 8mm 5mm !important; box-shadow: none !important;\n` +
            `  margin: 0 !important; overflow: visible !important;\n` +
            `}\n` +
            `.ns-doc-box { display: table !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; padding-top: 6mm !important; padding-bottom: 6mm !important; }\n` +
            `.ns-main-col { display: table-cell !important; vertical-align: top !important; border: 1.5px solid #000 !important; }\n` +
            `.ns-sanglagni-col { display: table-cell !important; vertical-align: top !important; width: 60px !important; min-width: 60px !important; border: 1.5px solid #000 !important; }\n` +
            `.ns-approver-section { min-height: 50px !important; padding: 6px 16px 10px 20px !important; }\n` +
            `.ns-initiator-area { padding: 8px 16px 8px 20px !important; }\n` +
            `.no-print { display: none !important; }\n` +
            `</style></head><body><div class="print-page-frame">${clone.outerHTML}</div></body></html>`
        );
        win.document.close();

        const imgs = win.document.querySelectorAll('img');
        if (imgs.length > 0) {
            let loaded = 0;
            const tryPrint = () => { if (++loaded >= imgs.length) setTimeout(() => win.print(), 300); };
            imgs.forEach(img => { if (img.complete) tryPrint(); else { img.onload = tryPrint; img.onerror = tryPrint; } });
            setTimeout(() => win.print(), 2000);
        } else {
            setTimeout(() => win.print(), 500);
        }
    }

    // ─── Export ──────────────────────────────────────────────────────

    async exportWord(): Promise<void> {
        if (!this.noteSheet) return;
        const bn = !this.isEnglish();
        const lang = bn ? 'bn-BD' : 'en-US';

        // Shared run properties: font + language so Word uses correct word-breaking
        const runProps: IRunPropertiesOptions = {
            font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'Times New Roman', cs: 'Nirmala UI' },
            language: { value: lang, eastAsia: lang, bidirectional: lang },
            size: 20,  // 10pt = 20 half-points
        };
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        // ── Helper: parse rich-editor HTML → Paragraph[] ─────────────
        const htmlToParas = (html: string): Paragraph[] => {
            if (!html) return [];
            html = this.fixBanglaWordBreaks(html);
            const div = document.createElement('div');
            div.innerHTML = html;
            const paras: Paragraph[] = [];
            for (const node of Array.from(div.childNodes)) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const el = node as HTMLElement;
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'table') {
                        // skip — tables handled separately below
                        continue;
                    }
                    const text = (el.textContent || '').replace(/\u00A0/g, ' ').trim();
                    if (text) {
                        paras.push(new Paragraph({
                            children: [new TextRun({ text, ...runProps })],
                            spacing: { after: 80, line: 340 },
                        }));
                    }
                } else if (node.nodeType === Node.TEXT_NODE) {
                    const text = (node.textContent || '').replace(/\u00A0/g, ' ').trim();
                    if (text) {
                        paras.push(new Paragraph({
                            children: [new TextRun({ text, ...runProps })],
                            spacing: { after: 80, line: 340 },
                        }));
                    }
                }
            }
            return paras;
        };

        // ── Helper: extract tables from HTML ─────────────────────────
        const htmlToTables = (html: string): Table[] => {
            if (!html) return [];
            html = this.fixBanglaWordBreaks(html);
            const div = document.createElement('div');
            div.innerHTML = html;
            const tables: Table[] = [];
            for (const tbl of Array.from(div.querySelectorAll('table'))) {
                const rows = Array.from(tbl.querySelectorAll('tr'));
                if (!rows.length) continue;
                const maxCols = Math.max(...rows.map(r => r.querySelectorAll('td,th').length), 1);
                const cw = Math.floor(13000 / maxCols);
                tables.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: rows.map(row => new TableRow({
                        children: Array.from(row.querySelectorAll('td,th')).map(cell => new TableCell({
                            children: [new Paragraph({ children: [new TextRun({
                                text: (cell.textContent || '').replace(/\u00A0/g, ' ').trim() || ' ',
                                ...runProps, size: 20, bold: cell.tagName.toLowerCase() === 'th',
                            })] })],
                            borders: cellBorders, width: { size: cw, type: WidthType.DXA },
                        }))
                    })),
                }));
            }
            return tables;
        };

        // ── Build document children ──────────────────────────────────
        const children: (Paragraph | Table)[] = [];

        // Title
        children.push(new Paragraph({
            children: [new TextRun({ text: 'NOTE SHEET', ...runProps, size: 24, bold: true, underline: {} })],
            alignment: AlignmentType.CENTER, spacing: { after: 40 },
        }));
        children.push(new Paragraph({
            children: [new TextRun({ text: 'মন্তব্য পত্র', ...runProps, size: 24, underline: {} })],
            alignment: AlignmentType.CENTER, spacing: { after: 200 },
        }));

        // Subject
        children.push(new Paragraph({
            children: [new TextRun({ text: this.noteSheet.subject ?? '', ...runProps, bold: true, underline: {} })],
            spacing: { after: 100 },
        }));

        // Reference / Date
        const metaParts: string[] = [];
        if (this.noteSheet.referenceNumber) metaParts.push(`${bn ? 'সূত্রঃ' : 'Reference:'} ${this.stripHtml(this.noteSheet.referenceNumber)}`);
        if (this.noteSheet.noteSheetDate) metaParts.push(`${bn ? 'তারিখঃ' : 'Date:'} ${this.formatDate(this.noteSheet.noteSheetDate)}`);
        if (metaParts.length) {
            children.push(new Paragraph({
                children: [new TextRun({ text: metaParts.join('    '), ...runProps, size: 22 })],
                spacing: { after: 200 },
            }));
        }

        // Serial number + main text paragraphs
        const mainParas = htmlToParas(this.noteSheet.mainText ?? '');
        if (mainParas.length > 0) {
            // First paragraph gets the serial number prefix
            const firstText = (mainParas[0] as any)?.options?.children?.[0]?.options?.text ?? '';
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: `${this.serial(1)}  `, ...runProps, bold: true }),
                    new TextRun({ text: firstText, ...runProps }),
                ],
                spacing: { after: 80, line: 340 },
            }));
            // Remaining paragraphs
            for (let i = 1; i < mainParas.length; i++) {
                children.push(mainParas[i]);
            }
        }

        // Tables from main text
        const mainTables = htmlToTables(this.noteSheet.mainText ?? '');
        for (const t of mainTables) children.push(t);

        // ExBD leave info
        if (this.isExBdLeave()) {
            const parts: string[] = [];
            if (this.noteSheet.purposeOfExBdLeaveId != null) parts.push(`${bn ? 'উদ্দেশ্য:' : 'Purpose:'} ${this.getPurposeLabel(this.noteSheet.purposeOfExBdLeaveId)}`);
            if (this.noteSheet.destinationCountryId  != null) parts.push(`${bn ? 'গন্তব্য দেশ:' : 'Destination:'} ${this.getCountryLabel(this.noteSheet.destinationCountryId)}`);
            if (this.noteSheet.dateOfVisitFrom || this.noteSheet.dateOfVisitTo) parts.push(`${bn ? 'সফরকাল:' : 'Visit:'} ${this.formatDate(this.noteSheet.dateOfVisitFrom)} - ${this.formatDate(this.noteSheet.dateOfVisitTo)}`);
            if (this.noteSheet.totalDays && this.noteSheet.totalDays > 0) parts.push(`${bn ? 'মোট দিন:' : 'Total Days:'} ${this.noteSheet.totalDays}`);
            if (parts.length) children.push(new Paragraph({ children: [new TextRun({ text: parts.join(' | '), ...runProps, size: 20 })], spacing: { after: 200 } }));
        }

        // Posting table
        if (this.isNewPosting() && this.postingEmployees.length > 0) {
            const cols = bn ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','নিজ জেলা','মাতৃ ইউনিটের অবস্থান','বদলি কর্মস্থল','মন্তব্য'] : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Own District','Mother Unit Location','Transfer Unit','Remarks'];
            const cw = Math.floor(13000 / cols.length);
            const headerRow = new TableRow({ tableHeader: true, children: cols.map(c => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c, ...runProps, size: 16, bold: true })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: cw, type: WidthType.DXA },
            })) });
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                String(i+1), emp.serviceId??'',
                bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''),
                bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''),
                bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                bn?(emp.motherUnitNameBN||emp.motherUnitName||''):(emp.motherUnitName??''),
                bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''),
                bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''),
                emp.transferRabUnitName??'', emp.remarks??''
            ].map(v => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, ...runProps, size: 16 })] })], borders: cellBorders, width: { size: cw, type: WidthType.DXA } })) }));
            children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
        }

        // Note
        if (this.noteSheet.note) {
            children.push(new Paragraph({
                children: [new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', ...runProps, bold: true }), new TextRun({ text: this.noteSheet.note, ...runProps })],
                spacing: { before: 200, after: 200 },
            }));
        }

        // Closing
        children.push(new Paragraph({
            children: [new TextRun({ text: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.', ...runProps, italics: true })],
            spacing: { before: 400 },
        }));

        // Signatures
        if (this.initiatorDetails) {
            const d = this.initiatorDetails;
            children.push(new Paragraph({ spacing: { before: 300 } }));
            children.push(new Paragraph({ children: [new TextRun({ text: '______________________________', ...runProps })], alignment: AlignmentType.RIGHT }));
            children.push(new Paragraph({ children: [new TextRun({ text: this.translateStep(d.step), ...runProps, bold: true })], alignment: AlignmentType.RIGHT }));
            const lines = [d.name, d.rank && d.rank !== '-' ? d.rank : ''].filter(Boolean);
            for (const ln of lines) children.push(new Paragraph({ children: [new TextRun({ text: ln!, ...runProps })], alignment: AlignmentType.RIGHT }));
        }
        for (const approver of this.approversDetails) {
            children.push(new Paragraph({ spacing: { before: 200 } }));
            children.push(new Paragraph({ children: [new TextRun({ text: this.translateStep(approver.step), ...runProps, underline: {} })], }));
            children.push(new Paragraph({ spacing: { before: 60 } }));
        }

        // ── Create document: Legal paper (8.5″ × 14″) ───────────────
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT }, // Legal in twips
                        margin: { top: 794, bottom: 1134, left: 567, right: 567 }, // ~14mm top, 20mm bottom, 10mm sides
                    },
                },
                children,
            }],
        });

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
            const cols = bn ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','মাতৃ ইউনিট','নিজ জেলা','মাতৃ ইউনিটের অবস্থান','বদলি কর্মস্থল','মন্তব্য'] : ['Ser','Service ID','Rank','Trade','Name','Mother Unit','Own District','Mother Unit Location','Transfer Unit','Remarks'];
            const headerCells = cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('');
            const bodyRows = this.postingEmployees.map((emp, i) => {
                const vals = [String(i+1), emp.serviceId??'', bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''), bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''), bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''), bn?(emp.motherUnitNameBN||emp.motherUnitName||''):(emp.motherUnitName??''), bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''), bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''), emp.transferRabUnitName??'', emp.remarks??''];
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
    /* Custom ordered list types (suffix space to avoid extra 0) */
    @counter-style bangla-alpha { system: alphabetic; symbols: "অ" "আ" "ই" "ঈ" "উ" "ঊ" "ঋ" "এ" "ঐ" "ও" "ঔ" "ক" "খ" "গ" "ঘ" "ঙ" "চ" "ছ" "জ" "ঝ" "ঞ" "ট" "ঠ" "ড" "ঢ" "ণ" "ত" "থ" "দ" "ধ" "ন" "প" "ফ" "ব" "ভ" "ম" "য" "র" "ল" "শ" "ষ" "স" "হ"; suffix: " "; }
    @counter-style bangla-ka { system: alphabetic; symbols: "ক" "খ" "গ" "ঘ" "ঙ" "চ" "ছ" "জ" "ঝ" "ঞ" "ট" "ঠ" "ড" "ঢ" "ণ" "ত" "থ" "দ" "ধ" "ন" "প" "ফ" "ব" "ভ" "ম" "য" "র" "ল" "শ" "ষ" "স" "হ"; suffix: " "; }
    li[data-list] { list-style-type: none; }
    ol { counter-reset: preview-list-0; padding-left: 1.5em; }
    li[data-list="ordered"] { counter-increment: preview-list-0; }
    li[data-list="ordered"]::before { content: counter(preview-list-0, decimal) '. '; margin-right: 0.3em; }
    li[data-list="upper-roman"] { counter-increment: preview-list-0; }
    li[data-list="upper-roman"]::before { content: counter(preview-list-0, upper-roman) '. '; margin-right: 0.3em; }
    li[data-list="bangla-number"] { counter-increment: preview-list-0; }
    li[data-list="bangla-number"]::before { content: counter(preview-list-0, bengali) '. '; margin-right: 0.3em; }
    li[data-list="lower-alpha"] { counter-increment: preview-list-0; }
    li[data-list="lower-alpha"]::before { content: counter(preview-list-0, lower-alpha) '. '; margin-right: 0.3em; }
    li[data-list="bangla-alpha"] { counter-increment: preview-list-0; }
    li[data-list="bangla-alpha"]::before { content: counter(preview-list-0, bangla-alpha); margin-right: 0.3em; }
    li[data-list="bangla-ka"] { counter-increment: preview-list-0; }
    li[data-list="bangla-ka"]::before { content: counter(preview-list-0, bangla-ka); margin-right: 0.3em; }
    li[data-list="bullet"]::before { content: '• '; margin-right: 0.3em; }
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
            const dateStr = this.getApproverDate(detail.step);
            const dateHtml = dateStr ? `<div style="font-size:10pt;text-align:center">${dateStr}</div>` : '';
            return `<div class="approver-section"><div class="approver-role">${this.translateStep(detail.step)}</div>${sigImg}${dateHtml}</div>`;
        };
        let html = '';
        if (this.initiatorDetails) html += buildSig(this.initiatorDetails);
        for (const a of this.approversDetails) html += buildSig(a);
        return html;
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

}
