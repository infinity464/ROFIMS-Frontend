import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { PaginatorModule } from 'primeng/paginator';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PostingService } from '@/services/posting.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ReportService } from '@/services/report.service';
import { UserMenuService } from '@/services/user-menu.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { PendingPostingJoiningDto } from '@/models/posting.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { ReportAccessibleScope } from '@/models/report.model';
import { unitScopeLine, memberTypeScopeLine } from '../report-scope.helper';
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
import { forkJoin } from 'rxjs';

/**
 * Pending Inter-Posting Report — rows are pending posting orders (each
 * line is a member who has an approved order to move but hasn't joined yet).
 *
 * Access control (applied server-side in GetPendingPostingJoiningHandler):
 *  - Org-tree: row in scope when EITHER the employee's current placement
 *    OR the posted destination (TransferRabUnitId) is in the caller's
 *    accessible closure.
 *  - Member-type: row in scope when the employee's MemberType is in the
 *    caller's allowed list.
 *
 * Frontend is a thin filter + RAB-formal renderer over the existing
 * PostingService endpoint — not part of the dynamic-employee backend
 * since rows aren't employee snapshots, they're posting transitions.
 */
@Component({
    selector: 'app-report-pending-inter-posting',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        PaginatorModule,
        Toast,
    ],
    providers: [MessageService],
    templateUrl: './report-pending-inter-posting.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-pending-inter-posting.component.scss'],
})
export class ReportPendingInterPostingComponent implements OnInit {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    allRows: PendingPostingJoiningDto[] = [];
    list: PendingPostingJoiningDto[] = [];
    loading = false;
    searched = false;

    orgOptions: { label: string; labelBn: string; value: number }[] = [];
    rabUnitOptions: { label: string; value: number }[] = [];
    memberTypeOptions: { label: string; value: number }[] = [];
    rankOptions: { label: string; labelBn: string; value: number }[] = [];
    corpsOptions: { label: string; labelBn: string; value: number }[] = [];
    tradeOptions: { label: string; labelBn: string; value: number }[] = [];

    selectedFromUnitIds: number[] = [];
    selectedPostedUnitIds: number[] = [];
    selectedOrgIds: number[] = [];
    selectedMemberTypeIds: number[] = [];
    selectedRankIds: number[] = [];
    selectedCorpsIds: number[] = [];
    selectedTradeIds: number[] = [];
    /** Raw org-scoped MotherOrgRank rows, re-filtered client-side by Member Type. */
    private allRanksForOrg: CommonCodeModel[] = [];

    first = 0;
    rows = 20;
    rowsPerPageOptions = [20, 50, 100];
    get totalRecords(): number { return this.list.length; }

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    accessibleScope: ReportAccessibleScope | null = null;
    get unitScopeLine(): string | null { return unitScopeLine(this.accessibleScope, this.lang); }
    get memberTypeScopeLine(): string | null { return memberTypeScopeLine(this.accessibleScope, this.lang); }

