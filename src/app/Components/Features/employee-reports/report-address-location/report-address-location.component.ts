import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ReportService } from '@/services/report.service';
import { CommonCodeService } from '@/services/common-code-service';
import { ExportService } from '@/services/export.service';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { AddressLocationReportRow } from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-report-address-location',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, Toast],
    providers: [MessageService],
    templateUrl: './report-address-location.component.html',
    styleUrls: ['./report-address-location.component.scss', '../report-theme.scss'],
})
export class ReportAddressLocationComponent implements OnInit {
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

    /** Separate search fields */
    searchRabId: string = '';
    searchServiceId: string = '';
    searchNid: string = '';

    /** Address Owner filter: "Self", relationship CodeId as string, or empty for all */
    addressOwnerOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All', labelBn: 'সকল', value: '' },
        { label: 'Self (Employee)', labelBn: 'নিজ (কর্মচারী)', value: 'Self' },
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

    list: AddressLocationReportRow[] = [];
    loading = false;
    searched = false;
    first = 0;
    rows = 20;
    totalRecords = 0;

    exportDropdownOpen = false;
    exporting = false;
    appliedFilterLines: string[] = [];

    constructor(
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
        const { columns, rows } = this.getExportData();
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            filterLines: this.appliedFilterLines,
        };
        if (type === 'pdf') {
            this.exporting = true;
            try { await this.exportService.generatePDF(config); } finally { this.exporting = false; }
        } else if (type === 'print') {
            this.exportService.exportPDF(config);
        } else if (type === 'word') {
            await this.exportService.exportWord(config);
        } else {
            this.exportService.exportExcel(config);
        }
    }

    ngOnInit(): void {
        this.loadDivisions();
        this.loadRelationshipOptions();
    }

    loadDivisions(): void {
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
                    { label: 'Self (Employee)', labelBn: 'নিজ (কর্মচারী)', value: 'Self' },
                    ...relOptions,
                ];
            },
            error: () => {},
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

    onPostOfficeChange(): void {}

    filterOpen = true;

    get activeFilterCount(): number {
        let c = 0;
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

    filterSubtitle(): string {
        const L = this.L['en'];
        if (this.activeFilterCount === 0) return L['report.search.panelSubtitle'];
        const n = this.lang === 'bn' ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' ' + L['report.search.panelSubtitleApplied'];
    }

    clearFilters(): void {
        this.searchRabId = '';
        this.searchServiceId = '';
        this.searchNid = '';
        this.selectedAddressOwner = 'Self';
        this.selectedLocationType = 'Present';
        this.selectedDivisionId = null;
        this.selectedDistrictId = null;
        this.selectedUpazilaId = null;
        this.selectedPostOfficeId = null;
        this.selectedPostingStatus = 'Servings';
        this.activeOnly = true;
        this.districtOptions = [];
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
        this.first = 0;
    }

    onPage(event: { first: number; rows: number }): void {
        this.first = event.first;
        this.rows = event.rows;
        this.load();
    }

    toggleLang(): void {
        this.lang = this.lang === 'en' ? 'bn' : 'en';
        this.appliedFilterLines = this.buildFilterLines();
    }

    load(): void {
        this.searched = true;
        this.loading = true;
        this.appliedFilterLines = this.buildFilterLines();
        const page_no = Math.floor(this.first / this.rows) + 1;
        this.reportService
            .getAddressLocationReport({
                divisionId: this.selectedDivisionId ?? undefined,
                districtId: this.selectedDistrictId ?? undefined,
                upazilaId: this.selectedUpazilaId ?? undefined,
                postOfficeId: this.selectedPostOfficeId ?? undefined,
                postingStatus: this.selectedPostingStatus || undefined,
                rabId: this.searchRabId.trim() || undefined,
                serviceId: this.searchServiceId.trim() || undefined,
                nid: this.searchNid.trim() || undefined,
                activeOnly: this.activeOnly,
                locationType: this.selectedLocationType || undefined,
                addressOwner: this.selectedAddressOwner || undefined,
                pagination: { page_no, row_per_page: this.rows },
            })
            .subscribe({
                next: (res) => {
                    this.list = res.datalist ?? [];
                    this.totalRecords = res.pages?.rows ?? 0;
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

    displayNum(v: number | string | null | undefined): string {
        if (v == null || v === '') return '-';
        const s = String(v);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    codeValue(enVal: string | null | undefined, bnVal: string | null | undefined): string {
        if (this.lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
        return enVal ?? bnVal ?? '—';
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
