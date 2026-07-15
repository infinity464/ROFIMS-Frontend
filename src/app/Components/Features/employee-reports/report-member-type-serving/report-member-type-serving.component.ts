import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { DatePickerModule } from 'primeng/datepicker';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type {
    MemberAppointmentReportRow,
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
    NominalRollSeniority,
} from '@/models/report.model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { CommonCodeModel } from '@/models/common-code-model';
import {
    unitScopeLine,
    memberTypeScopeLine,
    statusLocked,
} from '../report-scope.helper';
import { OrgTreeMultiSelectComponent } from '@/shared/components/org-tree-multi-select/org-tree-multi-select.component';
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
import { debounceTime, forkJoin, Subject, Subscription } from 'rxjs';

/**
 * Member Type Report — standalone report (no parent dropdown).
 * Filters: Member Type, RAB Unit org-tree, Mother Org → Rank cascade,
 * Joining-in-RAB date range, and Member Status (Servings | Ex-Member).
 * Ex-Member rows show last posting battalion via the shared employee-base view.
 */
@Component({
    selector: 'app-report-member-type-serving',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        PaginatorModule,
        DatePickerModule,
        Toast,
        OrgTreeMultiSelectComponent,
    ],
    providers: [MessageService],
    templateUrl: './report-member-type-serving.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-member-type-serving.component.scss'],
})
export class ReportMemberTypeServingComponent implements OnInit, OnDestroy {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    /** Toolbar quick search — matches Service ID or RAB ID (server-side). */
    idSearchText = '';
    /** Debounces toolbar typing so we don't query on every keystroke. */
    private readonly idSearchInput$ = new Subject<string>();
    private idSearchSub: Subscription | null = null;
    /** Last term actually sent to the server — suppresses duplicate reloads
     *  (e.g. Enter followed by the debounced emission of the same text). */
    private lastIdSearchApplied = '';

    /** Member Type — independent root pick. */
    memberTypeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedMemberTypeIds: number[] = [];

    /**
     * Multi-select RAB org-tree filter — the user checks any nodes at any
     * level (Unit / Wing / Branch / Sub-Branch / Section / Sub-Section) in the
     * shared org-tree picker. The selected node ids are sent to the backend as
     * the `rabOrgNode` criterion (idValues).
     */
    selectedOrgNodeIds: number[] = [];
    /** id → {en,bn,parentId} for every org node — lets the criteria strip
     *  resolve each picked node to its full root→node ancestry path. */
    private orgNodeLabels = new Map<number, { en: string; bn: string; parentId: number | null }>();

    /** Mother Org → Rank/Corps cascade. */
    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    corpsOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedOrgIds: number[] = [];
    selectedRankIds: number[] = [];
    selectedCorpsIds: number[] = [];
    selectedTradeIds: number[] = [];
    /** Raw org-scoped MotherOrgRank rows, re-filtered client-side by Member Type. */
    private allRanksForOrg: CommonCodeModel[] = [];

    /** Joining-in-RAB date range (maps to registry `joiningDate`). */
    joiningInRabFrom: Date | null = null;
    joiningInRabTo: Date | null = null;

    /**
     * Nominal Roll Seniority — which seniority leads the row order. Organization
     * Seniority is the server's default (and every other report's), so it leads here.
     */
    seniorityOptions: { label: string; value: NominalRollSeniority }[] = [
        { label: 'Organization Seniority', value: 'OrganizationSeniority' },
        { label: 'RAB Rank Seniority',     value: 'RankSeniority' },
    ];
    selectedSeniority: NominalRollSeniority = 'OrganizationSeniority';

