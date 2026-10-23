import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import {
    DynamicSearchService,
    SearchCategory,
    SearchFieldDefinition,
    DynamicSearchCriterion,
    DynamicSearchRequest
} from '@/services/dynamic-search.service';
import { UserMenuService } from '@/services/user-menu.service';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { EmpService } from '@/services/emp-service';
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
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';

interface CriterionValue {
    fieldKey: string;
    textValue: string;
    idValue: number | null;
    stringIdValue: string;
    dateFrom: Date | null;
    dateTo: Date | null;
}

@Component({
    selector: 'app-dynamic-search',
    standalone: true,
    imports: [
        CommonModule, FormsModule, RouterModule,
        TableModule, ButtonModule, InputTextModule,
        SelectModule, MultiSelectModule, DatePickerModule, FlexibleDateDirective,
        Toast, DialogModule
    ],
    providers: [MessageService],
    templateUrl: './dynamic-search.html',
    styleUrls: ['../../../Components/Features/employee-reports/report-theme.scss', './dynamic-search.scss']
})
export class DynamicSearchComponent implements OnInit, OnDestroy {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    // Category
    categoryOptions = [
        { label: 'Employee', value: 'Employee' as SearchCategory },
        // { label: 'Office Management', value: 'OfficeManagement' as SearchCategory } // TODO: re-enable when Office Management search is ready
    ];
    selectedCategory: SearchCategory = 'Employee';

    // Employee posting status filter
    memberStatusOptions = [
        { label: 'Presently Serving', value: 'Servings' },
        { label: 'Ex Member', value: 'ExMember' },
        { label: 'Supernumerary', value: 'Supernumerary' },
        { label: 'Pending for Joining', value: 'Pending' },
        { label: 'All', value: '' }
    ];
    selectedMemberStatus: string = 'Servings';

    // Fields
    availableFields: SearchFieldDefinition[] = [];
    selectedFields: SearchFieldDefinition[] = [];
    criteriaValues: Map<string, CriterionValue> = new Map();

    // Results
    results: any[] = [];
    loading = false;
    totalRecords = 0;
    first = 0;
    rows = 10;

    // Track whether user has performed a search (prevents onLazyLoad from
    // firing before first search; also gates the Columns picker so it
    // only appears after the user has actually run a search).
    hasSearched = false;

    /**
     * Set from the Search response. When the caller is org-tree
     * restricted, the backend forces "Servings" — we lock the Member
     * Status dropdown to match so the user sees the constraint instead
     * of silently picking an option that gets overridden server-side.
     */
    memberStatusLocked = false;

    // Filter panel
    filterOpen = true;

    /**
     * Catalog of every column the Employee results table can render.
     * `key` doubles as the access path on the result row (camelCase
     * matching .NET JSON serialization). `hint` selects a cell template:
     * Serial / NameWithProfile / CorpsBadge / UnitBadge / Date / Plain.
     * Mirrors the pattern used by report-address-location.
     */
    columnCatalog: { key: string; labelEN: string; labelBN: string; hint: string; defaultVisible: boolean }[] = [
        { key: 'ser',             labelEN: 'Ser',          labelBN: 'ক্রঃ',           hint: 'Serial',          defaultVisible: true  },
        { key: 'picture',         labelEN: 'Picture',      labelBN: 'ছবি',            hint: 'Photo',           defaultVisible: true  },
        { key: 'serviceId',       labelEN: 'Service ID',   labelBN: 'সার্ভিস আইডি',    hint: 'Plain',           defaultVisible: true  },
        { key: 'rabid',           labelEN: 'RAB ID',       labelBN: 'র‍্যাব আইডি',     hint: 'Plain',           defaultVisible: true  },
        { key: 'nameEnglish',     labelEN: 'Name (EN)',    labelBN: 'নাম (ইংরেজি)',    hint: 'NameWithProfile', defaultVisible: true  },
        { key: 'nameBangla',      labelEN: 'Name (BN)',    labelBN: 'নাম (বাংলা)',     hint: 'Plain',           defaultVisible: false },
        { key: 'armyRank',        labelEN: 'Rank',         labelBN: 'র‍্যাঙ্ক',         hint: 'Plain',           defaultVisible: true  },
        { key: 'corps',           labelEN: 'Corps',        labelBN: 'কোর',             hint: 'CorpsBadge',      defaultVisible: true  },
        { key: 'trade',           labelEN: 'Trade',        labelBN: 'ট্রেড',           hint: 'Plain',           defaultVisible: true  },
        { key: 'tradeRemarks',    labelEN: 'Trade Remarks', labelBN: 'ট্রেড মন্তব্য',   hint: 'Plain',           defaultVisible: false },
        { key: 'memberType',      labelEN: 'Member Type',  labelBN: 'সদস্য ধরন',       hint: 'Plain',           defaultVisible: false },
        { key: 'appointment',     labelEN: 'Appointment',  labelBN: 'নিয়োগ',          hint: 'Plain',           defaultVisible: false },
        { key: 'prefix',          labelEN: 'Prefix',       labelBN: 'প্রিফিক্স',        hint: 'Plain',           defaultVisible: false },
        { key: 'motherOrganization', labelEN: 'Mother Org', labelBN: 'মাতৃ সংস্থা',     hint: 'Plain',           defaultVisible: false },
        { key: 'motherUnit',      labelEN: 'Last Unit',    labelBN: 'শেষ ইউনিট',        hint: 'Plain',           defaultVisible: false },
        { key: 'location',        labelEN: 'Location',     labelBN: 'অবস্থান',         hint: 'Plain',           defaultVisible: false },
        { key: 'rabUnit',         labelEN: 'RAB Unit',     labelBN: 'র‍্যাব ইউনিট',     hint: 'UnitBadge',       defaultVisible: true  },
        { key: 'gender',          labelEN: 'Gender',       labelBN: 'লিঙ্গ',           hint: 'Plain',           defaultVisible: false },
        { key: 'dob',             labelEN: 'Date of Birth', labelBN: 'জন্ম তারিখ',      hint: 'Date',            defaultVisible: false },
        { key: 'joiningDate',     labelEN: 'Date of Joining in RAB', labelBN: 'র‍্যাবে যোগদান', hint: 'Date',     defaultVisible: false },
        { key: 'dateOfCommission', labelEN: 'Commission Date', labelBN: 'কমিশন তারিখ',  hint: 'Date',            defaultVisible: false },
        { key: 'dateOfJoiningInServiceTraining', labelEN: 'Date of Joining in Service/Training', labelBN: 'সেবা/প্রশিক্ষণে যোগদান', hint: 'Date', defaultVisible: false },
        { key: 'religionName',    labelEN: 'Religion',     labelBN: 'ধর্ম',             hint: 'Plain',           defaultVisible: false },
        { key: 'bloodGroup',      labelEN: 'Blood Group',  labelBN: 'রক্তের গ্রুপ',     hint: 'Plain',           defaultVisible: false },
        { key: 'maritalStatusName', labelEN: 'Marital Status', labelBN: 'বৈবাহিক অবস্থা', hint: 'Plain',          defaultVisible: false },
        { key: 'mobileNo',        labelEN: 'Mobile No',    labelBN: 'মোবাইল',          hint: 'Plain',           defaultVisible: false },
        { key: 'mobileNoOfficial', labelEN: 'Mobile (Official)', labelBN: 'মোবাইল (অফিসিয়াল)', hint: 'Plain',   defaultVisible: false },
        { key: 'email',           labelEN: 'Email',        labelBN: 'ইমেইল',           hint: 'Plain',           defaultVisible: false },
        { key: 'nid',             labelEN: 'NID',          labelBN: 'এনআইডি',          hint: 'Plain',           defaultVisible: false },
        { key: 'nIDOld',          labelEN: 'Old NID',      labelBN: 'পুরাতন এনআইডি',   hint: 'Plain',           defaultVisible: false },
        { key: 'passportNo',      labelEN: 'Passport No',  labelBN: 'পাসপোর্ট নং',     hint: 'Plain',           defaultVisible: false },
        { key: 'identificationMark', labelEN: 'Identification Mark', labelBN: 'পরিচিতি চিহ্ন', hint: 'Plain',     defaultVisible: false },
        { key: 'emergencyContact', labelEN: 'Emergency Contact', labelBN: 'জরুরি যোগাযোগ', hint: 'Plain',       defaultVisible: false },
        { key: 'drivingLicenseNo', labelEN: 'Driving License No', labelBN: 'ড্রাইভিং লাইসেন্স', hint: 'Plain',  defaultVisible: false },
        { key: 'serviceIdCardNo', labelEN: 'Service ID Card No', labelBN: 'সার্ভিস আইডি কার্ড', hint: 'Plain',  defaultVisible: false },
        { key: 'personalBatch',   labelEN: 'Batch',        labelBN: 'ব্যাচ',           hint: 'Plain',           defaultVisible: false },
        { key: 'awards',          labelEN: 'Gallantry Awards', labelBN: 'গ্যালান্ট্রি অ্যাওয়ার্ড', hint: 'Plain', defaultVisible: false },
        { key: 'specialQualifications', labelEN: 'Special Qualifications', labelBN: 'বিশেষ যোগ্যতা', hint: 'Plain', defaultVisible: false },
        { key: 'presentStatus',   labelEN: 'Present Status', labelBN: 'বর্তমান অবস্থা', hint: 'Plain',           defaultVisible: false },
        { key: 'permanentDistrictTypeName', labelEN: 'Home District', labelBN: 'নিজ জেলা', hint: 'Plain',         defaultVisible: false },
        // Status auto-toggles when the Member Status filter is set to "All"
        // (see onPostingStatusFilterChange) — picked from PostingStatus and
        // mapped through memberStatusDisplayMap for a localized label.
        { key: 'postingStatus',   labelEN: 'Status',       labelBN: 'অবস্থা',          hint: 'Status',          defaultVisible: false },
        { key: 'action',          labelEN: 'Action',       labelBN: 'কর্ম',           hint: 'Action',          defaultVisible: true  },
    ];

