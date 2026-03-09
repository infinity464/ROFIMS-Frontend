import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { NotesheetSignatoryComponent } from '@/Components/Common/notesheet-signatory/notesheet-signatory';
import { RichEditorComponent } from '@/Components/Common/rich-editor/rich-editor';
import { NotesheetPreviewBase } from '../notesheet-preview-base';
import { FamilyInfoService, FamilyInfoByEmployeeView } from '@/services/family-info-service';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { NoteSheetCurrentStatus, NoteSheetOperationTypeOptions, ApprovalStatus } from '@/models/enums';
import { environment } from '@/Core/Environments/environment';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SafeHtml } from '@angular/platform-browser';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, ImageRun,
    VerticalAlign, TableLayoutType, HeightRule, PageOrientation
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { NotesheetDocumentModel, ContentBlock, SignatoryBlock } from '../notesheet-document-model';

@Component({
    selector: 'app-notesheet-preview-exbd',
    standalone: true,
    imports: [
        CommonModule, FormsModule, ButtonModule, ToastModule, TooltipModule,
        InputTextModule, TextareaModule, SelectModule, MultiSelectModule, DatePickerModule,
        NotesheetSignatoryComponent, RichEditorComponent
    ],
    providers: [MessageService],
    templateUrl: './notesheet-preview-exbd.html',
    styleUrl: '../notesheet-preview.scss'
})
export class NotesheetPreviewExbdComponent extends NotesheetPreviewBase {

    private readonly familyInfoService = inject(FamilyInfoService);
    private readonly commonCodeService = inject(CommonCodeService);

    // ── ExBD-specific data ─────────────────────────────────────
    leaveEmployee: EmployeePersonalServiceOverview | null = null;
    wingName = '';
    wingNameBN = '';
    familyMembers: FamilyInfoByEmployeeView[] = [];

    // ── Edit state ─────────────────────────────────────────────
    editing = false;
    saving = false;
    employeeOptions: { label: string; value: number }[] = [];
    purposeOptions: { label: string; value: number }[] = [];
    countryOptions: { label: string; value: number }[] = [];
    subjectTypeOptions: { label: string; value: number }[] = [];
    familyMemberEditOptions: { label: string; value: number }[] = [];

    // ── Edit model fields ──────────────────────────────────────
    editSubject = '';
    editExBdLeaveSubjectId: number | null = null;
    editReferenceNumber = '';
    editMainText = '';
    editNote = '';
    editNoteSheetDate: Date | null = null;
    editInitiatorId: number | null = null;
    editRecommenderIds: number[] = [];
    editFinalApproverId: number | null = null;
    editTextType: string = 'en';
    editOperationType: string | null = null;
    editEmployeeId: number | null = null;
    editPurposeId: number | null = null;
    editCountryId: number | null = null;
    editDateFrom: Date | null = null;
    editDateTo: Date | null = null;
    editFamilyMemberIds: number[] = [];

    // ── Dropdown options ───────────────────────────────────────
    textTypeOptions = [
        { label: 'English', value: 'en' },
        { label: 'Bangla', value: 'bn' }
    ];
    readonly operationTypeOptions = NoteSheetOperationTypeOptions;

    // ── Computed ───────────────────────────────────────────────
    get canEdit(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Draft;
    }

    get isInitiatorStatus(): boolean {
        return this.noteSheet?.currentStatus?.toLowerCase() === NoteSheetCurrentStatus.Initiator;
    }

    // ── Data loading ──────────────────────────────────────────
    protected override loadApprovalChain(): void {
        super.loadApprovalChain();
        this.loadExbdDetails();
    }

    private loadExbdDetails(): void {
        const ns = this.noteSheet;
        if (!ns) return;

        this.loadSubjectTypeOptions();

        if (ns.employeeId && ns.employeeId > 0) {
            this.servingMembersService.getEmployeePersonalServiceOverview(ns.employeeId)
                .pipe(catchError(() => of(null)))
                .subscribe(emp => { this.leaveEmployee = emp; });
        }

        if (ns.wingBattalionId && ns.wingBattalionId > 0 && ns.unitId && ns.unitId > 0) {
            this.masterBasicSetup.getByParentId(ns.unitId)
                .pipe(catchError(() => of([])))
                .subscribe(list => {
                    const found = (list ?? []).find(c => c.codeId === ns.wingBattalionId);
                    if (found) {
                        this.wingName = found.codeValueEN || '';
                        this.wingNameBN = found.codeValueBN || '';
                    }
                });
        }

        if (ns.employeeId && ns.employeeId > 0 && ns.familyInfoJson) {
            try {
                const famIds = JSON.parse(ns.familyInfoJson) as { employeeId?: number; familyMemberId?: number; FamilyMemberId?: number }[];
                if (Array.isArray(famIds) && famIds.length > 0) {
                    this.familyInfoService.getFamilyInfoByEmployeeView(ns.employeeId)
                        .pipe(catchError(() => of([])))
                        .subscribe(allFam => {
                            const selectedIds = famIds.map(f => f.familyMemberId ?? f.FamilyMemberId ?? 0);
                            this.familyMembers = (allFam ?? []).filter(f => selectedIds.includes(f.ser));
                        });
                }
            } catch { /* ignore */ }
        }
    }