    /** Member Status — Servings (default) or Ex-Member only. */
    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
    ];
    selectedPostingStatus = 'Servings';

    get statusLabel(): string {
        return this.statusOptions.find(o => o.value === this.selectedPostingStatus)?.label ?? '';
    }

    get statusLabelBn(): string {
        return this.statusOptions.find(o => o.value === this.selectedPostingStatus)?.labelBn ?? '';
    }

    list: MemberAppointmentReportRow[] = [];
    loading = false;
    first = 0;
    rows = 100;
    rowsPerPageOptions = [100, 500, 1000, 5000];
    totalRecords = 0;
    searched = false;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    accessibleScope: ReportAccessibleScope | null = null;

    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    /** Hidden on this report — title already says "Member Type Report …". */
    get memberTypeScopeLine(): string | null { return null; }
    get statusLocked(): boolean { return statusLocked(this.accessibleScope); }

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // Catalog order doubles as the default column order: `selectedColumnKeys` is
    // seeded by filtering this list on `defaultVisible`. The first twelve entries
    // are the Nominal Roll default table, in the order the spec prints them —
    // Ser, Service Id, Rank, Corps, Trade, Name, Mother Org, RAB Joining Date,
    // Present Unit, Unit Joining Date, Appointment, Remarks. Keep them contiguous
    // and in that order; everything below is opt-in via the column picker.
    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: string; defaultVisible: boolean }[] = [
        { key: 'ser',          labelEN: 'Ser',           labelBN: 'ক্রঃ',          hint: 'Serial',                defaultVisible: true  },
        { key: 'serviceId',    labelEN: 'Service ID',    labelBN: 'সার্ভিস আইডি',    hint: 'Plain',                 defaultVisible: true  },
        { key: 'armyRank',     labelEN: 'Rank',          labelBN: 'র‍্যাঙ্ক',        hint: 'Plain',                 defaultVisible: true  },
        { key: 'corps',        labelEN: 'Corps',         labelBN: 'কোর',           hint: 'Plain',                 defaultVisible: true  },
        { key: 'trade',        labelEN: 'Trade',         labelBN: 'ট্রেড',         hint: 'Plain',                 defaultVisible: true  },
        { key: 'name', labelEN: 'Name', labelBN: 'নাম', hint: 'Name', defaultVisible: true },
        { key: 'motherOrganization',labelEN: 'Mother Org', labelBN: 'মাতৃ সংস্থা',  hint: 'Plain',                 defaultVisible: true  },
        // Joining in RAB (EmployeeInfo.JoiningDate) — the same field the
        // "Joining in RAB" date-range filter above targets.
        { key: 'joiningDate',  labelEN: 'RAB Joining Date', labelBN: 'র‍্যাবে যোগদান তারিখ', hint: 'JoiningDate',  defaultVisible: true  },
        { key: 'rabUnit',      labelEN: 'Present Unit',  labelBN: 'বর্তমান ইউনিট',   hint: 'Plain',                 defaultVisible: true  },
        // RABServiceFrom is the ServiceFrom of the member's currently-active
        // PreviousRABServiceInfo row — the same row Present Unit resolves from —
        // so it is the date they joined that unit, not their RAB joining date.
        { key: 'rabServiceFrom',    labelEN: 'Unit Joining Date', labelBN: 'ইউনিটে যোগদান তারিখ', hint: 'Plain', defaultVisible: true  },
        { key: 'appointment',       labelEN: 'Appointment',      labelBN: 'নিয়োগ',             hint: 'Plain', defaultVisible: true  },
        { key: 'allRemarks',   labelEN: 'Remarks',       labelBN: 'মন্তব্য',       hint: 'Remarks',               defaultVisible: true  },
        { key: 'nameExtras', labelEN: 'Award + Professional Qualification', labelBN: 'পদক + পেশাগত যোগ্যতা', hint: 'NameSuffix', defaultVisible: false },
        { key: 'callNoRankName', labelEN: 'No Rank Name', labelBN: 'নং র‍্যাঙ্ক নাম', hint: 'CallNoRankName', defaultVisible: false },
        { key: 'nameEnglish',  labelEN: 'Name',          labelBN: 'নাম',           hint: 'Plain',                 defaultVisible: false },
        { key: 'personnel',    labelEN: 'RAB Personnel', labelBN: 'র‍্যাব সদস্য',   hint: 'RabPersonnelComposite', defaultVisible: false },
        { key: 'rabId',        labelEN: 'RAB ID',        labelBN: 'র‍্যাব আইডি',    hint: 'RabId',                 defaultVisible: false },
        { key: 'memberType',   labelEN: 'Member Type',   labelBN: 'সদস্য ধরন',      hint: 'Plain',                 defaultVisible: false },
        { key: 'rabUnitHierarchy', labelEN: 'RAB Unit', labelBN: 'র‍্যাব ইউনিট (পূর্ণ)', hint: 'Plain', defaultVisible: false },
        { key: 'rabWing',      labelEN: 'RAB Wing',      labelBN: 'র‍্যাব উইং',     hint: 'Plain',                 defaultVisible: false },
        { key: 'rabRank',      labelEN: 'RAB Rank',      labelBN: 'র‍্যাব র‍্যাঙ্ক', hint: 'Plain',                 defaultVisible: false },
        { key: 'nameBangla',        labelEN: 'Name (BN)',        labelBN: 'নাম (বাংলা)',        hint: 'Plain', defaultVisible: false },
        { key: 'nid',               labelEN: 'NID',              labelBN: 'এনআইডি',            hint: 'Plain', defaultVisible: false },
        { key: 'prefix',            labelEN: 'Prefix',           labelBN: 'প্রিফিক্স',          hint: 'Plain', defaultVisible: false },
        { key: 'tradeRemarks',      labelEN: 'Trade Remarks',    labelBN: 'ট্রেড মন্তব্য',       hint: 'Plain', defaultVisible: false },
        { key: 'gender',            labelEN: 'Gender',           labelBN: 'লিঙ্গ',              hint: 'Plain', defaultVisible: false },
        { key: 'motherUnit',        labelEN: 'Last Unit',        labelBN: 'শেষ ইউনিট',          hint: 'Plain', defaultVisible: false },
        { key: 'dateOfCommission',  labelEN: 'Commission Date',  labelBN: 'কমিশন তারিখ',         hint: 'Plain', defaultVisible: false },
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
        rabRank:             { en: 'rabRank',             bn: 'rabRankBN' },
        tradeRemarks:        { en: 'tradeRemarks' },
        gender:              { en: 'gender',              bn: 'genderBN' },
        motherUnit:          { en: 'motherUnit',          bn: 'motherUnitBN' },
        rabUnit:             { en: 'rabUnit',             bn: 'rabUnitBN' },
        rabUnitHierarchy:    { en: 'rabUnitHierarchy',    bn: 'rabUnitHierarchyBN' },
        rabWing:             { en: 'rabWing',             bn: 'rabWingBN' },
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

    /**
     * Plain columns whose value is a date. They come off the wire as raw ISO
     * strings, so they need the same dd-mm-yyyy (and Bangla-numeral) rendering
     * the dedicated date hints get — otherwise the cell leaks "2020-01-15T00:00:00".
     */
    private static readonly dateColumnKeys = new Set([
        'dateOfCommission',
        'rabServiceFrom',
        'rabServiceTo',
        'dob',
    ]);

    plainCellValue(row: MemberAppointmentReportRow, key: string): string {
        // Service ID is shown with the member's prefix in front (e.g. "K. 4045260").
        if (key === 'serviceId') {
            const r = row as any;
            const prefix = this.codeValue(r.prefix, r.prefixBN);
            const svc = r.serviceId != null && r.serviceId !== '' ? String(r.serviceId) : '';
            const px = prefix && prefix !== '-' && prefix !== '—' ? prefix : '';
            return [px, svc].filter((s) => s).join(' ') || '—';
        }
        const map = ReportMemberTypeServingComponent.plainColumnPropertyMap[key];
        if (!map) return '—';
        const en = (row as any)[map.en] as string | null | undefined;
        const bn = map.bn ? (row as any)[map.bn] as string | null | undefined : undefined;
        if (ReportMemberTypeServingComponent.dateColumnKeys.has(key)) return this.formatDate(en);
        const value = this.codeValue(en, bn);
        // RAB Unit hierarchy is a comma-joined chain (Battalion, Wing, Branch,
        // Sub-Branch, Section, Sub-Section). Show only the first two levels
        // (Unit, Wing) + the deepest level instead of the full chain.
        if (key === 'rabUnitHierarchy') return this.trimHierarchy(value);
        return value;
    }

    /** Keep only the first two levels + the last one from a comma-joined
     *  hierarchy chain. Chains of 3 or fewer levels are returned unchanged. */
    private trimHierarchy(value: string): string {
        if (!value || value === '-' || value === '—') return value;
        const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length <= 3) return parts.join(', ');
        return [parts[0], parts[1], parts[parts.length - 1]].join(', ');
    }

    selectedColumnKeys: string[] = this.columnCatalog.filter(c => c.defaultVisible).map(c => c.key);

    /**
     * For ex-members the RAB Unit column holds their final posting rather than a
     * present one, so the "Present Unit" header would be a lie — retitle it.
     * Mirrors course report behaviour.
     */
    private decorateColumn(col: typeof this.columnCatalog[number]): typeof this.columnCatalog[number] {
        if (col.key === 'rabUnit' && this.selectedPostingStatus === 'ExMember') {
            return { ...col, labelEN: 'Last Posting Battalion', labelBN: 'শেষ পোস্টিং ব্যাটালিয়ন' };
        }
        return col;
    }

    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map(c => {
            const col = this.decorateColumn(c);
            return { label: this.lang === 'bn' ? col.labelBN : col.labelEN, value: c.key };
        });
    }

    /**
     * Field key that, when ticked, folds Award + Professional Qualification
     * into the Name cell instead of rendering as its own column. Default
     * (unticked) = Name shows just the name.
     */
    private static readonly NAME_EXTRAS_KEY = 'nameExtras';

    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys
            .filter((k) => k !== ReportMemberTypeServingComponent.NAME_EXTRAS_KEY)
            .map(k => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null)
            .map(c => this.decorateColumn(c));
    }

    /**
     * Name column value — just the name by default; when the "Award +
     * Professional Qualification" toggle is ticked, appends Gallantry Awards,
     * Professional Qualification and Corps (profile-style, same order as the
     * "No Rank Name" composite). An "N/A" corps is skipped.
     */
    nameColumnValue(row: MemberAppointmentReportRow): string {
        const r = row as any;
        const blank = (s: string | null | undefined) => !s || s === '-' || s === '—';
        const parts: string[] = [];
        const name = this.codeValue(r.name, r.nameBN);
        if (!blank(name)) parts.push(name);
        if (this.selectedColumnKeys.includes(ReportMemberTypeServingComponent.NAME_EXTRAS_KEY)) {
            const a = this.codeValue(r.awards, r.awardsBN);
            if (!blank(a)) parts.push(a);
            const p = this.codeValue(r.professionalQualification, r.professionalQualificationBN);
            if (!blank(p)) parts.push(p);
            let corps = this.codeValue(r.corps, r.corpsBN);
            // Skip a "not applicable" corps (English "N/A" or Bangla "অপ্রযোজ্য").
            const na = ['n/a', 'na', 'অপ্রযোজ্য'];
            if (na.includes((corps ?? '').trim().toLowerCase())) corps = '';
            if (!blank(corps)) parts.push(corps);
        }
        return parts.length ? parts.join(', ') : '-';
    }

    /** "Call No Rank Name" composite — line 1: Prefix + Service No + Rank. */
    callNoRankLine1(row: MemberAppointmentReportRow): string {
        const r = row as any;
        const prefix = this.codeValue(r.prefix, r.prefixBN);
        const svcId = r.serviceId != null && r.serviceId !== '' ? this.displayNum(r.serviceId) : '';
        const rank = this.codeValue(r.rank, r.rankBN);
        return [prefix, svcId, rank].filter((s) => s && s !== '-' && s !== '—').join(' ');
    }

    /** Line 2: Name, Awards, Professional Qualification, Corps (profile style). */
    callNoRankLine2(row: MemberAppointmentReportRow): string {
        const r = row as any;
        const name = this.codeValue(r.name, r.nameBN);
        const awards = this.codeValue(r.awards, r.awardsBN);
        const prof = this.codeValue(r.professionalQualification, r.professionalQualificationBN);
        let corps = this.codeValue(r.corps, r.corpsBN);
        // Skip a "not applicable" corps (English "N/A" or Bangla "অপ্রযোজ্য").
        const na = ['n/a', 'na', 'অপ্রযোজ্য'];
        if (na.includes((corps ?? '').trim().toLowerCase())) corps = '';
        return [name, awards, prof, corps].filter((s) => s && s !== '-' && s !== '—').join(', ');
    }

    /** Combined remarks cell — language-aware (EN vs BN), newline-separated lines. */
    remarksCellValue(row: MemberAppointmentReportRow): string {
        const r = row as any;
        return ((this.lang === 'bn' ? r.allRemarksBN : r.allRemarks) as string) || '';
    }

    /**
     * The remarks cell split into one entry per remark. Rendered as a block each
     * (rather than newlines inside one block) so each can carry a hanging indent —
     * CSS only indents the first line of a block, so "\n" alone cannot hang-indent.
     */
    remarksLines(row: MemberAppointmentReportRow): string[] {
        const txt = this.remarksCellValue(row);
        return txt ? txt.split('\n').filter((l) => l.trim() !== '') : [];
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
    removeColumn(key: string): void { this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key); this.onColumnsChange(); }

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
        const sLabel = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
        if (sLabel) items.push({ label: this.lang === 'bn' ? 'সদস্য অবস্থা' : 'Member Status', value: sLabel });
        const multi = (ids: number[], opts: { label: string; labelBn: string; value: number }[], label: string) => {
            if (!ids.length) return;
            const names = ids
                .map((id) => opts.find((o) => o.value === id))
                .filter((o): o is (typeof opts)[number] => o != null)
                .map((o) => (this.lang === 'bn' ? o.labelBn : o.label));
            if (names.length) items.push({ label, value: names.join(', ') });
        };
        multi(this.selectedMemberTypeIds, this.memberTypeOptions, L['report.search.memberType']);
        if (this.selectedOrgNodeIds.length > 0) {
            const names = this.orgNodesLabel(this.lang === 'bn');
            if (names) items.push({ label: this.lang === 'bn' ? 'র‍্যাব ইউনিট' : 'RAB Unit', value: names });
        }
        multi(this.selectedOrgIds, this.orgOptions, L['report.search.motherOrg']);
        multi(this.selectedRankIds, this.rankOptions, L['report.search.rank']);
        multi(this.selectedCorpsIds, this.corpsOptions, L['report.table.corps'] ?? 'Corps');
        multi(this.selectedTradeIds, this.tradeOptions, L['report.search.trade']);
        if (this.joiningInRabFrom != null) {
            items.push({ label: L['report.search.joiningInRabFrom'] ?? 'Joining From', value: this.formatDate(this.toDateStr(this.joiningInRabFrom)) });
        }
        if (this.joiningInRabTo != null) {
            items.push({ label: L['report.search.joiningInRabTo'] ?? 'Joining To', value: this.formatDate(this.toDateStr(this.joiningInRabTo)) });
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
        return this.L[this.lang]['report.title.memberTypeServing'];
    }
    get rabSubtitleText(): string { return ''; }
    get rabCriteriaTitle(): string { return this.lang === 'bn' ? 'নির্বাচন মানদণ্ড' : 'SELECTION CRITERIA'; }
    get rabGeneratedLabel(): string { return this.lang === 'bn' ? 'তারিখ' : 'GENERATED'; }
    get rabFormattedDate(): string {
        const now = new Date();
        return this.lang === 'bn'
            ? now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
            : now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    }
    get rabConfidentialLabel(): string { return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL'; }
    get rabWarningLabel(): string { return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED'; }
    get rabPageOfLabel(): string { return this.lang === 'bn' ? 'পৃষ্ঠা ১ / ১' : 'PAGE 1 OF 1'; }
    get rabTotalText(): string {
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.totalRecords)) : String(this.totalRecords);
        return this.lang === 'bn' ? `মোট · ${n} রেকর্ড` : `Total · ${n} records`;
    }

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // Eager scope fetch so the unit-scope chip shows on first paint without
        // waiting for the user to click Search.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => {
                this.accessibleScope = scope ?? null;
                if (this.accessibleScope?.orgScopeRestricted && this.selectedPostingStatus !== 'Servings') {
                    this.selectedPostingStatus = 'Servings';
                }
            },
            error: () => { /* silent — chip stays hidden on failure */ },
        });

        this.loadMemberTypes();
        this.loadOrgNodeLabels();
        this.loadOrgs();

        this.idSearchSub = this.idSearchInput$
            .pipe(debounceTime(400))
            .subscribe((term) => this.applyIdSearch(term));
    }

    ngOnDestroy(): void {
        this.idSearchSub?.unsubscribe();
    }

    loadMemberTypes(): void {
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.memberTypeOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: () => (this.memberTypeOptions = []),
        });
    }

    /** All RAB org codeTypes — same set the shared picker loads. */
    private static readonly ORG_CODE_TYPES = ['RabUnit', 'RabWing', 'RabBranch', 'RabSubBranch', 'RabSection', 'RabSubSection'];

    /** Build the id → label map for every org node, so the criteria strip can
     *  resolve the selected node ids to names. */
    loadOrgNodeLabels(): void {
        forkJoin(
            ReportMemberTypeServingComponent.ORG_CODE_TYPES.map((t) => this.commonCodeService.getAllActiveCommonCodesType(t))
        ).subscribe({
            next: (buckets) => {
                this.orgNodeLabels.clear();
                for (const codes of buckets) {
                    for (const c of codes || []) {
                        this.orgNodeLabels.set(c.codeId, {
                            en: c.codeValueEN || String(c.codeId),
                            bn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                            parentId: c.parentCodeId ?? null,
                        });
                    }
                }
            },
            error: () => this.orgNodeLabels.clear(),
        });
    }

    /** Root→node label chain for one org node, e.g. ["RAB 1","Wing 1","Sub Branch 1"]. */
    private orgNodePathParts(id: number, bn: boolean): string[] {
        const parts: string[] = [];
        const guard = new Set<number>();   // cycle guard
        let cur: number | null = id;
        while (cur != null && !guard.has(cur)) {
            guard.add(cur);
            const n = this.orgNodeLabels.get(cur);
            if (!n) break;
            parts.unshift(bn ? n.bn : n.en);
            cur = n.parentId;
        }
        return parts;
    }

    /**
     * Selected org nodes for the criteria strip — grouped by their root unit so
     * the unit name isn't repeated. One line per unit; the nodes picked under it
     * are listed comma-separated (each keeping its sub-path below the unit). A
     * unit picked on its own renders as just the unit name.
     */
    private orgNodesLabel(bn: boolean): string {
        const groups: { root: string; subs: string[] }[] = [];
        const byRoot = new Map<string, { root: string; subs: string[] }>();
        for (const id of this.selectedOrgNodeIds) {
            const parts = this.orgNodePathParts(id, bn);
            if (parts.length === 0) continue;
            const root = parts[0];
            let g = byRoot.get(root);
            if (!g) { g = { root, subs: [] }; byRoot.set(root, g); groups.push(g); }
            const sub = parts.slice(1).join(' › ');
            if (sub) g.subs.push(sub);
        }
        return groups
            .map((g) => (g.subs.length ? `${g.root}: ${g.subs.join(', ')}` : g.root))
            .join('\n');
    }


    loadOrgs(): void {
        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) =>
                (this.orgOptions = (orgs || []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId,
                }))),
            error: () => (this.orgOptions = []),
        });
    }

    /** Map CommonCode rows to {label, labelBn, value} option shape. */
    private mapCodes(codes: CommonCodeModel[]): { label: string; labelBn: string; value: number }[] {
        return (codes || []).map((c) => ({
            label: c.codeValueEN || String(c.codeId),
            labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
            value: c.codeId,
        }));
    }

    /** Dedupe CommonCode rows by codeId, preserving first-seen order. */
    private dedupeByCodeId(rows: CommonCodeModel[]): CommonCodeModel[] {
        const byId = new Map<number, CommonCodeModel>();
        for (const r of rows || []) if (!byId.has(r.codeId)) byId.set(r.codeId, r);
        return Array.from(byId.values());
    }

    /** Mother Org changed → reload org-scoped Ranks and Corps across all selected orgs; reset Trade. */
    onOrgChange(): void {
        this.rankOptions = [];
        this.allRanksForOrg = [];
        this.selectedRankIds = [];
        this.corpsOptions = [];
        this.selectedCorpsIds = [];
        this.tradeOptions = [];
        this.selectedTradeIds = [];
        if (!this.selectedOrgIds.length) return;
        forkJoin(this.selectedOrgIds.map((orgId) => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank'))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.allRanksForOrg = this.dedupeByCodeId(results.flat());
                this.applyRankMemberTypeFilter();
            },
            error: () => {
                this.allRanksForOrg = [];
                this.rankOptions = [];
            },
        });
        forkJoin(this.selectedOrgIds.map((orgId) => this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps'))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.corpsOptions = this.mapCodes(this.dedupeByCodeId(results.flat()));
            },
            error: () => (this.corpsOptions = []),
        });
    }

    /** Member Type changed → re-filter the org-scoped ranks by parentCodeId. */
    onMemberTypeChange(): void {
        this.applyRankMemberTypeFilter();
    }

    /** Rank = org-scoped MotherOrgRank rows whose parentCodeId is a selected Member Type. */
    private applyRankMemberTypeFilter(): void {
        let rows = this.allRanksForOrg;
        if (this.selectedMemberTypeIds.length) rows = rows.filter((r) => r.parentCodeId != null && this.selectedMemberTypeIds.includes(r.parentCodeId));
        this.rankOptions = this.mapCodes(rows);
        this.selectedRankIds = this.selectedRankIds.filter((id) => this.rankOptions.some((o) => o.value === id));
    }

    /** Cascade: a new Corps reloads Trades (children of selected Corps rows). */
    onCorpsChange(): void {
        this.tradeOptions = [];
        this.selectedTradeIds = [];
        if (!this.selectedCorpsIds.length) return;
        forkJoin(this.selectedCorpsIds.map((corpsId) => this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.tradeOptions = this.mapCodes(this.dedupeByCodeId(results.flat()));
            },
            error: () => (this.tradeOptions = []),
        });
    }

    onFilterChange(): void {}

    onPostingStatusChange(): void {
        this.first = 0;
        if (this.searched) this.load();
    }

    /** Seniority drives the server-side ORDER BY, so re-fetch from page 1. */
    onSeniorityChange(): void {
        this.first = 0;
        if (this.searched) this.load();
    }

    /** Column selection changed — re-fetch so newly added columns are populated. */
    onColumnsChange(): void {
        if (this.searched) this.load();
    }

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedMemberTypeIds.length > 0) c++;
        if (this.selectedOrgNodeIds.length > 0) c++;
        if (this.selectedOrgIds.length > 0) c++;
        if (this.selectedRankIds.length > 0) c++;
        if (this.selectedCorpsIds.length > 0) c++;
        if (this.selectedTradeIds.length > 0) c++;
        if (this.joiningInRabFrom != null) c++;
        if (this.joiningInRabTo != null) c++;
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
        this.idSearchText = '';
        this.lastIdSearchApplied = '';
        this.selectedMemberTypeIds = [];
        this.selectedOrgNodeIds = [];
        this.selectedOrgIds = [];
        this.selectedRankIds = [];
        this.selectedCorpsIds = [];
        this.selectedTradeIds = [];
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.allRanksForOrg = [];
        this.joiningInRabFrom = null;
        this.joiningInRabTo = null;
        this.selectedSeniority = 'OrganizationSeniority';
        if (!this.statusLocked) this.selectedPostingStatus = 'Servings';
        this.first = 0;
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.load();
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    /** Keystroke in the toolbar search — debounced auto-search. */
    onIdSearchInput(): void {
        this.idSearchInput$.next((this.idSearchText ?? '').trim());
    }

    /** Enter / search icon — search immediately, skipping the debounce. */
    onIdSearch(): void {
        this.applyIdSearch((this.idSearchText ?? '').trim());
    }

    clearIdSearch(): void {
        this.idSearchText = '';
        this.applyIdSearch('');
    }

    private applyIdSearch(term: string): void {
        if (term === this.lastIdSearchApplied) return;
        this.lastIdSearchApplied = term;
        this.first = 0;
        this.load();
    }

    buildFilterLines(): string[] {
        return this.criteriaItems.map(it => `${it.label}: ${it.value}`);
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    /**
     * Translate the display column keys into backend field keys. Synthetic /
     * composite columns (name, nameExtras, callNoRankName, serviceId) expand to
     * the raw registry fields they render so the server projects them; ser is
     * synthetic and ignored server-side. A trailing default push(key) lets the
     * remaining keys (incl. rabUnitHierarchy) project unchanged.
     */
    private backendColumnKeys(): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        const push = (k: string) => {
            if (!seen.has(k)) {
                seen.add(k);
                out.push(k);
            }
        };
        for (const key of this.selectedColumnKeys) {
            if (key === 'name') {
                push('nameEnglish');
                push('nameBangla');
                continue;
            }
            if (key === 'nameExtras') {
                push('awards');
                push('professionalQualification');
                push('corps');
                continue;
            }
            if (key === 'serviceId') {
                push('serviceId');
                push('prefix');
                continue;
            }
            if (key === 'callNoRankName') {
                push('prefix');
                push('serviceId');
                push('armyRank');
                push('nameEnglish');
                push('nameBangla');
                push('awards');
                push('professionalQualification');
                push('corps');
                continue;
            }
            push(key);
        }
        return out;
    }

    load(): void {
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;

        // Date range on Joining-in-RAB maps to the registry's `joiningDate` field.
        const criteria: DynamicReportCriterion[] = [];
        if (this.selectedMemberTypeIds.length > 0)
            criteria.push({ fieldKey: 'memberType', idValues: this.selectedMemberTypeIds });
        if (this.selectedOrgNodeIds.length > 0)
            criteria.push({ fieldKey: 'rabOrgNode', idValues: this.selectedOrgNodeIds });
        if (this.selectedOrgIds.length > 0)
            criteria.push({ fieldKey: 'motherOrganization', idValues: this.selectedOrgIds });
        if (this.selectedRankIds.length > 0)
            criteria.push({ fieldKey: 'armyRank', idValues: this.selectedRankIds });
        if (this.selectedCorpsIds.length > 0)
            criteria.push({ fieldKey: 'corps', idValues: this.selectedCorpsIds });
        if (this.selectedTradeIds.length > 0)
            criteria.push({ fieldKey: 'trade', idValues: this.selectedTradeIds });
        const jFrom = this.toDateStr(this.joiningInRabFrom);
        const jTo   = this.toDateStr(this.joiningInRabTo);
        if (jFrom || jTo) {
            criteria.push({ fieldKey: 'joiningDate', dateFrom: jFrom || null, dateTo: jTo || null });
        }

        this.reportService.runDynamicEmployeeBaseReport({
            columns: this.backendColumnKeys(),
            criteria,
            nominalRollSeniority: this.selectedSeniority,
            postingStatusFilter: this.selectedPostingStatus || 'Servings',
            idSearchText: (this.idSearchText ?? '').trim() || undefined,
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
                if (this.accessibleScope?.orgScopeRestricted && this.selectedPostingStatus !== 'Servings') {
                    this.selectedPostingStatus = 'Servings';
                }
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
            allRemarks:    d['allRemarks']            as string,
            allRemarksBN:  d['allRemarksBN']          as string,
            ...(d['rabId'] ? { rabid: d['rabId'] as string } : {}),
        } as MemberAppointmentReportRow & { rabid?: string };
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
        const bnFont = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'Nirmala UI', hint: 'cs' as const };
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
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }));

        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;
        const stripCell = (runs: TextRun[], alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT) =>
            new TableCell({ columnSpan: 2, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border }, left: { style: BorderStyle.SINGLE, size: 4, color: C.border }, right: { style: BorderStyle.SINGLE, size: 4, color: C.border } }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment, children: runs })] });
        const stripRow = new TableRow({ cantSplit: true, children: [stripCell([new TextRun({ text: wsafe(this.rabCriteriaTitle), font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true, color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn })], AlignmentType.LEFT), stripCell([
            new TextRun({ text: wsafe(this.rabTotalText), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn }),
            new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn, break: 1 })
        ], AlignmentType.RIGHT)] });
        const items = this.criteriaItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({ borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: critCellPct, type: WidthType.PERCENTAGE }, children: it ? [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: wsafe(it.label), font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true, color: C.labelGray, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }), ...wsafe(it.value).split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true, color: C.black })] }))] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })] }));
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
                    case 'CallNoRankName': {
                        const l1 = this.callNoRankLine1(row);
                        const l2 = this.callNoRankLine2(row);
                        const children: Paragraph[] = [new Paragraph({ spacing: { after: l2 ? 40 : 0 }, children: [run(l1, { sz: S.name, bold: true })] })];
                        if (l2) children.push(new Paragraph({ children: [run(l2, { sz: S.name, bold: true })] }));
                        return new TableCell({ ...cellOpts, children });
                    }
                    case 'Name': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.nameColumnValue(row), { sz: S.name, bold: true })] })] });
                    case 'RabId': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run((row as any).rabid ? this.displayNum((row as any).rabid) : '—', { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'JoiningDate': return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.formatDate(row.joiningDate), { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'Remarks': {
                        // One paragraph per remark, all flush left — a wrapped line starts
                        // under the bullet, not under the text.
                        const rmkLines = this.remarksLines(row);
                        return new TableCell({ ...cellOpts, children: (rmkLines.length ? rmkLines : ['']).map(l => new Paragraph({ children: [run(l, { color: C.gray })] })) });
                    }
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
        saveAs(blob, `nominal-roll-report_${this.lang}.docx`);
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
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabTotalText}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value.replace(/\n/g, '; ')}`, ...pad(totalCols - 1)]);
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
                    case 'CallNoRankName': {
                        const l1 = this.callNoRankLine1(row);
                        const l2 = this.callNoRankLine2(row);
                        return l1 && l2 ? `${l1}\n${l2}` : l1 || l2;
                    }
                    case 'Name': return this.nameColumnValue(row);
                    case 'RabId': return (row as any).rabid ? this.displayNum((row as any).rabid) : '';
                    case 'JoiningDate': return this.formatDate(row.joiningDate);
                    case 'Remarks': return this.remarksCellValue(row);
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
        const titleRows = [0, 1, 2, 3, 4];
        for (const r of titleRows) ws['!merges'].push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });
        const lastRow = aoa.length - 1;
        ws['!merges'].push({ s: { r: lastRow, c: 0 }, e: { r: lastRow, c: totalCols - 1 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isBn ? 'প্রতিবেদন' : 'Report');
        XLSX.writeFile(wb, `nominal-roll-report_${this.lang}.xlsx`);
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
        const serif = isBn ? "'Times New Roman', 'Nirmala UI', serif" : "'Times New Roman', serif";
        const sans = isBn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Times New Roman', sans-serif";
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
                case 'CallNoRankName':
                    return `<td class="td-personnel"><div class="personnel-name">${esc(this.callNoRankLine1(row))}</div><div class="personnel-name">${esc(this.callNoRankLine2(row))}</div></td>`;
                case 'Name':
                    return `<td class="td-personnel"><div class="personnel-name">${esc(this.nameColumnValue(row))}</div></td>`;
                case 'RabId': return `<td class="td-date">${esc((row as any).rabid ? this.displayNum((row as any).rabid) : '—')}</td>`;
                case 'JoiningDate': return `<td class="td-date">${esc(this.formatDate(row.joiningDate))}</td>`;
                case 'Remarks':
                    return `<td class="td-rmks">${this.remarksLines(row).map((l) => `<div class="rmk-line">${esc(l)}</div>`).join('')}</td>`;
                case 'Plain':
                default: return `<td>${esc(this.plainCellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list.map((row, i) => `<tr>${visibleCols.map(c => renderCell(row, c, i)).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value).replace(/\n/g, '<br>')}</div></div>`).join('')}</div>` : '';
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
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip { display: flex; justify-content: space-between; align-items: center; padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0; font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase; color: #4a4a4a; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.9; font-weight: 500; display: flex; flex-direction: column; align-items: flex-end; gap: 0.4mm; text-align: right; }
    .criteria-strip-total { color: #b78b3b; font-weight: 700; text-transform: none; letter-spacing: normal; }
    .criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr)); }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label { font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a8a; margin-bottom: 1mm; font-weight: 600; ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''} }
    .cell-value { font-family: ${serif}; font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2; ${isBn ? 'font-family:' + sans + ';' : ''} }
    table { width: 100%; border-collapse: collapse; table-layout: auto; font-family: ${sans}; font-size: 8pt; }
    thead { display: table-header-group; }
    thead th { background: #0b0b0b; color: #d9c79a; font-family: ${mono}; font-size: 6.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 1.8mm 2mm; text-align: left; vertical-align: middle; white-space: nowrap; border: 1px solid rgba(11,11,11,0.05); ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''} }
    tbody td { padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b; border: 1px solid rgba(11,11,11,0.05); vertical-align: top; background: #fff; word-break: keep-all; overflow-wrap: normal; }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; }
    .ser { font-family: ${mono}; font-size: 9pt; font-weight: 600; color: #6b6b6b; letter-spacing: 0.04em; white-space: nowrap; }
    .td-personnel { min-width: 56mm; }
    .personnel-name { font-family: ${sans}; font-weight: 600; font-size: 9.5pt; color: #0b0b0b; line-height: 1.2; }
    .personnel-meta { margin-top: 0.7mm; font-family: ${mono}; font-size: 7pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''} }
    .td-date { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
    /* One block per remark, every line flush left — a wrapped line starts under
       the bullet, not under the text. */
    .td-rmks { text-align: left; }
    .rmk-line { text-align: left; padding-left: 0; text-indent: 0; }
</style></head><body><div class="paper">
    <header class="paper-head">
        <div class="overline">${esc(this.rabOverlineText)}</div>
        <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
        <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
        <div class="orn-divider"><span class="orn-line"></span><span class="orn-diamond">&#9670;</span><span class="orn-line"></span></div>
        <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
    </header>
    <div class="criteria">
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date"><span class="criteria-strip-total">${esc(this.rabTotalText)}</span><span class="criteria-strip-gen">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></span></div>
        ${criteriaGridHtml}
    </div>
    <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
</div></body></html>`;
    }

    toDateStr(d: Date | null): string {
        if (d == null) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '—';
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