    /** Column catalog for the dynamic picker. `key` doubles as both the row
        property accessor (via cellValue() / formatDate()) and the chip id. */
    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: 'Serial' | 'Personnel' | 'Date' | 'Plain' | 'Remarks'; defaultVisible: boolean }[] = [
        { key: 'ser',                labelEN: 'Ser',            labelBN: 'ক্রঃ',           hint: 'Serial',     defaultVisible: true  },
        { key: 'serviceId',          labelEN: 'Service ID',     labelBN: 'সার্ভিস আইডি',    hint: 'Plain',      defaultVisible: true  },
        { key: 'rank',               labelEN: 'Rank',           labelBN: 'র‍্যাঙ্ক',        hint: 'Plain',      defaultVisible: true  },
        { key: 'rabRank',            labelEN: 'RAB Rank',       labelBN: 'র‍্যাব র‍্যাঙ্ক',  hint: 'Plain',      defaultVisible: false },
        { key: 'corps',              labelEN: 'Corps',          labelBN: 'কোর',            hint: 'Plain',      defaultVisible: true  },
        { key: 'trade',              labelEN: 'Trade',          labelBN: 'ট্রেড',          hint: 'Plain',      defaultVisible: true  },
        { key: 'name',               labelEN: 'Name',           labelBN: 'নাম',            hint: 'Personnel',  defaultVisible: true  },
        { key: 'motherOrganization', labelEN: 'Mother Org',     labelBN: 'মাতৃ সংস্থা',     hint: 'Plain',      defaultVisible: true  },
        { key: 'presentBnWg',        labelEN: 'Present Bn/Wg',  labelBN: 'বর্তমান বিএন/উইং', hint: 'Plain',      defaultVisible: true  },
        { key: 'postedBnWg',         labelEN: 'Posted Bn/Wg',   labelBN: 'পোস্টেড বিএন/উইং', hint: 'Plain',      defaultVisible: true  },
        { key: 'postingOrderDate',   labelEN: 'Posting Order Date', labelBN: 'পোস্টিং অর্ডার তারিখ', hint: 'Date', defaultVisible: true  },
        { key: 'rmks',               labelEN: 'Remarks',        labelBN: 'মন্তব্য',        hint: 'Remarks',    defaultVisible: true  },
        // Opt-in extras
        { key: 'rabID',              labelEN: 'RAB ID',         labelBN: 'র‍্যাব আইডি',    hint: 'Plain',      defaultVisible: false },
        { key: 'postingOrderNo',     labelEN: 'Order No',       labelBN: 'অর্ডার নম্বর',    hint: 'Plain',      defaultVisible: false },
        { key: 'noteSheetNo',        labelEN: 'NoteSheet No',   labelBN: 'নোটশীট নম্বর',    hint: 'Plain',      defaultVisible: false },
        { key: 'transferToHierarchy',labelEN: 'Posted (Full Path)', labelBN: 'পোস্টেড (পূর্ণ পথ)', hint: 'Plain', defaultVisible: false },
        { key: 'motherUnitName',     labelEN: 'Mother Unit',    labelBN: 'মাতৃ ইউনিট',      hint: 'Plain',      defaultVisible: false },
        { key: 'memberType',         labelEN: 'Member Type',    labelBN: 'সদস্য ধরন',       hint: 'Plain',      defaultVisible: false },
    ];

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

    filterOpen = true;

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private postingService: PostingService,
        private commonCodeService: CommonCodeService,
        private reportService: ReportService,
        private messageService: MessageService,
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

        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => { this.accessibleScope = scope ?? null; },
            error: () => { /* silent */ },
        });

        this.loadFilterOptions();
        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.postingService.getPendingPostingJoining('InterPosting').subscribe({
            next: (data) => {
                this.allRows = data ?? [];
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load pending inter-posting list.',
                });
                this.loading = false;
            },
        });
    }

    private loadFilterOptions(): void {
        // RAB Unit options — shared for Present + Posted.
        this.commonCodeService.getAllActiveCommonCodesType('RabUnit').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.rabUnitOptions = (codes || []).map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }))),
            error: () => (this.rabUnitOptions = []),
        });

        this.commonCodeService.getAllActiveMotherOrgs().subscribe({
            next: (orgs: MotherOrganizationModel[]) =>
                (this.orgOptions = (orgs || []).map((o) => ({
                    label: o.orgNameEN || String(o.orgId),
                    labelBn: o.orgNameBN || o.orgNameEN || String(o.orgId),
                    value: o.orgId,
                }))),
            error: () => (this.orgOptions = []),
        });

        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.memberTypeOptions = (codes || []).map((c) => ({ label: c.codeValueEN || String(c.codeId), value: c.codeId }))),
            error: () => (this.memberTypeOptions = []),
        });
    }

    /** Map common codes to id-valued bilingual options. */
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
        if (!this.selectedCorpsIds.length) { this.selectedTradeIds = []; return; }
        forkJoin(this.selectedCorpsIds.map((corpsId) => this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId))).subscribe({
            next: (results: CommonCodeModel[][]) => {
                this.tradeOptions = this.mapCodes(this.dedupeByCodeId(results.flat()));
                this.selectedTradeIds = this.selectedTradeIds.filter((id) => this.tradeOptions.some((o) => o.value === id));
            },
            error: () => (this.tradeOptions = []),
        });
    }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedFromUnitIds.length) c++;
        if (this.selectedPostedUnitIds.length) c++;
        if (this.selectedOrgIds.length) c++;
        if (this.selectedMemberTypeIds.length) c++;
        if (this.selectedRankIds.length) c++;
        if (this.selectedCorpsIds.length) c++;
        if (this.selectedTradeIds.length) c++;
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
        this.selectedFromUnitIds = [];
        this.selectedPostedUnitIds = [];
        this.selectedOrgIds = [];
        this.selectedMemberTypeIds = [];
        this.selectedRankIds = [];
        this.selectedCorpsIds = [];
        this.selectedTradeIds = [];
        this.allRanksForOrg = [];
        this.rankOptions = [];
        this.corpsOptions = [];
        this.tradeOptions = [];
        this.first = 0;
    }

    /** Join the option labels for a set of selected ids. */
    private labelsForIds(ids: number[], options: { label: string; value: number }[]): string {
        return ids
            .map(id => options.find(o => o.value === id)?.label ?? String(id))
            .join(', ');
    }

    /** Join bilingual option labels for a set of selected ids. */
    private bilingualLabelsForIds(ids: number[], options: { label: string; labelBn: string; value: number }[]): string {
        return ids
            .map(id => {
                const o = options.find(opt => opt.value === id);
                if (!o) return String(id);
                return this.lang === 'bn' ? o.labelBn : o.label;
            })
            .join(', ');
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    buildFilterLines(): string[] {
        return this.criteriaItems.map(it => `${it.label}: ${it.value}`);
    }

    get criteriaItems(): { label: string; value: string }[] {
        const L = this.L[this.lang];
        const items: { label: string; value: string }[] = [];
        const presentLabel = this.lang === 'bn' ? 'বর্তমান ইউনিট' : 'Present Unit';
        const corpsLabel = this.lang === 'bn' ? 'কোর' : 'Corps';
        if (this.selectedFromUnitIds.length) {
            items.push({ label: presentLabel, value: this.labelsForIds(this.selectedFromUnitIds, this.rabUnitOptions) });
        }
        if (this.selectedPostedUnitIds.length) {
            items.push({ label: L['report.search.postedUnit'] ?? 'Posted Unit', value: this.labelsForIds(this.selectedPostedUnitIds, this.rabUnitOptions) });
        }
        if (this.selectedOrgIds.length) {
            items.push({ label: L['report.search.motherOrg'], value: this.bilingualLabelsForIds(this.selectedOrgIds, this.orgOptions) });
        }
        if (this.selectedMemberTypeIds.length) {
            items.push({ label: L['report.search.memberType'], value: this.labelsForIds(this.selectedMemberTypeIds, this.memberTypeOptions) });
        }
        if (this.selectedRankIds.length) {
            items.push({ label: L['report.search.rank'], value: this.bilingualLabelsForIds(this.selectedRankIds, this.rankOptions) });
        }
        if (this.selectedCorpsIds.length) {
            items.push({ label: corpsLabel, value: this.bilingualLabelsForIds(this.selectedCorpsIds, this.corpsOptions) });
        }
        if (this.selectedTradeIds.length) {
            items.push({ label: L['report.search.trade'], value: this.bilingualLabelsForIds(this.selectedTradeIds, this.tradeOptions) });
        }
        return items;
    }

    /** Filters the in-memory rows by the picked Mother Org / posted-unit. */
    search(): void {
        this.searched = true;
        this.appliedFilterLines = this.buildFilterLines();
        this.list = this.allRows.filter((r) => {
            if (this.selectedFromUnitIds.length && !this.selectedFromUnitIds.includes(r.fromRabUnitId as number)) return false;
            if (this.selectedPostedUnitIds.length && !this.selectedPostedUnitIds.includes(r.transferRabUnitId as number)) return false;
            if (this.selectedOrgIds.length && !this.selectedOrgIds.includes(r.motherOrganizationId as number)) return false;
            if (this.selectedMemberTypeIds.length && !this.selectedMemberTypeIds.includes(r.memberTypeId as number)) return false;
            if (this.selectedRankIds.length && !this.selectedRankIds.includes(r.rankId as number)) return false;
            if (this.selectedCorpsIds.length && !this.selectedCorpsIds.includes(r.corpsId as number)) return false;
            if (this.selectedTradeIds.length && !this.selectedTradeIds.includes(r.tradeId as number)) return false;
            return true;
        });
        this.first = 0;
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
    }

    /** Slice for the paginator — table renders `list` directly with manual paging. */
    get pagedList(): PendingPostingJoiningDto[] {
        return this.list.slice(this.first, this.first + this.rows);
    }

    paddedSer(n: number | string | null | undefined): string {
        const s = n == null ? '' : String(n);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s.padStart(2, '0')) : s.padStart(2, '0');
    }

    /** Composite RAB Personnel cell — name on top, "SVC · Rank · Org" below. */
    personnelMetaText(row: PendingPostingJoiningDto): string {
        return personnelMetaHelper({
            name: row.fullNameEN,
            nameBN: row.fullNameBN,
            rank: row.rankName,
            rankBN: row.rankNameBN,
            orgName: row.motherOrganization,
            orgNameBN: null,
            serviceId: row.serviceId,
        } as any, this.lang);
    }

    /** Resolve a row's value for a column. Handles the curated cells and the
        opt-in raw fields uniformly. Date fields are formatted dd-mm-yyyy. */
    cellValue(row: PendingPostingJoiningDto, key: string): string {
        switch (key) {
            case 'serviceId':           return this.displayNum(row.serviceId);
            case 'rank':                return this.codeValue(row.rankName, row.rankNameBN);
            case 'rabRank':             return this.codeValue(row.rabRank, row.rabRankBN);
            case 'memberType':          return this.codeValue(row.memberType, row.memberTypeBN);
            case 'corps':               return this.codeValue(row.corps, row.corpsBN);
            case 'trade':               return this.codeValue(row.trade, row.tradeBN);
            case 'name':                return this.codeValue(row.fullNameEN, row.fullNameBN);
            case 'motherOrganization':  return row.motherOrganization ?? '—';
            case 'motherUnitName':      return row.motherUnitName ?? '—';
            case 'presentBnWg':         return row.fromRabUnitName ?? '—';
            case 'postedBnWg':          return row.transferRabUnitName ?? '—';
            case 'transferToHierarchy': return row.transferToHierarchy ?? '—';
            case 'postingOrderDate':    return this.formatDate(row.postingOrderDate);
            case 'rabID':               return row.rabID ?? '—';
            case 'postingOrderNo':      return row.postingOrderNo ?? '—';
            case 'noteSheetNo':         return row.noteSheetNo ?? '—';
            case 'rmks':                return '';
            default:                    return '—';
        }
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
    get rabSectionTitle(): string { return this.L[this.lang]['report.title.pendingInterPosting']; }
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
        headerPars.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: wsafe(this.rabSectionTitle), font: serif, size: S.sectionTitle, ...bnRunExtras(S.sectionTitle), bold: true, color: C.black, characterSpacing: isBn ? 0 : 32, allCaps: !isBn })] }));

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

        const dataRows: TableRow[] = this.list.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven ? { type: 'clear' as const, fill: C.zebra, color: 'auto' } : undefined;
            const cellOpts = { borders: innerCellBorder, margins: { top: 100, bottom: 100, left: 140, right: 140 }, width: { size: dataColPct, type: WidthType.PERCENTAGE }, shading };
            const cells: TableCell[] = visibleCols.map(col => {
                const run = (text: string, opts: { fontKey?: any; sz?: number; bold?: boolean; color?: string; chSp?: number } = {}) => new TextRun({ text: wsafe(text), font: opts.fontKey ?? sans, size: opts.sz ?? S.body, ...bnRunExtras(opts.sz ?? S.body), bold: opts.bold ?? false, color: opts.color ?? C.black, ...(opts.chSp != null ? { characterSpacing: opts.chSp } : {}) });
                switch (col.hint) {
                    case 'Serial':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(this.paddedSer(idx + 1), { fontKey: mono, sz: S.name, bold: true, color: C.gray, chSp: isBn ? 0 : 8 })] })] });
                    case 'Personnel': {
                        const meta = this.personnelMetaText(row);
                        const children: Paragraph[] = [new Paragraph({ spacing: { after: meta ? 40 : 0 }, children: [run(this.cellValue(row, 'name'), { sz: S.name, bold: true })] })];
                        if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, font: mono, size: S.meta, ...bnRunExtras(S.meta), color: C.gray, characterSpacing: isBn ? 0 : 16, allCaps: !isBn })] }));
                        return new TableCell({ ...cellOpts, children });
                    }
                    case 'Date':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.cellValue(row, col.key), { fontKey: mono, chSp: isBn ? 0 : 4 })] })] });
                    case 'Remarks':
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run('', { color: C.gray })] })] });
                    case 'Plain':
                    default:
                        return new TableCell({ ...cellOpts, children: [new Paragraph({ children: [run(this.cellValue(row, col.key))] })] });
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
        saveAs(blob, `pending-inter-posting-report_${this.lang}.docx`);
    }

    private exportRabExcel(): void {
        const isBn = this.lang === 'bn';
        const wsafe = (s: string | null | undefined): string => s ?? '';
        const visibleCols = this.visibleColumns;
        const headers: string[] = visibleCols.map(c => isBn ? c.labelBN : c.labelEN);
        const totalCols = headers.length || 1;

        const aoa: any[][] = [];
        const pad = (n: number) => Array.from({ length: n }, () => '');
        aoa.push([wsafe(this.rabOverlineText), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgTitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabOrgSubtitle), ...pad(totalCols - 1)]);
        aoa.push([wsafe(this.rabSectionTitle), ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push([`${this.rabCriteriaTitle}  ·  ${this.rabGeneratedLabel}: ${this.rabFormattedDate}`, ...pad(totalCols - 1)]);
        for (const it of this.criteriaItems) aoa.push([`${it.label}: ${it.value}`, ...pad(totalCols - 1)]);
        aoa.push(pad(totalCols));
        aoa.push(headers);
        for (let i = 0; i < this.list.length; i++) {
            const row = this.list[i];
            const cells = visibleCols.map(col => {
                switch (col.hint) {
                    case 'Serial': return this.paddedSer(i + 1);
                    case 'Personnel': {
                        const name = this.cellValue(row, 'name');
                        const meta = this.personnelMetaText(row);
                        return meta ? `${name}\n${meta}` : name;
                    }
                    case 'Remarks': return '';
                    case 'Date':
                    case 'Plain':
                    default: return this.cellValue(row, col.key);
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
        XLSX.writeFile(wb, `pending-inter-posting-report_${this.lang}.xlsx`);
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

        const renderCell = (row: PendingPostingJoiningDto, col: { key: string; hint: string }, idx: number): string => {
            switch (col.hint) {
                case 'Serial': return `<td class="td-ser"><span class="ser">${esc(this.paddedSer(idx + 1))}</span></td>`;
                case 'Personnel': {
                    const meta = this.personnelMetaText(row);
                    const metaHtml = meta ? `<div class="personnel-meta">${esc(meta)}</div>` : '';
                    return `<td class="td-personnel"><div class="personnel-name">${esc(this.cellValue(row, 'name'))}</div>${metaHtml}</td>`;
                }
                case 'Date': return `<td class="td-date">${esc(this.cellValue(row, col.key))}</td>`;
                case 'Remarks': return `<td class="td-rmks"></td>`;
                case 'Plain':
                default: return `<td>${esc(this.cellValue(row, col.key))}</td>`;
            }
        };

        const tableBodyHtml = this.list.map((row, i) => `<tr>${visibleCols.map(c => renderCell(row, c, i)).join('')}</tr>`).join('');
        const items = this.criteriaItems;
        const criteriaGridHtml = items.length ? `<div class="criteria-grid">${items.map(item => `<div class="cell"><div class="cell-label">${esc(item.label)}</div><div class="cell-value">${esc(item.value)}</div></div>`).join('')}</div>` : '';
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
    </header>
    <div class="criteria">
        <div class="criteria-strip"><span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> ${esc(this.rabCriteriaTitle)}</span><span class="criteria-strip-date">${esc(this.rabGeneratedLabel)} &middot; ${esc(this.rabFormattedDate)}</span></div>
        ${criteriaGridHtml}
    </div>
    <table><thead>${tableHeaderHtml}</thead><tbody>${tableBodyHtml}</tbody></table>
</div></body></html>`;
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
}
