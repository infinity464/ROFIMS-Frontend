import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    MemberAppointmentReportRow,
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import {
    unitScopeLine,
    memberTypeScopeLine,
    statusLocked,
} from '../report-scope.helper';
import { personnelMeta as personnelMetaHelper } from '../formal-rab-render.helper';
import {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Packer,
    PageNumber,
    PageOrientation,
    Paragraph,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

/**
 * Corps Report — parent's `commonCodeIds` is the picked Corps (single-pick),
 * or the N/A bundle (a list of Corps CodeIds collapsed under one UI option,
 * one per mother org).
 *
 * Filter panel intentionally OMITS Mother Org — Corps is itself mother-org-
 * specific (each Corps belongs to one MotherOrg via CommonCode.OrgId), so
 * picking a Corps already pins the org. Rank options are scoped to the
 * picked Corps's mother org; Trade options are children of the picked Corps
 * via CommonCode.ParentCodeId. Both pickers stay disabled until a Corps is
 * picked, and stay disabled in the N/A-bundle case (multi-org → scoping
 * is ambiguous).
 */
@Component({
    selector: 'app-report-corps',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, MultiSelectModule, PaginatorModule, Toast],
    providers: [MessageService],
    templateUrl: './report-corps.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-corps.component.scss'],
})
export class ReportCorpsComponent implements OnInit, OnChanges {
    L = REPORT_LABELS;
    @Input() lang: ReportLang = 'en';
    /** Parent-locked Corps CodeId(s). Single-pick = one element; N/A bundle = many. */
    @Input() commonCodeIds: number[] = [];
    @Input() reportTypeLabel = '';
    @Input() commonCodeLabel = '';
    @Input() postingStatus: string = 'Servings';
    @Input() statusLabel = '';
    @Input() statusLabelBn = '';
    @Output() langToggle = new EventEmitter<void>();

    /** Full Corps list — fetched once; used to resolve the picked Corps's
        mother org so we can scope the Rank picker. */
    private allCorpsCodes: CommonCodeModel[] = [];

    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedRankId: number | null = null;
    selectedTradeId: number | null = null;