    // ── Formatted paragraph (view mode) ───────────────────────
    getFormattedParagraphHtml(): SafeHtml {
        const html = this.buildParagraphHtml();
        if (this._paraCache?.raw === html) return this._paraCache.safe;
        const safe = this.sanitizer.bypassSecurityTrustHtml(html);
        this._paraCache = { raw: html, safe };
        return safe;
    }
    private _paraCache: { raw: string; safe: SafeHtml } | null = null;

    /** Build formatted paragraph as plain text (for export) */
    buildParagraphText(): string {
        return this.stripHtml(this.buildParagraphHtml());
    }

    private buildParagraphHtml(): string {
        const ns = this.noteSheet;
        if (!ns) return '';
        const bn = !this.isEnglish();
        const emp = this.leaveEmployee;

        const unitName = emp ? (bn ? (emp.rabUnitBN || emp.rabUnit) : emp.rabUnit) || '' : '';
        const wing = bn ? (this.wingNameBN || this.wingName) : this.wingName;
        const rabId = emp?.rabId || '';
        const empName = emp ? (bn ? (emp.nameBN || emp.nameEnglish) : emp.nameEnglish) || '' : '';
        const rank = emp ? (bn ? (emp.armyRankBN || emp.armyRank) : emp.armyRank) || '' : '';

        let familyText = '';
        if (this.familyMembers.length > 0) {
            const parts = this.familyMembers.map(f => {
                const rel = bn ? (f.relationBN || f.relation) : f.relation;
                const name = bn ? (f.nameBN || f.name) : f.name;
                return rel && name ? `${rel} ${name}` : (name || rel || '');
            }).filter(Boolean);
            familyText = parts.join(', ');
        }

        const country = ns.destinationCountryId != null ? this.getCountryLabel(ns.destinationCountryId) : '';
        const purposeId = ns.purposeOfExBdLeaveId ?? (ns as any).purposeId ?? null;
        const purpose = purposeId != null ? this.getPurposeLabel(purposeId) : '';
        const visitFrom = ns.dateOfVisitFrom ?? (ns as any).fromDate ?? null;
        const visitTo = ns.dateOfVisitTo ?? (ns as any).toDate ?? null;
        const fromDate = visitFrom ? this.formatDate(visitFrom) : '';
        const toDate = visitTo ? this.formatDate(visitTo) : '';
        let totalDays = ns.totalDays ?? (ns as any).totalDays ?? 0;
        if (!totalDays && visitFrom && visitTo) {
            try {
                const f = new Date(visitFrom), t = new Date(visitTo);
                if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
                    totalDays = Math.max(0, Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                }
            } catch { /* ignore */ }
        }

        let text = '';
        if (bn) {
            text = `বর্তমানে ${unitName}`;
            if (wing) text += `, ${wing}`;
            text += `-এ কর্মরত, ${rabId}: ${rank} ${empName}`;
            if (familyText) text += `, তাঁর পরিবারের সদস্য ${familyText}-এর`;
            text += ` ${country}-তে ${purpose}-এর জন্য নিরাপত্তা ছাড়পত্রের আবেদন জমা দিয়েছেন`;
            if (fromDate && toDate) text += ` ${fromDate} থেকে ${toDate} পর্যন্ত`;
            if (totalDays > 0) text += `, অথবা ভ্রমণের তারিখ থেকে ${totalDays} দিনের মধ্যে`;
            text += '।';
        } else {
            text = `Currently, working at the ${unitName}`;
            if (wing) text += `, ${wing}`;
            text += `, ${rabId}: ${rank} ${empName}`;
            text += `, has submitted a request for a security clearance`;
            if (familyText) text += ` for his family ${familyText}`;
            if (country) text += ` to travel to ${country}`;
            if (purpose) text += ` for ${purpose}`;
            if (fromDate && toDate) text += ` from ${fromDate} to ${toDate}`;
            if (totalDays > 0) text += `, or within ${totalDays} days from the date of travel`;
            text += '.';
        }

        const mainText = ns.mainText?.trim();
        if (mainText) {
            const inline = mainText.replace(/^<p[^>]*>/i, '').replace(/<\/p>\s*$/i, '');
            text += ' ' + inline;
        }

        return text;
    }

