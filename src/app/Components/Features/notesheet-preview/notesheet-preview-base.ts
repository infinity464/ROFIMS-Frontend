import { inject, Injectable, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { catchError, forkJoin, map, of } from 'rxjs';
import { environment } from '@/Core/Environments/environment';
import { EmpService } from '@/services/emp-service';
import { UserMenuService } from '@/services/user-menu.service';
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
import { normalizeRab } from '@/shared/utils/bangla-text.util';
import { decodeNoteSheetId } from '@/shared/utils/notesheet-id-codec';

export interface NoteSheetInfoFull {
    noteSheetId: number;
    noteSheetNo: string;
    noteSheetDate: string;
    wingBattalionId?: number;
    branchId?: number;
    subject: string;
    noteSheetSubjectId?: number | null;
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
    // ── Signatory snapshots (frozen name/rank/appointment, EN+BN, at sign time) ──
    // JSON SignatorySnapshot per slot; recommender snapshots live inside
    // recommendersJson (signatory_snapshot). Null → step not yet signed → live.
    initiatorSignatorySnapshot?: string;
    finalApprovalSignatorySnapshot?: string;
    preparedBySignatorySnapshot?: string;
    // ── Workflow state ─────────────────────────────────────────────────
    currentStatus?: string;
    // ── Audit ──────────────────────────────────────────────────────────
    createdBy?: string;
    lastUpdatedBy?: string;
    createdDate?: string;
    lastupdate?: string;
    isDeleted?: boolean;
    deletedBy?: string;
    // ── Leave (ExBD) ───────────────────────────────────────────────────
    exBdLeaveApplicationId?: number | null;
    exBdLeaveSubjectId?: number | null;
    note?: string | null;
    preparedByEmployeeId?: number | null;
    // ── Legacy (kept for old cached data) ─────────────────────────────
    /** @deprecated use finalApprovalId */
    finalApproverId?: number;
    /** @deprecated use recommendersJson */
    recommenderIdsJson?: string;
    remark?: string;
    paragraphText?: string;
}

/** Frozen signatory identity captured at sign time (mirrors backend SignatorySnapshot). */
export interface SignatorySnapshotFE {
    employeeId?: number;
    rabId?: string;
    prefixEN?: string;
    prefixBN?: string;
    nameEN?: string;
    nameBN?: string;
    rankEN?: string;
    rankBN?: string;
    appointmentEN?: string;
    appointmentBN?: string;
    snapshotAtUtc?: string;
}

/** One resolved node of the approval chain, with its frozen snapshot if signed. */
interface SignatoryChainEntry {
    empId: number;
    step: string;
    snapshot: SignatorySnapshotFE | null;
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
    protected readonly userMenuService     = inject(UserMenuService);

    protected readonly api = `${environment.apis.core}/NoteSheetInfo`;

    noteSheetId: number | null = null;
    noteSheet: NoteSheetInfoFull | null = null;
    loading = false;
    error = false;
    exportingPdf = false;
    printingPreview = false;

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
    loadingApprovalChain = false;

    get isFullyLoaded(): boolean {
        return !this.loading && !this.loadingEmployees && !this.loadingApprovalChain;
    }

    purposeLabelMap: Record<number, string> = {};
    purposeLabelMapBN: Record<number, string> = {};
    countryLabelMap: Record<number, string> = {};
    countryLabelMapBN: Record<number, string> = {};
    unitLabelMap: Record<number, string> = {};
    unitLabelMapBN: Record<number, string> = {};

    /** Permissions resolved from the parent list/generation route */
    canInsert = false;
    canUpdate = false;
    canDelete = false;

    protected _lastLoadedId: number | null = null;

    ngOnInit(): void {
        this.loadLookups();
        this.route.queryParams.subscribe(params => {
            // The URL carries an obfuscated token (see notesheet-id-codec); decode to the
            // real id. Plain numeric ids still resolve for backward-compat.
            const newId = decodeNoteSheetId(params['id']);
            if (newId && newId > 0) {
                if (newId === this._lastLoadedId) return;
                this._lastLoadedId = newId;
                this.noteSheetId = newId;
                this.loadNoteSheet();
            } else {
                this.error = true;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No note-sheet ID provided.' });
            }
        });
    }

    /** Resolve permissions from the parent route based on notesheet type */
    protected resolvePermissions(): void {
        const type = this.noteSheet?.noteSheetType;
        const parentRoutes = this.getParentRoutes(type);
        for (const route of parentRoutes) {
            const perms = this.userMenuService.getPermissionsByRoute(route);
            if (perms.canView || perms.canInsert || perms.canUpdate || perms.canDelete) {
                this.canInsert = perms.canInsert;
                this.canUpdate = perms.canUpdate;
                this.canDelete = perms.canDelete;
                return;
            }
        }
    }

    /** Map notesheet type to possible parent routes that control permissions */
    private getParentRoutes(type: string | undefined): string[] {
        switch (type) {
            case NoteSheetType.ExBDLeave:
                return ['notesheet-ex-bd-leave', 'notesheet-list/draft-ex-bd-leave'];
            case NoteSheetType.NewPosting:
                return ['notesheet-posting', 'notesheet-list/draft-posting'];
            case NoteSheetType.InterPosting:
                return ['notesheet-inter-posting', 'notesheet-list/draft-inter-posting'];
            default:
                return ['notesheet-general', 'notesheet-list/draft'];
        }
    }

    private loadLookups(): void {
        this.masterBasicSetup.getAllByType('PurposeOfExBDLeave').subscribe({
            next: (list) => {
                this.purposeLabelMap = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueEN; return acc; }, {} as Record<number, string>);
                this.purposeLabelMapBN = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueBN || c.codeValueEN; return acc; }, {} as Record<number, string>);
            }
        });
        this.masterBasicSetup.getAllByType('Country').subscribe({
            next: (list) => {
                this.countryLabelMap = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueEN; return acc; }, {} as Record<number, string>);
                this.countryLabelMapBN = (list ?? []).reduce((acc, c) => { acc[c.codeId] = c.codeValueBN || c.codeValueEN; return acc; }, {} as Record<number, string>);
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
                    // Normalise the "র‍্যাব" spelling once at load so it renders consistently
                    // everywhere this note-sheet is shown (subject, text, paragraphs, exports).
                    this.noteSheet.subject = normalizeRab(this.noteSheet.subject);
                    this.noteSheet.mainText = normalizeRab(this.noteSheet.mainText);
                    this.noteSheet.referenceNumber = normalizeRab(this.noteSheet.referenceNumber);
                    this.noteSheet.note = normalizeRab(this.noteSheet.note);
                    this.noteSheet.paragraphText = normalizeRab(this.noteSheet.paragraphText);
                    this.resolvePermissions();
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
            error: (err: any) => {
                this.error = true;
                this.loading = false;
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load note-sheet.' });
            }
        });
    }

    protected loadPostingEmployees(): void {
        if (!this.noteSheet?.draftPostingMasterId) return;
        this.loadingEmployees = true;
        this.postingService.getDraftPostingEmployees(this.noteSheet.draftPostingMasterId).subscribe({
            next: (list) => {
                this.postingEmployees = list ?? [];
                this.loadingEmployees = false;
                this.onPostingEmployeesLoaded(this.postingEmployees);
            },
            error: (err: any) => { this.loadingEmployees = false; }
        });
    }

    protected loadInterPostingEmployees(): void {
        if (!this.noteSheet?.draftPostingMasterId) return;
        this.loadingEmployees = true;
        this.postingService.getDraftInterPostingEmployees(this.noteSheet.draftPostingMasterId).subscribe({
            next: (list: any[]) => {
                this.postingEmployees = (list ?? []).map(e => ({
                    ...e,
                    draftPostingDetailId: e.draftInterPostingDetailId,
                    draftPostingMasterId: e.draftInterPostingMasterId,
                }));
                this.loadingEmployees = false;
                this.onPostingEmployeesLoaded(this.postingEmployees);
            },
            error: (err: any) => { this.loadingEmployees = false; }
        });
    }

    protected onPostingEmployeesLoaded(_employees: DraftPostingEmployeeRow[]): void { }

    protected loadApprovalChain(): void {
        if (!this.noteSheet) return;

        const preparedByEmpId = this.noteSheet.preparedByEmployeeId && this.noteSheet.preparedByEmployeeId > 0
            ? this.noteSheet.preparedByEmployeeId : null;
        const initiatorId = this.noteSheet.initiatorId && this.noteSheet.initiatorId > 0
            ? this.noteSheet.initiatorId : null;

        // Each recommender carries its frozen snapshot (name/rank/appointment captured
        // at sign time) when signed; null while pending → resolve live.
        const recommenderEntries: SignatoryChainEntry[] = [];
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
                        if (id && id > 0) {
                            const snapshot = typeof r === 'number' ? null : this.parseSnapshot(r.signatory_snapshot);
                            recommenderEntries.push({ empId: id, step: `${ApprovalStep.Recommender} ${arr.length > 1 ? i + 1 : ''}`.trim(), snapshot });
                        }
                    });
                }
            }
        } catch { /* ignore */ }

        const finalApproverEmpId = (this.noteSheet.finalApprovalId && this.noteSheet.finalApprovalId > 0)
            ? this.noteSheet.finalApprovalId
            : (this.noteSheet.finalApproverId && this.noteSheet.finalApproverId > 0 ? this.noteSheet.finalApproverId : null);

        const entries: SignatoryChainEntry[] = [
            ...(preparedByEmpId ? [{ empId: preparedByEmpId, step: ApprovalStep.PreparedBy, snapshot: this.parseSnapshot(this.noteSheet.preparedBySignatorySnapshot) }] : []),
            ...(initiatorId     ? [{ empId: initiatorId,     step: ApprovalStep.Initiator,   snapshot: this.parseSnapshot(this.noteSheet.initiatorSignatorySnapshot) }] : []),
            ...recommenderEntries,
            ...(finalApproverEmpId ? [{ empId: finalApproverEmpId, step: ApprovalStep.FinalApprover, snapshot: this.parseSnapshot(this.noteSheet.finalApprovalSignatorySnapshot) }] : []),
        ];

        if (entries.length === 0) return;

        this.loadingApprovalChain = true;

        // A signed step reads its FROZEN snapshot (no fetch) so promotion/reassignment
        // never changes an approved document. A still-pending (or legacy) step resolves
        // LIVE from GetEmployeeBriefProfile — intentionally NOT member-access scoped, so
        // any viewer who can open the note-sheet sees who signed it. forkJoin preserves
        // input order, keeping approversDetails in chain order.
        forkJoin(
            entries.map(e =>
                e.snapshot
                    ? of(this.detailFromSnapshot(e.step, e.snapshot))
                    : this.servingMembersService.getEmployeeBriefProfile(e.empId).pipe(
                        map(emp => this.detailFromProfile(e.step, e.empId, emp)),
                        catchError(() => of(this.detailFromProfile(e.step, e.empId, null)))
                    )
            )
        ).subscribe({
            next: (details) => {
                details.forEach(detail => {
                    if (detail.step === ApprovalStep.PreparedBy) this.preparedByDetails = detail;
                    else if (detail.step === ApprovalStep.Initiator) this.initiatorDetails = detail;
                    else this.approversDetails.push(detail);
                    this.loadSignature(detail);
                });
                this.loadingApprovalChain = false;
            },
            error: () => { this.loadingApprovalChain = false; }
        });
    }

    /** Parse a stored snapshot (JSON string, already-parsed object, or null). */
    private parseSnapshot(v: any): SignatorySnapshotFE | null {
        if (!v) return null;
        try {
            const o = typeof v === 'string' ? JSON.parse(v) : v;
            return o && typeof o === 'object' ? o as SignatorySnapshotFE : null;
        } catch { return null; }
    }

    /** Build a signatory block from a frozen snapshot (signed step). */
    private detailFromSnapshot(step: string, s: SignatorySnapshotFE): SignatoryDetail {
        return {
            step,
            name:          s.nameEN        ?? '-',
            nameBN:        s.nameBN        ?? '',
            rabId:         s.rabId         ?? '-',
            rank:          s.rankEN        ?? '-',
            rankBN:        s.rankBN        ?? '',
            serviceRank:   s.rankEN        ?? '-',
            appointment:   s.appointmentEN ?? '',
            appointmentBN: s.appointmentBN ?? '',
            employeeId:    s.employeeId
        };
    }

    /** Build a signatory block from the LIVE employee profile (pending/legacy step). */
    private detailFromProfile(step: string, empId: number, emp: any): SignatoryDetail {
        return {
            step,
            name:          emp?.nameEN        ?? '-',
            nameBN:        emp?.nameBN        ?? '',
            rabId:         emp?.rabId         ?? '-',
            rank:          emp?.rankEN        ?? '-',
            rankBN:        emp?.rankBN        ?? '',
            serviceRank:   emp?.rankEN        ?? '-',
            appointment:   emp?.appointmentEN ?? '',
            appointmentBN: emp?.appointmentBN ?? '',
            employeeId:    empId
        };
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
            error: (err: any) => { /* no signature */ }
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
            return this.noteSheet.finalApprovalApprovedDate ? this.formatFullDate(this.noteSheet.finalApprovalApprovedDate) : '';
        if (step === ApprovalStep.Initiator)
            return this.noteSheet.initiatorApprovedDate ? this.formatFullDate(this.noteSheet.initiatorApprovedDate) : '';
        if (step.startsWith(ApprovalStep.Recommender)) {
            try {
                const json = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
                if (json && typeof json === 'string') {
                    const arr = JSON.parse(json) as any[];
                    if (Array.isArray(arr)) {
                        const numPart = step.replace(ApprovalStep.Recommender, '').trim();
                        const idx = numPart ? parseInt(numPart, 10) - 1 : 0;
                        const rec = arr[idx];
                        if (rec?.recomender_approved_date) return this.formatFullDate(rec.recomender_approved_date);
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

    /**
     * Page footer label under the page border, e.g. "১/৬". `index` is zero-based;
     * callers hide the footer when `total` is 1.
     */
    pageLabel(index: number, total: number): string {
        return this.toBanglaDigits(`${index + 1}/${total}`);
    }

    /**
     * pdf-utils `merge` operation that stamps "১/৬" into each page's bottom margin
     * — i.e. BELOW the .pdf-page-frame border, which only covers the printable area.
     *
     * Chromium's own displayHeaderFooter/footerTemplate would be simpler, but it
     * substitutes .pageNumber/.totalPages with Latin digits and gives no way to
     * transform them. This renders a transparent overlay — one page per page of the
     * main PDF, looping pdf-utils' `$pdf.pages` — so the label is ordinary HTML we
     * can set in Bangla, bold, in the document's own font. Page counts still come
     * from the finished PDF, not from the screen's pagination.
     *
     * renderForEveryPage is REQUIRED. Without it pdf-utils renders the template once
     * and merges that single buffer onto every page — i.e. page 1's overlay lands on
     * all of them, so every page reads "১/৩" (see pdfProcessing.js: `singleMergeBuffer
     * || await runRender(...)`). With it, the template is rendered per page and gets
     * $pdf.pageNumber. Costs one Chromium render per page, which is why the whole
     * operation is skipped for single-page documents.
     *
     * Returns [] for single-page documents: a lone "১/১" is noise.
     */
    protected pdfPageNumberOperations(opts: {
        multipage: boolean;
        pageWidth: string;
        pageHeight: string;
        bottomMarginMm: number;
        fontCss: string;
    }): Record<string, unknown>[] {
        if (!opts.multipage) return [];

        // Runs inside jsreport's templating worker, not the browser — plain ES5.
        const helpers = `
function bnPageLabel(pageNumber, total) {
    var bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return (pageNumber + '/' + total).replace(/[0-9]/g, function (d) { return bn[+d]; });
}`;

        const content = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${opts.fontCss}
@page { size: ${opts.pageWidth} ${opts.pageHeight}; margin: 0; }
html, body { margin: 0; padding: 0; background: transparent; }
/* Exactly one page-sized block — this template renders once per page. */
.pg {
    position: relative;
    width: ${opts.pageWidth};
    height: ${opts.pageHeight};
    overflow: hidden;
}
/* Centred in the bottom margin band — the strip below the page frame's border. */
.pg-label {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: ${opts.bottomMarginMm}mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Times New Roman', 'SolaimanLipi', Times, serif;
    font-size: 10pt;
    font-weight: 700;
    color: #000;
}
</style></head><body>
<div class="pg"><div class="pg-label">{{bnPageLabel $pdf.pageNumber $pdf.pages.length}}</div></div>
</body></html>`;

        return [{
            type: 'merge',
            mergeWholeDocument: false,
            renderForEveryPage: true,
            template: {
                content,
                helpers,
                engine: 'handlebars',
                recipe: 'chrome-pdf',
                chrome: {
                    format: null,
                    width: opts.pageWidth,
                    height: opts.pageHeight,
                    landscape: false,
                    marginTop: '0', marginBottom: '0', marginLeft: '0', marginRight: '0',
                    printBackground: false,
                    displayHeaderFooter: false,
                },
            },
        }];
    }

    /** Parse paragraphText JSON into string array. */
    get parsedParagraphs(): string[] {
        if (!this.noteSheet?.paragraphText) return [];
        try {
            const arr = JSON.parse(this.noteSheet.paragraphText);
            return Array.isArray(arr) ? arr.filter((p: string) => p && p.trim()) : [];
        } catch { return []; }
    }

    formatDate(value: string | null | undefined): string {
        if (!value) return '—';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const locale = this.isEnglish() ? 'en-GB' : 'bn-BD';
            return d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
        } catch { return String(value); }
    }

    formatMonthYear(value: string | null | undefined): string {
        if (!value) return '—';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const locale = this.isEnglish() ? 'en-GB' : 'bn-BD';
            return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        } catch { return String(value); }
    }

    /** Full date (day + month + year), e.g. "২২ জুন ২০২৬" — used for note-sheet/signature dates. */
    formatFullDate(value: string | null | undefined): string {
        if (!value) return '—';
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            const locale = this.isEnglish() ? 'en-GB' : 'bn-BD';
            const day = d.toLocaleDateString(locale, { day: 'numeric' });
            const month = d.toLocaleDateString(locale, { month: 'long' });
            const year = d.toLocaleDateString(locale, { year: 'numeric' });
            return `${day} ${month} ${year}`;   // no comma
        } catch { return String(value); }
    }

    /** Convert English digits (0-9) in a string to Bangla digits (০-৯). */
    toBanglaDigits(input: string | number | null | undefined): string {
        if (input == null) return '';
        const map: Record<string, string> = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
        return String(input).replace(/[0-9]/g, (d) => map[d] ?? d);
    }

    /** Convert a number (1-99) to Bangla word. E.g. 10 → দশ, 15 → পনেরো */
    numberToBanglaWord(n: number): string {
        if (n <= 0 || n > 99) return '';
        const words: Record<number, string> = {
            1: 'এক', 2: 'দুই', 3: 'তিন', 4: 'চার', 5: 'পা���চ',
            6: 'ছয়', 7: 'সাত', 8: 'আট', 9: 'নয়', 10: 'দশ',
            11: 'এগারো', 12: 'বারো', 13: 'তেরো', 14: 'চৌদ্দ', 15: 'পনেরো',
            16: 'ষোলো', 17: 'সতেরো', 18: 'আঠারো', 19: 'উনিশ', 20: 'বিশ',
            21: 'একুশ', 22: 'বাইশ', 23: 'তেইশ', 24: 'চব্বিশ', 25: 'পঁচিশ',
            26: 'ছাব্বিশ', 27: 'সাতাশ', 28: 'আঠাশ', 29: 'উনত্রিশ', 30: 'ত্রিশ',
            31: 'একত্রিশ', 32: 'বত্রিশ', 33: 'তেত্রিশ', 34: 'চৌত্রিশ', 35: 'পঁয়ত্রিশ',
            36: 'ছত্রিশ', 37: 'সাতত্রিশ', 38: 'আটত্রিশ', 39: 'উনচল্লিশ', 40: 'চল্লিশ',
            41: 'একচল্লিশ', 42: 'ব��য়াল্লিশ', 43: 'তেতাল্লিশ', 44: 'চুয়াল্লিশ', 45: 'পঁয়তাল্লিশ',
            46: 'ছেচল্লিশ', 47: 'সাতচল্লিশ', 48: 'আটচল্লিশ', 49: 'উনপঞ্চাশ', 50: 'পঞ্চাশ',
            51: 'একান্ন', 52: 'বায়ান্ন', 53: 'তিপান্ন', 54: 'চুয়ান্ন', 55: 'পঞ্চান্ন',
            56: 'ছাপান্ন', 57: 'সাতান্ন', 58: 'আটান্ন', 59: 'উনষাট', 60: 'ষাট',
            61: 'একষট্টি', 62: 'বাষট্টি', 63: 'তেষট্টি', 64: 'চৌষট্টি', 65: 'পঁয়ষট্টি',
            66: 'ছেষট্টি', 67: 'সাতষট্টি', 68: 'আটষট্টি', 69: 'উনসত্তর', 70: 'সত্তর',
            71: 'একাত্তর', 72: 'বাহাত্তর', 73: 'তিয়াত্তর', 74: 'চুয়াত্তর', 75: 'পঁচাত্তর',
            76: 'ছিয়াত্তর', 77: 'সাতাত্তর', 78: 'আটাত্তর', 79: 'উনআশি', 80: 'আশি',
            81: 'একাশি', 82: 'বিরাশি', 83: 'তিরাশি', 84: 'চুরাশি', 85: 'পঁচাশি',
            86: 'ছিয়াশি', 87: 'সাতাশি', 88: 'আটাশি', 89: 'উননব্বই', 90: 'নব্বই',
            91: 'একানব্বই', 92: 'বিরানব্বই', 93: 'তিরানব্বই', 94: 'চুরানব্বই', 95: 'পঁচানব্বই',
            96: 'ছিয়ানব্বই', 97: 'সাতানব্বই', 98: 'আটানব্বই', 99: 'নিরানব্বই'
        };
        return words[n] ?? '';
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
        if (!this.isEnglish()) return this.purposeLabelMapBN[id] || this.purposeLabelMap[id] || '';
        return this.purposeLabelMap[id] ?? '';
    }

    getCountryLabel(id: number | null | undefined): string {
        if (id == null) return '';
        if (!this.isEnglish()) return this.countryLabelMapBN[id] || this.countryLabelMap[id] || '';
        return this.countryLabelMap[id] ?? '';
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
                    if (this.backHistory.length === 0) {
                        this.loadingBackHistory = false;
                        return;
                    }
                    const uniqueIds = [...new Set(this.backHistory.map(r => r.backedByEmployeeId))];
                    forkJoin(
                        uniqueIds.map(id => this.servingMembersService.getEmployeePersonalServiceOverview(id).pipe(catchError(() => of(null))))
                    ).subscribe({
                        next: (results) => {
                            const nameMap = new Map<number, string>();
                            results.forEach((emp, i) => { nameMap.set(uniqueIds[i], emp?.nameEnglish ?? 'Unknown'); });
                            for (const row of this.backHistory) {
                                row.backedByName = nameMap.get(row.backedByEmployeeId) ?? 'Unknown';
                            }
                            this.loadingBackHistory = false;
                        },
                        error: () => { this.loadingBackHistory = false; }
                    });
                },
                error: (err: any) => { this.loadingBackHistory = false; }
            });
    }

    getStatusLabel(status: string): string {
        return NoteSheetCurrentStatusOptions.find(o => o.value === status)?.label ?? status;
    }

    goBack(): void {
        // If we were opened from a list (e.g. a My-Approval list), return to exactly that list.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) {
            this.router.navigateByUrl(returnUrl);
            return;
        }
        const type = this.noteSheet?.noteSheetType;
        if (type === NoteSheetType.ExBDLeave) {
            this.router.navigate(['/notesheet-list/draft-ex-bd-leave']);
        } else if (type === NoteSheetType.NewPosting) {
            this.router.navigate(['/notesheet-list/pending-finalized-new-posting']);
        } else if (type === NoteSheetType.InterPosting) {
            this.router.navigate(['/notesheet-list/draft-inter-posting']);
        } else {
            this.router.navigate(['/notesheet-list/draft']);
        }
    }

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

        // Page size follows the selected option (subclasses declare selectedPageSize).
        const isLegal = (this as any).selectedPageSize === 'Legal';
        const pageSize = isLegal ? '215.9mm 355.6mm' : '210mm 297mm';

        win.document.write(
            `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Print</title>` +
            `<style>${chunks.join('\n')}\n` +
            `@page { size: ${pageSize}; margin: 5mm 8mm; }\n` +
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

        // Page size follows the selected option (subclasses declare selectedPageSize;
        // default A4 when absent). Margins below are 567 twips (10mm) each side, so the
        // usable text column = pageWidth - 1134 (A4 ≈ 10772, Legal ≈ 11106 twips).
        const isLegal = (this as any).selectedPageSize === 'Legal';
        const pageWidth = isLegal ? 12240 : 11906;   // twips (Legal 8.5in vs A4)
        const pageHeight = isLegal ? 20160 : 16838;   // twips (Legal 14in vs A4)
        const usableWidth = pageWidth - 1134;          // minus 2×567 side margins

        // Shared run properties: font + language so Word uses correct word-breaking
        const runProps: IRunPropertiesOptions = {
            font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman', eastAsia: 'Times New Roman', cs: 'SolaimanLipi' },
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
                const cw = Math.floor(usableWidth / maxCols);
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

        // Posting table
        if (this.isNewPosting() && this.postingEmployees.length > 0) {
            const cols = bn
                ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্পাউস জেলা (দায়িত্বপূর্ণ এলাকা)','পূর্ববতী কর্মস্থল (দায়িত্বপূর্ণ এলাকা)','বদলি কর্মস্থল','মন্তব্য']
                : ['Ser','Service ID','Rank','Trade','Name','Own District (Responsible Area)','Spouse District (Responsible Area)','Previous Workplace (Responsible Area)','Transfer Unit','Remarks'];
            const cw = Math.floor(usableWidth / cols.length);
            const headerRow = new TableRow({ tableHeader: true, children: cols.map(c => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c, ...runProps, size: 16, bold: true })], alignment: AlignmentType.CENTER })],
                borders: cellBorders, width: { size: cw, type: WidthType.DXA },
            })) });
            const dataRows = this.postingEmployees.map((emp, i) => new TableRow({ children: [
                String(i+1), emp.serviceId??'',
                bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''),
                bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''),
                bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''),
                bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''),
                bn?(emp.spousePermanentDistrictNameBN||emp.spousePermanentDistrictName||''):(emp.spousePermanentDistrictName??''),
                bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''),
                emp.transferRabUnitName??'', emp.remarks??''
            ].map(v => {
                const lines = v.split('\n');
                const cellParas = lines.map(line => new Paragraph({ children: [new TextRun({ text: line, ...runProps, size: 16 })] }));
                return new TableCell({ children: cellParas, borders: cellBorders, width: { size: cw, type: WidthType.DXA } });
            }) }));
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

        // ── Create document: page size follows selectedPageSize (A4 default / Legal) ──
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: { width: pageWidth, height: pageHeight, orientation: PageOrientation.PORTRAIT },
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
        const fontFamily = bn ? "'Times New Roman', 'SolaimanLipi', sans-serif" : "'Times New Roman', serif";
        const title = bn ? 'মন্তব্যপত্র' : 'NOTE SHEET';

        // Page size follows the selected option (subclasses override this method with a
        // JsReport path, so this is only the base fallback). A4 default / Legal.
        const pdfIsLegal = (this as any).selectedPageSize === 'Legal';
        const pdfPageSize = pdfIsLegal ? '215.9mm 355.6mm' : 'A4 portrait';
        const pdfPageWidth = pdfIsLegal ? '215.9mm' : '210mm';
        const pdfPageHeight = pdfIsLegal ? '355.6mm' : '297mm';

        const metaParts: string[] = [];
        if (this.noteSheet.noteSheetNo)     metaParts.push(`<strong>${bn ? 'মন্তব্যপত্র নং:' : 'Note-Sheet No:'}</strong> ${this.escapeHtml(this.noteSheet.noteSheetNo)}`);
        if (this.noteSheet.noteSheetDate)   metaParts.push(`<strong>${bn ? 'তারিখ:' : 'Date:'}</strong> ${this.escapeHtml(this.formatDate(this.noteSheet.noteSheetDate))}`);
        if (this.noteSheet.referenceNumber) metaParts.push(`<strong>${bn ? 'সুত্র:' : 'Reference:'}</strong> ${this.escapeHtml(this.noteSheet.referenceNumber)}`);

        let extraHtml = '';
        if (this.isNewPosting() && this.postingEmployees.length > 0) {
            const cols = bn
                ? ['ক্রমিক','ব্যক্তিগত নম্বর','পদবি','ট্রেড','নাম','নিজ জেলা (দায়িত্বপূর্ণ এলাকা)','স্পাউস জেলা (দায়িত্বপূর্ণ এলাকা)','পূর্ববতী কর্মস্থল (দায়িত্বপূর্ণ এলাকা)','বদলি কর্মস্থল','মন্তব্য']
                : ['Ser','Service ID','Rank','Trade','Name','Own District (Responsible Area)','Spouse District (Responsible Area)','Previous Workplace (Responsible Area)','Transfer Unit','Remarks'];
            const headerCells = cols.map(c => `<th>${this.escapeHtml(c)}</th>`).join('');
            const bodyRows = this.postingEmployees.map((emp, i) => {
                const vals = [String(i+1), emp.serviceId??'', bn?(emp.rankNameBN||emp.rankName||''):(emp.rankName??''), bn?(emp.tradeNameBN||emp.tradeName||''):(emp.tradeName??''), bn?(emp.fullNameBN||emp.fullNameEN||''):(emp.fullNameEN??''), bn?(emp.permanentDistrictNameBN||emp.permanentDistrictName||''):(emp.permanentDistrictName??''), bn?(emp.spousePermanentDistrictNameBN||emp.spousePermanentDistrictName||''):(emp.spousePermanentDistrictName??''), bn?(emp.motherOrgLocationNameBN||emp.motherOrgLocationName||''):(emp.motherOrgLocationName??''), emp.transferRabUnitName??'', emp.remarks??''];
                return `<tr>${vals.map(v => `<td>${this.escapeHtml(v)}</td>`).join('')}</tr>`;
            }).join('');
            extraHtml += `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        }

        const noteText   = this.noteSheet.note ? `<div class="note">${this.fixBanglaWordBreaks(this.noteSheet.note)}</div>` : '';
        const closing    = bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.';
        const sigHtml    = this.buildSignaturesHtml();

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${this.escapeHtml(title)}</title>
<style>
    @page { size: ${pdfPageSize}; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: ${fontFamily}; font-size: 8pt; margin: 0; padding: 0; color: #000; }
    .a4-page { width: ${pdfPageWidth}; min-height: ${pdfPageHeight}; margin: 0 auto; padding: 20mm; border: 2px solid #000; background: #fff; }
    .title { font-size: 9pt; text-align: center; font-weight: bold; text-decoration: underline; margin: 0 0 4px; }
    .title-bn { font-size: 9pt; text-align: center; text-decoration: underline; margin: 0 0 12px; }
    .doc-box { border: 1.5px solid #000; }
    .box-header { display: flex; border-bottom: 1.5px solid #000; }
    .box-subject { flex: 1; padding: 7px 12px; font-weight: bold; text-decoration: underline; font-size: 8pt; }
    .ref-line { padding: 5px 12px; font-size: 8pt; border-bottom: 1px solid #ccc; }
    .para { display: flex; gap: 8px; padding: 10px 12px; font-size: 8pt; line-height: 1.85; }
    .para-no { font-weight: 600; min-width: 28px; flex-shrink: 0; }
    .exbd-info { padding: 6px 12px 10px 40px; font-size: 8pt; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 7pt; }
    th, td { border: 1px solid #000; padding: 5px 7px; text-align: center; }
    th { font-weight: bold; background: #f5f5f5; font-size: 7pt; text-transform: uppercase; }
    .note { padding: 6px 12px; font-size: 8pt; border-top: 1px dashed #aaa; }
    .closing { margin-top: 14px; font-size: 8pt; text-indent: 2em; }
    .initiator-sig { margin-top: 10px; text-align: left; display: flex; flex-direction: column; align-items: flex-start; margin-left: 80%; font-size: 9pt; }
    .initiator-sig > * { text-align: left; }
    .sig-img { max-width: 160px; max-height: 60px; object-fit: contain; display: block; margin-bottom: 4px; }
    .approver-section { border-top: 1.5px solid #000; padding: 10px 12px 20px; min-height: 90px; font-size: 9pt; }
    .approver-role { text-decoration: underline; font-size: 9pt; margin-bottom: 6px; }
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
        <div class="box-header"><div class="box-subject">${this.escapeHtml(this.noteSheet.subject??'')}</div></div>
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
            const dateHtml = dateStr ? `<div style="font-size:9pt;text-align:center">${dateStr}</div>` : '';
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