    list: MemberAppointmentReportRow[] = [];
    loading = false;
    first = 0;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];
    totalRecords = 0;
    searched = false;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    accessibleScope: ReportAccessibleScope | null = null;
    @Output() scopeChange = new EventEmitter<ReportAccessibleScope | null>();

    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    get memberTypeScopeLine(): string | null { return memberTypeScopeLine(this.accessibleScope, this.lang); }
    get statusLocked(): boolean { return statusLocked(this.accessibleScope); }

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    /** True only when EXACTLY ONE Corps is picked. N/A bundle (length > 1)
        crosses mother-org boundaries, so Rank/Trade scoping is ambiguous. */
    get isSingleCorpsPicked(): boolean {
        return Array.isArray(this.commonCodeIds) && this.commonCodeIds.length === 1;
    }
    get pickedCorpsId(): number | null {
        return this.isSingleCorpsPicked ? this.commonCodeIds[0] : null;
    }

    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: string; defaultVisible: boolean }[] = [
        { key: 'ser',          labelEN: 'Ser',           labelBN: 'ক্রঃ',          hint: 'Serial',                defaultVisible: true  },
        { key: 'personnel',    labelEN: 'RAB Personnel', labelBN: 'র‍্যাব সদস্য',   hint: 'RabPersonnelComposite', defaultVisible: true  },
        { key: 'rabId',        labelEN: 'RAB ID',        labelBN: 'র‍্যাব আইডি',    hint: 'RabId',                 defaultVisible: true  },
        { key: 'corps',        labelEN: 'Corps',         labelBN: 'কোর',           hint: 'Plain',                 defaultVisible: true  },
        { key: 'trade',        labelEN: 'Trade',         labelBN: 'ট্রেড',         hint: 'Plain',                 defaultVisible: true  },
        { key: 'motherOrganization',labelEN: 'Mother Org', labelBN: 'মাতৃ সংস্থা',  hint: 'Plain',                 defaultVisible: true  },
        { key: 'joiningDate',  labelEN: 'Joining Date',  labelBN: 'যোগদান তারিখ',   hint: 'JoiningDate',          defaultVisible: true  },
        { key: 'rmks',         labelEN: 'Remarks',       labelBN: 'মন্তব্য',       hint: 'Remarks',               defaultVisible: true  },
        { key: 'serviceId',         labelEN: 'Service ID',       labelBN: 'সার্ভিস আইডি',       hint: 'Plain', defaultVisible: false },
        { key: 'nameEnglish',       labelEN: 'Name (EN)',        labelBN: 'নাম (ইংরেজি)',       hint: 'Plain', defaultVisible: false },
        { key: 'nameBangla',        labelEN: 'Name (BN)',        labelBN: 'নাম (বাংলা)',        hint: 'Plain', defaultVisible: false },
        { key: 'nid',               labelEN: 'NID',              labelBN: 'এনআইডি',            hint: 'Plain', defaultVisible: false },
        { key: 'prefix',            labelEN: 'Prefix',           labelBN: 'প্রিফিক্স',          hint: 'Plain', defaultVisible: false },
        { key: 'appointment',       labelEN: 'Appointment',      labelBN: 'নিয়োগ',             hint: 'Plain', defaultVisible: false },
        { key: 'memberType',        labelEN: 'Member Type',      labelBN: 'সদস্য ধরন',          hint: 'Plain', defaultVisible: false },
        { key: 'armyRank',          labelEN: 'Rank',             labelBN: 'র‍্যাঙ্ক',           hint: 'Plain', defaultVisible: false },
        { key: 'tradeRemarks',      labelEN: 'Trade Remarks',    labelBN: 'ট্রেড মন্তব্য',       hint: 'Plain', defaultVisible: false },
        { key: 'gender',            labelEN: 'Gender',           labelBN: 'লিঙ্গ',              hint: 'Plain', defaultVisible: false },
        { key: 'motherUnit',        labelEN: 'Last Unit',        labelBN: 'শেষ ইউনিট',          hint: 'Plain', defaultVisible: false },
        { key: 'rabUnit',           labelEN: 'RAB Unit',         labelBN: 'র‍্যাব ইউনিট',       hint: 'Plain', defaultVisible: false },
        { key: 'dateOfCommission',  labelEN: 'Commission Date',  labelBN: 'কমিশন তারিখ',         hint: 'Plain', defaultVisible: false },
        { key: 'rabServiceFrom',    labelEN: 'RAB Joining Date', labelBN: 'র‍্যাবে যোগদান তারিখ',hint: 'Plain', defaultVisible: false },
        { key: 'rabServiceTo',      labelEN: 'RAB End Date',     labelBN: 'র‍্যাব শেষ তারিখ',   hint: 'Plain', defaultVisible: false },
        { key: 'officerType',       labelEN: 'Officer Type',     labelBN: 'অফিসার ধরণ',        hint: 'Plain', defaultVisible: false },
        { key: 'division',          labelEN: 'Division',         labelBN: 'বিভাগ',              hint: 'Plain', defaultVisible: false },
        { key: 'district',          labelEN: 'District',         labelBN: 'জেলা',               hint: 'Plain', defaultVisible: false },
        { key: 'upazila',           labelEN: 'Upazila',          labelBN: 'উপজেলা',             hint: 'Plain', defaultVisible: false },
        { key: 'postOffice',        labelEN: 'Post Office',      labelBN: 'ডাকঘর',              hint: 'Plain', defaultVisible: false },
        { key: 'dob',               labelEN: 'Date of Birth',    labelBN: 'জন্ম তারিখ',          hint: 'Plain', defaultVisible: false },
        { key: 'religion',          labelEN: 'Religion',         labelBN: 'ধর্ম',               hint: 'Plain', defaultVisible: false },
        { key: 'bloodGroup',        labelEN: 'Blood Group',      labelBN: 'রক্তের গ্রুপ',        hint: 'Plain', defaultVisible: false },
        { key: 'maritalStatus',     labelEN: 'Marital Status',   labelBN: 'বৈবাহিক অবস্থা',      hint: 'Plain', defaultVisible: false },
        { key: 'mobileNo',          labelEN: 'Mobile',           labelBN: 'মোবাইল',             hint: 'Plain', defaultVisible: false },
        { key: 'email',             labelEN: 'Email',            labelBN: 'ইমেইল',              hint: 'Plain', defaultVisible: false },
    ];

    private static readonly plainColumnPropertyMap: Record<string, { en: string; bn?: string }> = {
        serviceId:           { en: 'serviceId' },
        nameEnglish:         { en: 'name' },
        nameBangla:          { en: 'nameBN' },
        nid:                 { en: 'nid' },
        prefix:              { en: 'prefix',              bn: 'prefixBN' },
        appointment:         { en: 'appointment',         bn: 'appointmentBN' },
        memberType:          { en: 'memberType',          bn: 'memberTypeBN' },
        motherOrganization:  { en: 'orgName',             bn: 'orgNameBN' },
        armyRank:            { en: 'rank',                bn: 'rankBN' },
        tradeRemarks:        { en: 'tradeRemarks' },
        gender:              { en: 'gender',              bn: 'genderBN' },
        motherUnit:          { en: 'motherUnit',          bn: 'motherUnitBN' },
        rabUnit:             { en: 'rabUnit',             bn: 'rabUnitBN' },
        dateOfCommission:    { en: 'dateOfCommission' },
        rabServiceFrom:      { en: 'rabServiceFrom' },
        rabServiceTo:        { en: 'rabServiceTo' },
        division:            { en: 'division',            bn: 'divisionBN' },
        district:            { en: 'district',            bn: 'districtBN' },
        upazila:             { en: 'upazila',             bn: 'upazilaBN' },
        postOffice:          { en: 'postOffice',          bn: 'postOfficeBN' },
        corps:               { en: 'corps',               bn: 'corpsBN' },
        trade:               { en: 'trade',               bn: 'tradeBN' },
        officerType:         { en: 'officerType',         bn: 'officerTypeBN' },
        dob:                 { en: 'dob' },
        religion:            { en: 'religion' },
        bloodGroup:          { en: 'bloodGroup' },
        maritalStatus:       { en: 'maritalStatus' },
        mobileNo:            { en: 'mobileNo' },
        email:               { en: 'email' },
    };

    plainCellValue(row: MemberAppointmentReportRow, key: string): string {
        const map = ReportCorpsComponent.plainColumnPropertyMap[key];
        if (!map) return '—';
        const en = (row as any)[map.en] as string | null | undefined;
        const bn = map.bn ? (row as any)[map.bn] as string | null | undefined : undefined;
        return this.codeValue(en, bn);
    }

    selectedColumnKeys: string[] = this.columnCatalog.filter(c => c.defaultVisible).map(c => c.key);

    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map(c => ({ label: this.lang === 'bn' ? c.labelBN : c.labelEN, value: c.key }));
    }

    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys
            .map(k => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

    draggingColumnKey: string | null = null;

    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingColumnKey = key;
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }
    onColumnDragOver(event: DragEvent): void {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }
    onColumnDrop(targetKey: string, event: DragEvent): void {
        event.preventDefault();
        const sourceKey = this.draggingColumnKey;
        this.draggingColumnKey = null;
        if (!sourceKey || sourceKey === targetKey) return;
        const arr = [...this.selectedColumnKeys];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx   = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.selectedColumnKeys = arr;
    }
    onColumnDragEnd(): void { this.draggingColumnKey = null; }
    removeColumn(key: string): void { this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key); }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }

    personnelMeta(row: MemberAppointmentReportRow): string {
        return personnelMetaHelper(row as any, this.lang);
    }

    get criteriaItems(): { label: string; value: string }[] {
        const L = this.L[this.lang];
        const items: { label: string; value: string }[] = [];
        if (this.selectedRankId != null) {
            const rank = this.rankOptions.find(o => o.value === this.selectedRankId);
            const val = this.lang === 'bn' ? rank?.labelBn : rank?.label;
            if (val) items.push({ label: L['report.search.rank'], value: val });
        }
        if (this.selectedTradeId != null) {
            const trade = this.tradeOptions.find(o => o.value === this.selectedTradeId);
            const val = this.lang === 'bn' ? trade?.labelBn : trade?.label;
            if (val) items.push({ label: L['report.search.trade'], value: val });
        }
        if (this.postingStatus && this.postingStatus !== 'All') {
            const sLabel = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
            if (sLabel) items.push({ label: L['report.search.rabMemberStatus'], value: sLabel });
        }
        return items;
    }

    get rabOverlineText(): string {
        return this.lang === 'bn'
            ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার'
            : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    get rabOrgTitle(): string { return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION'; }
    get rabOrgSubtitle(): string {
        return this.lang === 'bn'
            ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা'
            : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }
    get rabSectionTitle(): string {
        if (this.reportTypeLabel && this.commonCodeLabel) {
            const suffix = this.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
            return `${this.reportTypeLabel}: ${this.commonCodeLabel} ${suffix}`;
        }
        return this.L[this.lang]['report.title.corps'];
    }
    get rabSubtitleText(): string {
        return (this.lang === 'bn' ? this.statusLabelBn : this.statusLabel) || '';
    }
    get rabCriteriaTitle(): string { return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA'; }
    get rabGeneratedLabel(): string { return this.lang === 'bn' ? 'উৎপন্ন' : 'GENERATED'; }
    get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn'
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    get rabConfidentialLabel(): string { return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL'; }
    get rabWarningLabel(): string { return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED'; }
    get rabPageOfLabel(): string { return this.lang === 'bn' ? 'পৃষ্ঠা ১ / ১' : 'PAGE 1 OF 1'; }

    constructor(
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    get reportTitle(): string {
        const sLabel = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
        const statusSuffix = sLabel ? ` (${sLabel})` : '';
        if (this.reportTypeLabel && this.commonCodeLabel) {
            const suffix = this.lang === 'bn' ? 'প্রতিবেদন' : 'Report';
            return `${this.reportTypeLabel}: ${this.commonCodeLabel} ${suffix}${statusSuffix}`;
        }
        return this.L[this.lang]['report.title.corps'] + statusSuffix;
    }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') {
            return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        if (this.selectedRankId != null) {
            const rank = this.rankOptions.find((o) => o.value === this.selectedRankId);
            const val = this.lang === 'bn' ? rank?.labelBn : rank?.label;
            if (val) lines.push(`${L['report.search.rank']}: ${val}`);
        }
        if (this.selectedTradeId != null) {
            const trade = this.tradeOptions.find((o) => o.value === this.selectedTradeId);
            const val = this.lang === 'bn' ? trade?.labelBn : trade?.label;
            if (val) lines.push(`${L['report.search.trade']}: ${val}`);
        }
        return lines;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.list?.length) return;
        if (type === 'print') {
            this.openRabPrintWindow();
            return;
        }
        if (type === 'word') {
            await this.exportRabWord();
        } else {
            this.exportRabExcel();
        }
    }

    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        const bnFont = { ascii: 'Nirmala UI', hAnsi: 'Nirmala UI', cs: 'Nirmala UI', hint: 'cs' as const };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const sans = isBn ? (bnFont as any) : 'Calibri';
        const serif = isBn ? (bnFont as any) : 'Cambria';
        const mono = isBn ? (bnFont as any) : 'Consolas';
        const bnRunExtras = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
        const wsafe = (s: string | null | undefined): string => s ?? '';

        const S = { overline: 15, title: 44, subtitle: 20, sectionTitle: 26, sectionSub: 20, stripLabel: 16, stripDate: 16, critLabel: 14, critValue: 20, tableHeader: 14, name: 20, meta: 14, body: 16, footer: 13 };
        const C = { black: '0B0B0B', mutedText: '555555', gray: '6B6B6B', labelGray: '8A8A8A', zebra: 'FAFAF6', border: 'BFBFBF', innerBorder: 'D9D9D9' };
        const innerCellBorder = { top: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, left: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder }, right: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder } };
        const headerCellBorder = { top: { style: BorderStyle.SINGLE, size: 8, color: C.black }, bottom: { style: BorderStyle.SINGLE, size: 8, color: C.black }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } };

        const headerPars: Paragraph[] = [];
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: wsafe(this.rabOverlineText), font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText, characterSpacing: isBn ? 0 : 60, allCaps: !isBn })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: wsafe(this.rabOrgTitle), font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24 })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabOrgSubtitle), font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText })] }));
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: this.rabSubtitleText ? 40 : 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }));
        if (this.rabSubtitleText) headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSubtitleText), font: serif, size: S.sectionSub, ...bnRunExtras(S.sectionSub), italics: true, color: C.mutedText })] }));

        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({ columnSpan: 2, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment, children: runs })] });
        const stripRow = new TableRow({ cantSplit: true, children: [stripCell([new TextRun({ text: wsafe(this.rabCriteriaTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT), stripCell([new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })], AlignmentType.RIGHT)] });
        const items = this.criteriaItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({ borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: critCellPct, type: WidthType.PERCENTAGE }, children: it ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }), new Paragraph({ children: [new TextRun({ text: wsafe(it.value), font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] })] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })] }));
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }
        const criteriaTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: critRows });

        const visibleCols = this.visibleColumns;
        const headerLabels = visibleCols.map(c => this.lang === 'bn' ? c.labelBN : c.labelEN);
        const dataColPct = visibleCols.length > 0 ? (100 / visibleCols.length) : 100;
        const headerCells: TableCell[] = headerLabels.map(label => new TableCell({ borders: headerCellBorder, margins: { top: 120, bottom: 120, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(label), font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }));
        const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: headerCells });

        const codeValue = (en?: string | null, bn?: string | null): string => (isBn && bn) ? bn.trim() : (en ?? bn ?? '—');

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map(col => {
                const run = (text: string, opts: { fontKey?: any; sz?: number; bold?: boolean; color?: string; chSp?: number } = {}) => new TextRun({ text: wsafe(text), font: opts.fontKey ?? sans, size: opts.sz ?? S.body, ...bnRunExtras(opts.sz ?? S.body), bold: opts.bold ?? false, color: opts.color ?? C.black, ...(opts.chSp != null ? { characterSpacing: opts.chSp } : {}) });
                switch (col.hint) {
                    case 'Serial': return new TableCell({ ...cellOpts, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(this.paddedSer((row as any).ser ?? idx + 1), { fontKey: mono, sz: S.name, bold: true, color: C.gray, chSp: isBn ? 0 : 8 })] })] });
                    case 'RabPersonnelComposite': {
                        const meta = this.personnelMeta(row);
                        const children: Paragraph[] = [new Paragraph({ spacing: { after: meta ? 40 : 0 }, children: [run(codeValue(row.name, row.nameBN), { sz: S.name, bold: true })] })];
                        if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, font: mono, size: S.meta, ...bnRunExtras(S.meta), color: C.gray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn })] }));
                        return new TableCell({ ...cellOpts, children });
                    }
                    case 'RabId': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run((row as any).rabid ? this.displayNum((row as any).rabid) : '—', { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'JoiningDate': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.formatDate(row.joiningDate), { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'Remarks': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(row.rmks || '', { color: C.gray })] })] });
                    case 'Plain':
                    default: return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.plainCellValue(row, col.key))] })] });
                }
            });
            return new TableRow({ cantSplit: true, children: cells });
        });
        const dataTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.AUTOFIT, rows: [headerRow, ...dataRows] });

        const footerCellBorder = { top: { style: BorderStyle.SINGLE, size: 6, color: C.black }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
        const footerCellMargins = { top: 80, bottom: 0, left: 0, right: 0 };
        const footer = new Footer({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3000, 3000, 3000], rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: wsafe(this.rabConfidentialLabel), font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn })] })] }), new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ children: [] })] }), new TableCell({ borders: footerCellBorder, margins: footerCellMargins, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black, characterSpacing: isBn ? 0 : 24, allCaps: !isBn })] })] })] })] })] });

        const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, bottom: 1247, left: 680, right: 680 } } }, footers: { default: footer }, children: [...headerPars, criteriaTable, new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', font: sans, size: 4 })] }), dataTable] }] });
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `corps-report_${this.lang}.docx`);
    }

    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const visibleCols = this.visibleColumns;
        const headers: string[] = visibleCols.map(c => isBn ? c.labelBN : c.labelEN);
        const totalCols = headers.length || 1;
        const codeValue = (en?: string | null, bn?: string | null): string => (isBn && bn) ? bn.trim() : (en ?? bn ?? '—');

        const aoa: any[][] = [];
        const pad = (n: number) => Array.from({ length: n }, () => '');
        aoa.push([wsafe(this.rabOverlineText), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgTitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgSubtitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabSectionTitle), ...pad(totalCols - 1)]);
        if (this.rabSubtitleText) aoa.push([wsafe(this.rabSubtitleText), ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        for (let i = 0; i < this.list.length; i++) {
            const row = this.list[i];
            const cells = visibleCols.map(col => {
                switch (col.hint) {
                    case 'Serial': return this.paddedSer((row as any).ser ?? i + 1);
                    case 'RabPersonnelComposite': {
                        const name = codeValue(row.name, row.nameBN);
                        const meta = this.personnelMeta(row);
                        return meta ? `${name}\n${meta}` : name;
                    }
                    case 'RabId': return (row as any).rabid ? this.displayNum((row as any).rabid) : '';
                    case 'JoiningDate': return this.formatDate(row.joiningDate);
                    case 'Remarks': return row.rmks || '';
                    case 'Plain':
                    default: return this.plainCellValue(row, col.key);
                }
            });
            aoa.push(cells);
        }
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabConfidentialLabel}  ·  ${this.rabWarningLabel}`, ...pad(totalCols - 1)]);

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = ws['!merges'] ?? [];
        const titleRows = [0, 1, 2, 3, ...(this.rabSubtitleText ? [4] : []), 5 + (this.rabSubtitleText ? 1 : 0)];
        for (const r of titleRows) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `corps-report_${this.lang}.xlsx`);
    }

    private openRabPrintWindow(): void {
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) { this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 }); return; }
        const html = this.buildRabPrintHtml();
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P from the open window */ } }, 700);
    }

    private buildRabPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif" : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif" : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols.map(c => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`).join('')}</tr>`;
        const codeValue = (en?: string | null, bn?: string | null): string => (this.lang === 'bn' && bn) ? bn.trim() : (en ?? bn ?? '—');

        const renderCell = (row: MemberAppointmentReportRow, col: { key: string; hint: string }, idx: number): string => {
            switch (col.hint) {
                case 'Serial': return `<td class="td-ser"><span class="ser">${esc(this.paddedSer((row as any).ser ?? idx + 1))}</span></td>`;
                case 'RabPersonnelComposite': {
                    const meta = this.personnelMeta(row);
                    const metaHtml = meta ? `<div class="personnel-meta">${esc(meta)}</div>` : '';
                    return `<td class="td-personnel"><div class="personnel-name">${esc(codeValue(row.name, row.nameBN))}</div>${metaHtml}</td>`;
                }
                case 'RabId': return `<td class="td-date">${esc((row as any).rabid ? this.displayNum((row as any).rabid) : '—')}</td>`;
                case 'JoiningDate': return `<td class="td-date">${esc(this.formatDate(row.joiningDate))}</td>`;
                case 'Remarks': return `<td class="td-rmks">${esc(row.rmks || '')}</td>`;
                case 'Plain':
                default: return `<td>${esc(this.plainCellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list.map((row, i) => `<tr>${visibleCols.map(c => renderCell(row, c, i)).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
        const subtitleHtml = this.rabSubtitleText ? `<div class="paper-section-sub"><em>${esc(this.rabSubtitleText)}</em></div>` : '';
        const confidential = this.rabConfidentialLabel;
        const warning = this.rabWarningLabel;
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html><html lang="${isBn ? 'bn' : 'en'}"><head><meta charset="UTF-8" /><title>${esc(this.rabSectionTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    @counter-style bn-digits { system: numeric; symbols: '\\09E6' '\\09E7' '\\09E8' '\\09E9' '\\09EA' '\\09EB' '\\09EC' '\\09ED' '\\09EE' '\\09EF'; }
    @page {
        margin: 12mm 5mm 22mm 5mm;
        @bottom-left { content: "● " "${cssStr(confidential)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 0 0 8mm; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 8mm 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-center { content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''}); font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.25em; text-transform: uppercase; color: #4a4a4a; padding-top: 5mm; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 0 1.5mm; background-size: 100% 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
        @bottom-right { content: "${cssStr(warning)}"; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.3em; text-transform: uppercase; color: #b03a3a; padding: 5mm 8mm 0 0; background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5)); background-position: 0 1.5mm; background-size: calc(100% - 8mm) 0.7mm; background-repeat: no-repeat; vertical-align: top; ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''} }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0b0b0b; font-family: ${sans}; font-size: 10pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline { font-size: 7.5pt; letter-spacing: 0.3em; color: #555; text-transform: uppercase; margin-bottom: 3mm; font-weight: 500; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';font-size:9pt;' : ''} }
    .paper-title { font-family: ${serif}; font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0; letter-spacing: 0.12em; color: #0b0b0b; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; margin-bottom: 4mm; }
    .orn-divider { display: flex; justify-content: center; align-items: center; gap: 6mm; margin: 4mm auto; max-width: 65%; }
    .orn-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, #b78b3b, transparent); }
    .orn-diamond { color: #b78b3b; font-size: 9pt; }
    .paper-section { font-family: ${serif}; font-size: 13pt; font-weight: 700; letter-spacing: 0.16em; color: #0b0b0b; margin: 0 0 1mm 0; text-transform: uppercase; ${isBn ? 'letter-spacing:0;' : ''} }
    .paper-section-sub { font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt; }
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; ${isBn ? 'font-family:' + sans + ';' : ''} }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-family: ${sans}; font-size: 8pt; }
    thead { display: table-header-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 1.8mm 2mm; text-align: left; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.05); vertical-align: top; background: #fff; word-break: break-word; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; }
    .ser { font-family: ${mono}; font-size: 9pt; font-weight: 600; color: #6b6b6b; letter-spacing: 0.04em; white-space: nowrap; }
    .td-personnel { min-width: 56mm; }
    .personnel-name { font-family: ${sans}; font-weight: 600; font-size: 10pt; color: #0b0b0b; line-height: 1.2; }
    .personnel-meta { margin-top: 0.7mm; font-family: ${mono}; font-size: 7pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''} }
    .td-date { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
</style></head><body><div class="paper">
    <header class="paper-head">
        <div class="overline">${esc(this.rabOverlineText)}</div>
        <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
        <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
        <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
        <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
        ${subtitleHtml}
    </header>
    <div class="criteria">
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></div>
        ${criteriaGridHtml}
    </div>
    <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
</div></body></html>`;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // Cache Corps codes so we can resolve the picked Corps's mother org
        // without an extra round-trip every time the parent's pick changes.
        this.commonCodeService.getAllActiveCommonCodesType('Corps').subscribe({
            next: (codes) => {
                this.allCorpsCodes = codes ?? [];
                this.refreshDependentOptions();
            },
            error: () => { this.allCorpsCodes = []; },
        });

        this.load();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['commonCodeIds']) {
            this.selectedRankId = null;
            this.selectedTradeId = null;
            this.rankOptions = [];
            this.tradeOptions = [];
            this.refreshDependentOptions();
            if (!changes['commonCodeIds'].firstChange) {
                this.first = 0;
                this.load();
            }
        } else if (changes['postingStatus'] && !changes['postingStatus'].firstChange) {
            this.first = 0;
            this.load();
        }
        if (changes['lang']) {
            this.appliedFilterLines = this.buildFilterLines();
        }
    }

    /** Load Rank options scoped to the picked Corps's mother org, and Trade
        options as children of the picked Corps (CommonCode.ParentCodeId).
        Bails out when the parent passed an N/A bundle (length > 1) because
        scoping across mother orgs would be ambiguous. */
    private refreshDependentOptions(): void {
        if (!this.isSingleCorpsPicked) return;
        const corpsId = this.pickedCorpsId!;
        const corps = this.allCorpsCodes.find(c => c.codeId === corpsId);
        const orgId = corps?.orgId ?? null;
        if (orgId != null && orgId > 0) {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.rankOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
            });
        }
        this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId).subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.tradeOptions = codes.map((c) => ({ label: c.codeValueEN || String(c.codeId), labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId), value: c.codeId }))),
        });
    }

    onFilterChange(): void {}

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedRankId != null) c++;
        if (this.selectedTradeId != null) c++;
        return c;
    }

    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedRankId = null;
        this.selectedTradeId = null;
        this.first = 0;
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.load();
    }

    load(): void {
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;

        // ── Dynamic-backend criteria ────────────────────────────────
        // The parent-locked Corps drives the `corps` filter. Single pick →
        // idValue; N/A bundle (multi-org) → idValues so the backend does an
        // IN match. Rank / Trade are additive picks the user can layer on.
        const criteria: DynamicReportCriterion[] = [];
        if (Array.isArray(this.commonCodeIds) && this.commonCodeIds.length > 0) {
            if (this.commonCodeIds.length === 1) {
                criteria.push({ fieldKey: 'corps', idValue: this.commonCodeIds[0] });
            } else {
                criteria.push({ fieldKey: 'corps', idValues: [...this.commonCodeIds] });
            }
        }
        if (this.selectedRankId != null && this.selectedRankId > 0)
            criteria.push({ fieldKey: 'armyRank', idValue: this.selectedRankId });
        if (this.selectedTradeId != null && this.selectedTradeId > 0)
            criteria.push({ fieldKey: 'trade', idValue: this.selectedTradeId });

        this.reportService.runDynamicEmployeeBaseReport({
            columns: this.selectedColumnKeys,
            criteria,
            postingStatusFilter: this.postingStatus || null,
            pagination: { page_no, row_per_page: this.rows },
        }).subscribe({
            next: (res) => {
                const startSer = (page_no - 1) * this.rows + 1;
                this.list = (res.datalist ?? []).map((d, i) => this.adaptDynamicRow(d, startSer + i));
                this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                this.accessibleScope = res.accessibleScope ? {
                    rabUnitNames: null,
                    rabUnitNamesBN: null,
                    memberTypeNames: null,
                    memberTypeNamesBN: null,
                    orgScopeRestricted: res.accessibleScope.orgScopeRestricted,
                } as ReportAccessibleScope : null;
                this.scopeChange.emit(this.accessibleScope);
                this.searched = true;
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load report' });
                this.loading = false;
            },
        });
    }

    private adaptDynamicRow(d: DynamicReportRow, ser: number): MemberAppointmentReportRow {
        return {
            ...d,
            ser,
            serviceId:     d['serviceId']             as string,
            name:          d['nameEnglish']           as string,
            nameBN:        d['nameBangla']            as string,
            rank:          d['armyRank']              as string,
            rankBN:        d['armyRankBN']            as string,
            orgName:       d['motherOrganization']    as string,
            orgNameBN:     d['motherOrganizationBN']  as string,
            corps:         d['corps']                 as string,
            corpsBN:       d['corpsBN']               as string,
            trade:         d['trade']                 as string,
            tradeBN:       d['tradeBN']               as string,
            presentUnit:   d['rabUnit']               as string,
            presentUnitBN: d['rabUnitBN']             as string,
            joiningDate:   d['joiningDate']           as string,
            rmks:          (d['rmks'] ?? d['remarks'])as string,
            ...(d['rabId'] ? { rabid: d['rabId'] as string } : {}),
        } as MemberAppointmentReportRow & { rabid?: string };
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear());
            const s = `${day}-${month}-${year}`;
            return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
        } catch { return v; }
    }

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
    }
}
