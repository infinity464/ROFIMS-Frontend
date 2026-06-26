import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import {
    codeValue as codeValueHelper,
    displayNum as displayNumHelper,
    paddedSer as paddedSerHelper,
    personnelMeta as personnelMetaHelper,
    addressCrumbParts as addressCrumbPartsHelper,
    addressDetail as addressDetailHelper,
} from '../formal-rab-render.helper';
import type {
    AddressLocationReportRow,
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import { OrgTreeMultiSelectComponent } from '@/shared/components/org-tree-multi-select/org-tree-multi-select.component';
import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    TableLayoutType,
    PageOrientation,
    Footer,
    PageNumber,
} from 'docx';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-report-address-location',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, MultiSelectModule, InputTextModule, PaginatorModule, Toast, OrgTreeMultiSelectComponent],
    providers: [MessageService],
    templateUrl: './report-address-location.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-address-location.component.scss'],
})
export class ReportAddressLocationComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    /** Cascading geographic dropdowns */
    divisionOptions: { label: string; labelBn: string; value: number }[] = [];
    districtOptions: { label: string; labelBn: string; value: number }[] = [];
    upazilaOptions: { label: string; labelBn: string; value: number }[] = [];
    postOfficeOptions: { label: string; labelBn: string; value: number }[] = [];

    selectedDivisionId: number | null = null;
    selectedDistrictId: number | null = null;
    selectedUpazilaId: number | null = null;
    selectedPostOfficeId: number | null = null;

    /** Common org/rank multi-select cascade (mirrors member-appointment). */
    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    memberTypeOptions: { label: string; labelBn: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    corpsOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];

    selectedOrgIds: number[] = [];
    selectedMemberTypeIds: number[] = [];
    selectedRankIds: number[] = [];
    selectedCorpsIds: number[] = [];
    selectedTradeIds: number[] = [];
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

    /** Raw org-scoped MotherOrgRank rows, re-filtered client-side by Member Type. */
    private allRanksForOrg: CommonCodeModel[] = [];

    /** Separate search fields */
    searchRabId: string = '';
    searchServiceId: string = '';
    searchNid: string = '';

    /** Address Owner filter: "Self", relationship CodeId as string, or empty for all */
    addressOwnerOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Self (Member)', labelBn: 'নিজ (সদস্য)', value: 'Self' },
    ];
    selectedAddressOwner: string = 'Self';

    /** Location Type filter */
    locationTypeOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Permanent Address', labelBn: 'স্থায়ী ঠিকানা', value: 'Permanent' },
        { label: 'Present Address', labelBn: 'বর্তমান ঠিকানা', value: 'Present' },
    ];
    selectedLocationType: string = 'Present';

    /** Address Status: true = Only Active, false = With All History */
    addressStatusOptions: { label: string; value: boolean }[] = [
        { label: 'Only Active Address', value: true },
        { label: 'With All History', value: false },
    ];
    activeOnly: boolean = true;

    /** Member Status dropdown */
    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
        { label: 'Supernumerary', labelBn: 'সুপারনিউমারারি', value: 'Supernumerary' },
    ];
    selectedPostingStatus: string = 'Servings';

    /** Show RAB Unit column only when filtering Presently Serving members */
    get showRabUnit(): boolean {
        return this.selectedPostingStatus === 'Servings';
    }

    /** ── Column picker ────────────────────────────────────────────────
        Catalog of fields the user can toggle. Built from the existing
        `AddressLocationReportRow` shape so this is additive and doesn't
        require a backend change — every key here is already populated by
        the current `getAddressLocationReport` endpoint.

        `hint` drives the cell renderer in the HTML:
          - 'Serial'             — row index + 1
          - 'PersonnelComposite' — name + rank · org · SVC meta
          - 'RabId'              — mono-styled cell
          - 'LocationType'       — uppercase mono cell
          - 'AddressComposite'   — Division › District › Upazila crumb + PO
          - 'AddressOwner'       — `addressOwner` / `addressOwnerBN`
          - 'Status'             — mapped via displayMemberStatus()
          - 'Remarks'            — row.rmks
          - 'Plain'              — generic codeValue() lookup

        `lockedWhen` lets us auto-select a column based on the filter state
        without locking the user out (e.g. Status auto-ticks when the
        Member Status filter is set to All). */
    columnCatalog: {
        key: string;
        labelEN: string;
        labelBN: string;
        hint: string;
        defaultVisible: boolean;
    }[] = [
        { key: 'ser',          labelEN: 'Ser',           labelBN: 'ক্রঃ',           hint: 'Serial',             defaultVisible: true },
        { key: 'serviceId',    labelEN: 'Service ID',    labelBN: 'সার্ভিস আইডি',     hint: 'Plain',              defaultVisible: true },
        { key: 'armyRank',     labelEN: 'Rank',          labelBN: 'র‍্যাঙ্ক',         hint: 'Plain',              defaultVisible: true },
        { key: 'corps',        labelEN: 'Corps',         labelBN: 'কোর',             hint: 'Plain',              defaultVisible: true },
        { key: 'trade',        labelEN: 'Trade',         labelBN: 'ট্রেড',            hint: 'Plain',              defaultVisible: true },
        { key: 'name',         labelEN: 'Name',          labelBN: 'নাম',             hint: 'Plain',              defaultVisible: true },
        // Single toggle that folds Award + Professional Qualification + Corps
        // INTO the Name cell when ticked. Never renders as its own column —
        // see visibleColumns + nameColumnValue. Default off.
        { key: 'nameExtras',   labelEN: 'Award + Professional Qualification', labelBN: 'পদক + পেশাগত যোগ্যতা', hint: 'NameSuffix', defaultVisible: false },
        // Profile-style composite: line 1 = Prefix + Service No + Rank; line 2 =
        // Name with awards, professional qualification and corps. Opt-in.
        { key: 'callNoRankName', labelEN: 'No Rank Name', labelBN: 'নং র‍্যাঙ্ক নাম', hint: 'CallNoRankName', defaultVisible: false },
        // Personnel composite (name + SVC·Rank·Org meta) — opt-in only now;
        // the identity renders as separate plain columns (serviceId/rank/corps/
        // trade/name) by default instead.
        { key: 'personnel',    labelEN: 'Personnel',     labelBN: 'সদস্য',          hint: 'PersonnelComposite', defaultVisible: false },
        { key: 'rabId',        labelEN: 'RAB ID',        labelBN: 'র‍্যাব আইডি',     hint: 'RabId',              defaultVisible: false },
        { key: 'addressOwner', labelEN: 'Address Owner', labelBN: 'ঠিকানার মালিক',   hint: 'AddressOwner',       defaultVisible: false },
        { key: 'locationType', labelEN: 'Address Type',  labelBN: 'ঠিকানার ধরন',     hint: 'LocationType',       defaultVisible: false },
        { key: 'address',      labelEN: 'Address',       labelBN: 'ঠিকানা',         hint: 'AddressComposite',   defaultVisible: true },
        { key: 'status',       labelEN: 'Status',        labelBN: 'অবস্থা',          hint: 'Status',             defaultVisible: false },
        { key: 'remarks',      labelEN: 'Remarks',       labelBN: 'মন্তব্য',         hint: 'Remarks',            defaultVisible: true },
        // Extras the user can add — already in the AddressLocationReportRow
        // shape; just not shown by default.
        // Service-side extras (data comes from the dynamic backend via
        // vw_DynamicReportEmployee). Keys match the backend ReportFieldRegistry
        // so the request → response round-trip works without renames.
        { key: 'nameEnglish',       labelEN: 'Name (EN)',        labelBN: 'নাম (ইংরেজি)',      hint: 'Plain', defaultVisible: false },
        { key: 'nameBangla',        labelEN: 'Name (BN)',        labelBN: 'নাম (বাংলা)',       hint: 'Plain', defaultVisible: false },
        { key: 'nid',               labelEN: 'NID',              "labelBN": 'এনআইডি',          hint: 'Plain', defaultVisible: false },
        { key: 'prefix',            labelEN: 'Prefix',           labelBN: 'প্রিফিক্স',          hint: 'Plain', defaultVisible: false },
        { key: 'appointment',       labelEN: 'Appointment',      labelBN: 'নিয়োগ',            hint: 'Plain', defaultVisible: false },
        { key: 'memberType',        labelEN: 'Member Type',      labelBN: 'সদস্য ধরন',         hint: 'Plain', defaultVisible: false },
        { key: 'motherOrganization',labelEN: 'Mother Org',       labelBN: 'মাতৃ সংস্থা',       hint: 'Plain', defaultVisible: false },
        { key: 'rabRank',           labelEN: 'RAB Rank',         labelBN: 'র‍্যাব র‍্যাঙ্ক',    hint: 'Plain', defaultVisible: false },
        { key: 'tradeRemarks',      labelEN: 'Trade Remarks',    labelBN: 'ট্রেড মন্তব্য',      hint: 'Plain', defaultVisible: false },
        { key: 'gender',            labelEN: 'Gender',           labelBN: 'লিঙ্গ',             hint: 'Plain', defaultVisible: false },
        { key: 'motherUnit',        labelEN: 'Last Unit',        labelBN: 'শেষ ইউনিট',         hint: 'Plain', defaultVisible: false },
        { key: 'rabUnit',           labelEN: 'Battalion',        labelBN: 'ব্যাটালিয়ন',        hint: 'Plain', defaultVisible: false },
        // Trimmed job hierarchy (Battalion, Wing … deepest level — first two + last). Opt-in.
        { key: 'rabUnitHierarchy',  labelEN: 'RAB Unit',         labelBN: 'র‍্যাব ইউনিট',     hint: 'Plain', defaultVisible: false },
        { key: 'dateOfCommission',  labelEN: 'Commission Date',  labelBN: 'কমিশন তারিখ',       hint: 'Plain', defaultVisible: false },
        { key: 'joiningDate',       labelEN: 'Joining Date',     labelBN: 'যোগদান তারিখ',      hint: 'Plain', defaultVisible: false },
        { key: 'rabServiceFrom',    labelEN: 'RAB Joining Date', labelBN: 'র‍্যাবে যোগদান তারিখ', hint: 'Plain', defaultVisible: false },
        { key: 'rabServiceTo',      labelEN: 'RAB End Date',     labelBN: 'র‍্যাব শেষ তারিখ',  hint: 'Plain', defaultVisible: false },
        { key: 'division',          labelEN: 'Division',         labelBN: 'বিভাগ',             hint: 'Plain', defaultVisible: false },
        { key: 'district',          labelEN: 'District',         labelBN: 'জেলা',              hint: 'Plain', defaultVisible: false },
        { key: 'upazila',           labelEN: 'Upazila',          labelBN: 'উপজেলা',            hint: 'Plain', defaultVisible: false },
        { key: 'postOffice',        labelEN: 'Post Office',      labelBN: 'ডাকঘর',             hint: 'Plain', defaultVisible: false },
        // Personal-side fields
        { key: 'dob',               labelEN: 'Date of Birth',    labelBN: 'জন্ম তারিখ',         hint: 'Plain', defaultVisible: false },
        { key: 'religion',          labelEN: 'Religion',         labelBN: 'ধর্ম',              hint: 'Plain', defaultVisible: false },
        { key: 'bloodGroup',        labelEN: 'Blood Group',      labelBN: 'রক্তের গ্রুপ',       hint: 'Plain', defaultVisible: false },
        { key: 'maritalStatus',     labelEN: 'Marital Status',   labelBN: 'বৈবাহিক অবস্থা',     hint: 'Plain', defaultVisible: false },
        { key: 'mobileNo',          labelEN: 'Mobile',           labelBN: 'মোবাইল',            hint: 'Plain', defaultVisible: false },
        { key: 'email',             labelEN: 'Email',            labelBN: 'ইমেইল',             hint: 'Plain', defaultVisible: false },
    ];

    /** Field keys the user has selected to render. Defaults to the catalog's
        `defaultVisible` set; the user can edit via the MultiSelect picker. */
    selectedColumnKeys: string[] = this.columnCatalog
        .filter((c) => c.defaultVisible)
        .map((c) => c.key);

    /** Picker option list — projects the catalog to PrimeNG MultiSelect shape. */
    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map((c) => ({
            label: this.lang === 'bn' ? c.labelBN : c.labelEN,
            value: c.key,
        }));
    }

    /** Visible columns in user-picked order. `selectedColumnKeys` is the
        source of truth — drag-reorder mutates it directly. New picks land at
        the end (PrimeNG MultiSelect appends), so they appear at the right
        of the table until the user drags them elsewhere. */
    /**
     * Field key that, when ticked, folds Award + Professional Qualification
     * into the Name cell instead of rendering as its own column.
     */
    private static readonly NAME_EXTRAS_KEY = 'nameExtras';

    get visibleColumns() {
        const map = new Map(this.columnCatalog.map((c) => [c.key, c]));
        return this.selectedColumnKeys
            .filter((k) => k !== ReportAddressLocationComponent.NAME_EXTRAS_KEY)
            .map((k) => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

    /**
     * Name column value — just the name by default; when the "Award +
     * Professional Qualification" toggle is ticked, appends Gallantry Awards,
     * Professional Qualification and Corps (profile-style). An "N/A" corps is skipped.
     */
    nameColumnValue(row: AddressLocationReportRow): string {
        const r = row as any;
        const blank = (s: string | null | undefined) => !s || s === '-' || s === '—';
        const parts: string[] = [];
        const name = this.codeValue(r.name, r.nameBN);
        if (!blank(name)) parts.push(name);
        if (this.selectedColumnKeys.includes(ReportAddressLocationComponent.NAME_EXTRAS_KEY)) {
            const a = this.codeValue(r.awards, r.awardsBN);
            if (!blank(a)) parts.push(a);
            const p = this.codeValue(r.professionalQualification, r.professionalQualificationBN);
            if (!blank(p)) parts.push(p);
            let corps = this.codeValue(r.corps, r.corpsBN);
            const na = ['n/a', 'na', 'অপ্রযোজ্য'];
            if (na.includes((corps ?? '').trim().toLowerCase())) corps = '';
            if (!blank(corps)) parts.push(corps);
        }
        return parts.length ? parts.join(', ') : '—';
    }

    /** "Call No Rank Name" composite — line 1: Prefix + Service No + Rank. */
    callNoRankLine1(row: AddressLocationReportRow): string {
        const r = row as any;
        const prefix = this.codeValue(r.prefix, r.prefixBN);
        const svcId = r.serviceId != null && r.serviceId !== '' ? this.displayNum(r.serviceId) : '';
        const rank = this.codeValue(r.rank, r.rankBN);
        return [prefix, svcId, rank].filter((s) => s && s !== '-' && s !== '—').join(' ');
    }

    /** Line 2: Name, Awards, Professional Qualification, Corps (profile style). */
    callNoRankLine2(row: AddressLocationReportRow): string {
        const r = row as any;
        const name = this.codeValue(r.name, r.nameBN);
        const awards = this.codeValue(r.awards, r.awardsBN);
        const prof = this.codeValue(r.professionalQualification, r.professionalQualificationBN);
        let corps = this.codeValue(r.corps, r.corpsBN);
        const na = ['n/a', 'na', 'অপ্রযোজ্য'];
        if (na.includes((corps ?? '').trim().toLowerCase())) corps = '';
        return [name, awards, prof, corps].filter((s) => s && s !== '-' && s !== '—').join(', ');
    }

    /** Keep only the first two levels + the last one from a comma-joined
     *  hierarchy chain. Chains of 3 or fewer levels are returned unchanged. */
    private trimHierarchy(value: string): string {
        if (!value || value === '-' || value === '—') return value;
        const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length <= 3) return parts.join(', ');
        return [parts[0], parts[1], parts[parts.length - 1]].join(', ');
    }

    // ── Drag-reorder of the column chips ─────────────────────────────────
    /** Field key currently being dragged. Cleared on dragend/drop. */
    draggingColumnKey: string | null = null;

    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingColumnKey = key;
        // dataTransfer is required for Firefox to fire dragover on the drop target.
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }

    onColumnDragOver(event: DragEvent): void {
        event.preventDefault();  // allow drop
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

    onColumnDragEnd(): void {
        this.draggingColumnKey = null;
    }

    /** "×" button on a chip — removes the column from the picker selection. */
    removeColumn(key: string): void {
        this.selectedColumnKeys = this.selectedColumnKeys.filter((k) => k !== key);
        this.onColumnsChange();
    }

    /** Show the Address Owner column whenever the filter is something OTHER than
        "Self" — when the user is looking at "All" or a specific relationship, the
        owner identity is the whole point of the column. With "Self" selected,
        every row would say the same thing, so the column is dead weight.

        Still drives auto-selection: when the filter changes, the column key
        is added to (or removed from) `selectedColumnKeys` so the picker UX
        and the legacy auto-toggle stay in sync. Manual user picks aren't
        overridden — the picker is the single source of truth at render time. */
    get showAddressOwner(): boolean {
        return this.selectedColumnKeys.includes('addressOwner');
    }

    /** Show the Status column when the user has selected it in the picker.
        Auto-managed by `onPostingStatusChange()` so that picking "All" in
        the filter auto-adds the column, and picking a specific status
        auto-removes it (unless the user explicitly re-ticked it). */
    get showStatus(): boolean {
        return this.selectedColumnKeys.includes('status');
    }

    /** Mapping from picker key → (EN-property, BN-property) on the row.
        Drives the @default cell renderer for "Plain" columns. Adapter
        renames preserve the existing render code's property accesses
        (`row.rank` / `row.rankBN` etc.) for the legacy field set; new
        fields project under their own keys via the adapter's pass-through. */
    private static readonly plainColumnPropertyMap: Record<string, { en: string; bn?: string }> = {
        // Service-side — keys match the picker; values are the AddressLocation
        // legacy property names the adapter renames the dynamic response to.
        serviceId:           { en: 'serviceId' },
        name:                { en: 'name',                bn: 'nameBN' },
        nameEnglish:         { en: 'name' },
        nameBangla:          { en: 'nameBN' },
        nid:                 { en: 'nid' },
        prefix:              { en: 'prefix',              bn: 'prefixBN' },
        appointment:         { en: 'appointment',         bn: 'appointmentBN' },
        memberType:          { en: 'memberType',          bn: 'memberTypeBN' },
        motherOrganization:  { en: 'orgName',             bn: 'orgNameBN' },
        armyRank:            { en: 'rank',                bn: 'rankBN' },
        rabRank:             { en: 'rabRank',             bn: 'rabRankBN' },
        corps:               { en: 'corps',               bn: 'corpsBN' },
        trade:               { en: 'trade',               bn: 'tradeBN' },
        tradeRemarks:        { en: 'tradeRemarks' },
        gender:              { en: 'gender',              bn: 'genderBN' },
        motherUnit:          { en: 'motherUnit',          bn: 'motherUnitBN' },
        rabUnit:             { en: 'rabUnit',             bn: 'rabUnitBN' },
        rabUnitHierarchy:    { en: 'rabUnitHierarchy',    bn: 'rabUnitHierarchyBN' },
        dateOfCommission:    { en: 'dateOfCommission' },
        joiningDate:         { en: 'joiningDate' },
        rabServiceFrom:      { en: 'rabServiceFrom' },
        rabServiceTo:        { en: 'rabServiceTo' },
        division:            { en: 'division',            bn: 'divisionBN' },
        district:            { en: 'district',            bn: 'districtBN' },
        upazila:             { en: 'upazila',             bn: 'upazilaBN' },
        postOffice:          { en: 'postOffice',          bn: 'postOfficeBN' },
        // Personal-side
        dob:                 { en: 'dob' },
        religion:            { en: 'religion' },              // view exposes EN only
        bloodGroup:          { en: 'bloodGroup' },
        maritalStatus:       { en: 'maritalStatus' },          // view exposes EN only
        mobileNo:            { en: 'mobileNo' },
        email:               { en: 'email' },
    };

    /** Flatten any column to a single text value for exports. Composite
        cells get joined with " · " / " › " so the row stays one line — Word
        keeps richer formatting by branching directly on hint instead. */
    private cellExportText(row: AddressLocationReportRow, col: { key: string; hint: string }): string {
        switch (col.hint) {
            case 'Serial':
                return this.paddedSer(row.ser);
            case 'PersonnelComposite': {
                const name = this.codeValue(row.name, row.nameBN);
                const meta = this.personnelMeta(row);
                return meta && meta !== '—' ? `${name} · ${meta}` : name;
            }
            case 'RabId':
                return row.rabid ? this.displayNum(row.rabid) : '—';
            case 'LocationType':
                return this.displayLocationTypeUpper(row.locationType);
            case 'AddressComposite': {
                const crumbs = this.addressCrumbParts(row)
                    .map((p) => `${p.label}: ${p.value}`)
                    .join(' › ');
                const detail = this.addressDetail(row);
                if (crumbs && detail) return `${crumbs} · ${detail}`;
                return crumbs || detail || '';
            }
            case 'AddressOwner':
                return this.codeValue(row.addressOwner, row.addressOwnerBN);
            case 'Status':
                return this.displayMemberStatus(row);
            case 'Remarks':
                return row.rmks || '';
            case 'CallNoRankName': {
                const l1 = this.callNoRankLine1(row);
                const l2 = this.callNoRankLine2(row);
                return [l1, l2].filter(Boolean).join('\n');
            }
            default:
                return this.plainCellValue(row, col.key);
        }
    }

    /** Header label list for exports, in visible-column order, lang-aware. */
    private get exportHeaderLabels(): string[] {
        return this.visibleColumns.map((c) =>
            this.lang === 'bn' ? c.labelBN : c.labelEN,
        );
    }

    /** Resolve a plain-hint cell's value by walking the column→property map
        and applying the same bilingual fallback as `codeValue()`. */
    plainCellValue(row: AddressLocationReportRow, key: string): string {
        // Name cell — folds Award + Professional Qualification + Corps into the
        // name when the nameExtras toggle is ticked (screen + all exporters
        // route here, so they stay consistent).
        if (key === 'name') return this.nameColumnValue(row);
        // Service ID is shown with the member's prefix in front (e.g. "K. 4045260").
        if (key === 'serviceId') {
            const r = row as any;
            const prefix = this.codeValue(r.prefix, r.prefixBN);
            const svc = r.serviceId != null && r.serviceId !== '' ? String(r.serviceId) : '';
            const px = prefix && prefix !== '-' && prefix !== '—' ? prefix : '';
            return [px, svc].filter((s) => s).join(' ') || '—';
        }
        const map = ReportAddressLocationComponent.plainColumnPropertyMap[key];
        if (!map) return '—';
        const en = (row as any)[map.en] as string | null | undefined;
        const bn = map.bn ? (row as any)[map.bn] as string | null | undefined : undefined;
        const value = this.codeValue(en, bn);
        // RAB Unit hierarchy is a comma-joined chain (Battalion, Wing, Branch, …).
        // Show only the first two levels + the deepest instead of the full chain.
        if (key === 'rabUnitHierarchy') return this.trimHierarchy(value);
        return value;
    }

    /** Toggle a single column key in the picker selection. Used by the
        auto-management of conditional columns (Address Owner, Status). */
    private toggleColumn(key: string, visible: boolean): void {
        const has = this.selectedColumnKeys.includes(key);
        if (visible && !has) {
            this.selectedColumnKeys = [...this.selectedColumnKeys, key];
        } else if (!visible && has) {
            this.selectedColumnKeys = this.selectedColumnKeys.filter((k) => k !== key);
        }
    }

    /** Filter-change handlers — auto-add/remove the address-owner / status
        columns to mirror the previous always-on conditional behaviour. */
    onAddressOwnerFilterChange(): void {
        this.toggleColumn('addressOwner', this.selectedAddressOwner !== 'Self');
    }
    onPostingStatusFilterChange(): void {
        this.toggleColumn('status', !this.selectedPostingStatus);
    }

    /** Backend returns the status code; map to a localized label. Unknown
        codes fall through as-is so we don't silently hide unexpected values.
        "Pending" and "PendingForJoining" collapse onto one display label —
        the backend uses both spellings interchangeably in EmployeeInfo. */
    private static readonly memberStatusDisplayMap: Record<string, { en: string; bn: string }> = {
        Servings: { en: 'Serving', bn: 'কর্মরত' },
        Serving: { en: 'Serving', bn: 'কর্মরত' },
        ExMember: { en: 'Ex-Member', bn: 'সাবেক সদস্য' },
        Pending: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        PendingForJoining: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        Supernumerary: { en: 'Supernumerary', bn: 'সুপারনিউমারারি' },
    };

    displayMemberStatus(row: AddressLocationReportRow): string {
        const raw = (row.status ?? '').trim();
        if (!raw) return '—';
        const mapped = ReportAddressLocationComponent.memberStatusDisplayMap[raw];
        if (mapped) return this.lang === 'bn' ? mapped.bn : mapped.en;
        return raw;
    }

    list: AddressLocationReportRow[] = [];
    loading = false;
    searched = false;
    first = 0;
    // Reports default to 1000 rows per page — the formal-document layout is
    // designed to be browsed at a roster scale, not 20 rows at a time.
    rows = 100;
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    /**
     * Access-scope snapshot returned by the backend. Drives:
     *  - The scope chip rendered under the title
     *  - Locking the Member Status dropdown to "Servings" when the org scope is
     *    restricted (other statuses have no RAB unit to scope against)
     */
    accessibleScope: ReportAccessibleScope | null = null;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    get reportTitle(): string {
        const sLabel = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
        const statusSuffix = sLabel ? ` (${sLabel})` : '';
        return this.L[this.lang]['report.title.addressLocation'] + statusSuffix;
    }

    get statusLabel(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.label ?? '';
    }

    get statusLabelBn(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.labelBn ?? '';
    }

    /**
     * When the caller has org-tree restrictions, only currently-serving members
     * carry a RAB unit placement we can scope against. We lock the status filter
     * to "Servings" to make the constraint explicit instead of silently 0-ing
     * out an Ex-Member / Supernumerary search.
     */
    get statusLocked(): boolean {
        return this.accessibleScope?.orgScopeRestricted === true;
    }

    /**
     * Unit-scope line — rendered ABOVE the date so the org context reads first.
     * Bare comma-separated list (no "Units:" label) to match the statistics
     * reports' design pass. Null when unrestricted on this axis.
     */
    get unitScopeLine(): string | null {
        const s = this.accessibleScope;
        if (!s) return null;
        const bn = this.lang === 'bn';
        const unitNames = (bn ? s.rabUnitNamesBN : s.rabUnitNames) ?? s.rabUnitNames;
        if (!unitNames || unitNames.length === 0) return null;
        return unitNames.join(', ');
    }

    /**
     * Member-type scope line — rendered BELOW the date, where the original
     * combined scope chip used to live. Null when unrestricted on this axis.
     */
    get memberTypeScopeLine(): string | null {
        const s = this.accessibleScope;
        if (!s) return null;
        const bn = this.lang === 'bn';
        const memberTypeNames = (bn ? s.memberTypeNamesBN : s.memberTypeNames) ?? s.memberTypeNames;
        if (!memberTypeNames || memberTypeNames.length === 0) return null;
        const label = bn ? 'সদস্য ধরণ' : 'Member Types';
        return `${label}: ${memberTypeNames.join(', ')}`;
    }

    get dateLine(): string {
        const now = new Date();
        if (this.lang === 'en') {
            return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return now.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    /**
     * Date formatted for the formal RAB report header strip — "25 MAY, 2026".
     * Day numeric, month uppercase abbrev-full, year numeric.
     */
    get rabFormattedDate(): string {
        const now = new Date();
        if (this.lang === 'en') {
            const day = now.getDate();
            const month = now.toLocaleString('en-US', { month: 'long' }).toUpperCase();
            const year = now.getFullYear();
            return `${day} ${month}, ${year}`;
        }
        const dayBn = BanglaNumerals.toBangla(now.getDate().toString());
        const monthBn = now.toLocaleString('bn-BD', { month: 'long' });
        const yearBn = BanglaNumerals.toBangla(now.getFullYear().toString());
        return `${dayBn} ${monthBn}, ${yearBn}`;
    }

    /** "<status> Personnel" — section subtitle under the report title in the paper view. */
    get rabSubtitleText(): string {
        const label = this.lang === 'bn' ? this.statusLabelBn : this.statusLabel;
        if (!label) return '';
        return this.lang === 'bn' ? label : `${label} Personnel`;
    }

    /** Section title for the paper view — uppercase variant of the report title. */
    get rabSectionTitle(): string {
        return this.L[this.lang]['report.title.addressLocation'].toUpperCase();
    }

    /** Government-letterhead lines at the top of the paper. */
    get rabOverlineText(): string {
        return this.lang === 'bn'
            ? 'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার'
            : "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH";
    }
    get rabOrgTitle(): string {
        return this.lang === 'bn' ? 'র‍্যাপিড অ্যাকশন ব্যাটালিয়ন' : 'RAPID ACTION BATTALION';
    }
    get rabOrgSubtitle(): string {
        return this.lang === 'bn'
            ? 'বাংলাদেশ পুলিশ · সদর দপ্তর, কুর্মিটোলা, ঢাকা'
            : 'Bangladesh Police · Headquarters, Kurmitola, Dhaka';
    }

    /** Selection-criteria strip labels. */
    get rabCriteriaTitle(): string {
        return this.lang === 'bn' ? 'বাছাইয়ের শর্তাবলী' : 'SELECTION CRITERIA';
    }
    get rabGeneratedLabel(): string {
        return this.lang === 'bn' ? 'প্রস্তুতকৃত' : 'GENERATED';
    }

    get rabTotalText(): string {
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.totalRecords)) : String(this.totalRecords);
        return this.lang === 'bn' ? `মোট · ${n} রেকর্ড` : `Total · ${n} records`;
    }

    /** Confidential-strip labels. */
    get rabConfidentialLabel(): string {
        return this.lang === 'bn' ? 'গোপনীয়' : 'CONFIDENTIAL';
    }
    get rabPageOfLabel(): string {
        if (this.lang === 'bn') {
            const cur = BanglaNumerals.toBangla(this.currentPage.toString());
            const tot = BanglaNumerals.toBangla(this.totalPages.toString());
            return `পৃষ্ঠা ${cur} / ${tot}`;
        }
        return `PAGE ${this.currentPage} OF ${this.totalPages}`;
    }
    get rabWarningLabel(): string {
        return this.lang === 'bn' ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED';
    }

    /** Current/total pages for the in-paper footer line. */
    get currentPage(): number {
        return Math.floor(this.first / this.rows) + 1;
    }
    get totalPages(): number {
        return Math.max(1, Math.ceil(this.totalRecords / this.rows));
    }

    /** Zero-pad serial to 2 digits and apply Bangla numerals when appropriate. */
    paddedSer(n: number | string | null | undefined): string {
        return paddedSerHelper(n, this.lang);
    }

    displayLocationTypeUpper(val: string | null | undefined): string {
        return this.displayLocationType(val).toUpperCase();
    }

    /** "CPL · ARMY · SVC 4045260" — sub-meta line under the personnel name.
        The space between "SVC" and the service id is a non-breaking space
        (U+00A0) so they always render on the same line, even when the cell
        is narrow enough to wrap the rest of the meta string. */
    personnelMeta(row: AddressLocationReportRow): string {
        return personnelMetaHelper(row, this.lang);
    }

    /** Geographic crumbs — each part labelled (Division/District/Upazila) so a
        reader can see what the value names without inferring from position alone. */
    addressCrumbParts(row: AddressLocationReportRow): { label: string; value: string }[] {
        return addressCrumbPartsHelper(row, this.lang);
    }

    /** "P.O. Bishnapur · Holding 54, Kholla, 3413" — second address line. */
    addressDetail(row: AddressLocationReportRow): string {
        return addressDetailHelper(row, this.lang);
    }

    /** Table column headers — lang-aware. Composite columns ("Personnel", "Address")
        replace the previous flat layout shown in the screen design. */
    get rabHeaders(): {
        ser: string;
        personnel: string;
        rabId: string;
        locationType: string;
        addressOwner: string;
        address: string;
        status: string;
        remarks: string;
    } {
        const bn = this.lang === 'bn';
        return {
            ser: bn ? 'ক্রঃ' : 'SER',
            personnel: bn ? 'সদস্য' : 'PERSONNEL',
            rabId: bn ? 'র‍্যাব আইডি' : 'RAB ID',
            locationType: bn ? 'অবস্থানের ধরন' : 'LOCATION TYPE',
            addressOwner: bn ? 'ঠিকানার মালিক' : 'ADDRESS OWNER',
            address: bn ? 'ঠিকানা' : 'ADDRESS',
            status: bn ? 'অবস্থা' : 'STATUS',
            remarks: bn ? 'মন্তব্য' : 'REMARKS',
        };
    }

    /**
     * Criteria cells rendered in the SELECTION CRITERIA strip — only filters the
     * user actually applied. Cells fall through if the value is the "All"/empty
     * sentinel, so the formal-report top section stays free of placeholder rows.
     */
    get criteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const findLabel = <T>(
            opts: { value: T; label: string; labelBn?: string }[],
            val: T,
        ): string | null => {
            const opt = opts.find((o) => o.value === val);
            if (!opt) return null;
            return bn ? (opt.labelBn ?? opt.label) : opt.label;
        };
        const lbl = (en: string, b: string) => (bn ? b : en);

        const items: { label: string; value: string }[] = [];

        // ── Common org/rank criteria first ──────────────────────────────
        const multi = (ids: number[], opts: { label: string; labelBn: string; value: number }[], label: string) => {
            if (!ids.length) return;
            const names = ids
                .map((id) => opts.find((o) => o.value === id))
                .filter((o): o is (typeof opts)[number] => o != null)
                .map((o) => (bn ? o.labelBn : o.label));
            if (names.length) items.push({ label, value: names.join(', ') });
        };
        multi(this.selectedOrgIds, this.orgOptions, lbl('MOTHER ORG', 'মাতৃ সংস্থা'));
        multi(this.selectedMemberTypeIds, this.memberTypeOptions, lbl('MEMBER TYPE', 'সদস্য ধরন'));
        multi(this.selectedRankIds, this.rankOptions, lbl('RANK', 'র‍্যাঙ্ক'));
        multi(this.selectedCorpsIds, this.corpsOptions, lbl('CORPS', 'কোর'));
        multi(this.selectedTradeIds, this.tradeOptions, lbl('TRADE', 'ট্রেড'));
        if (this.selectedOrgNodeIds.length > 0) {
            const names = this.orgNodesLabel(bn);
            if (names) items.push({ label: lbl('RAB UNIT', 'র‍্যাব ইউনিট'), value: names });
        }

        // Address Owner always renders — when "All" is picked it reads as the
        // friendly "Member & Family" instead of the placeholder "All", so a
        // reader can see the scope of the search at a glance.
        {
            const v =
                this.selectedAddressOwner === ''
                    ? bn ? 'সদস্য ও পরিবার' : 'Member & Family'
                    : findLabel(this.addressOwnerOptions, this.selectedAddressOwner);
            if (v) items.push({ label: lbl('ADDRESS OWNER', 'ঠিকানার মালিক'), value: v });
        }

        if (this.selectedDivisionId != null) {
            const v = findLabel(this.divisionOptions, this.selectedDivisionId);
            if (v) items.push({ label: lbl('DIVISION', 'বিভাগ'), value: v });
        }

        if (this.selectedDistrictId != null) {
            const v = findLabel(this.districtOptions, this.selectedDistrictId);
            if (v) items.push({ label: lbl('DISTRICT', 'জেলা'), value: v });
        }

        if (this.selectedUpazilaId != null) {
            const v = findLabel(this.upazilaOptions, this.selectedUpazilaId);
            if (v) items.push({ label: lbl('UPAZILA', 'উপজেলা'), value: v });
        }

        if (this.selectedPostOfficeId != null) {
            const v = findLabel(this.postOfficeOptions, this.selectedPostOfficeId);
            if (v) items.push({ label: lbl('UNION / POST OFFICE', 'ইউনিয়ন / ডাকঘর'), value: v });
        }

        // RAB UNIT — only shown when access-scope actually restricts to specific units.
        if (this.unitScopeLine) {
            items.push({ label: lbl('RAB UNIT', 'র‍্যাব ইউনিট'), value: this.unitScopeLine });
        }

        if (this.selectedLocationType) {
            const v = findLabel(this.locationTypeOptions, this.selectedLocationType);
            if (v) items.push({ label: lbl('LOCATION TYPE', 'অবস্থানের ধরন'), value: v });
        }

        if (this.searchRabId.trim()) {
            items.push({ label: lbl('RAB ID', 'র‍্যাব আইডি'), value: this.searchRabId.trim() });
        }
        if (this.searchServiceId.trim()) {
            items.push({ label: lbl('SERVICE ID', 'সার্ভিস আইডি'), value: this.searchServiceId.trim() });
        }
        if (this.searchNid.trim()) {
            items.push({ label: lbl('NID', 'এনআইডি'), value: this.searchNid.trim() });
        }

        return items;
    }

    buildFilterLines(): string[] {
        const L = this.L[this.lang];
        const lines: string[] = [];
        const multi = (ids: number[], opts: { label: string; labelBn: string; value: number }[], label: string) => {
            if (!ids.length) return;
            const names = ids
                .map((id) => opts.find((o) => o.value === id))
                .filter((o): o is (typeof opts)[number] => o != null)
                .map((o) => (this.lang === 'bn' ? o.labelBn : o.label));
            if (names.length) lines.push(`${label}: ${names.join(', ')}`);
        };
        multi(this.selectedOrgIds, this.orgOptions, this.lang === 'bn' ? 'মাতৃ সংস্থা' : 'Mother Org');
        multi(this.selectedMemberTypeIds, this.memberTypeOptions, this.lang === 'bn' ? 'সদস্য ধরন' : 'Member Type');
        multi(this.selectedRankIds, this.rankOptions, this.lang === 'bn' ? 'র‍্যাঙ্ক' : 'Rank');
        multi(this.selectedCorpsIds, this.corpsOptions, this.lang === 'bn' ? 'কোর' : 'Corps');
        multi(this.selectedTradeIds, this.tradeOptions, this.lang === 'bn' ? 'ট্রেড' : 'Trade');
        if (this.selectedOrgNodeIds.length > 0) {
            const names = this.orgNodesLabel(this.lang === 'bn');
            if (names) lines.push(`${this.lang === 'bn' ? 'র‍্যাব ইউনিট' : 'RAB Unit'}: ${names}`);
        }
        if (this.searchRabId.trim()) lines.push(`RAB ID: ${this.searchRabId.trim()}`);
        if (this.searchServiceId.trim()) lines.push(`Service ID: ${this.searchServiceId.trim()}`);
        if (this.searchNid.trim()) lines.push(`NID: ${this.searchNid.trim()}`);
        if (this.selectedLocationType) {
            const opt = this.locationTypeOptions.find((o) => o.value === this.selectedLocationType);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.locationType']}: ${val}`);
        }
        if (this.selectedAddressOwner) {
            const opt = this.addressOwnerOptions.find((o) => o.value === this.selectedAddressOwner);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.addressOwner']}: ${val}`);
        }
        if (this.selectedDivisionId != null) {
            const opt = this.divisionOptions.find((o) => o.value === this.selectedDivisionId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.division']}: ${val}`);
        }
        if (this.selectedDistrictId != null) {
            const opt = this.districtOptions.find((o) => o.value === this.selectedDistrictId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.district']}: ${val}`);
        }
        if (this.selectedUpazilaId != null) {
            const opt = this.upazilaOptions.find((o) => o.value === this.selectedUpazilaId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.upazila']}: ${val}`);
        }
        if (this.selectedPostOfficeId != null) {
            const opt = this.postOfficeOptions.find((o) => o.value === this.selectedPostOfficeId);
            const val = this.lang === 'bn' ? opt?.labelBn : opt?.label;
            if (val) lines.push(`${L['report.search.postOffice']}: ${val}`);
        }
        return lines;
    }

    getExportData(): { columns: string[]; rows: string[][] } {
        const L = this.L[this.lang];
        const columns: string[] = [
            L['report.table.ser'],
            L['report.table.orgName'],
            L['report.table.serviceId'],
            L['report.table.rabId'],
            L['report.table.rank'],
            L['report.table.name'],
            ...(this.showRabUnit ? [L['report.table.rabUnit']] : []),
            L['report.table.locationType'],
            L['report.table.addressOwner'],
            L['report.table.division'],
            L['report.table.district'],
            L['report.table.upazila'],
            L['report.table.postOffice'],
            L['report.table.address'],
            L['report.table.rmks'],
        ];
        const rows = this.list.map((row) => [
            this.displayNum(row.ser),
            this.codeValue(row.orgName, row.orgNameBN),
            this.displayNum(row.serviceId),
            row.rabid ?? '—',
            this.codeValue(row.rank, row.rankBN),
            this.codeValue(row.name, row.nameBN),
            ...(this.showRabUnit ? [this.codeValue(row.rabUnit, row.rabUnitBN)] : []),
            this.displayLocationType(row.locationType),
            this.codeValue(row.addressOwner, row.addressOwnerBN),
            this.codeValue(row.division, row.divisionBN),
            this.codeValue(row.district, row.districtBN),
            this.codeValue(row.upazila, row.upazilaBN),
            this.codeValue(row.postOffice, row.postOfficeBN),
            this.codeValue(row.address, row.addressBN),
            row.rmks ?? '—',
        ]);
        return { columns, rows };
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        if (type === 'print' || type === 'pdf') {
            // Both routes use the same formal RAB HTML — the print dialog the
            // browser opens lets the user pick "Print" or "Save as PDF" from a
            // single rendered document, instead of us shipping two divergent
            // layouts.
            if (type === 'pdf') this.exporting = true;
            try {
                this.openRabPrintWindow();
            } finally {
                if (type === 'pdf') this.exporting = false;
            }
            return;
        }

        if (type === 'word') {
            await this.exportRabWord();
            return;
        }

        if (type === 'excel') {
            this.exportRabExcel();
            return;
        }
    }

    /** Opens a new browser window with the formal RAB HTML and fires the print dialog. */
    private openRabPrintWindow(): void {
        const html = this.buildRabPrintHtml();
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
        // 700ms gives the font loader and layout enough time to settle before
        // the dialog opens; without it, headings sometimes print in fallback fonts.
        setTimeout(() => {
            try {
                win.focus();
                win.print();
            } catch {
                // print blocked — leave the window open, user can Ctrl+P
            }
        }, 700);
    }

    /** Mirrors the on-screen RAB document as printable HTML. */
    private buildRabPrintHtml(): string {
        const esc = (s: string) =>
            (s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        const isBn = this.lang === 'bn';
        const serif = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', serif"
            : "'Playfair Display', Georgia, 'Times New Roman', serif";
        const sans = isBn
            ? "'Nirmala UI', 'Hind Siliguri', 'SolaimanLipi', sans-serif"
            : "'DM Sans', 'Segoe UI', Arial, sans-serif";
        const mono = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns;
        const tableHeaderHtml = `<tr>${visibleCols
            .map((c) => `<th>${esc(this.lang === 'bn' ? c.labelBN : c.labelEN)}</th>`)
            .join('')}</tr>`;

        const renderPrintCell = (row: AddressLocationReportRow, col: { key: string; hint: string }): string => {
            switch (col.hint) {
                case 'Serial':
                    return `<td class="td-ser"><span class="ser">${esc(this.paddedSer(row.ser))}</span></td>`;
                case 'PersonnelComposite': {
                    const name = this.codeValue(row.name, row.nameBN);
                    const meta = this.personnelMeta(row);
                    return `<td class="td-personnel">
                        <div class="name">${esc(name)}</div>
                        <div class="meta">${esc(meta)}</div>
                    </td>`;
                }
                case 'RabId':
                    return `<td class="td-rabid">${esc(row.rabid ? this.displayNum(row.rabid) : '—')}</td>`;
                case 'AddressOwner':
                    return `<td class="td-owner">${esc(this.codeValue(row.addressOwner, row.addressOwnerBN))}</td>`;
                case 'LocationType':
                    return `<td class="td-loctype"><span class="loc-text">${esc(this.displayLocationTypeUpper(row.locationType))}</span></td>`;
                case 'AddressComposite': {
                    const crumbs = this.addressCrumbParts(row);
                    const detail = this.addressDetail(row);
                    const crumbHtml = crumbs
                        .map((p, i) =>
                            `<span class="addr-part"><span class="addr-label">${esc(p.label)}:</span> <span class="addr-value">${esc(p.value)}</span></span>` +
                            (i < crumbs.length - 1 ? '<span class="addr-sep">&rsaquo;</span>' : ''),
                        )
                        .join(' ');
                    return `<td class="td-address">
                        <div class="addr-crumb">${crumbHtml}</div>
                        ${detail ? `<div class="addr-detail">${esc(detail)}</div>` : ''}
                    </td>`;
                }
                case 'Status':
                    return `<td class="td-status">${esc(this.displayMemberStatus(row))}</td>`;
                case 'Remarks':
                    // Remarks is intentionally blank when absent — em-dash would
                    // imply "intentionally empty" but the column is just optional.
                    return `<td class="td-remarks">${esc(row.rmks || '')}</td>`;
                case 'CallNoRankName': {
                    const l1 = this.callNoRankLine1(row);
                    const l2 = this.callNoRankLine2(row);
                    const l2Html = l2 ? `<div class="personnel-name">${esc(l2)}</div>` : '';
                    return `<td class="td-personnel"><div class="personnel-name">${esc(l1)}</div>${l2Html}</td>`;
                }
                default:
                    return `<td>${esc(this.plainCellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list
            .map((row) => `<tr>${visibleCols.map((c) => renderPrintCell(row, c)).join('')}</tr>`)
            .join('');

        const criteriaGridHtml = this.criteriaItems.length
            ? `<div class="criteria-grid">${this.criteriaItems
                  .map(
                      (item) => `
                <div class="cell">
                    <div class="cell-label">${esc(item.label)}</div>
                    <div class="cell-value">${esc(item.value).replace(/\n/g, '<br>')}</div>
                </div>`,
                  )
                  .join('')}</div>`
            : '';

        const subtitleHtml = this.rabSubtitleText
            ? `<div class="paper-section-sub"><em>${esc(this.rabSubtitleText)}</em></div>`
            : '';

        const confidential = isBn ? 'গোপনীয়' : 'CONFIDENTIAL';
        const warning = isBn ? 'অননুমোদিত প্রকাশ নিষিদ্ধ' : 'UNAUTHORIZED DISCLOSURE PROHIBITED';
        const pageWord = isBn ? 'পৃষ্ঠা' : 'PAGE';
        const ofWord = isBn ? '/' : 'OF';
        const criteriaTitle = esc(this.rabCriteriaTitle);
        const generatedLabel = esc(this.rabGeneratedLabel);
        const generatedDate = esc(this.rabFormattedDate);
        // CSS escape for use inside content: "..." — escape backslashes and quotes.
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head>
<meta charset="UTF-8" />
<title>${esc(this.rabSectionTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
    /* Bengali numerals for counter(page) when printing in Bangla mode.
       Browsers that ignore @counter-style will fall back to decimal — readable. */
    @counter-style bn-digits {
        system: numeric;
        symbols: '\\09E6' '\\09E7' '\\09E8' '\\09E9' '\\09EA' '\\09EB' '\\09EC' '\\09ED' '\\09EE' '\\09EF';
    }

    @page {
        /* No size rule — Chrome's print dialog hides the Layout
           (Portrait / Landscape) selector whenever @page declares a size,
           even without an orientation keyword. Margins only, so the user
           picks paper size AND orientation from the dialog. */
        /* Side margins kept narrow so the criteria + table use the full
           printable area and the per-page @bottom-* footer text never wraps
           onto two lines. */
        margin: 12mm 5mm 22mm 5mm;

        /* The three margin-boxes sit side-by-side along the bottom of every
           page. Each paints its own share of a red horizontal line using a
           background gradient (not border-top): the outermost boxes inset the
           line by 8mm so the overall strip reads ~8% narrower than the page
           content while the table above stays at its full width. */
        @bottom-left {
            content: "● " "${cssStr(confidential)}";
            font-family: ${mono};
            font-size: 6.5pt;
            font-weight: 600;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: #b03a3a;
            padding: 5mm 0 0 8mm;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 8mm 1.5mm;
            background-size: calc(100% - 8mm) 0.7mm;
            background-repeat: no-repeat;
            vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
        @bottom-center {
            content: "${cssStr(pageWord)} " counter(page${isBn ? ', bn-digits' : ''}) " ${cssStr(ofWord)} " counter(pages${isBn ? ', bn-digits' : ''});
            font-family: ${mono};
            font-size: 6.5pt;
            font-weight: 600;
            letter-spacing: 0.25em;
            text-transform: uppercase;
            color: #4a4a4a;
            padding-top: 5mm;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 0 1.5mm;
            background-size: 100% 0.7mm;
            background-repeat: no-repeat;
            vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
        @bottom-right {
            content: "${cssStr(warning)}";
            font-family: ${mono};
            font-size: 6.5pt;
            font-weight: 600;
            letter-spacing: 0.3em;
            text-transform: uppercase;
            color: #b03a3a;
            padding: 5mm 8mm 0 0;
            background-image: linear-gradient(rgba(176, 58, 58, 0.5), rgba(176, 58, 58, 0.5));
            background-position: 0 1.5mm;
            background-size: calc(100% - 8mm) 0.7mm;
            background-repeat: no-repeat;
            vertical-align: top;
            ${isBn ? 'letter-spacing:0.05em;text-transform:none;font-family:' + sans + ';' : ''}
        }
    }
    * { box-sizing: border-box; }
    html, body {
        margin: 0; padding: 0;
        background: #ffffff;
        color: #0b0b0b;
        font-family: ${sans};
        font-size: 10pt;
        line-height: 1.35;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    /* Side padding makes the body content (criteria + table) sit 8mm in from
       each page edge — the @bottom-* footer stays at the full printable
       width set by @page margin, so the footer can keep its single-line text
       layout while the table reads slightly inset. */
    .paper { padding: 4mm 8mm; }
    /* ---- Header ---- */
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline {
        font-size: 7.5pt; letter-spacing: 0.3em; color: #555;
        text-transform: uppercase; margin-bottom: 3mm; font-weight: 500;
        ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';font-size:9pt;' : ''}
    }
    .paper-title {
        font-family: ${serif};
        font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0;
        letter-spacing: 0.12em; color: #0b0b0b;
        ${isBn ? 'letter-spacing:0;' : ''}
    }
    .paper-sub {
        font-family: ${serif};
        font-style: italic; color: #555; font-size: 10pt;
        margin-bottom: 4mm;
    }
    .orn-divider {
        display: flex; justify-content: center; align-items: center;
        gap: 6mm; margin: 4mm auto; max-width: 65%;
    }
    .orn-line {
        flex: 1; height: 1px;
        background: linear-gradient(to right, transparent, #b78b3b, transparent);
    }
    .orn-diamond { color: #b78b3b; font-size: 9pt; }
    .paper-section {
        font-family: ${serif};
        font-size: 13pt; font-weight: 700; letter-spacing: 0.16em;
        color: #0b0b0b; margin: 0 0 1mm 0; text-transform: uppercase;
        ${isBn ? 'letter-spacing:0;' : ''}
    }
    .paper-section-sub {
        font-family: ${serif}; font-style: italic; color: #555; font-size: 10pt;
    }

    /* ---- Selection Criteria ---- */
    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0;
        font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase;
        color: #4a4a4a; font-weight: 600;
        ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''}
    }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.9; font-weight: 500; display: flex; flex-direction: column; align-items: flex-end; gap: 0.4mm; text-align: right; }
    .criteria-strip-total { color: #b78b3b; font-weight: 700; text-transform: none; letter-spacing: normal; }
    .criteria-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr));
    }
    .cell {
        padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de;
    }
    .cell:last-child { border-right: 1px solid #e6e4de; }
    .cell-label {
        font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase;
        color: #8a8a8a; margin-bottom: 1mm; font-weight: 600;
        ${isBn ? 'letter-spacing:0.04em;text-transform:none;' : ''}
    }
    .cell-value {
        font-family: ${serif};
        font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2;
        ${isBn ? 'font-family:' + sans + ';' : ''}
    }

    /* ---- Table ---- */
    table {
        width: 100%; border-collapse: collapse; table-layout: auto;
        font-family: ${sans}; font-size: 8pt;
    }
    /* Repeat the table header on every printed page so each page reads as a
       self-contained roster, not "page 2 starts with a nameless column". */
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    thead th {
        background: #0b0b0b; color: #d9c79a;
        font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
        letter-spacing: 0.15em; text-transform: uppercase;
        padding: 1.8mm 2mm; text-align: left; vertical-align: middle;
        white-space: nowrap; border: 1px solid rgba(11, 11, 11, 0.05);
        ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''}
    }
    tbody td {
        padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b;
        border: 1px solid rgba(11, 11, 11, 0.05); vertical-align: top;
        background: #ffffff;
        word-break: keep-all;
        overflow-wrap: normal;
    }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }

    .td-ser { white-space: nowrap; }
    .ser {
        font-family: ${mono}; font-size: 9pt; font-weight: 600;
        color: #6b6b6b; letter-spacing: 0.04em;
        white-space: nowrap;
    }
    .name {
        font-family: ${sans}; font-weight: 600; font-size: 10pt;
        color: #0b0b0b; line-height: 1.2;
    }
    /* "No Rank Name" composite — both lines share the same size so the
       prefix/rank line and the name line read as one block. */
    .personnel-name {
        font-family: ${sans}; font-weight: 600; font-size: 9.5pt;
        color: #0b0b0b; line-height: 1.2;
    }
    .meta {
        margin-top: 0.5mm; font-family: ${mono}; font-size: 7.5pt;
        letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b;
        ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''}
    }
    .td-rabid { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
    /* Status keeps the whole code on one line — words like "Supernumerary"
       were breaking mid-token when the cell was forced narrow. */
    .td-status { font-family: ${sans}; font-weight: 600; font-size: 9pt; white-space: nowrap; }
    .td-owner {
        font-family: ${sans}; font-weight: 600; font-size: 10pt;
        color: #0b0b0b; letter-spacing: -0.005em;
    }
    .loc-text {
        font-family: ${mono}; font-size: 7.5pt; font-weight: 600;
        letter-spacing: 0.08em; color: #0b0b0b;
        ${isBn ? 'letter-spacing:0;font-family:' + sans + ';' : ''}
    }
    .addr-crumb { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1mm 1.5mm; line-height: 1.25; }
    .addr-part { display: inline-flex; align-items: baseline; gap: 1mm; }
    .addr-label {
        font-family: ${mono}; font-size: 7pt; font-weight: 600;
        letter-spacing: 0.08em; text-transform: uppercase; color: #8a8a8a;
        ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''}
    }
    .addr-value { font-weight: 600; color: #0b0b0b; }
    .addr-sep { color: #b78b3b; font-weight: 700; font-size: 11pt; line-height: 1; }
    .addr-detail {
        margin-top: 0.8mm; font-size: 8pt; color: #6b6b6b;
        font-style: italic; line-height: 1.3;
    }
    .dash { color: #b0b0b0; }
</style>
</head>
<body>
    <div class="paper">
        <header class="paper-head">
            <div class="overline">${esc(this.rabOverlineText)}</div>
            <h1 class="paper-title">${esc(this.rabOrgTitle)}</h1>
            <div class="paper-sub"><em>${esc(this.rabOrgSubtitle)}</em></div>
            <div class="orn-divider">
                <span class="orn-line"></span>
                <span class="orn-diamond">&#9670;</span>
                <span class="orn-line"></span>
            </div>
            <h2 class="paper-section">${esc(this.rabSectionTitle)}</h2>
            ${subtitleHtml}
        </header>

        <div class="criteria">
            <div class="criteria-strip">
                <span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${criteriaTitle}</span>
                <span class="criteria-strip-date"><span class="criteria-strip-total">${esc(this.rabTotalText)}</span><span class="criteria-strip-gen">${generatedLabel} &middot; ${generatedDate}</span></span>
            </div>
            ${criteriaGridHtml}
        </div>

        <table>
            <thead>${tableHeaderHtml}</thead>
            <tbody>${tableBodyHtml}</tbody>
        </table>
    </div>
</body>
</html>`;
    }

    /** Word export — mirrors the formal-RAB print layout (title block, selection
        criteria strip + grid, composite-cell data table, confidential footer).
        Black-and-white: the print HTML's gold accents, shaded strip, and
        filled/hollow location icon are dropped in favour of typography-only
        differentiation so the docx reads identically on any printer. */
    private async exportRabWord(): Promise<void> {
        const isBn = this.lang === 'bn';
        // Nirmala UI is the standard Bangla font on Windows 8+. The same
        // font config we use here is what the notesheet-preview/article-47
        // exports use to render conjuncts like "র‍্যাব" correctly — the key
        // is that EVERY TextRun must also carry (a) language: bn-BD with
        // bidirectional set so Word's shaping engine applies Bangla rules,
        // and (b) sizeComplexScript matching size so the cs glyphs aren't
        // shrunk to Word's default cs size. Without the language tag, the
        // ZWJ (U+200D) in "র‍্যাপিড" gets dropped to a placeholder box even
        // when cs font is set.
        const bnFont = {
            ascii: 'Nirmala UI',
            hAnsi: 'Nirmala UI',
            cs: 'Nirmala UI',
            hint: 'cs' as const,
        };
        const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD' } as any;
        const sans = isBn ? bnFont : 'Calibri';
        const serif = isBn ? bnFont : 'Cambria';
        const mono = isBn ? bnFont : 'Consolas';

        // Per-run extras for Bangla — language tag + complex-script size.
        // Spread into each TextRun via `...bnRunExtras(size)` so the docx
        // shaping engine sees the Bangla cues on every run.
        const bnRunExtras = (size: number) =>
            isBn ? { language: bnLang, sizeComplexScript: size } : {};

        // Identity helper — kept as a seam for future per-string fixes.
        const wsafe = (s: string | null | undefined): string => s ?? '';

        // Half-points (Word: 2 × pt).
        const S = {
            overline: 15, title: 44, subtitle: 20,
            sectionTitle: 26, sectionSub: 20,
            stripLabel: 16, stripDate: 16,
            critLabel: 14, critValue: 20,
            tableHeader: 14, name: 20, meta: 14, body: 16, footer: 13,
        };
        const C = {
            black: '0B0B0B',
            mutedText: '555555',
            gray: '6B6B6B',
            labelGray: '8A8A8A',
            zebra: 'FAFAF6',
            border: 'BFBFBF',
            innerBorder: 'D9D9D9',
        };

        const cellBorder = {
            top: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        };
        const innerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            left: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
            right: { style: BorderStyle.SINGLE, size: 2, color: C.innerBorder },
        };
        const headerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 8, color: C.black },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: C.black },
            left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            right: { style: BorderStyle.SINGLE, size: 4, color: C.border },
        };

        // Page: A4 landscape by default. Margins kept tight so the table reads
        // wide. Both tables below use percentage widths + AUTOFIT layout so
        // they reflow when the user flips orientation or resizes margins in
        // Word — fixed-DXA widths would clip content on portrait.
        const marginTop = 680;
        const marginBottom = 1247;
        const marginSide = 680;

        // ── Header block ──────────────────────────────────────────────────
        const headerPars: Paragraph[] = [];
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({
                text: wsafe(this.rabOverlineText),
                font: sans, size: S.overline, ...bnRunExtras(S.overline), color: C.mutedText,
                characterSpacing: isBn ? 0 : 60, allCaps: !isBn,
            })],
        }));
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [new TextRun({
                text: wsafe(this.rabOrgTitle),
                font: serif, size: S.title, ...bnRunExtras(S.title), bold: true, color: C.black,
                characterSpacing: isBn ? 0 : 24,
            })],
        }));
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: wsafe(this.rabOrgSubtitle),
                font: serif, size: S.subtitle, ...bnRunExtras(S.subtitle), italics: true, color: C.mutedText,
            })],
        }));
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: this.rabSubtitleText ? 40 : 200 },
            children: [new TextRun({
                text: wsafe(this.rabSectionTitle),
                font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black,
                characterSpacing: isBn ? 0 : 32, allCaps: !isBn,
            })],
        }));
        if (this.rabSubtitleText) {
            headerPars.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({
                    text: wsafe(this.rabSubtitleText),
                    font: serif, size: S.sectionSub, ...bnRunExtras(S.sectionSub), italics: true, color: C.mutedText,
                })],
            }));
        }

        // ── Selection Criteria block ──────────────────────────────────────
        // Uniform 4-col grid. Strip row uses columnSpan=2 left + columnSpan=2
        // right so the title sits opposite the generated date on the same row.
        // Cell widths are PERCENTAGE-based so the table reflows when the user
        // flips orientation in Word.
        const colsPerCritRow = 4;
        const critCellPct = 100 / colsPerCritRow;

        const stripCell = (
            runs: TextRun[],
            alignment: typeof AlignmentType.LEFT | typeof AlignmentType.RIGHT,
        ) => new TableCell({
            columnSpan: 2,
            borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                left: { style: BorderStyle.SINGLE, size: 4, color: C.border },
                right: { style: BorderStyle.SINGLE, size: 4, color: C.border },
            },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ alignment, children: runs })],
        });

        const stripRow = new TableRow({
            cantSplit: true,
            children: [
                stripCell([
                    new TextRun({
                        text: wsafe(this.rabCriteriaTitle),
                        font: sans, size: S.stripLabel, ...bnRunExtras(S.stripLabel), bold: true,
                        color: C.black, characterSpacing: isBn ? 0 : 40, allCaps: !isBn,
                    }),
                ], AlignmentType.LEFT),
                stripCell([
                    new TextRun({ text: wsafe(this.rabTotalText), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn }),
                    new TextRun({ text: wsafe(`${this.rabGeneratedLabel} · ${this.rabFormattedDate}`), font: sans, size: S.stripDate, ...bnRunExtras(S.stripDate), bold: true, color: C.mutedText, characterSpacing: isBn ? 0 : 30, allCaps: !isBn, break: 1 }),
                ], AlignmentType.RIGHT),
            ],
        });

        const items = this.criteriaItems;
        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < items.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = items[i + j];
                cells.push(new TableCell({
                    borders: innerCellBorder,
                    margins: { top: 100, bottom: 100, left: 140, right: 140 },
                    width: { size: critCellPct, type: WidthType.PERCENTAGE },
                    children: it ? [
                        new Paragraph({
                            spacing: { after: 40 },
                            children: [new TextRun({
                                text: wsafe(it.label),
                                font: sans, size: S.critLabel, ...bnRunExtras(S.critLabel), bold: true,
                                color: C.labelGray, characterSpacing: isBn ? 0 : 32,
                                allCaps: !isBn,
                            })],
                        }),
                        // One paragraph per line — multi-line values (RAB Unit
                        // org paths) keep their line breaks in Word.
                        ...wsafe(it.value).split('\n').map((line) =>
                            new Paragraph({
                                children: [new TextRun({
                                    text: line,
                                    font: serif, size: S.critValue, ...bnRunExtras(S.critValue), bold: true,
                                    color: C.black,
                                })],
                            })),
                    ] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue, ...bnRunExtras(S.critValue) })] })],
                }));
            }
            critRows.push(new TableRow({ cantSplit: true, children: cells }));
        }

        const criteriaTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.AUTOFIT,
            rows: critRows,
        });

        // ── Data table ────────────────────────────────────────────────────
        // Column-width percentages are derived per visible column from a
        // hint→weight table, then normalized so the row sums to 100. This
        // means adding/removing picker columns automatically rebalances the
        // table width without per-combination hardcoded arrays.
        const widthWeightForHint = (hint: string): number => {
            switch (hint) {
                case 'Serial':              return 4;
                case 'PersonnelComposite':  return 22;
                case 'RabId':               return 9.5;
                case 'AddressOwner':        return 10;
                case 'LocationType':        return 10;
                case 'AddressComposite':    return 32;
                case 'Status':              return 13;
                case 'Remarks':             return 10;
                default:                    return 10;
            }
        };
        const rawWeights = this.visibleColumns.map((c) => widthWeightForHint(c.hint));
        const weightSum = rawWeights.reduce((a, b) => a + b, 0) || 1;
        const dataColPct: number[] = rawWeights.map((w) => (w * 100) / weightSum);

        const headerLabels: string[] = this.visibleColumns.map((c) =>
            this.lang === 'bn' ? c.labelBN : c.labelEN,
        );

        const headerCells: TableCell[] = headerLabels.map((label, i) => new TableCell({
            borders: headerCellBorder,
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            width: { size: dataColPct[i], type: WidthType.PERCENTAGE },
            children: [new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({
                    text: wsafe(label),
                    font: sans, size: S.tableHeader, ...bnRunExtras(S.tableHeader), bold: true,
                    color: C.black, characterSpacing: isBn ? 0 : 30, allCaps: !isBn,
                })],
            })],
        }));

        const headerRow = new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: headerCells,
        });

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;  // zebra: rows 2, 4, 6 (1-based) get shading
            const ser = this.paddedSer(row.ser);
            const name = this.codeValue(row.name, row.nameBN);
            const meta = this.personnelMeta(row);
            const rabId = row.rabid ? this.displayNum(row.rabid) : '—';
            const owner = this.codeValue(row.addressOwner, row.addressOwnerBN);
            const locType = this.displayLocationTypeUpper(row.locationType);
            const crumbs = this.addressCrumbParts(row);
            const detail = this.addressDetail(row);
            const remarks = row.rmks || '';

            const shading = isEven
                ? { type: 'clear' as const, fill: C.zebra, color: 'auto' }
                : undefined;

            const cellOpts = (pct: number) => ({
                borders: innerCellBorder,
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                width: { size: pct, type: WidthType.PERCENTAGE },
                shading,
            });

            // Address crumbs: "Division: Dhaka  >  District: Gazipur  >  ..."
            // Plain " > " separator in gray — the gold chevron is dropped per
            // the B&W brief.
            const crumbRuns: TextRun[] = [];
            for (let i = 0; i < crumbs.length; i++) {
                crumbRuns.push(new TextRun({
                    text: wsafe(`${crumbs[i].label}: `),
                    font: mono, size: S.meta, ...bnRunExtras(S.meta), bold: true,
                    color: C.labelGray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn,
                }));
                crumbRuns.push(new TextRun({
                    text: wsafe(crumbs[i].value),
                    font: sans, size: S.body, ...bnRunExtras(S.body), bold: true, color: C.black,
                }));
                if (i < crumbs.length - 1) {
                    crumbRuns.push(new TextRun({
                        text: '   ›   ',
                        font: sans, size: S.body, ...bnRunExtras(S.body), bold: true, color: C.gray,
                    }));
                }
            }
            const addrParagraphs: Paragraph[] = [
                new Paragraph({
                    spacing: { after: detail ? 40 : 0 },
                    children: crumbRuns.length > 0 ? crumbRuns : [new TextRun({ text: '—', font: sans, size: S.body, ...bnRunExtras(S.body), color: C.gray })],
                }),
            ];
            if (detail) {
                addrParagraphs.push(new Paragraph({
                    children: [new TextRun({
                        text: wsafe(detail),
                        font: sans, size: S.body, ...bnRunExtras(S.body), italics: true, color: C.gray,
                    })],
                }));
            }

            // Per-column cell builder — switches on the registry hint so
            // composite cells keep their rich Word formatting (name+meta,
            // address crumb+detail) while plain cells render as a single
            // styled paragraph. Index into dataColPct stays aligned with
            // visibleColumns because both iterate the same list.
            const cells: TableCell[] = this.visibleColumns.map((col, i) => {
                const w = cellOpts(dataColPct[i]);
                switch (col.hint) {
                    case 'Serial':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [new TextRun({
                                    text: wsafe(ser), font: mono, size: S.name, ...bnRunExtras(S.name), bold: true,
                                    color: C.gray, characterSpacing: isBn ? 0 : 8,
                                })],
                            })],
                        });
                    case 'PersonnelComposite':
                        return new TableCell({
                            ...w,
                            children: [
                                new Paragraph({
                                    spacing: { after: 40 },
                                    children: [new TextRun({
                                        text: wsafe(name), font: sans, size: S.name, ...bnRunExtras(S.name), bold: true, color: C.black,
                                    })],
                                }),
                                new Paragraph({
                                    children: [new TextRun({
                                        text: wsafe(meta), font: mono, size: S.meta, ...bnRunExtras(S.meta),
                                        color: C.gray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn,
                                    })],
                                }),
                            ],
                        });
                    case 'RabId':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(rabId), font: mono, size: S.body, ...bnRunExtras(S.body), color: C.black,
                                    characterSpacing: isBn ? 0 : 4,
                                })],
                            })],
                        });
                    case 'AddressOwner':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(owner), font: sans, size: S.body, ...bnRunExtras(S.body), bold: true, color: C.black,
                                })],
                            })],
                        });
                    case 'LocationType':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(locType), font: mono, size: S.meta, ...bnRunExtras(S.meta), bold: true,
                                    color: C.black, characterSpacing: isBn ? 0 : 16, allCaps: !isBn,
                                })],
                            })],
                        });
                    case 'AddressComposite':
                        return new TableCell({ ...w, children: addrParagraphs });
                    case 'Status':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(this.displayMemberStatus(row)),
                                    font: sans, size: S.body, ...bnRunExtras(S.body), bold: true, color: C.black,
                                })],
                            })],
                        });
                    case 'Remarks':
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(remarks), font: sans, size: S.body, ...bnRunExtras(S.body), color: C.black,
                                })],
                            })],
                        });
                    case 'CallNoRankName': {
                        const l1 = this.callNoRankLine1(row);
                        const l2 = this.callNoRankLine2(row);
                        const children: Paragraph[] = [new Paragraph({
                            spacing: { after: l2 ? 40 : 0 },
                            children: [new TextRun({
                                text: wsafe(l1), font: sans, size: S.name, ...bnRunExtras(S.name), bold: true, color: C.black,
                            })],
                        })];
                        if (l2) children.push(new Paragraph({
                            children: [new TextRun({
                                text: wsafe(l2), font: sans, size: S.body, ...bnRunExtras(S.body), color: C.black,
                            })],
                        }));
                        return new TableCell({ ...w, children });
                    }
                    default:
                        return new TableCell({
                            ...w,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(this.plainCellValue(row, col.key)),
                                    font: sans, size: S.body, ...bnRunExtras(S.body), color: C.black,
                                })],
                            })],
                        });
                }
            });

            return new TableRow({ cantSplit: true, children: cells });
        });

        const dataTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.AUTOFIT,
            rows: [headerRow, ...dataRows],
        });

        // ── Confidential footer ───────────────────────────────────────────
        // 3-cell borderless table: CONFIDENTIAL (left) | spacer | PAGE X OF Y
        // (right). columnWidths sum to 9000 DXA — under portrait A4's
        // printable width with default 1" margins — so the underlying
        // tblGrid never overflows portrait. FIXED layout with tblW=100% PCT
        // lets Word scale the columns proportionally to the live page
        // width: in landscape the table fills the page (each col grows in
        // proportion), in portrait it fits exactly. The right column's
        // right edge always lands on the page's right margin, so the
        // right-aligned page number stays flush-right in both orientations.
        const footerCellBorder = {
            top: { style: BorderStyle.SINGLE, size: 6, color: C.black },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        };
        const footerCellMargins = { top: 80, bottom: 0, left: 0, right: 0 };

        const footer = new Footer({
            children: [
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    layout: TableLayoutType.FIXED,
                    columnWidths: [3000, 3000, 3000],
                    rows: [new TableRow({
                        cantSplit: true,
                        children: [
                            new TableCell({
                                borders: footerCellBorder,
                                margins: footerCellMargins,
                                children: [new Paragraph({
                                    alignment: AlignmentType.LEFT,
                                    children: [new TextRun({
                                        text: wsafe(this.rabConfidentialLabel),
                                        font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black,
                                        characterSpacing: isBn ? 0 : 30, allCaps: !isBn,
                                    })],
                                })],
                            }),
                            new TableCell({
                                borders: footerCellBorder,
                                margins: footerCellMargins,
                                children: [new Paragraph({ children: [] })],
                            }),
                            new TableCell({
                                borders: footerCellBorder,
                                margins: footerCellMargins,
                                children: [new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [new TextRun({
                                        children: [
                                            `${isBn ? 'পৃষ্ঠা' : 'PAGE'} `,
                                            PageNumber.CURRENT,
                                            ` ${isBn ? '/' : 'OF'} `,
                                            PageNumber.TOTAL_PAGES,
                                        ],
                                        font: mono, size: S.footer, ...bnRunExtras(S.footer), bold: true, color: C.black,
                                        characterSpacing: isBn ? 0 : 24, allCaps: !isBn,
                                    })],
                                })],
                            }),
                        ],
                    })],
                }),
            ],
        });

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        size: { orientation: PageOrientation.LANDSCAPE },
                        margin: {
                            top: marginTop, bottom: marginBottom,
                            left: marginSide, right: marginSide,
                        },
                    },
                },
                footers: { default: footer },
                children: [
                    ...headerPars,
                    criteriaTable,
                    new Paragraph({
                        spacing: { before: 0, after: 200 },
                        children: [new TextRun({ text: '', font: sans, size: 4 })],
                    }),
                    dataTable,
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        const filename = `address-location-report_${this.lang}.docx`;
        saveAs(blob, filename);
    }

    /** Excel export — mirrors the formal-RAB layout used by the PDF/Word
        exports (title block → selection criteria → composite-cell data table
        → confidential strip). Without cell-styling support in the standard
        xlsx package, composite columns use ' · ' separators within a single
        cell so the data still reads cleanly as one line — line breaks would
        otherwise render as raw newline characters. */
    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        // Identity helper kept as a seam for any future Bangla-specific
        // string normalization; currently a no-op so the original ZWJ form
        // ("র‍্যাপিড") reaches Excel intact.
        const wsafe = (s: string | null | undefined): string => s ?? '';

        // Visible columns from the picker drive both headers AND data rows.
        const headers: string[] = this.exportHeaderLabels.map(wsafe);
        const totalCols = headers.length || 1;

        const data: unknown[][] = [];
        const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
        const fullMerge = (r: number) => merges.push({ s: { r, c: 0 }, e: { r, c: totalCols - 1 } });

        // ── Header block (centered, full-width rows) ──────────────────────
        let r = 0;
        data.push([wsafe(this.rabOverlineText)]); fullMerge(r++);
        data.push([wsafe(this.rabOrgTitle)]); fullMerge(r++);
        data.push([wsafe(this.rabOrgSubtitle)]); fullMerge(r++);
        data.push([wsafe(this.rabSectionTitle)]); fullMerge(r++);
        if (this.rabSubtitleText) { data.push([wsafe(this.rabSubtitleText)]); fullMerge(r++); }
        data.push([]); r++;

        // ── Selection Criteria block ──────────────────────────────────────
        // Strip row: title left + date right merged across full width as a
        // single concatenated string (cell-level alignment isn't reachable
        // without cell styling, so we lean on the natural reading order).
        const stripText = wsafe(`${this.rabCriteriaTitle}     ${this.rabTotalText}     ${this.rabGeneratedLabel} · ${this.rabFormattedDate}`);
        data.push([stripText]); fullMerge(r++);

        const items = this.criteriaItems;
        if (items.length > 0) {
            // 2-per-row layout: each item formatted as "LABEL: VALUE" and
            // each cell merged across half the table width so the criteria
            // grid mirrors the PDF's 4-up layout without requiring 4 equal
            // table columns (which would break the data-table layout below).
            const halfPoint = Math.floor(totalCols / 2);
            for (let i = 0; i < items.length; i += 2) {
                const left = items[i] ? wsafe(`${items[i].label}: ${items[i].value.replace(/\n/g, '; ')}`) : '';
                const right = items[i + 1] ? wsafe(`${items[i + 1].label}: ${items[i + 1].value.replace(/\n/g, '; ')}`) : '';
                const row: string[] = new Array(totalCols).fill('');
                row[0] = left;
                row[halfPoint] = right;
                data.push(row);
                merges.push({ s: { r, c: 0 }, e: { r, c: halfPoint - 1 } });
                merges.push({ s: { r, c: halfPoint }, e: { r, c: totalCols - 1 } });
                r++;
            }
        }
        data.push([]); r++;

        // ── Data table ────────────────────────────────────────────────────
        data.push(headers); r++;

        // Composite cells flatten to one line via cellExportText (` · ` / ` › ` joins)
        // so the row stays readable without depending on per-cell wrapText (which
        // the standard xlsx package can't write anyway).
        for (const row of this.list) {
            const rowData = this.visibleColumns.map((col) => wsafe(this.cellExportText(row, col)));
            data.push(rowData);
            r++;
        }

        // ── Confidential footer strip ─────────────────────────────────────
        data.push([]); r++;
        const footerText = wsafe(this.rabConfidentialLabel);
        data.push([footerText]); fullMerge(r++);

        // ── Build sheet ───────────────────────────────────────────────────
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Column widths derived from the column hint — Personnel and
        // Address carry composite content so they get the widest share.
        const widthForHint = (hint: string): number => {
            switch (hint) {
                case 'Serial':              return 6;
                case 'PersonnelComposite':  return 36;
                case 'RabId':               return 14;
                case 'AddressOwner':        return 20;
                case 'LocationType':        return 16;
                case 'AddressComposite':    return 60;
                case 'Status':              return 18;
                case 'Remarks':             return 16;
                default:                    return 18;
            }
        };
        ws['!cols'] = this.visibleColumns.map((c) => ({ wch: widthForHint(c.hint) }));
        ws['!merges'] = merges;

        const wb = XLSX.utils.book_new();
        const sheetName = isBn ? 'প্রতিবেদন' : 'Report';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `address-location-report_${this.lang}.xlsx`);
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // Fetch the caller's access-scope BEFORE the first search so the
        // RAB Member Status dropdown locks immediately on page load —
        // previously it only flipped after a search response landed.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => {
                this.accessibleScope = scope ?? null;
                if (scope?.orgScopeRestricted && this.selectedPostingStatus !== 'Servings') {
                    this.selectedPostingStatus = 'Servings';
                }
            },
            error: () => { /* silent — leave dropdown editable on failure */ },
        });

        this.loadDivisions();
        this.loadRelationshipOptions();
        this.loadOrgOptions();
        this.loadMemberTypeOptions();
        this.loadOrgNodeLabels();
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

    loadOrgOptions(): void {
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

    loadMemberTypeOptions(): void {
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes) => (this.memberTypeOptions = this.mapCodes(codes)),
            error: () => (this.memberTypeOptions = []),
        });
    }

    /** CommonCode types that make up the RAB org tree, root → leaf. */
    private static readonly ORG_CODE_TYPES = ['RabUnit', 'RabWing', 'RabBranch', 'RabSubBranch', 'RabSection', 'RabSubSection'];

    /** Build the id → label map for every org node, so the criteria strip can
     *  resolve the selected node ids to names. */
    loadOrgNodeLabels(): void {
        forkJoin(
            ReportAddressLocationComponent.ORG_CODE_TYPES.map((t) => this.commonCodeService.getAllActiveCommonCodesType(t))
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

    /** Mother Org changed → reload org-scoped Ranks and Corps across all selected orgs; reset Rank/Corps/Trade. */
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

    loadDivisions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Division').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.divisionOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: (err: any) => (this.divisionOptions = []),
        });
    }

    /** Load relationship types (Relationship CommonCode) and append to addressOwnerOptions */
    loadRelationshipOptions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Relationship').subscribe({
            next: (codes: CommonCodeModel[]) => {
                const relOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: String(c.codeId),
                }));
                this.addressOwnerOptions = [
                    { label: 'All', labelBn: 'সকল', value: '' },
                    { label: 'Self (Member)', labelBn: 'নিজ (সদস্য)', value: 'Self' },
                    ...relOptions,
                ];
            },
            error: (err: any) => {},
        });
    }

    onDivisionChange(): void {
        this.districtOptions = [];
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
        this.selectedDistrictId = null;
        this.selectedUpazilaId = null;
        this.selectedPostOfficeId = null;
        if (this.selectedDivisionId != null) {
            this.commonCodeService.getAllActiveCommonCodesByParentId(this.selectedDivisionId).subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.districtOptions = (codes || []).map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }))),
                error: (err: any) => (this.districtOptions = []),
            });
        }
    }

    onDistrictChange(): void {
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
        this.selectedUpazilaId = null;
        this.selectedPostOfficeId = null;
        if (this.selectedDistrictId != null) {
            this.commonCodeService.getAllActiveCommonCodesByParentId(this.selectedDistrictId).subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.upazilaOptions = (codes || []).map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }))),
                error: (err: any) => (this.upazilaOptions = []),
            });
        }
    }

    onUpazilaChange(): void {
        this.postOfficeOptions = [];
        this.selectedPostOfficeId = null;
        if (this.selectedUpazilaId != null) {
            this.commonCodeService.getAllActiveCommonCodesByParentId(this.selectedUpazilaId).subscribe({
                next: (codes: CommonCodeModel[]) =>
                    (this.postOfficeOptions = (codes || []).map((c) => ({
                        label: c.codeValueEN || String(c.codeId),
                        labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                        value: c.codeId,
                    }))),
                error: (err: any) => (this.postOfficeOptions = []),
            });
        }
    }

    onPostOfficeChange(): void {}

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedOrgIds.length > 0) c++;
        if (this.selectedMemberTypeIds.length > 0) c++;
        if (this.selectedRankIds.length > 0) c++;
        if (this.selectedCorpsIds.length > 0) c++;
        if (this.selectedTradeIds.length > 0) c++;
        if (this.selectedOrgNodeIds.length > 0) c++;
        if (this.searchRabId.trim()) c++;
        if (this.searchServiceId.trim()) c++;
        if (this.searchNid.trim()) c++;
        if (this.selectedLocationType) c++;
        if (this.selectedAddressOwner) c++;
        if (this.selectedDivisionId != null) c++;
        if (this.selectedDistrictId != null) c++;
        if (this.selectedUpazilaId != null) c++;
        if (this.selectedPostOfficeId != null) c++;
        if (this.selectedPostingStatus) c++;
        return c;
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    /** Paginator page-size choices. Static base ladder plus totalRecords as
        the "All" option — appended only when it exceeds the largest base
        rung so we don't duplicate (e.g. 500 base + 487 total would still
        show 500 as the max). Recomputes on every change-detection pass, so
        the "All" rung snaps to whatever the current result set contains. */
    get rowsPerPageOptions(): number[] {
        const base = [100, 500, 1000, 5000];
        const t = this.totalRecords;
        if (t > 0 && t > base[base.length - 1] && !base.includes(t)) {
            return [...base, t];
        }
        return base;
    }

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.selectedOrgIds = [];
        this.selectedMemberTypeIds = [];
        this.selectedRankIds = [];
        this.selectedCorpsIds = [];
        this.selectedTradeIds = [];
        this.selectedOrgNodeIds = [];
        this.allRanksForOrg = [];
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.searchRabId = '';
        this.searchServiceId = '';
        this.searchNid = '';
        this.selectedAddressOwner = 'Self';
        this.selectedLocationType = 'Present';
        this.selectedDivisionId = null;
        this.selectedDistrictId = null;
        this.selectedUpazilaId = null;
        this.selectedPostOfficeId = null;
        // 'Servings' is also the locked value when the user is org-scope-restricted,
        // so this default is safe in both modes.
        this.selectedPostingStatus = 'Servings';
        this.activeOnly = true;
        this.districtOptions = [];
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
        this.first = 0;
        // Roll back to the pre-search state so the Columns picker (gated
        // on `searched`) disappears again until the next Search click.
        this.searched = false;
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

    /** Translate display column keys → backend registry field keys. The
        synthetic "name" column maps to nameEnglish/nameBangla so the server
        projects the name data; ser/personnel are synthetic/composite and pass
        through harmlessly (the backend whitelists/expands them). */
    private backendColumnKeys(): string[] {
        const out: string[] = [];
        const seen = new Set<string>();
        const push = (k: string) => { if (!seen.has(k)) { seen.add(k); out.push(k); } };
        for (const key of this.selectedColumnKeys) {
            if (key === 'name') { push('nameEnglish'); push('nameBangla'); continue; }
            if (key === 'nameExtras') {
                // Fold-into-name toggle — project awards + professional
                // qualification + corps so nameColumnValue can append them.
                push('awards'); push('professionalQualification'); push('corps');
                continue;
            }
            if (key === 'serviceId') {
                // Service ID cell shows the prefix before the number.
                push('serviceId'); push('prefix');
                continue;
            }
            if (key === 'callNoRankName') {
                // Composite cell — request every backend field it renders.
                push('prefix'); push('serviceId'); push('armyRank');
                push('nameEnglish'); push('nameBangla');
                push('awards'); push('professionalQualification'); push('corps');
                continue;
            }
            if (key === 'rabUnitHierarchy') { push('rabUnitHierarchy'); continue; }
            push(key);
        }
        return out;
    }

    /** Column selection changed — re-fetch so newly added columns are populated
        (the backend only returns requested columns). Reloads only post-search. */
    onColumnsChange(): void {
        if (this.searched) this.load();
    }

    load(): void {
        this.searched = true;
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;

        // Filter clauses for the dynamic backend. The cascading geo + free-
        // text searches go through `criteria`; AddressOwner / LocationType /
        // PostingStatus / ActiveOnly use the special top-level slots.
        const criteria: DynamicReportCriterion[] = [];
        if (this.selectedOrgIds.length > 0)        criteria.push({ fieldKey: 'motherOrganization', idValues: this.selectedOrgIds });
        if (this.selectedMemberTypeIds.length > 0) criteria.push({ fieldKey: 'memberType',         idValues: this.selectedMemberTypeIds });
        if (this.selectedRankIds.length > 0)       criteria.push({ fieldKey: 'armyRank',           idValues: this.selectedRankIds });
        if (this.selectedCorpsIds.length > 0)      criteria.push({ fieldKey: 'corps',              idValues: this.selectedCorpsIds });
        if (this.selectedTradeIds.length > 0)      criteria.push({ fieldKey: 'trade',              idValues: this.selectedTradeIds });
        if (this.selectedOrgNodeIds.length > 0)    criteria.push({ fieldKey: 'rabOrgNode',         idValues: this.selectedOrgNodeIds });
        if (this.selectedDivisionId != null)    criteria.push({ fieldKey: 'division',   idValue: this.selectedDivisionId });
        if (this.selectedDistrictId != null)    criteria.push({ fieldKey: 'district',   idValue: this.selectedDistrictId });
        if (this.selectedUpazilaId != null)     criteria.push({ fieldKey: 'upazila',    idValue: this.selectedUpazilaId });
        if (this.selectedPostOfficeId != null)  criteria.push({ fieldKey: 'postOffice', idValue: this.selectedPostOfficeId });
        if (this.searchRabId.trim())            criteria.push({ fieldKey: 'rabId',      textValue: this.searchRabId.trim() });
        if (this.searchServiceId.trim())        criteria.push({ fieldKey: 'serviceId',  textValue: this.searchServiceId.trim() });
        if (this.searchNid.trim())              criteria.push({ fieldKey: 'nid',        textValue: this.searchNid.trim() });

        this.reportService.runDynamicReport({
            columns: this.backendColumnKeys(),
            criteria,
            postingStatusFilter: this.selectedPostingStatus || null,
            locationTypeFilter:  this.selectedLocationType  || null,
            addressOwnerFilter:  this.selectedAddressOwner  || null,
            activeOnly: this.activeOnly,
            pagination: { page_no, row_per_page: this.rows },
        }).subscribe({
            next: (res) => {
                const startSer = (page_no - 1) * this.rows + 1;
                this.list = (res.datalist ?? []).map((d, i) => this.adaptDynamicRow(d, startSer + i));
                this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                // Dynamic-backend scope envelope returns IDs (not names). For
                // MVP we surface only the `orgScopeRestricted` flag — names
                // for the unit / member-type chip can be resolved client-side
                // via CommonCodeService in a follow-up.
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
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load report',
                });
                this.loading = false;
            },
        });
    }

    /** Translates a dynamic-backend property bag (keyed by registry field
        keys: rabId, nameEnglish, armyRank, motherOrganization, …) into the
        existing AddressLocationReportRow shape (rabid, name, rank, orgName,
        …). The spread keeps the original camelCase keys on the object too so
        the picker's "Plain" cells for new fields (religion, dob, bloodGroup,
        …) resolve via plainColumnPropertyMap without further renames. */
    private adaptDynamicRow(d: DynamicReportRow, ser: number): AddressLocationReportRow {
        const houseRoad     = (d['houseRoad'] as string)     || '';
        const addressAreaEN = (d['addressAreaEN'] as string) || '';
        const addressAreaBN = (d['addressAreaBN'] as string) || '';
        const postCode      = (d['postCode'] as string)      || '';
        const join = (...parts: string[]) =>
            parts.map((p) => (p || '').trim()).filter(Boolean).join(', ');
        return {
            // Pass-through: any field key not explicitly renamed below stays
            // accessible by its original (registry) key.
            ...d,
            ser,
            rabid:           d['rabId']                  as string,
            name:            d['nameEnglish']            as string,
            nameBN:          d['nameBangla']             as string,
            serviceId:       d['serviceId']              as string,
            rank:            d['armyRank']               as string,
            rankBN:          d['armyRankBN']             as string,
            orgName:         d['motherOrganization']     as string,
            orgNameBN:       d['motherOrganizationBN']   as string,
            corps:           d['corps']                  as string,
            corpsBN:         d['corpsBN']                as string,
            trade:           d['trade']                  as string,
            tradeBN:         d['tradeBN']                as string,
            rabUnit:         d['rabUnit']                as string,
            rabUnitBN:       d['rabUnitBN']              as string,
            locationType:    d['locationType']           as string,
            addressOwner:    d['addressOwner']           as string,
            addressOwnerBN:  d['addressOwnerBN']         as string,
            division:        d['division']               as string,
            divisionBN:      d['divisionBN']             as string,
            district:        d['district']               as string,
            districtBN:      d['districtBN']             as string,
            upazila:         d['upazila']                as string,
            upazilaBN:       d['upazilaBN']              as string,
            postOffice:      d['postOffice']             as string,
            postOfficeBN:    d['postOfficeBN']           as string,
            // Address detail built from underlying view columns — the legacy
            // backend pre-concatenated these; the dynamic backend leaves them
            // separate so we recreate the same string here.
            address:         join(houseRoad, addressAreaEN, postCode),
            addressBN:       join(houseRoad, addressAreaBN, postCode),
            // Status code passthrough — backend `status` field carries
            // EmployeeInfo.PostingStatus.
            status:          d['status']                 as string,
            // Remarks = the employee's Additional Remarks, filled server-side
            // (per employee, repeated across that employee's address rows).
            rmks:            (d['rmks'] as string) ?? null,
        } as AddressLocationReportRow;
    }

    displayNum(v: number | string | null | undefined): string {
        return displayNumHelper(v, this.lang);
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        return codeValueHelper(enVal, bnVal, this.lang);
    }

    /** Strip "Spouse" prefix and translate LocationType for display */
    private static readonly locationTypeDisplayMap: Record<string, { en: string; bn: string }> = {
        Permanent: { en: 'Permanent', bn: 'স্থায়ী' },
        Present: { en: 'Present', bn: 'বর্তমান' },
        SpousePermanent: { en: 'Permanent', bn: 'স্থায়ী' },
        SpousePresent: { en: 'Present', bn: 'বর্তমান' },
    };

    displayLocationType(val: string | null | undefined): string {
        if (!val) return '—';
        const mapped = ReportAddressLocationComponent.locationTypeDisplayMap[val];
        if (mapped) return this.lang === 'bn' ? mapped.bn : mapped.en;
        return val.replace('Spouse', '');
    }
}