    selectedColumnKeys: string[] = this.columnCatalog.filter(c => c.defaultVisible).map(c => c.key);

    get columnPickerOptions(): { label: string; value: string }[] {
        return this.columnCatalog.map(c => ({ label: c.labelEN, value: c.key }));
    }

    get visibleColumns(): typeof this.columnCatalog {
        const map = new Map(this.columnCatalog.map(c => [c.key, c]));
        return this.selectedColumnKeys
            .map(k => map.get(k))
            .filter((c): c is typeof this.columnCatalog[number] => c != null);
    }

    /** Field key currently being dragged on the column-order strip. */
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

    onColumnDragEnd(): void {
        this.draggingColumnKey = null;
    }

    removeColumn(key: string): void {
        this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== key);
    }

    /**
     * Member Status dropdown changed — when the user picks "All" (empty
     * string), the result set will mix PostingStatuses, so auto-tick the
     * Status column. Specific picks ("Servings", "ExMember", etc.) make
     * the column redundant, so auto-untick. Same pattern as
     * report-address-location. Status is inserted BEFORE 'action' so the
     * profile-link column stays the rightmost — feels more natural than
     * Action then Status.
     */
    onPostingStatusFilterChange(): void {
        const wantStatus = !this.selectedMemberStatus;
        const has = this.selectedColumnKeys.includes('postingStatus');
        if (wantStatus && !has) {
            const arr = [...this.selectedColumnKeys];
            const idx = arr.indexOf('action');
            if (idx >= 0) arr.splice(idx, 0, 'postingStatus');
            else arr.push('postingStatus');
            this.selectedColumnKeys = arr;
        } else if (!wantStatus && has) {
            this.selectedColumnKeys = this.selectedColumnKeys.filter(k => k !== 'postingStatus');
        }
    }

    /**
     * Localized label for the Status cell. The view's PostingStatus column
     * carries raw codes; we map them through this dictionary for display.
     * "Pending" and "PendingForJoining" collapse onto one label — the FE
     * dropdown treats them as one too.
     */
    private static readonly memberStatusDisplayMap: Record<string, string> = {
        Servings: 'Serving',
        Serving: 'Serving',
        ExMember: 'Ex-Member',
        Pending: 'Pending for Joining',
        PendingForJoining: 'Pending for Joining',
        Supernumerary: 'Supernumerary',
    };

    displayMemberStatus(row: any): string {
        const raw = (row?.postingStatus ?? '').toString().trim();
        if (!raw) return '—';
        return DynamicSearchComponent.memberStatusDisplayMap[raw] ?? raw;
    }

    constructor(
        private searchService: DynamicSearchService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private exportService: ExportService,
        private empService: EmpService
    ) {}

    // ── Row thumbnails ────────────────────────────────────────────────────
    // Profile photos aren't part of the search payload as an image — the row
    // carries `profileImages` (JSON array of {FileId,fileName}). We resolve
    // the first FileId to a blob via FileInformation/Download, cache the
    // object URL per employeeID, and render a small clickable thumbnail that
    // opens the full image in a modal. Object URLs are revoked on every new
    // results page and on destroy to avoid leaks.
    private photoUrls = new Map<number, string>();
    private photoRequested = new Set<number>();

    /** Photo modal state. */
    showPhotoDialog = false;
    photoDialogUrl: string | null = null;
    photoDialogName = '';

    /** Revoke and drop every cached thumbnail object URL. */
    private clearRowPhotos(): void {
        for (const url of this.photoUrls.values()) {
            try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
        }
        this.photoUrls.clear();
        this.photoRequested.clear();
    }

    /** First FileId from a row's ProfileImages JSON, or null when absent/invalid. */
    private firstPhotoFileId(row: any): number | null {
        const json = row?.profileImages ?? row?.ProfileImages;
        if (!json || typeof json !== 'string') return null;
        try {
            const refs = JSON.parse(json);
            const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
            const id = first?.FileId ?? first?.fileId;
            return typeof id === 'number' && id > 0 ? id : null;
        } catch {
            return null;
        }
    }

    /** Kick off thumbnail downloads for the current results page (deduped). */
    private loadRowPhotos(): void {
        for (const row of this.results) {
            const empId = row?.employeeID;
            if (empId == null || this.photoRequested.has(empId)) continue;
            const fileId = this.firstPhotoFileId(row);
            if (fileId == null) continue;
            this.photoRequested.add(empId);
            this.empService.downloadFile(fileId).subscribe({
                next: (blob) => {
                    if (blob && blob.size > 0) {
                        this.photoUrls.set(empId, URL.createObjectURL(blob));
                    }
                },
                error: () => { /* leave the placeholder in place */ },
            });
        }
    }

    /** Cached thumbnail URL for a row, or null while loading / when none. */
    photoUrlFor(row: any): string | null {
        const empId = row?.employeeID;
        return empId != null ? (this.photoUrls.get(empId) ?? null) : null;
    }

    /** Open the full-size photo modal for a row (no-op if the thumb isn't loaded). */
    openPhotoDialog(row: any): void {
        const url = this.photoUrlFor(row);
        if (!url) return;
        this.photoDialogUrl = url;
        this.photoDialogName = row?.nameEnglish ?? '';
        this.showPhotoDialog = true;
    }

    /** Export dropdown state — print / PDF / Word / Excel options. */
    exportDropdownOpen = false;
    exporting = false;

    @HostListener('document:click')
    onDocumentClick(): void {
        this.exportDropdownOpen = false;
    }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    /**
     * Builds the column/row matrix the ExportService expects. Uses the
     * user's current `visibleColumns` set + their column order so the
     * exported document mirrors the on-screen table.
     */
    private getExportData(): { columns: string[]; rows: string[][] } {
        // Action + Photo columns are interactive-only — strip them from exports.
        const cols = this.visibleColumns.filter(c => c.hint !== 'Action' && c.hint !== 'Photo');
        const columns = cols.map(c => c.labelEN);
        const rows = this.results.map((row, idx) =>
            cols.map(c => {
                switch (c.hint) {
                    case 'Serial': return String(idx + 1);
                    case 'Status': return this.displayMemberStatus(row);
                    case 'Date':   return this.formatDate(row[c.key]);
                    default: {
                        const v = row?.[c.key];
                        return v == null || v === '' ? '—' : String(v);
                    }
                }
            })
        );
        return { columns, rows };
    }

    async exportAs(type: 'print' | 'pdf' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.results?.length) return;

        // Print + PDF share the formal RAB layout (browser print dialog
        // also lets the user "Save as PDF" from a single rendered document
        // — same trick report-address-location uses).
        if (type === 'print' || type === 'pdf') {
            if (type === 'pdf') this.exporting = true;
            try { this.openRabPrintWindow(); }
            finally { if (type === 'pdf') this.exporting = false; }
            return;
        }

        // Word + Excel fall back to ExportService (generic table). The
        // user-facing "no report name" rule means the title is left blank.
        const { columns, rows } = this.getExportData();
        const config = {
            title: '',
            lang: 'en' as const,
            columns,
            rows,
            showPageNumbers: true,
            filterLines: [],
            landscape: true,
            marginMm: 5,
        };
        if (type === 'word') {
            await this.exportRabWord();
        } else {
            this.exportService.exportExcel(config);
        }
    }

    /**
     * Word export — mirrors report-address-location's exportRabWord: same
     * heading block (overline / title / subtitle), same 4-column selection-
     * criteria table, same data table layout with zebra striping + dark
     * header row, same CONFIDENTIAL / PAGE X OF Y footer table. Section-
     * title block is intentionally skipped per the user's "no report name"
     * rule. Bangla-specific font branching is dropped too since
     * dynamic-search is English-only.
     */
    private async exportRabWord(): Promise<void> {
        const sans = 'Calibri';
        const serif = 'Cambria';
        const mono = 'Consolas';
        const wsafe = (s: string | null | undefined): string => s ?? '';

        // Half-points (Word: 2 × pt).
        const S = {
            overline: 15, title: 44, subtitle: 20,
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

        const marginTop = 680;
        const marginBottom = 1247;
        const marginSide = 680;

        // ── Header block ──────────────────────────────────────────────────
        const headerPars: Paragraph[] = [];
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({
                text: "GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH",
                font: sans, size: S.overline, color: C.mutedText,
                characterSpacing: 60, allCaps: true,
            })],
        }));
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [new TextRun({
                text: 'RAPID ACTION BATTALION',
                font: serif, size: S.title, bold: true, color: C.black,
                characterSpacing: 24,
            })],
        }));
        headerPars.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: 'Bangladesh Police · Headquarters, Kurmitola, Dhaka',
                font: serif, size: S.subtitle, italics: true, color: C.mutedText,
            })],
        }));

        // ── Selection Criteria block (4-col grid with strip row) ─────────
        const criteriaItems = this.buildExportCriteriaItems();
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

        const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const stripRow = new TableRow({
            cantSplit: true,
            children: [
                stripCell([
                    new TextRun({
                        text: 'SELECTION CRITERIA',
                        font: sans, size: S.stripLabel, bold: true,
                        color: C.black, characterSpacing: 40, allCaps: true,
                    }),
                ], AlignmentType.LEFT),
                stripCell([
                    new TextRun({
                        text: `Generated · ${generatedDate}`,
                        font: sans, size: S.stripDate, bold: true,
                        color: C.mutedText, characterSpacing: 30, allCaps: true,
                    }),
                ], AlignmentType.RIGHT),
            ],
        });

        const critRows: TableRow[] = [stripRow];
        for (let i = 0; i < criteriaItems.length; i += colsPerCritRow) {
            const cells: TableCell[] = [];
            for (let j = 0; j < colsPerCritRow; j++) {
                const it = criteriaItems[i + j];
                cells.push(new TableCell({
                    borders: innerCellBorder,
                    margins: { top: 100, bottom: 100, left: 140, right: 140 },
                    width: { size: critCellPct, type: WidthType.PERCENTAGE },
                    children: it ? [
                        new Paragraph({
                            spacing: { after: 40 },
                            children: [new TextRun({
                                text: wsafe(it.label),
                                font: sans, size: S.critLabel, bold: true,
                                color: C.labelGray, characterSpacing: 32, allCaps: true,
                            })],
                        }),
                        new Paragraph({
                            children: [new TextRun({
                                text: wsafe(it.value),
                                font: serif, size: S.critValue, bold: true, color: C.black,
                            })],
                        }),
                    ] : [new Paragraph({ children: [new TextRun({ text: ' ', font: sans, size: S.critValue })] })],
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
        const visibleCols = this.visibleColumns.filter(c => c.hint !== 'Action' && c.hint !== 'Photo');
        const headerLabels = visibleCols.map(c => c.labelEN);
        // Each column gets an even slice — dynamic-search has too many
        // permutations to hand-tune width weights per column.
        const dataColPct = visibleCols.length > 0 ? (100 / visibleCols.length) : 100;

        const headerCells: TableCell[] = headerLabels.map((label) => new TableCell({
            borders: headerCellBorder,
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            width: { size: dataColPct, type: WidthType.PERCENTAGE },
            children: [new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({
                    text: wsafe(label),
                    font: sans, size: S.tableHeader, bold: true,
                    color: C.black, characterSpacing: 30, allCaps: true,
                })],
            })],
        }));

        const wordHeaderRow = new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: headerCells,
        });

        const dataRows: TableRow[] = this.results.map((row, idx) => {
            const isEven = idx % 2 === 1;
            const shading = isEven
                ? { type: 'clear' as const, fill: C.zebra, color: 'auto' }
                : undefined;
            const cellOpts = {
                borders: innerCellBorder,
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                width: { size: dataColPct, type: WidthType.PERCENTAGE },
                shading,
            };
            const cells: TableCell[] = visibleCols.map((col) => {
                switch (col.hint) {
                    case 'Serial':
                        return new TableCell({
                            ...cellOpts,
                            children: [new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [new TextRun({
                                    text: String(idx + 1).padStart(3, '0'),
                                    font: mono, size: S.name, bold: true,
                                    color: C.gray, characterSpacing: 8,
                                })],
                            })],
                        });
                    case 'Status':
                        return new TableCell({
                            ...cellOpts,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(this.displayMemberStatus(row)),
                                    font: sans, size: S.body, bold: true, color: C.black,
                                })],
                            })],
                        });
                    case 'Date':
                        return new TableCell({
                            ...cellOpts,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(this.formatDate(row?.[col.key])),
                                    font: mono, size: S.body, color: C.black, characterSpacing: 4,
                                })],
                            })],
                        });
                    default: {
                        const v = row?.[col.key];
                        const text = v == null || v === '' ? '—' : String(v);
                        return new TableCell({
                            ...cellOpts,
                            children: [new Paragraph({
                                children: [new TextRun({
                                    text: wsafe(text),
                                    font: sans, size: S.body, color: C.black,
                                })],
                            })],
                        });
                    }
                }
            });
            return new TableRow({ cantSplit: true, children: cells });
        });

        const dataTable = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.AUTOFIT,
            rows: [wordHeaderRow, ...dataRows],
        });

        // ── Confidential footer ───────────────────────────────────────────
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
                                        text: 'CONFIDENTIAL',
                                        font: mono, size: S.footer, bold: true, color: C.black,
                                        characterSpacing: 30, allCaps: true,
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
                                            'PAGE ',
                                            PageNumber.CURRENT,
                                            ' OF ',
                                            PageNumber.TOTAL_PAGES,
                                        ],
                                        font: mono, size: S.footer, bold: true, color: C.black,
                                        characterSpacing: 24, allCaps: true,
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
        saveAs(blob, `dynamic-search_en.docx`);
    }

    /** Opens a new browser window with the formal RAB HTML and fires the print dialog. */
    private openRabPrintWindow(): void {
        const html = this.buildRabPrintHtml();
        const win = window.open('', '_blank', 'width=1200,height=900');
        if (!win) return;
        win.document.open();
        win.document.write(html);
        win.document.close();
        // ~700ms gives fonts + layout time to settle before the print
        // dialog opens; otherwise headings sometimes print in fallback fonts.
        setTimeout(() => {
            try { win.focus(); win.print(); }
            catch { /* print blocked — user can Ctrl+P from the open window */ }
        }, 700);
    }

    /**
     * Formal RAB print HTML — adapted from report-address-location with two
     * key differences:
     *   • No "report name" section (per user request — title block drops
     *     the .paper-section / .paper-section-sub).
     *   • Dynamic columns: cells render row[col.key] with hint-aware
     *     formatting for Serial / Status / Date; everything else is a
     *     generic Plain text cell. The Action column is excluded from
     *     export (interactive-only).
     */
    private buildRabPrintHtml(): string {
        const esc = (s: string) =>
            (s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        const serif = "'Times New Roman', serif";
        const sans  = "'Times New Roman', sans-serif";
        const mono  = "'JetBrains Mono', 'Consolas', 'Courier New', monospace";

        const visibleCols = this.visibleColumns.filter(c => c.hint !== 'Action' && c.hint !== 'Photo');
        const tableHeaderHtml = `<tr>${visibleCols
            .map((c) => `<th>${esc(c.labelEN)}</th>`)
            .join('')}</tr>`;

        const renderCell = (row: any, col: { key: string; hint: string }, idx: number): string => {
            switch (col.hint) {
                case 'Serial':
                    return `<td class="td-ser"><span class="ser">${esc(String(idx + 1).padStart(3, '0'))}</span></td>`;
                case 'Status':
                    return `<td class="td-status">${esc(this.displayMemberStatus(row))}</td>`;
                case 'Date':
                    return `<td>${esc(this.formatDate(row?.[col.key]))}</td>`;
                default: {
                    const v = row?.[col.key];
                    const text = v == null || v === '' ? '—' : String(v);
                    return `<td>${esc(text)}</td>`;
                }
            }
        };

        const tableBodyHtml = this.results
            .map((row, idx) => `<tr>${visibleCols.map((c) => renderCell(row, c, idx)).join('')}</tr>`)
            .join('');

        // Selection-criteria strip — surfaces the criteria the user actually
        // searched on. Empty when no fields were filled (search button is
        // disabled in that case anyway).
        const criteriaItems = this.buildExportCriteriaItems();
        const criteriaGridHtml = criteriaItems.length
            ? `<div class="criteria-grid">${criteriaItems
                  .map((item) => `
                <div class="cell">
                    <div class="cell-label">${esc(item.label)}</div>
                    <div class="cell-value">${esc(item.value)}</div>
                </div>`)
                  .join('')}</div>`
            : '';

        const confidential = 'CONFIDENTIAL';
        const warning = 'UNAUTHORIZED DISCLOSURE PROHIBITED';
        const generatedLabel = 'Generated';
        const generatedDate = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const cssStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Dynamic Search</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
    @page {
        /* No size rule — Chrome's print dialog hides the Layout
           (Portrait / Landscape) selector whenever @page declares a size,
           even without an orientation keyword. Margins only, so the user
           picks both paper size AND orientation from the dialog. */
        margin: 12mm 5mm 22mm 5mm;
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
        }
        @bottom-center {
            content: "PAGE " counter(page) " OF " counter(pages);
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
    .paper { padding: 4mm 8mm; }
    .paper-head { text-align: center; margin-bottom: 6mm; }
    .overline {
        font-size: 7.5pt; letter-spacing: 0.3em; color: #555;
        text-transform: uppercase; margin-bottom: 3mm; font-weight: 500;
    }
    .paper-title {
        font-family: ${serif};
        font-weight: 700; font-size: 22pt; margin: 0 0 2mm 0;
        letter-spacing: 0.12em; color: #0b0b0b;
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

    .criteria { margin: 5mm 0 6mm; border: 1px solid #d8d6d0; border-radius: 1mm; overflow: hidden; }
    .criteria-strip {
        display: flex; justify-content: space-between; align-items: center;
        padding: 1.5mm 3mm; background: #f4f4f2; border-bottom: 1px solid #d8d6d0;
        font-size: 8pt; letter-spacing: 0.2em; text-transform: uppercase;
        color: #4a4a4a; font-weight: 600;
    }
    .criteria-strip-title { display: inline-flex; gap: 1.5mm; align-items: center; color: #0b0b0b; }
    .diamond-bullet { color: #b78b3b; }
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
    .criteria-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr));
    }
    .cell { padding: 2mm 3mm; border-right: 1px solid #e6e4de; border-top: 1px solid #e6e4de; }
    .cell-label {
        font-size: 7pt; letter-spacing: 0.16em; text-transform: uppercase;
        color: #8a8a8a; margin-bottom: 1mm; font-weight: 600;
    }
    .cell-value {
        font-family: ${serif};
        font-size: 10pt; font-weight: 700; color: #0b0b0b; line-height: 1.2;
    }

    table {
        width: 100%; border-collapse: collapse; table-layout: auto;
        font-family: ${sans}; font-size: 8pt;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    thead th {
        background: #0b0b0b; color: #d9c79a;
        font-family: ${mono}; font-size: 6.5pt; font-weight: 600;
        letter-spacing: 0.15em; text-transform: uppercase;
        padding: 1.8mm 2mm; text-align: left; vertical-align: middle;
        white-space: nowrap; border: 1px solid rgba(11, 11, 11, 0.05);
    }
    tbody td {
        padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b;
        border: 1px solid rgba(11, 11, 11, 0.05); vertical-align: top;
        background: #ffffff;
        word-break: break-word;
        overflow-wrap: anywhere;
    }
    tbody tr:nth-child(even) td { background: #fafaf6; }
    tbody tr { page-break-inside: avoid; }
    .td-ser { white-space: nowrap; }
    .ser {
        font-family: ${mono}; font-size: 9pt; font-weight: 600;
        color: #6b6b6b; letter-spacing: 0.04em; white-space: nowrap;
    }
    .td-status { font-family: ${sans}; font-weight: 600; font-size: 9pt; white-space: nowrap; }
</style>
</head>
<body>
    <div class="paper">
        <header class="paper-head">
            <div class="overline">GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH</div>
            <h1 class="paper-title">RAPID ACTION BATTALION</h1>
            <div class="paper-sub"><em>Bangladesh Police &middot; Headquarters, Kurmitola, Dhaka</em></div>
            <div class="orn-divider">
                <span class="orn-line"></span>
                <span class="orn-diamond">&#9670;</span>
                <span class="orn-line"></span>
            </div>
        </header>

        <div class="criteria">
            <div class="criteria-strip">
                <span class="criteria-strip-title"><span class="diamond-bullet">&#9670;</span> SELECTION CRITERIA</span>
                <span class="criteria-strip-date">${esc(generatedLabel)} &middot; ${esc(generatedDate)}</span>
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

    /**
     * Selection-criteria items shown in the print header — surfaces each
     * filled-in search field's label + the picked value (or the typed
     * text). Empty fields are skipped.
     */
    private buildExportCriteriaItems(): { label: string; value: string }[] {
        const items: { label: string; value: string }[] = [];
        for (const field of this.selectedFields) {
            const cv = this.criteriaValues.get(field.fieldKey);
            if (!cv) continue;
            let value = '';
            if (field.fieldType === 'Text' && cv.textValue?.trim()) {
                value = cv.textValue.trim();
            } else if (field.fieldType === 'ExactId') {
                if (field.isStringId && cv.stringIdValue) {
                    value = cv.stringIdValue;
                } else if (!field.isStringId && cv.idValue != null) {
                    const opt = (field.options ?? []).find(o => o.value === cv.idValue);
                    value = opt?.label ?? String(cv.idValue);
                }
            } else if (field.fieldType === 'DateRange') {
                const from = cv.dateFrom ? this.formatDateOnly(cv.dateFrom) : '';
                const to   = cv.dateTo   ? this.formatDateOnly(cv.dateTo)   : '';
                value = [from, to].filter(Boolean).join(' to ');
            }
            if (value) items.push({ label: field.displayLabel, value });
        }
        if (this.selectedMemberStatus) {
            const opt = this.memberStatusOptions.find(o => o.value === this.selectedMemberStatus);
            if (opt) items.push({ label: 'Member Status', value: opt.label });
        }
        return items;
    }

    /**
     * Plain p-dialog state (matches emp-present-member-check's info-dialog
     * pattern). Shown when an identity-style search (RAB ID / Service ID /
     * NID) returns zero rows — the row almost certainly exists but the
     * caller can't reach it.
     */
    showAccessDeniedDialog = false;
    accessDeniedMessage = 'You do not have permission to view this employee. Either they are outside your accessible scope or no longer presently serving.';

    /** Cached accessible-member-type ids (loaded once at init). Null = not loaded yet. */
    private accessibleMemberTypeIds: Set<number> | null = null;

    /**
     * Underlying CodeIds for the synthetic N/A option per field. When the
     * user picks the collapsed "N/A" (value = -1), the backend pre-resolves
     * these on its own (see DynamicSearchQuery), but we keep the map for
     * potential FE-side filtering / display.
     */
    private naCodeIdsByField = new Map<string, number[]>();

    /** Original (full) option lists per field — captured the first time the
     *  field arrives from the backend, so a cascade-reset can restore them. */
    private originalOptionsByField = new Map<string, { label: string; value: any }[]>();

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // Fetch the caller's access-scope BEFORE the first search, so the
        // Member Status dropdown locks immediately on page load — same
        // pattern as /employee-reports. The search response also carries
        // the flag so it stays correct across category changes; this just
        // makes the lock visible without a search.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => {
                const locked = scope?.orgScopeRestricted === true;
                this.memberStatusLocked = locked;
                if (locked && this.selectedMemberStatus !== 'Servings') {
                    this.selectedMemberStatus = 'Servings';
                }
                // Strip the RAB Unit picker for org-scoped callers — picking
                // a unit outside their scope would silently return zero
                // rows. Also drop it from selectedFields if it was already
                // queued before the scope response landed.
                if (locked) this.applyScopeFieldRestrictions();
            },
            error: () => { /* silent — leave dropdown editable on failure */ },
        });

        // Pre-load the caller's accessible member-type ids. GetAccessibleMemberTypes
        // is server-side filtered: a scoped user gets only their allowed
        // EmployeeType rows; an admin (no member-type rows) gets all. We
        // overlay these onto the memberType field's options so the dropdown
        // mirrors what the user can actually search.
        this.commonCodeService.getAccessibleMemberTypes().subscribe({
            next: (rows) => {
                this.accessibleMemberTypeIds = new Set((rows ?? []).map((r: any) => r?.codeId ?? r?.CodeId ?? 0).filter(Boolean));
                this.applyMemberTypeRestriction();
            },
            error: () => { /* silent — leave dropdown unfiltered on failure */ },
        });

        this.loadFields();
    }

    ngOnDestroy(): void {
        this.clearRowPhotos();
    }

    /**
     * Cascade dependency wiring — when the parent field's value changes,
     * its dependent fields reload from a scoped endpoint. Called by the
     * template (onChange). Triggers a fresh option-list fetch for each
     * dependent and clears any stale picked value.
     */
    onCriterionIdChange(fieldKey: string): void {
        const cv = this.criteriaValues.get(fieldKey);
        if (fieldKey === 'motherOrg') {
            // Mother Org → narrow Corps + Rank (per-org MotherOrgRank), and
            // Trade (scoped to the org until a Corps is picked).
            // reloadCorpsByMotherOrg re-scopes Trade once the corps list
            // resolves, so we don't call reloadTradeForSelection here too.
            const orgId = cv?.idValue ?? null;
            this.reloadCorpsByMotherOrg(orgId);
            this.reloadRankByMotherOrg(orgId);
        } else if (fieldKey === 'corps') {
            // Corps → narrow Trade to the picked corps's children.
            this.reloadTradeForSelection();
        } else if (fieldKey === 'memberType') {
            // Member Type → re-filter the org's ranks (MotherOrgRank rows
            // carry parentCodeId = member-type id).
            this.applyRankMemberTypeFilter();
        }
    }

    private reloadCorpsByMotherOrg(orgId: number | null): void {
        const corpsField = this.availableFields.find(f => f.fieldKey === 'corps');
        if (!corpsField) return;
        // Restore the original full list when org is cleared.
        if (orgId == null || orgId <= 0) {
            const original = this.originalOptionsByField.get('corps');
            if (original) corpsField.options = original;
            this.clearStaleCriterionId('corps', corpsField.options);
            // Org cleared → drop the corps scope and re-scope Trade (falls
            // back to the full list since neither org nor corps is set).
            this.reloadTradeForSelection();
        } else {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').subscribe({
                next: (codes: any[]) => {
                    corpsField.options = this.collapseNa(codes, 'corps');
                    // Clear a now-invalid corps pick against the NARROWED list
                    // (must run after the async options arrive), then re-scope
                    // Trade — by corps if still valid, otherwise by the org.
                    this.clearStaleCriterionId('corps', corpsField.options);
                    this.reloadTradeForSelection();
                },
                error: () => {
                    corpsField.options = [];
                    this.clearStaleCriterionId('corps', corpsField.options);
                    this.reloadTradeForSelection();
                },
            });
        }
    }

    /** Raw MotherOrgRank rows for the currently-picked Mother Org (each row
     *  carries parentCodeId = member-type id). Cached so a Member Type change
     *  can re-filter without another round-trip. Empty when no org is picked. */
    private allRanksForOrg: any[] = [];

    private reloadRankByMotherOrg(orgId: number | null): void {
        const rankField = this.availableFields.find(f => f.fieldKey === 'rank');
        if (!rankField) return;
        if (orgId == null || orgId <= 0) {
            // Org cleared → drop the org-rank cache and restore the full list.
            this.allRanksForOrg = [];
            const original = this.originalOptionsByField.get('rank');
            if (original) rankField.options = original;
            this.clearStaleCriterionId('rank', rankField.options);
            return;
        }
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
            next: (codes: any[]) => {
                this.allRanksForOrg = Array.isArray(codes) ? codes : [];
                // Narrow further by the currently-selected Member Type.
                this.applyRankMemberTypeFilter();
            },
            error: () => {
                this.allRanksForOrg = [];
                rankField.options = [];
                this.clearStaleCriterionId('rank', rankField.options);
            },
        });
    }

    /**
     * Narrow the Rank options to the picked Member Type. MotherOrgRank rows
     * carry parentCodeId = member-type (EmployeeType) id, so once the org's
     * ranks are cached we filter them by the selected Member Type. Mirrors
     * serving-member-entry's applyRankMemberTypeFilter. With no org picked we
     * have no per-rank member-type key (the flat registry list omits it), so
     * the full list stays until an org is chosen.
     */
    private applyRankMemberTypeFilter(): void {
        const rankField = this.availableFields.find(f => f.fieldKey === 'rank');
        if (!rankField) return;
        if (this.allRanksForOrg.length === 0) {
            const original = this.originalOptionsByField.get('rank');
            if (original) rankField.options = original;
            this.clearStaleCriterionId('rank', rankField.options);
            return;
        }
        const memberType = this.criteriaValues.get('memberType')?.idValue ?? null;
        const source = (memberType != null && memberType > 0)
            ? this.allRanksForOrg.filter((r: any) => (r?.parentCodeId ?? r?.ParentCodeId) === memberType)
            : this.allRanksForOrg;
        rankField.options = source.map((c: any) => ({
            label: c?.codeValueEN ?? String(c?.codeId ?? ''),
            value: c?.codeId ?? 0,
        }));
        this.clearStaleCriterionId('rank', rankField.options);
    }

    /**
     * Scope the Trade options to the tightest active upstream selection:
     * the picked Corps (Trade.ParentCodeId) if one is set, else the picked
     * Mother Org (Trade.OrgId), else the full list. Trade CommonCodes carry
     * both keys, so either scope is a real subset. Any now-invalid Trade
     * pick is cleared against the resulting list.
     */
    private reloadTradeForSelection(): void {
        const tradeField = this.availableFields.find(f => f.fieldKey === 'trade');
        if (!tradeField) return;
        const corpsId = this.criteriaValues.get('corps')?.idValue ?? null;
        const orgId = this.criteriaValues.get('motherOrg')?.idValue ?? null;

        // Shared subscribe: collapse N/A + drop a now-invalid trade pick.
        const applyNarrowed = (obs: any) => obs.subscribe({
            next: (codes: any[]) => {
                tradeField.options = this.collapseNa(codes, 'trade');
                this.clearStaleCriterionId('trade', tradeField.options);
            },
            error: () => {
                tradeField.options = [];
                this.clearStaleCriterionId('trade', tradeField.options);
            },
        });

        if (corpsId != null && corpsId > 0) {
            // Tightest scope: trades whose parent is the picked corps.
            applyNarrowed(this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId));
        } else if (orgId != null && orgId > 0) {
            // No specific corps (or the collapsed N/A corps, id = -1) —
            // scope trades to the mother org.
            applyNarrowed(this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Trade'));
        } else {
            // Nothing upstream — restore the full list.
            const original = this.originalOptionsByField.get('trade');
            if (original) tradeField.options = original;
            this.clearStaleCriterionId('trade', tradeField.options);
        }
    }

    /** Collapse multiple "N/A" CommonCode rows into one synthetic option
     *  (value = -1). Mirrors the backend field-definitions handler. */
    private collapseNa(codes: any[], fieldKey: string): { label: string; value: any }[] {
        const list = Array.isArray(codes) ? codes : [];
        const naIds: number[] = [];
        const nonNa: { label: string; value: any }[] = [];
        for (const c of list) {
            const label = c?.codeValueEN ?? c?.CodeValueEN ?? '';
            const id = c?.codeId ?? c?.CodeId ?? 0;
            const trimmed = String(label).trim().toUpperCase();
            if (trimmed === 'N/A' || trimmed === 'NA') {
                naIds.push(id);
            } else {
                nonNa.push({ label, value: id });
            }
        }
        this.naCodeIdsByField.set(fieldKey, naIds);
        if (naIds.length > 0) nonNa.push({ label: 'N/A', value: -1 });
        return nonNa;
    }

    /** Drop the picked id from a dependent field when it's no longer in the new option set. */
    private clearStaleCriterionId(fieldKey: string, options: { value: any }[] | null | undefined): void {
        const cv = this.criteriaValues.get(fieldKey);
        if (cv?.idValue == null) return;
        const allowed = new Set((options ?? []).map(o => o.value));
        if (!allowed.has(cv.idValue)) cv.idValue = null;
    }

    /**
     * Replace the memberType field's options with only the ids the caller
     * can access. Called from both the fields-loaded and accessible-types-loaded
     * subscriptions so it works regardless of order. If the user already
     * picked a now-inaccessible member-type, clear it.
     */
    private applyMemberTypeRestriction(): void {
        if (this.accessibleMemberTypeIds == null) return;
        const allowedIds = this.accessibleMemberTypeIds;
        const memberTypeField = this.availableFields.find(f => f.fieldKey === 'memberType');
        if (memberTypeField?.options) {
            memberTypeField.options = memberTypeField.options.filter(o => allowedIds.has(o.value as number));
        }
        const cv = this.criteriaValues.get('memberType');
        if (cv?.idValue != null && !allowedIds.has(cv.idValue)) {
            cv.idValue = null;
        }
    }

    /** Org-scoped users can't meaningfully pick a RAB Unit — hide the field. */
    private applyScopeFieldRestrictions(): void {
        this.availableFields = this.availableFields.filter(f => f.fieldKey !== 'rabUnit');
        this.selectedFields = this.selectedFields.filter(f => f.fieldKey !== 'rabUnit');
        this.criteriaValues.delete('rabUnit');
    }

    onCategoryChange(): void {
        this.selectedFields = [];
        this.criteriaValues.clear();
        this.results = [];
        this.totalRecords = 0;
        this.first = 0;
        this.selectedMemberStatus = 'Servings';
        this.loadFields();
    }

    /**
     * Surface Mother Org / Rank / Corps / Trade / Home District at the top
     * of the Search Fields multiselect — they're the most commonly used and
     * have a cascade dependency, so listing them first reads naturally.
     * Any field not in PRIORITY_ORDER keeps the backend-registry order
     * after the priority block.
     */
    private static readonly FIELD_PRIORITY_ORDER = ['motherOrg', 'memberType', 'rank', 'corps', 'trade', 'permanentDistrict'];
    private reorderFields(fields: SearchFieldDefinition[]): SearchFieldDefinition[] {
        const priority = DynamicSearchComponent.FIELD_PRIORITY_ORDER;
        const byKey = new Map(fields.map(f => [f.fieldKey, f]));
        const head = priority.map(k => byKey.get(k)).filter((f): f is SearchFieldDefinition => f != null);
        const headKeys = new Set(head.map(f => f.fieldKey));
        const tail = fields.filter(f => !headKeys.has(f.fieldKey));
        return [...head, ...tail];
    }

    /**
     * Fields shown (pre-selected) by default on page load — the most
     * commonly used service filters. These are OPTIONAL: unlike fields the
     * user adds manually, leaving one of these empty does NOT trigger the
     * "fill the selected fields" validation in search(); an empty one is
     * simply dropped from the request (see loadResults()). Employee only.
     */
    private static readonly DEFAULT_FIELD_KEYS = ['motherOrg', 'memberType', 'rank', 'corps', 'trade', 'permanentDistrict'];

    /**
     * Pre-select the DEFAULT_FIELD_KEYS into selectedFields, merging (defaults
     * first) with anything already selected and de-duping. Uses the exact
     * field object references from availableFields so p-multiselect (reference
     * equality, no dataKey) renders them as ticked. Then wires up their
     * criterion values via onFieldsChange().
     */
    private applyDefaultFields(): void {
        if (this.selectedCategory !== 'Employee') return;
        const byKey = new Map(this.availableFields.map(f => [f.fieldKey, f]));
        const defaults = DynamicSearchComponent.DEFAULT_FIELD_KEYS
            .map(k => byKey.get(k))
            .filter((f): f is SearchFieldDefinition => f != null);
        const seen = new Set<string>();
        const merged: SearchFieldDefinition[] = [];
        for (const f of [...defaults, ...this.selectedFields]) {
            if (seen.has(f.fieldKey)) continue;
            seen.add(f.fieldKey);
            merged.push(f);
        }
        this.selectedFields = merged;
        this.onFieldsChange();
    }

    private loadFields(): void {
        this.searchService.getSearchFields(this.selectedCategory).subscribe({
            next: (fields) => {
                // Promote the most commonly searched org/rank fields to
                // the top of the picker — same order as the basic-info
                // form so users find them where they expect.
                this.availableFields = this.reorderFields(fields);
                // Snapshot Corps / Trade / Rank originals so a cascade reset
                // (parent cleared) can restore the full list without an
                // extra round-trip.
                this.originalOptionsByField.clear();
                for (const key of ['corps', 'trade', 'rank']) {
                    const f = fields.find(x => x.fieldKey === key);
                    if (f?.options) this.originalOptionsByField.set(key, [...f.options]);
                }
                // If the scope response already landed and the user is
                // org-scoped, re-apply the restriction to this fresh field
                // list. (loadFields can fire AFTER the scope subscribe.)
                if (this.memberStatusLocked) this.applyScopeFieldRestrictions();
                // Re-apply the member-type allowlist too — same race.
                this.applyMemberTypeRestriction();
                // Show the common service filters (Mother Org / Member Type /
                // Rank / Corps / Trade / Home District) pre-selected. They're
                // optional — an empty one won't block Search (see
                // DEFAULT_FIELD_KEYS).
                this.applyDefaultFields();
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to load search fields.' });
            }
        });
    }

    onFieldsChange(): void {
        // Initialize criterion values for newly selected fields
        for (const field of this.selectedFields) {
            if (!this.criteriaValues.has(field.fieldKey)) {
                this.criteriaValues.set(field.fieldKey, {
                    fieldKey: field.fieldKey,
                    textValue: '',
                    idValue: null,
                    stringIdValue: '',
                    dateFrom: null,
                    dateTo: null
                });
            }
        }
        // Remove deselected fields
        const selectedKeys = new Set(this.selectedFields.map(f => f.fieldKey));
        for (const key of this.criteriaValues.keys()) {
            if (!selectedKeys.has(key)) {
                this.criteriaValues.delete(key);
            }
        }
    }

    getCriterionValue(fieldKey: string): CriterionValue {
        return this.criteriaValues.get(fieldKey)!;
    }

    getFieldOptions(field: SearchFieldDefinition): { label: string; value: any }[] {
        return (field.options || []).map(o => ({ label: o.label, value: o.value }));
    }

    search(): void {
        // If the user picked search fields, they MUST fill each one — EXCEPT
        // the default service filters (Mother Org / Member Type / Rank /
        // Corps / Trade / Home District), which are pre-selected and optional:
        // an empty one is simply dropped from the request rather than blocking
        // Search.
        // Without this check, an empty (non-default) field is silently
        // dropped and the page returns an effectively unfiltered result set
        // — surprising and (with no upper bound on the FE side) potentially
        // huge.
        const empty = this.selectedFields.filter((f) =>
            !DynamicSearchComponent.DEFAULT_FIELD_KEYS.includes(f.fieldKey)
            && !this.hasCriterionValue(f));
        if (empty.length > 0) {
            const names = empty.map((f) => f.displayLabel).join(', ');
            this.messageService.add({
                severity: 'warn',
                summary: 'Fill the selected fields',
                detail: `Please enter a value for: ${names}. Otherwise remove them from the criteria.`,
                life: 5000,
            });
            return;
        }
        this.first = 0;
        this.hasSearched = true;
        this.loadResults();
    }

    /** Returns true when the user has typed/picked something into the given field's input. */
    private hasCriterionValue(field: SearchFieldDefinition): boolean {
        const cv = this.criteriaValues.get(field.fieldKey);
        if (!cv) return false;
        if (field.fieldType === 'Text') return !!cv.textValue?.trim();
        if (field.fieldType === 'ExactId') {
            return field.isStringId
                ? !!cv.stringIdValue
                : cv.idValue != null;
        }
        if (field.fieldType === 'DateRange') return !!cv.dateFrom || !!cv.dateTo;
        return false;
    }

    clearFilter(): void {
        this.selectedFields = [];
        this.criteriaValues.clear();
        this.results = [];
        this.totalRecords = 0;
        this.first = 0;
        this.hasSearched = false;
        // Keep the default service filters (Mother Org / Member Type / Rank /
        // Corps / Trade) on screen — Clear All wipes their values, not the
        // fields themselves. Restores fresh empty criterion values for them.
        this.applyDefaultFields();
    }

    onLazyLoad(event: TableLazyLoadEvent): void {
        if (!this.hasSearched) return;
        this.first = event.first ?? 0;
        this.rows = event.rows ?? 10;
        this.loadResults();
    }

    toggleFilter(): void {
        this.filterOpen = !this.filterOpen;
    }

    private loadResults(): void {
        this.loading = true;

        const criteria: DynamicSearchCriterion[] = [];
        for (const field of this.selectedFields) {
            const cv = this.criteriaValues.get(field.fieldKey);
            if (!cv) continue;

            const criterion: DynamicSearchCriterion = { fieldKey: field.fieldKey };
            let hasValue = false;

            if (field.fieldType === 'Text' && cv.textValue?.trim()) {
                criterion.textValue = cv.textValue.trim();
                hasValue = true;
            } else if (field.fieldType === 'ExactId') {
                if (field.isStringId && cv.stringIdValue) {
                    criterion.stringIdValue = cv.stringIdValue;
                    hasValue = true;
                } else if (!field.isStringId && cv.idValue != null) {
                    criterion.idValue = cv.idValue;
                    hasValue = true;
                }
            } else if (field.fieldType === 'DateRange') {
                if (cv.dateFrom) {
                    criterion.dateFrom = this.formatDateOnly(cv.dateFrom);
                    hasValue = true;
                }
                if (cv.dateTo) {
                    criterion.dateTo = this.formatDateOnly(cv.dateTo);
                    hasValue = true;
                }
            }

            if (hasValue) {
                criteria.push(criterion);
            }
        }

        const request: DynamicSearchRequest = {
            category: this.selectedCategory,
            pagination: {
                page_no: Math.floor(this.first / this.rows) + 1,
                row_per_page: this.rows
            },
            criteria,
            postingStatusFilter: this.isEmployee && this.selectedMemberStatus
                ? this.selectedMemberStatus
                : null
        };

        // Identity-style fields (RAB ID, Service ID, NID, Mobile No,
        // Passport No) are person-identifying — if the user searched by
        // one of these and got zero rows, the most likely cause is that
        // the member exists but falls outside the caller's access scope
        // (org-tree or member-type) or is no longer serving. Show the
        // access dialog instead of the silent empty state. Detect at
        // request-build time so we don't lose the criteria values when
        // the response lands.
        const IDENTITY_KEYS = new Set(['rabId', 'serviceId', 'nid', 'mobileNo', 'passportNo', 'email']);
        const identitySearched = criteria.some(c =>
            IDENTITY_KEYS.has(c.fieldKey) && !!c.textValue?.trim()
        );

        this.searchService.search(request).subscribe({
            next: (response) => {
                this.results = response.datalist || [];
                this.totalRecords = response.pages?.rows || 0;
                // Refresh row thumbnails for the new page — revoke the old
                // object URLs first, then lazily download this page's photos.
                this.clearRowPhotos();
                this.loadRowPhotos();
                // Lock state is set once at ngOnInit via getMyReportAccessScope()
                // — a user's access scope can't change mid-session, so the
                // search response is NOT used here. (Doing so would briefly
                // unlock the dropdown for a single render tick if the
                // backend ever omits the flag, e.g. before an API rebuild.)
                this.loading = false;
                if (identitySearched && this.totalRecords === 0) {
                    this.showAccessDeniedDialog = true;
                }
            },
            error: (err: any) => {
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Search failed.' });
                this.loading = false;
            }
        });
    }

    private formatDateOnly(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    formatDate(dateStr: string | null): string {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return dateStr;
        }
    }

    // Field grouping for Employee category (visual sections). Keep these
    // Sets exhaustive — any field key not listed here lands in the
    // "Other" catch-all so newly-registered fields render immediately
    // without the dev forgetting to assign a group.
    private readonly identifierKeys = new Set(['rabId', 'serviceId', 'nid']);
    private readonly personalKeys = new Set(['nameEnglish', 'nameBangla', 'prefix', 'mobileNo', 'email', 'dob', 'gender', 'bloodGroup', 'religion', 'maritalStatus', 'permanentDistrict']);
    private readonly serviceKeys = new Set([
        'rank', 'corps', 'trade', 'tradeRemarks', 'appointment', 'memberType',
        'motherOrg', 'motherUnit', 'rabUnit', 'location',
        'joiningDate', 'commissionDate', 'dateOfJoinService',
        'rabServiceFrom', 'rabServiceTo'
    ]);

    get groupedFields(): { label: string; fields: SearchFieldDefinition[] }[] {
        if (this.selectedCategory !== 'Employee') {
            return this.selectedFields.length > 0
                ? [{ label: '', fields: this.selectedFields }]
                : [];
        }
        const groups: { label: string; fields: SearchFieldDefinition[] }[] = [];
        const ids = this.selectedFields.filter(f => this.identifierKeys.has(f.fieldKey));
        const personal = this.selectedFields.filter(f => this.personalKeys.has(f.fieldKey));
        const service = this.selectedFields.filter(f => this.serviceKeys.has(f.fieldKey));
        const other = this.selectedFields.filter(f =>
            !this.identifierKeys.has(f.fieldKey)
            && !this.personalKeys.has(f.fieldKey)
            && !this.serviceKeys.has(f.fieldKey));
        if (ids.length > 0) groups.push({ label: 'Identification', fields: ids });
        if (personal.length > 0) groups.push({ label: 'Personal Information', fields: personal });
        if (service.length > 0) groups.push({ label: 'Service Information', fields: service });
        if (other.length > 0) groups.push({ label: 'Other', fields: other });
        return groups;
    }

    // Employee result columns
    get isEmployee(): boolean {
        return this.selectedCategory === 'Employee';
    }

    get isOffice(): boolean {
        return this.selectedCategory === 'OfficeManagement';
    }
}
