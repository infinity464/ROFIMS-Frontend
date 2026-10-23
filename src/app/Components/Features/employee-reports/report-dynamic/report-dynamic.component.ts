import { Component, OnInit } from '@angular/core';
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
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import type {
    DynamicReportFieldMeta,
    DynamicReportRow,
    DynamicReportCriterion,
    DynamicReportAccessibleScope,
} from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';
import {
    codeValue,
    displayNum,
    paddedSer,
    personnelMeta,
    addressCrumbParts,
    addressDetail,
} from '../formal-rab-render.helper';

interface ColumnPick {
    /** Field key from the registry. */
    key: string;
    /** Lang-aware display label (resolved at view time, not stored). */
    label: string;
    labelEn: string;
    labelBn: string;
    /** Render hint copied from the registry. */
    hint: string;
    /** For composites: the atomic field keys that need to be in the projection. */
    underlying?: string[] | null;
}

@Component({
    selector: 'app-report-dynamic',
    standalone: true,
    imports: [
        CommonModule, FormsModule, TableModule, ButtonModule,
        SelectModule, MultiSelectModule, PaginatorModule, Toast,
    ],
    providers: [MessageService],
    templateUrl: './report-dynamic.component.html',
    styleUrls: ['../report-theme.scss', '../report-card-mtr.scss', './report-dynamic.component.scss'],
})
export class ReportDynamicComponent implements OnInit {
    L = REPORT_LABELS;
    lang: ReportLang = 'en';

    // ── Field catalog ────────────────────────────────────────────────────
    /** All fields from the backend registry, sorted by SortOrder. */
    allFields: DynamicReportFieldMeta[] = [];
    /** MultiSelect options — visible to the user as "available columns". */
    columnPickerOptions: { label: string; value: string; group?: string }[] = [];
    /** Currently-selected field keys (driven by p-multiSelect). */
    selectedColumnKeys: string[] = [];