    // ── Toggle edit mode ──────────────────────────────────────
    toggleEdit(): void {
        if (!this.noteSheet) return;
        this.editing = true;
        const ns = this.noteSheet;

        this.editSubject = ns.subject ?? '';
        this.editExBdLeaveSubjectId = ns.exBdLeaveSubjectId ?? null;
        this.editReferenceNumber = ns.referenceNumber ?? '';
        this.editMainText = ns.mainText ?? '';
        this.editNote = ns.note ?? '';
        this.editNoteSheetDate = ns.noteSheetDate ? new Date(ns.noteSheetDate) : null;
        this.editTextType = (ns.textType ?? 0) === 1 ? 'bn' : 'en';
        this.editOperationType = ns.noteSheetOperationType ?? null;

        this.editInitiatorId = ns.initiatorId ?? null;
        this.editRecommenderIds = this.parseRecommenderIds();
        this.editFinalApproverId = (ns.finalApprovalId && ns.finalApprovalId > 0)
            ? ns.finalApprovalId
            : (ns.finalApproverId && ns.finalApproverId > 0 ? ns.finalApproverId : null);

        // ExBD-specific fields
        this.editEmployeeId = ns.employeeId ?? null;
        this.editPurposeId = ns.purposeOfExBdLeaveId ?? (ns as any).purposeId ?? null;
        this.editCountryId = ns.destinationCountryId ?? (ns as any).DestinationCountryId ?? null;
        const rawFrom = ns.dateOfVisitFrom ?? (ns as any).fromDate ?? null;
        const rawTo = ns.dateOfVisitTo ?? (ns as any).toDate ?? null;
        this.editDateFrom = rawFrom ? new Date(rawFrom) : null;
        this.editDateTo = rawTo ? new Date(rawTo) : null;
        this.editFamilyMemberIds = this.parseFamilyMemberIds();

        if (this.employeeOptions.length === 0) this.loadEmployeeOptions();
        this.loadPurposeOptions();
        this.loadCountryOptions();
        if (this.editEmployeeId) this.loadFamilyMemberOptions(this.editEmployeeId);
    }

    cancelEdit(): void {
        this.editing = false;
    }

    // ── Load dropdown options ─────────────────────────────────
    private loadEmployeeOptions(): void {
        const api = `${environment.apis.core}/EmployeeInfo`;
        this.http.get<any[]>(`${api}/GetAll`).subscribe({
            next: (list) => {
                this.employeeOptions = (Array.isArray(list) ? list : []).map((e: any) => {
                    const name = e.fullNameEN || e.FullNameEN || '';
                    const rabId = e.rabid || e.Rabid || e.RABID || '';
                    const serviceId = e.serviceId || e.ServiceId || '';
                    const parts = [name, rabId ? `RAB: ${rabId}` : '', serviceId ? `SVC: ${serviceId}` : ''].filter(Boolean);
                    return {
                        label: parts.join(' | ') || `ID ${e.employeeID ?? e.EmployeeID}`,
                        value: e.employeeID ?? e.EmployeeID
                    };
                });
            },
            error: () => this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load employee list.' })
        });
    }

