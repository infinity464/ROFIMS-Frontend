import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
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
import type { AddressLocationReportRow, ReportAccessibleScope } from '@/models/report.model';
import type { CommonCodeModel } from '@/models/common-code-model';

@Component({
    selector: 'app-report-address-location',
    standalone: true,
    imports: [CommonModule, FormsModule, TableModule, ButtonModule, SelectModule, InputTextModule, PaginatorModule, Toast],
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

    /** Show the Address Owner column whenever the filter is something OTHER than
        "Self" — when the user is looking at "All" or a specific relationship, the
        owner identity is the whole point of the column. With "Self" selected,
        every row would say the same thing, so the column is dead weight. */
    get showAddressOwner(): boolean {
        return this.selectedAddressOwner !== 'Self';
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
        if (n == null || n === '') return '—';
        const padded = String(n).padStart(2, '0');
        return this.lang === 'bn' ? BanglaNumerals.toBangla(padded) : padded;
    }

    /** True for Permanent / SpousePermanent — drives the filled-square icon. */
    isPermanent(loc: string | null | undefined): boolean {
        if (!loc) return false;
        return loc === 'Permanent' || loc === 'SpousePermanent';
    }

    displayLocationTypeUpper(val: string | null | undefined): string {
        return this.displayLocationType(val).toUpperCase();
    }

    /** "CPL · ARMY · SVC 4045260" — sub-meta line under the personnel name. */
    personnelMeta(row: AddressLocationReportRow): string {
        const rank = this.codeValue(row.rank, row.rankBN);
        const org = this.codeValue(row.orgName, row.orgNameBN);
        const svcId = row.serviceId != null && row.serviceId !== '' ? this.displayNum(row.serviceId) : '';
        const svc = svcId && svcId !== '-' ? (this.lang === 'bn' ? `সার্ভিস ${svcId}` : `SVC ${svcId}`) : '';
        return [rank, org, svc].filter((s) => s && s !== '—' && s !== '-').join(' · ');
    }

    /** Geographic crumbs — each part labelled (Division/District/Upazila) so a
        reader can see what the value names without inferring from position alone. */
    addressCrumbParts(row: AddressLocationReportRow): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const parts = [
            { label: bn ? 'বিভাগ' : 'Division', value: this.codeValue(row.division, row.divisionBN) },
            { label: bn ? 'জেলা' : 'District', value: this.codeValue(row.district, row.districtBN) },
            { label: bn ? 'উপজেলা' : 'Upazila', value: this.codeValue(row.upazila, row.upazilaBN) },
        ];
        return parts.filter((p) => p.value && p.value !== '—');
    }

    /** "P.O. Bishnapur · Holding 54, Kholla, 3413" — second address line. */
    addressDetail(row: AddressLocationReportRow): string {
        const po = this.codeValue(row.postOffice, row.postOfficeBN);
        const addr = this.codeValue(row.address, row.addressBN);
        const parts: string[] = [];
        if (po && po !== '—') {
            parts.push(this.lang === 'bn' ? `ডাকঘর ${po}` : `P.O. ${po}`);
        }
        if (addr && addr !== '—') parts.push(addr);
        return parts.join(' · ');
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
        // Unit picks render ABOVE the date via preDateLines so the org context
        // sits next to the title (matches the on-screen header). Member-type
        // restrictions stay with the other applied filters under the date.
        const preDate: string[] = [];
        if (this.unitScopeLine) preDate.push(this.unitScopeLine);
        const belowDate: string[] = [];
        if (this.memberTypeScopeLine) belowDate.push(this.memberTypeScopeLine);
        const config = {
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            // 15 visible columns (16 with RAB Unit on Servings) — portrait clips.
            landscape: true,
            preDateLines: preDate,
            filterLines: [...belowDate, ...this.appliedFilterLines],
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
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

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
        // 'Servings' is also the locked value when the user is org-scope-restricted,
        // so this default is safe in both modes.
        this.selectedPostingStatus = 'Servings';
        this.activeOnly = true;
        this.districtOptions = [];
        this.upazilaOptions = [];
        this.postOfficeOptions = [];
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
                    this.accessibleScope = res.accessibleScope ?? null;
                    // Mirror the backend's enforced status when the caller's org
                    // scope is restricted — keeps the UI honest (any value other
                    // than "Servings" would silently be overridden server-side).
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