    // ── Filter state (the 7 defaults from the screenshot) ────────────────
    addressOwnerOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Self (Member)', labelBn: 'নিজ (সদস্য)', value: 'Self' },
    ];
    selectedAddressOwner = 'Self';

    locationTypeOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Permanent Address', labelBn: 'স্থায়ী ঠিকানা', value: 'Permanent' },
        { label: 'Present Address', labelBn: 'বর্তমান ঠিকানা', value: 'Present' },
    ];
    selectedLocationType = 'Present';

    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
        { label: 'Supernumerary', labelBn: 'সুপারনিউমারারি', value: 'Supernumerary' },
    ];
    selectedPostingStatus = 'Servings';

    divisionOptions: { label: string; labelBn: string; value: number }[] = [];
    districtOptions: { label: string; labelBn: string; value: number }[] = [];
    upazilaOptions: { label: string; labelBn: string; value: number }[] = [];
    postOfficeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedDivisionId: number | null = null;
    selectedDistrictId: number | null = null;
    selectedUpazilaId: number | null = null;
    selectedPostOfficeId: number | null = null;

    activeOnly = true;

    // ── Data state ───────────────────────────────────────────────────────
    list: DynamicReportRow[] = [];
    loading = false;
    searched = false;
    first = 0;
    rows = 1000;
    totalRecords = 0;
    accessibleScope: DynamicReportAccessibleScope | null = null;
    filterOpen = true;

    constructor(
        private reportService: ReportService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
    ) {}

    // ── Lifecycle ────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.loadFields();
        this.loadDivisions();
        this.loadRelationshipOptions();
    }

    private loadFields(): void {
        this.reportService.getDynamicReportFields().subscribe({
            next: (fields) => {
                this.allFields = (fields ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
                this.columnPickerOptions = this.allFields.map((f) => ({
                    label: f.displayLabel,
                    value: f.fieldKey,
                    group: f.group,
                }));
                // Initialize selected columns from registry defaults.
                this.selectedColumnKeys = this.allFields
                    .filter((f) => f.defaultVisible)
                    .map((f) => f.fieldKey);
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error', summary: 'Error',
                    detail: 'Failed to load field catalog',
                });
            },
        });
    }

    private loadDivisions(): void {
        this.commonCodeService.getAllActiveCommonCodesType('Division').subscribe({
            next: (codes: CommonCodeModel[]) =>
                (this.divisionOptions = (codes || []).map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }))),
            error: () => (this.divisionOptions = []),
        });
    }

    /** Relationship CommonCodes appended to the AddressOwner dropdown. */
    private loadRelationshipOptions(): void {
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
            error: () => {},
        });
    }

    // ── Cascading geo dropdowns ──────────────────────────────────────────

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
                error: () => (this.districtOptions = []),
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
                error: () => (this.upazilaOptions = []),
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
                error: () => (this.postOfficeOptions = []),
            });
        }
    }

    // ── Search / Clear ───────────────────────────────────────────────────

    load(): void {
        this.searched = true;
        this.loading = true;
        const page_no = Math.floor(this.first / this.rows) + 1;

        const criteria: DynamicReportCriterion[] = [];
        if (this.selectedDivisionId != null) {
            criteria.push({ fieldKey: 'division', idValue: this.selectedDivisionId });
        }
        if (this.selectedDistrictId != null) {
            criteria.push({ fieldKey: 'district', idValue: this.selectedDistrictId });
        }
        if (this.selectedUpazilaId != null) {
            criteria.push({ fieldKey: 'upazila', idValue: this.selectedUpazilaId });
        }
        if (this.selectedPostOfficeId != null) {
            criteria.push({ fieldKey: 'postOffice', idValue: this.selectedPostOfficeId });
        }

        this.reportService.runDynamicReport({
            columns: this.selectedColumnKeys,
            criteria,
            postingStatusFilter: this.selectedPostingStatus || null,
            locationTypeFilter: this.selectedLocationType || null,
            addressOwnerFilter: this.selectedAddressOwner || null,
            activeOnly: this.activeOnly,
            pagination: { page_no, row_per_page: this.rows },
        }).subscribe({
            next: (res) => {
                this.list = res.datalist ?? [];
                this.totalRecords = res.pages?.Rows ?? res.pages?.rows ?? 0;
                this.accessibleScope = res.accessibleScope ?? null;
                if (this.accessibleScope?.orgScopeRestricted && this.selectedPostingStatus !== 'Servings') {
                    this.selectedPostingStatus = 'Servings';
                }
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({
                    severity: 'error', summary: 'Error',
                    detail: err?.error?.message || 'Failed to load report',
                });
                this.loading = false;
            },
        });
    }

    onPage(event: { first?: number; rows?: number }): void {
        this.first = event.first ?? 0;
        this.rows = event.rows ?? this.rows;
        this.load();
    }

    clearFilters(): void {
        this.selectedAddressOwner = 'Self';
        this.selectedLocationType = 'Present';
        this.selectedPostingStatus = 'Servings';
        this.selectedDivisionId = null;
        this.selectedDistrictId = null;
        this.selectedUpazilaId = null;
        this.selectedPostOfficeId = null;
        this.activeOnly = true;
        this.districtOptions = [];
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
        this.first = 0;
    }

    toggleFilter(): void { this.filterOpen = !this.filterOpen; }

    get activeFilterCount(): number {
        let c = 0;
        if (this.selectedAddressOwner) c++;
        if (this.selectedLocationType) c++;
        if (this.selectedPostingStatus) c++;
        if (this.selectedDivisionId != null) c++;
        if (this.selectedDistrictId != null) c++;
        if (this.selectedUpazilaId != null) c++;
        if (this.selectedPostOfficeId != null) c++;
        return c;
    }

    get statusLocked(): boolean {
        return this.accessibleScope?.orgScopeRestricted === true;
    }

    get rowsPerPageOptions(): number[] {
        const base = [100, 500, 1000, 5000];
        const t = this.totalRecords;
        if (t > 0 && t > base[base.length - 1] && !base.includes(t)) {
            return [...base, t];
        }
        return base;
    }

    // ── Column metadata + cell rendering ─────────────────────────────────

    /** Resolved column picks in user-selected order. Drives the table header
        and cell renderer switch. */
    get visibleColumns(): ColumnPick[] {
        if (!this.allFields.length) return [];
        const fieldMap = new Map(this.allFields.map((f) => [f.fieldKey, f]));
        return this.selectedColumnKeys
            .map((k) => fieldMap.get(k))
            .filter((f): f is DynamicReportFieldMeta => f != null)
            .map((f) => ({
                key: f.fieldKey,
                label: this.lang === 'bn' ? f.displayLabelBN : f.displayLabel,
                labelEn: f.displayLabel,
                labelBn: f.displayLabelBN,
                hint: f.renderHint || 'Plain',
                underlying: f.underlyingFields,
            }));
    }

    /** SER renderer — row position + paged offset. Matches paddedSer behaviour. */
    serValue(rowIndex: number): string {
        return paddedSer(this.first + rowIndex + 1, this.lang);
    }

    /** Resolve a plain (non-composite) cell value with bilingual fallback. */
    plainCell(row: DynamicReportRow, key: string): string {
        const bnKey = key + 'BN';
        const en = row[key];
        const bn = row[bnKey];
        if (this.lang === 'bn' && typeof bn === 'string' && bn.trim() !== '') return bn.trim();
        if (typeof en === 'string') return en;
        if (en == null) return '—';
        if (typeof en === 'number') return displayNum(en, this.lang);
        if (typeof en === 'boolean') return en ? '✓' : '—';
        return String(en);
    }

    /** Composite Personnel — name + meta line. The dynamic row shape maps
        underlying field keys (camelCase) onto the helper's loose row interface. */
    personnelName(row: DynamicReportRow): string {
        return codeValue(row['nameEnglish'] as string, row['nameBangla'] as string, this.lang);
    }

    personnelMetaLine(row: DynamicReportRow): string {
        return personnelMeta({
            rank: row['armyRank'] as string,
            rankBN: row['armyRankBN'] as string,
            orgName: row['motherOrganization'] as string,
            orgNameBN: row['motherOrganizationBN'] as string,
            serviceId: row['serviceId'] as string,
        }, this.lang);
    }

    addressCrumbsFor(row: DynamicReportRow): { label: string; value: string }[] {
        return addressCrumbParts({
            division: row['division'] as string,
            divisionBN: row['divisionBN'] as string,
            district: row['district'] as string,
            districtBN: row['districtBN'] as string,
            upazila: row['upazila'] as string,
            upazilaBN: row['upazilaBN'] as string,
        }, this.lang);
    }

    addressDetailFor(row: DynamicReportRow): string {
        return addressDetail({
            postOffice: row['postOffice'] as string,
            postOfficeBN: row['postOfficeBN'] as string,
            address: this.buildAddressDetail(row),
            addressBN: this.buildAddressDetail(row, true),
        }, this.lang);
    }

    /** "house/road, area, postcode" joined — the view doesn't pre-concat these. */
    private buildAddressDetail(row: DynamicReportRow, bn = false): string {
        const parts = [
            row['houseRoad'] as string,
            (bn ? row['addressAreaBN'] : row['addressAreaEN']) as string,
            row['postCode'] as string,
        ].filter((s) => s && String(s).trim() !== '');
        return parts.join(', ');
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
    }
}
