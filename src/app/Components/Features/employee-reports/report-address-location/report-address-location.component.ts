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

    /** "CPL · ARMY · SVC 4045260" — sub-meta line under the personnel name.
        The space between "SVC" and the service id is a non-breaking space
        (U+00A0) so they always render on the same line, even when the cell
        is narrow enough to wrap the rest of the meta string. */
    personnelMeta(row: AddressLocationReportRow): string {
        const rank = this.codeValue(row.rank, row.rankBN);
        const org = this.codeValue(row.orgName, row.orgNameBN);
        const svcId = row.serviceId != null && row.serviceId !== '' ? this.displayNum(row.serviceId) : '';
        const svc = svcId && svcId !== '-' ? (this.lang === 'bn' ? `সার্ভিস ${svcId}` : `SVC ${svcId}`) : '';
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

        // Excel stays on the flat tabular export — spreadsheets are for the
        // data shape, not the formal document presentation.
        const { columns, rows } = this.getExportData();
        const preDate: string[] = [];
        if (this.unitScopeLine) preDate.push(this.unitScopeLine);
        const belowDate: string[] = [];
        if (this.memberTypeScopeLine) belowDate.push(this.memberTypeScopeLine);
        this.exportService.exportExcel({
            title: this.reportTitle,
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            preDateLines: preDate,
            filterLines: [...belowDate, ...this.appliedFilterLines],
        });
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

        const h = this.rabHeaders;
        const cols: string[] = [h.ser, h.personnel, h.rabId];
        if (this.showAddressOwner) cols.push(h.addressOwner);
        cols.push(h.locationType, h.address, h.remarks);
        const tableHeaderHtml = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;

        const tableBodyHtml = this.list
            .map((row) => {
                const ser = this.paddedSer(row.ser);
                const name = this.codeValue(row.name, row.nameBN);
                const meta = this.personnelMeta(row);
                const rabId = row.rabid || '—';
                const owner = this.codeValue(row.addressOwner, row.addressOwnerBN);
                const locType = this.displayLocationTypeUpper(row.locationType);
                const isPerm = this.isPermanent(row.locationType);
                const crumbs = this.addressCrumbParts(row);
                const detail = this.addressDetail(row);
                // Remarks is intentionally blank when absent — em-dash would
                // imply "intentionally empty" but the column is just optional.
                const remarks = row.rmks || '';

                const crumbHtml = crumbs
                    .map(
                        (p, i) =>
                            `<span class="addr-part"><span class="addr-label">${esc(p.label)}:</span> <span class="addr-value">${esc(p.value)}</span></span>` +
                            (i < crumbs.length - 1 ? '<span class="addr-sep">&rsaquo;</span>' : ''),
                    )
                    .join(' ');

                const ownerCell = this.showAddressOwner ? `<td class="td-owner">${esc(owner)}</td>` : '';

                return `<tr>
                    <td class="td-ser"><span class="ser">${esc(ser)}</span></td>
                    <td class="td-personnel">
                        <div class="name">${esc(name)}</div>
                        <div class="meta">${esc(meta)}</div>
                    </td>
                    <td class="td-rabid">${esc(rabId)}</td>
                    ${ownerCell}
                    <td class="td-loctype">
                        <span class="loc-icon${isPerm ? ' filled' : ''}"></span>
                        <span class="loc-text">${esc(locType)}</span>
                    </td>
                    <td class="td-address">
                        <div class="addr-crumb">${crumbHtml}</div>
                        ${detail ? `<div class="addr-detail">${esc(detail)}</div>` : ''}
                    </td>
                    <td class="td-remarks">${esc(remarks)}</td>
                </tr>`;
            })
            .join('');

        const criteriaGridHtml = this.criteriaItems.length
            ? `<div class="criteria-grid">${this.criteriaItems
                  .map(
                      (item) => `
                <div class="cell">
                    <div class="cell-label">${esc(item.label)}</div>
                    <div class="cell-value">${esc(item.value)}</div>
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
        size: A4 portrait;
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
            font-size: 7.5pt;
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
            font-size: 7.5pt;
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
            font-size: 7.5pt;
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
    .criteria-strip-date { opacity: 0.75; font-weight: 500; }
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
        white-space: nowrap; border: 1px solid #0b0b0b;
        ${isBn ? 'letter-spacing:0.04em;font-family:' + sans + ';' : ''}
    }
    tbody td {
        padding: 2mm 2mm; font-size: 8pt; color: #0b0b0b;
        border-bottom: 1px solid #ece6d4; vertical-align: top;
        background: #ffffff;
        word-break: break-word;
        overflow-wrap: anywhere;
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
    .meta {
        margin-top: 0.5mm; font-family: ${mono}; font-size: 7.5pt;
        letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b;
        ${isBn ? 'letter-spacing:0;text-transform:none;font-family:' + sans + ';' : ''}
    }
    .td-rabid { font-family: ${mono}; letter-spacing: 0.02em; white-space: nowrap; }
    .td-owner {
        font-family: ${sans}; font-weight: 600; font-size: 10pt;
        color: #0b0b0b; letter-spacing: -0.005em;
    }
    .loc-icon {
        display: inline-block; width: 2.5mm; height: 2.5mm;
        border-radius: 0.3mm; vertical-align: middle; margin-right: 1.5mm;
        background: #d9b876; border: 1px solid #d9b876;
    }
    .loc-icon.filled { background: #0b0b0b; border-color: #0b0b0b; }
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
                <span class="criteria-strip-date">${generatedLabel} &middot; ${generatedDate}</span>
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

    /** Word export — formal RAB layout. Mirrors the on-screen document structure
        with a title block, selection-criteria table, and the composite-cell
        data table. Falls back to the shared exportService for the docx packing. */
    private async exportRabWord(): Promise<void> {
        const { columns, rows } = this.getExportData();
        const preDate: string[] = [];
        if (this.unitScopeLine) preDate.push(this.unitScopeLine);
        const belowDate: string[] = [];
        if (this.memberTypeScopeLine) belowDate.push(this.memberTypeScopeLine);
        // Add the selection-criteria lines (key: value) into filterLines so the
        // Word output carries the same scope info the print HTML shows in the
        // criteria strip. Order: org-scope (preDate) → status → criteria.
        const criteriaLines = this.criteriaItems.map((c) => `${c.label}: ${c.value}`);
        await this.exportService.exportWord({
            title: this.rabSectionTitle + (this.rabSubtitleText ? ` — ${this.rabSubtitleText}` : ''),
            lang: this.lang,
            columns,
            rows,
            showPageNumbers: true,
            landscape: true,
            preDateLines: preDate,
            filterLines: [...belowDate, ...criteriaLines],
        });
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