    private loadPurposeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('VisitType')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.purposeOptions = (list ?? []).map((c: any) => ({ label: c.codeValueEN || c.displayCodeValueEN || '', value: c.codeId }));
            });
    }

    private loadSubjectTypeOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('SubjectType')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.subjectTypeOptions = (list ?? []).map((c: any) => ({ label: c.codeValueEN || c.displayCodeValueEN || '', value: c.codeId }));
            });
    }

    getSubjectLabel(id: number | null | undefined): string {
        if (id == null) return '';
        const o = this.subjectTypeOptions.find(opt => opt.value === id);
        return o ? o.label : '';
    }

    private loadCountryOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Country')
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.countryOptions = (list ?? []).map((c: any) => ({ label: c.codeValueEN || c.displayCodeValueEN || '', value: c.codeId }));
            });
    }

    private loadFamilyMemberOptions(employeeId: number): void {
        this.familyInfoService.getFamilyInfoByEmployeeView(employeeId)
            .pipe(catchError(() => of([])))
            .subscribe(list => {
                this.familyMemberEditOptions = (list ?? []).map(f => ({
                    label: `${f.relation || ''} - ${f.name || ''}`.trim(),
                    value: f.ser
                }));
            });
    }

    // ── Save changes ──────────────────────────────────────────
    saveChanges(): void {
        if (!this.noteSheet || this.saving) return;
        this.saving = true;

        const recommendersJson = this.buildRecommendersJson();
        const familyInfoJson = this.editFamilyMemberIds.length > 0
            ? JSON.stringify(this.editFamilyMemberIds.map(id => ({ employeeId: this.editEmployeeId, familyMemberId: id })))
            : null;
        const now = new Date().toISOString();

        const resolvedSubject = this.getSubjectLabel(this.editExBdLeaveSubjectId) || this.editSubject;
        const payload: Record<string, unknown> = {
            ...this.noteSheet,
            subject: resolvedSubject,
            exBdLeaveSubjectId: this.editExBdLeaveSubjectId,
            referenceNumber: this.editReferenceNumber,
            mainText: this.editMainText,
            note: this.editNote || null,
            textType: this.editTextType === 'bn' ? 1 : 0,
            noteSheetOperationType: this.editOperationType,
            noteSheetDate: this.editNoteSheetDate ? this.formatDateOnly(this.editNoteSheetDate) : this.noteSheet.noteSheetDate,
            initiatorId: this.editInitiatorId ?? 0,
            recommendersJson,
            finalApprovalId: this.editFinalApproverId ?? null,
            employeeId: this.editEmployeeId ?? null,
            purposeId: this.editPurposeId ?? null,
            destinationCountryId: this.editCountryId ?? null,
            fromDate: this.editDateFrom ? this.formatDateOnly(this.editDateFrom) : null,
            toDate: this.editDateTo ? this.formatDateOnly(this.editDateTo) : null,
            familyInfoJson,
            lastUpdatedBy: this.noteSheet.lastUpdatedBy ?? this.noteSheet.createdBy ?? 'system',
            lastupdate: now
        };

        this.http.post(`${this.api}/UpdateAsyn`, payload).subscribe({
            next: () => {
                this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Note-sheet updated successfully.' });
                this.editing = false;
                this.saving = false;
                this.reloadNoteSheet();
            },
            error: () => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update note-sheet.' });
                this.saving = false;
            }
        });
    }

    private reloadNoteSheet(): void {
        if (!this.noteSheetId) return;
        this.initiatorDetails = null;
        this.approversDetails = [];
        this.preparedByDetails = null;
        this.leaveEmployee = null;
        this.familyMembers = [];
        this._paraCache = null;
        this.loadNoteSheet();
    }

    // ── Recommender helpers ───────────────────────────────────
    private parseRecommenderIds(): number[] {
        if (!this.noteSheet) return [];
        const rawJson = this.noteSheet.recommendersJson ?? this.noteSheet.recommenderIdsJson;
        if (!rawJson || typeof rawJson !== 'string') return [];
        try {
            const arr = JSON.parse(rawJson);
            if (!Array.isArray(arr) || arr.length === 0) return [];
            if (typeof arr[0] === 'object' && arr[0] !== null) {
                return arr.map((r: any) => r.recomender_id ?? r.recomenderId ?? r.RecomenderId).filter(Boolean);
            }
            return arr.filter((x: any) => typeof x === 'number');
        } catch { return []; }
    }

    private buildRecommendersJson(): string | null {
        if (!this.editRecommenderIds || this.editRecommenderIds.length === 0) return null;
        let existingMap: Record<number, any> = {};
        if (this.noteSheet?.recommendersJson) {
            try {
                const arr = JSON.parse(this.noteSheet.recommendersJson);
                if (Array.isArray(arr)) {
                    arr.forEach((r: any) => {
                        const id = r.recomender_id ?? r.recomenderId;
                        if (id) existingMap[id] = r;
                    });
                }
            } catch { /* ignore */ }
        }
        return JSON.stringify(this.editRecommenderIds.map((id, idx) => {
            const existing = existingMap[id];
            return {
                recomender_no: idx + 1,
                recomender_id: id,
                recomender_status: existing?.recomender_status ?? ApprovalStatus.Pending,
                recomender_approve_remark: existing?.recomender_approve_remark ?? '',
                recomender_cancel_remark: existing?.recomender_cancel_remark ?? '',
                recomender_approved_date: existing?.recomender_approved_date ?? null
            };
        }));
    }

    private parseFamilyMemberIds(): number[] {
        if (!this.noteSheet?.familyInfoJson) return [];
        try {
            const arr = JSON.parse(this.noteSheet.familyInfoJson) as any[];
            return Array.isArray(arr) ? arr.map(f => f.familyMemberId ?? f.FamilyMemberId ?? 0).filter(Boolean) : [];
        } catch { return []; }
    }

    private formatDateOnly(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // ═══════════════════════════════════════════════════════════
    // ── Export: shared document model (follows general notesheet)
    // ═══════════════════════════════════════════════════════════

    override async exportPdf(): Promise<void> {
        if (!this.noteSheet) return;
        try {
            const pdf = await this.buildPdfDocument();
            pdf.save(`NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.pdf`);
        } catch {
            this.messageService.add({ severity: 'error', summary: 'Export Error', detail: 'Failed to generate PDF.' });
        }
    }

    override async exportWord(): Promise<void> {
        if (!this.noteSheet) return;
        const doc = await this.buildWordDocument();
        saveAs(await Packer.toBlob(doc), `NoteSheet_${this.noteSheet.noteSheetNo ?? 'export'}.docx`);
    }

    private buildDocumentModel(): NotesheetDocumentModel {
        if (!this.noteSheet) throw new Error('No noteSheet');
        const bn = !this.isEnglish();

        const refHtml = this.fixBanglaWordBreaks(this.noteSheet.referenceNumber ?? '');
        const refBlocks = refHtml ? this.parseHtmlToContentBlocks(refHtml) : [];

        // For ExBD, the main content is the formatted paragraph
        const paraText = this.buildParagraphText();
        const mainBlocks: ContentBlock[] = paraText ? [{ type: 'paragraph', text: paraText, indent: 'normal', alignment: 'justify' }] : [];

        const model: NotesheetDocumentModel = {
            isBangla: bn,
            subject: this.getSubjectLabel(this.noteSheet.exBdLeaveSubjectId) || this.noteSheet.subject || '',
            referenceBlocks: refBlocks,
            referenceLabel: bn ? 'সূত্রঃ ' : 'Reference: ',
            dateLabel: bn ? 'তারিখঃ ' : 'Date: ',
            dateValue: this.formatDate(this.noteSheet.noteSheetDate),
            mainSerialText: this.serial(1),
            mainBlocks,
            closingText: bn ? 'আপনার সদয় অনুমোদনের জন্য উপস্থাপন করা হলো।' : 'Presented for your kind approval.',
            approvers: [],
            enclLabel: bn ? 'সংলগ্নী' : 'Encl.',
            enclNoLabel: bn ? 'নং' : 'No.'
        };
        if (this.noteSheet.note) model.note = this.noteSheet.note;

        if (this.initiatorDetails) {
            const d = this.initiatorDetails;
            const nameStr = bn ? (d.nameBN || d.name) : d.name;
            const rankStr = (d.rank && d.rank !== '-') ? `, ${bn ? (d.rankBN || d.rank) : d.rank}` : '';
            model.initiator = {
                role: '',
                serialText: '',
                nameLine: `(${nameStr}${rankStr})`,
                appointment: bn ? (d.appointmentBN || d.appointment) : d.appointment,
                date: this.noteSheet.noteSheetDate ? this.formatDate(this.noteSheet.noteSheetDate) : undefined,
                align: 'right',
                signatureDataUrl: this.shouldShowSignature(d.step) ? d.signatureDataUrl : undefined
            };
        }

        for (let i = 0; i < this.approversDetails.length; i++) {
            const a = this.approversDetails[i];
            const role = bn ? (a.appointmentBN || a.appointment) : a.appointment;
            const remark = this.getApproverRemark(a.step);
            const approverDate = this.getApproverDate(a.step);
            model.approvers.push({
                role,
                serialText: this.serial(i + 2),
                remark: remark || undefined,
                signatureDataUrl: this.shouldShowSignature(a.step) ? a.signatureDataUrl : undefined,
                nameLine: '',
                date: approverDate || undefined,
                align: 'center'
            });
        }
        return model;
    }

    private parseHtmlToContentBlocks(html: string): ContentBlock[] {
        if (!html) return [];
        const div = document.createElement('div');
        div.innerHTML = html;
        const blocks: ContentBlock[] = [];
        for (const node of Array.from(div.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = this.normalizeTextForWord((node.textContent || '').trim());
                if (text) blocks.push({ type: 'paragraph', text, indent: 'normal' });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                const tag = el.tagName.toLowerCase();
                if (tag === 'table') {
                    const rows: string[][] = [];
                    el.querySelectorAll('tr').forEach(tr => {
                        const cells: string[] = [];
                        tr.querySelectorAll('td, th').forEach(td => cells.push(this.normalizeTextForWord((td.textContent || '').trim())));
                        if (cells.length) rows.push(cells);
                    });
                    if (rows.length) blocks.push({ type: 'table', rows });
                } else {
                    const text = this.normalizeTextForWord((el.textContent || '').trim());
                    if (text) {
                        const bold = ['strong', 'b', 'h1', 'h2', 'h3'].includes(tag);
                        const italic = tag === 'em' || tag === 'i';
                        blocks.push({ type: 'paragraph', text, bold, italic, indent: 'normal' });
                    }
                }
            }
        }
        return blocks;
    }

    private normalizeTextForWord(s: string): string {
        return s.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
    }

    // ── PDF Export ─────────────────────────────────────────────
    private async buildPdfDocument(): Promise<jsPDF> {
        const model = this.buildDocumentModel();
        const html = this.modelToHtml(model);
        const fontFamily = model.isBangla ? "'Noto Sans Bengali','SolaimanLipi','Kalpurush',sans-serif" : "'Times New Roman',serif";

        const container = document.createElement('div');
        container.style.cssText = 'position:absolute;left:-9999px;top:0;width:720px;padding:14mm 10mm;font-size:12pt;line-height:1.6;background:#fff;z-index:-1;overflow:visible;box-sizing:border-box';
        container.style.fontFamily = fontFamily;
        container.innerHTML = `
            <style>
              .ns-pdf-wrap, .ns-pdf-wrap * { word-wrap:break-word!important; overflow-wrap:break-word!important; white-space:normal!important; max-width:100%!important; box-sizing:border-box!important; }
              .ns-pdf-wrap img { max-width:100%!important; height:auto!important; }
              .ns-pdf-wrap table, .ns-pdf-wrap th, .ns-pdf-wrap td { border:1px solid #000; padding:4px; white-space:normal!important; }
            </style>
            <div class="ns-pdf-wrap" style="font-family:${fontFamily};color:#000;width:100%">${html}</div>`;

        document.body.appendChild(container);

        try {
            await new Promise(resolve => setTimeout(resolve, 300));
            const canvas = await html2canvas(container, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
                scrollY: -window.scrollY, height: container.scrollHeight, windowHeight: container.scrollHeight
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'legal' });
            const margin = 10;
            const pdfWidth = pdf.internal.pageSize.getWidth() - margin * 2;
            const pdfPageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
            const ratio = pdfWidth / imgWidth;
            const scaledHeight = imgHeight * ratio;

            if (scaledHeight <= pdfPageHeight) {
                pdf.addImage(imgData, 'JPEG', margin, margin, pdfWidth, scaledHeight);
            } else {
                let remainingHeight = imgHeight;
                let srcY = 0;
                const sliceHeight = Math.floor(pdfPageHeight / ratio);
                while (remainingHeight > 0) {
                    const currentSlice = Math.min(sliceHeight, remainingHeight);
                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = imgWidth;
                    sliceCanvas.height = currentSlice;
                    const ctx = sliceCanvas.getContext('2d')!;
                    ctx.drawImage(canvas, 0, srcY, imgWidth, currentSlice, 0, 0, imgWidth, currentSlice);
                    const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);
                    const slicePdfH = currentSlice * ratio;
                    if (srcY > 0) pdf.addPage('legal', 'p');
                    pdf.addImage(sliceData, 'JPEG', margin, margin, pdfWidth, slicePdfH);
                    srcY += currentSlice;
                    remainingHeight -= currentSlice;
                }
            }
            return pdf;
        } finally {
            document.body.removeChild(container);
        }
    }

    private modelToHtml(model: NotesheetDocumentModel): string {
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const block = (b: ContentBlock): string => {
            if (b.type === 'table' && b.rows?.length) {
                const th = (r: string[]) => r.map(c => `<th style="border:1px solid #000;padding:5px 8px;font-weight:bold">${esc(c)}</th>`).join('');
                const td = (r: string[]) => r.map(c => `<td style="border:1px solid #000;padding:5px 8px">${esc(c)}</td>`).join('');
                const header = b.rows[0] ? `<tr>${th(b.rows[0])}</tr>` : '';
                const body = b.rows.slice(1).map(r => `<tr>${td(r)}</tr>`).join('');
                return `<table style="width:100%;border-collapse:collapse;margin:6px 0"><thead>${header}</thead><tbody>${body}</tbody></table>`;
            }
            if (!b.text) return '';
            const tag = b.bold ? 'strong' : b.italic ? 'em' : 'span';
            const style = [`text-align:${b.alignment ?? 'justify'}`];
            return `<p style="${style.join(';')};margin:0 0 0.4rem"><${tag}>${esc(b.text)}</${tag}></p>`;
        };

        let mainContent = '';

        mainContent += `<div style="padding:7px 16px 7px 20px;font-size:12pt;font-weight:bold;text-decoration:underline">${esc(model.subject)}</div>`;

        mainContent += '<div style="padding:5px 16px 5px 20px;font-size:12pt">';
        if (model.referenceBlocks.length > 0 || this.noteSheet?.referenceNumber) {
            mainContent += `<span style="font-weight:700">${esc(model.referenceLabel)}</span>`;
            if (model.referenceBlocks.length > 0) {
                model.referenceBlocks.forEach(b => { mainContent += block(b); });
            } else {
                mainContent += esc(this.stripHtml(this.noteSheet!.referenceNumber ?? ''));
            }
        } else if (this.noteSheet?.noteSheetDate) {
            mainContent += `<span style="font-weight:700">${esc(model.dateLabel)}</span>${esc(model.dateValue)}`;
        }
        mainContent += '</div>';

        mainContent += '<div style="padding:10px 16px 10px 20px;font-size:12pt;line-height:1.85;display:flex;gap:8px;text-align:justify">';
        mainContent += `<span style="font-weight:700;min-width:30px;flex-shrink:0">${esc(model.mainSerialText)}</span>`;
        mainContent += '<div style="flex:1;min-width:0">';
        model.mainBlocks.forEach(b => { mainContent += block(b); });
        mainContent += '</div></div>';

        if (model.note) {
            mainContent += `<div style="padding:5px 16px 5px 20px;font-size:12pt"><strong>${model.isBangla ? 'নোটঃ ' : 'Note: '}</strong>${esc(model.note)}</div>`;
        }

        mainContent += `<div style="padding:10px 16px 10px 20px;font-size:12pt;text-indent:2em">${esc(model.closingText)}</div>`;

        if (model.initiator) {
            mainContent += '<div style="padding:8px 16px 8px 20px;text-align:right;margin-top:24px;min-height:60px">';
            if (model.initiator.signatureDataUrl) {
                mainContent += `<img src="${model.initiator.signatureDataUrl}" style="max-width:80px;max-height:32px;display:block;margin-left:auto;margin-bottom:8px" />`;
            } else {
                mainContent += '<div style="min-height:48px;margin-bottom:8px"></div>';
            }
            mainContent += `<div style="font-size:11pt">${esc(model.initiator.nameLine)}</div>`;
            if (model.initiator.appointment) mainContent += `<div>${esc(model.initiator.appointment)}</div>`;
            if (model.initiator.date) mainContent += `<div>${esc(model.initiator.date)}</div>`;
            mainContent += '</div>';
        }

        model.approvers.forEach(ap => {
            mainContent += '<div style="padding:6px 16px 10px 20px;min-height:60px;margin-top:12px">';
            mainContent += `<div style="text-decoration:underline;font-size:12pt;margin-bottom:6px">${esc(ap.role)}</div>`;
            mainContent += `<div style="font-size:12pt"><strong>${esc(ap.serialText)}</strong>${ap.remark ? `<em> ${esc(ap.remark)}</em>` : ''}</div>`;
            if (ap.signatureDataUrl) {
                mainContent += `<img src="${ap.signatureDataUrl}" style="max-width:80px;max-height:32px;display:block;margin:8px auto 0" />`;
            } else {
                mainContent += '<div style="min-height:48px;margin-top:8px"></div>';
            }
            if (ap.date) mainContent += `<div style="font-size:10pt;text-align:center">${esc(ap.date)}</div>`;
            mainContent += '</div>';
        });

        const sanglagniText = model.isBangla ? 'সংলগ্নী<br>নং' : 'Encl.<br>No.';
        return `
<div style="text-align:center;margin-bottom:8px">
  <div style="font-size:16pt;font-weight:bold;text-decoration:underline;letter-spacing:2px">NOTE SHEET</div>
  <div style="font-size:12pt;text-decoration:underline;margin-top:2px">মন্তব্য পত্র</div>
</div>
<div style="border:1.5px solid #000;display:table;width:100%;table-layout:fixed">
  <div style="display:table-cell;vertical-align:top;width:auto">
    ${mainContent}
  </div>
  <div style="display:table-cell;vertical-align:top;width:60px;min-width:60px;border-left:1.5px solid #000;font-size:10pt;text-align:center;padding:6px 12px;line-height:1.4">
    ${sanglagniText}
  </div>
</div>`;
    }

    // ── Word Export ────────────────────────────────────────────
    private async buildWordDocument(): Promise<Document> {
        const model = this.buildDocumentModel();
        const bn = model.isBangla;
        const font = bn
            ? { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const }
            : 'Times New Roman';
        const csSize = bn ? 24 : undefined;
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const thickBorder = { style: BorderStyle.SINGLE, size: 3, color: '000000' };
        const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

        const mainChildren: (Paragraph | Table)[] = [];

        // Subject
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: model.subject, bold: true, underline: {}, size: 24, sizeComplexScript: csSize, font, language: lang })],
            spacing: { before: 140, after: 80 }, indent: { left: 240 }
        }));

        // Reference / Date
        if (model.referenceBlocks.length > 0 || this.noteSheet?.referenceNumber) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.referenceLabel, bold: true, size: 24, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { after: model.referenceBlocks.length > 0 ? 40 : 80 }
            }));
            if (model.referenceBlocks.length > 0) {
                mainChildren.push(...this.contentBlocksToDocx(model.referenceBlocks, font, bn));
            } else {
                const plain = this.stripHtml(this.noteSheet!.referenceNumber ?? '');
                if (plain) mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: plain, size: 24, sizeComplexScript: csSize, font, language: lang })],
                    indent: { left: 480 }, spacing: { after: 80 }
                }));
            }
        } else if (this.noteSheet?.noteSheetDate) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: model.dateLabel, bold: true, size: 24, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: model.dateValue, size: 24, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { after: 80 }
            }));
        }

        // Serial + main paragraph
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: model.mainSerialText, bold: true, size: 24, sizeComplexScript: csSize, font, language: lang })],
            indent: { left: 240 }, spacing: { before: 160, after: 40 }
        }));
        mainChildren.push(...this.contentBlocksToDocx(model.mainBlocks, font, bn));

        // Note
        if (model.note) {
            mainChildren.push(new Paragraph({
                children: [
                    new TextRun({ text: bn ? 'নোটঃ ' : 'Note: ', bold: true, size: 24, sizeComplexScript: csSize, font, language: lang }),
                    new TextRun({ text: model.note, size: 24, sizeComplexScript: csSize, font, language: lang })
                ],
                indent: { left: 240 }, spacing: { before: 80, after: 80 }
            }));
        }

        // Closing text
        mainChildren.push(new Paragraph({
            children: [new TextRun({ text: model.closingText, size: 24, sizeComplexScript: csSize, font, language: lang })],
            indent: { left: 240, firstLine: 480 }, spacing: { before: 200 }
        }));

        // Initiator
        if (model.initiator) {
            if (model.initiator.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(model.initiator.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.RIGHT, spacing: { before: 280, after: 80 }
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 280, after: 80 } }));
            }
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: model.initiator.nameLine, size: 22, sizeComplexScript: csSize, font, language: lang })],
                alignment: AlignmentType.RIGHT,
                spacing: !model.initiator.signatureDataUrl ? { before: 280 } : { after: 40 }
            }));
            if (model.initiator.appointment) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.appointment, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.RIGHT
                }));
            }
            if (model.initiator.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: model.initiator.date, size: 22, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.RIGHT
                }));
            }
        }

        // Approvers
        for (const ap of model.approvers) {
            mainChildren.push(new Paragraph({
                children: [new TextRun({ text: ap.role, underline: {}, size: 24, sizeComplexScript: csSize, font, language: lang })],
                indent: { left: 240 }, spacing: { before: 280 }
            }));
            const runs: TextRun[] = [new TextRun({ text: ap.serialText, bold: true, size: 24, sizeComplexScript: csSize, font, language: lang })];
            if (ap.remark) runs.push(new TextRun({ text: ` ${ap.remark}`, italics: true, size: 24, sizeComplexScript: csSize, font, language: lang }));
            mainChildren.push(new Paragraph({ children: runs, indent: { left: 240 } }));
            if (ap.signatureDataUrl) {
                try {
                    mainChildren.push(new Paragraph({
                        children: [new ImageRun({
                            type: 'png', data: this.base64ToBytes(ap.signatureDataUrl),
                            transformation: { width: 100, height: 40 }
                        })],
                        alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 }
                    }));
                } catch { /* no sig */ }
            } else {
                mainChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 } }));
            }
            if (ap.date) {
                mainChildren.push(new Paragraph({
                    children: [new TextRun({ text: ap.date, size: 20, sizeComplexScript: csSize, font, language: lang })],
                    alignment: AlignmentType.CENTER
                }));
            }
        }

        // Outer bordered table (main + sanglagni)
        const rowHeight = 17800;
        const outerTable = new Table({
            layout: TableLayoutType.FIXED,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [10473, 800],
            rows: [new TableRow({
                height: { value: rowHeight, rule: HeightRule.ATLEAST },
                children: [
                    new TableCell({
                        width: { size: 10473, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: noBorder },
                        margins: { right: 200 },
                        children: mainChildren.length > 0 ? mainChildren : [new Paragraph({})]
                    }),
                    new TableCell({
                        width: { size: 800, type: WidthType.DXA },
                        borders: { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder },
                        verticalAlign: VerticalAlign.TOP,
                        children: [
                            new Paragraph({ children: [new TextRun({ text: bn ? 'সংলগ্নী' : 'Encl.', size: 20, font: bn ? 'Nirmala UI' : 'Times New Roman' })], alignment: AlignmentType.CENTER }),
                            new Paragraph({ children: [new TextRun({ text: bn ? 'নং' : 'No.', size: 20, font: bn ? 'Nirmala UI' : 'Times New Roman' })], alignment: AlignmentType.CENTER })
                        ]
                    })
                ]
            })]
        });

        const docChildren: (Paragraph | Table)[] = [];
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'NOTE SHEET', bold: true, underline: {}, size: 32, font: 'Times New Roman' })],
            alignment: AlignmentType.CENTER, spacing: { after: 40 }, keepNext: true
        }));
        docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'মন্তব্য পত্র', underline: {}, size: 24, font: 'Nirmala UI' })],
            alignment: AlignmentType.CENTER, spacing: { after: 160 }, keepNext: true
        }));
        docChildren.push(outerTable);

        return new Document({
            styles: bn ? { default: { document: { run: { language: { value: 'bn-BD', bidirectional: 'bn-BD' } } } } } : undefined,
            sections: [{
                properties: { page: { size: { width: 12240, height: 20160, orientation: PageOrientation.PORTRAIT }, margin: { top: 567, right: 400, bottom: 400, left: 567 } } },
                children: docChildren
            }]
        });
    }

    private contentBlocksToDocx(blocks: ContentBlock[], font: any, bn: boolean): (Paragraph | Table)[] {
        const result: (Paragraph | Table)[] = [];
        const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
        const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        const lang = bn ? { value: 'bn-BD', bidirectional: 'bn-BD' } : undefined;
        const csSize = bn ? 24 : undefined;

        for (const b of blocks) {
            if (b.type === 'table' && b.rows?.length) {
                const rows: TableRow[] = b.rows.map((row, rowIdx) => new TableRow({
                    children: row.map(cell => new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: cell, bold: rowIdx === 0, size: 22, sizeComplexScript: bn ? 22 : undefined, font, language: lang })]
                        })],
                        borders: cellBorders
                    }))
                }));
                result.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, rows, alignment: AlignmentType.CENTER }));
            } else if (b.text) {
                let align: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
                if (b.alignment === 'center') align = AlignmentType.CENTER;
                else if (b.alignment === 'right') align = AlignmentType.RIGHT;
                else if (b.alignment === 'justify') align = AlignmentType.JUSTIFIED;
                const indent = { left: 480 };
                result.push(new Paragraph({
                    children: [new TextRun({ text: b.text, bold: b.bold, italics: b.italic, size: 24, sizeComplexScript: csSize, font, language: lang })],
                    indent, spacing: { after: 80 },
                    ...(align ? { alignment: align } : {})
                } as any));
            }
        }
        return result;
    }

    private base64ToBytes(dataUrl: string): Uint8Array {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}
