import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ReportMemberAppointmentComponent } from './report-member-appointment/report-member-appointment.component';
import { ReportBatchCourseComponent } from './report-batch-course/report-batch-course.component';
import { ReportEducationComponent } from './report-education/report-education.component';
import { ReportMotherOrgComponent } from './report-mother-org/report-mother-org.component';
import { ReportOfficerTypeComponent } from './report-officer-type/report-officer-type.component';
import { ReportRabUnitComponent } from './report-rab-unit/report-rab-unit.component';
import { ReportBloodGroupComponent } from './report-blood-group/report-blood-group.component';
import { ReportPersonalQualificationComponent } from './report-personal-qualification/report-personal-qualification.component';
import { ReportProfessionalQualificationComponent } from './report-professional-qualification/report-professional-qualification.component';
import { ReportSpecialQualificationComponent } from './report-special-qualification/report-special-qualification.component';
import { ReportRabRankComponent } from './report-rab-rank/report-rab-rank.component';
import { ReportCorpsComponent } from './report-corps/report-corps.component';
import { ReportTradeComponent } from './report-trade/report-trade.component';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { REPORT_LABELS, type ReportLang } from '@/Core/i18n/report-labels';
import { CommonCodeService } from '@/services/common-code-service';
import { ReportService } from '@/services/report.service';
import { UserMenuService } from '@/services/user-menu.service';
import type { CommonCodeModel } from '@/models/common-code-model';
import type { MotherOrganizationModel } from '@/models/mother-org-model';
import type { ReportAccessibleScope } from '@/models/report.model';

export type ReportType =
    | 'memberAppointment'
    | 'batchCourse'
    | 'education'
    | 'motherOrg'
    | 'officerType'
    | 'rabUnit'
    | 'bloodGroup'
    | 'personalQualification'
    | 'professionalQualification'
    | 'specialQualification'
    | 'rabRank'
    | 'corps'
    | 'trade'
    | 'decoration';

/** Sentinel value for the synthetic "N/A" option that collapses every CommonCode row whose label normalises to N/A. */
const NA_SENTINEL_VALUE = -1;

/** Treat "N/A", "NA", "n/a", whitespace as the same bucket. */
function isNALabel(s: string | null | undefined): boolean {
    if (s == null) return false;
    const t = s.trim().toUpperCase();
    return t === 'N/A' || t === 'NA';
}

/** Common code type name per report type (for dropdown options). */
const COMMON_CODE_TYPE_BY_REPORT: Record<ReportType, string> = {
    memberAppointment: 'AppointmentCategory',
    batchCourse: 'CourseName',
    education: 'EducationQualification',
    motherOrg: 'MotherOrg',
    officerType: 'OfficerType',
    rabUnit: 'RabUnit',
    bloodGroup: '', // Blood Group options are hardcoded standard values, not a CommonCode type.
    personalQualification: 'PersonalQualification',
    professionalQualification: 'ProfessionalQualification',
    specialQualification: 'SpecialQualification',
    rabRank: 'EquivalentName',
    corps: 'Corps',
    trade: 'Trade',
    decoration: 'Decoration',
};

/**
 * Standard blood group dropdown options. Stored as free-text strings on PersonalInfo.BloodGroup,
 * so the parent passes the literal string value to the child via commonCodeLabel.
 */
const BLOOD_GROUP_OPTIONS: { label: string; labelBn: string; value: number }[] = [
    { label: 'A+',  labelBn: 'A+',  value: 1 },
    { label: 'A-',  labelBn: 'A-',  value: 2 },
    { label: 'B+',  labelBn: 'B+',  value: 3 },
    { label: 'B-',  labelBn: 'B-',  value: 4 },
    { label: 'O+',  labelBn: 'O+',  value: 5 },
    { label: 'O-',  labelBn: 'O-',  value: 6 },
    { label: 'AB+', labelBn: 'AB+', value: 7 },
    { label: 'AB-', labelBn: 'AB-', value: 8 },
];

@Component({
    selector: 'app-employee-reports',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        SelectModule,
        MultiSelectModule,
        ReportMemberAppointmentComponent,
        ReportBatchCourseComponent,
        ReportEducationComponent,
        ReportMotherOrgComponent,
        ReportOfficerTypeComponent,
        ReportRabUnitComponent,
        ReportBloodGroupComponent,
        ReportPersonalQualificationComponent,
        ReportProfessionalQualificationComponent,
        ReportSpecialQualificationComponent,
        ReportRabRankComponent,
        ReportCorpsComponent,
        ReportTradeComponent,
    ],
    templateUrl: './employee-reports.component.html',
    styleUrls: ['./report-theme.scss', './employee-reports.component.scss'],
})
export class EmployeeReportsComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    reportLang: ReportLang = 'en';
    readonly L = REPORT_LABELS;

    reportType: ReportType = 'memberAppointment';
    reportTypes: { label: string; labelBn: string; value: ReportType }[] = [
        { label: 'Appointment', labelBn: 'নিয়োগ', value: 'memberAppointment' },
        { label: 'Course', labelBn: 'কোর্স', value: 'batchCourse' },
        { label: 'Education', labelBn: 'শিক্ষা', value: 'education' },
        { label: 'Mother Org', labelBn: 'মাতৃ সংস্থা', value: 'motherOrg' },
        { label: 'Officer Type', labelBn: 'অফিসার ধরণ', value: 'officerType' },
        { label: 'RAB UNIT', labelBn: 'র‍্যাব ইউনিট', value: 'rabUnit' },
        { label: 'Blood Group', labelBn: 'রক্তের গ্রুপ', value: 'bloodGroup' },
        { label: 'Personal Qualification', labelBn: 'ব্যক্তিগত যোগ্যতা', value: 'personalQualification' },
        { label: 'Professional Qualification', labelBn: 'পেশাগত যোগ্যতা', value: 'professionalQualification' },
        { label: 'Special Qualification', labelBn: 'বিশেষ যোগ্যতা', value: 'specialQualification' },
        { label: 'RAB Rank', labelBn: 'র‍্যাব পদবি', value: 'rabRank' },
        { label: 'Corps', labelBn: 'কোর', value: 'corps' },
        { label: 'Trade', labelBn: 'ট্রেড', value: 'trade' },
        { label: 'Gallantry Awards/Decoration', labelBn: 'বীরত্বসূচক পদক', value: 'decoration' },
    ];

    /** Common code options for the selected report type. When user selects one, filter fires. */
    commonCodeOptions: { label: string; labelBn: string; value: number }[] = [];
    selectedCommonCodeId: number | null = null;

    /**
     * For Corps / Trade reports: every CommonCode row whose label is "N/A" collapses into a single
     * synthetic option (value = NA_SENTINEL_VALUE). When the user picks it, this array carries the
     * underlying CodeIds so the report shows ALL members tagged with any of them.
     */
    private naCommonCodeIds: number[] = [];

    /**
     * For Corps / Trade reports: the same label (e.g. "Driver") exists as a separate CommonCode
     * row per mother org. We collapse same-label rows into ONE dropdown option (value = the first
     * row's CodeId) and remember every underlying CodeId here, keyed by that representative value,
     * so picking "Driver" returns all of them to the child (same mechanism as the N/A bundle).
     */
    private labelBundleIds = new Map<number, number[]>();

    /**
     * Stable, cached array passed to the Corps / Trade child via `[commonCodeIds]`. Recomputed
     * ONLY when the selection or the N/A list changes — never on each change detection cycle.
     * A fresh array per CD tick would flip the input's reference, fire ngOnChanges on the child,
     * trigger load(), and create an infinite request storm.
     */
    selectedCommonCodeIds: number[] = [];

    /**
     * Trade report only — the representative option values picked in the multi-select.
     * Each value expands (via labelBundleIds / naCommonCodeIds) into its underlying CodeIds;
     * the union feeds `selectedCommonCodeIds` passed down to the child.
     */
    selectedTradeValues: number[] = [];

    /**
     * Status (PostingStatus) dropdown options and selection. Default: Presently Serving.
     * "Supernumerary" includes Pending and PendingForJoining statuses.
     * "All" sends empty/null to backend (no filter).
     */
    statusOptions: { label: string; labelBn: string; value: string }[] = [
        { label: 'All Member', labelBn: 'সকল সদস্য', value: '' },
        { label: 'Presently Serving', labelBn: 'কর্মরত', value: 'Servings' },
        { label: 'Ex Member', labelBn: 'সাবেক সদস্য', value: 'ExMember' },
        { label: 'Supernumerary', labelBn: 'সুপারনিউমারারি', value: 'Supernumerary' },
    ];
    selectedPostingStatus: string = 'Servings';

    /**
     * Latest access-scope snapshot from any child report. When a child loads
     * a scope-aware response, it emits via (scopeChange). Once we see one
     * with orgScopeRestricted, we lock the shared PostingStatus dropdown to
     * "Servings" — out-of-scope ex-members / supernumeraries aren't visible
     * to org-restricted callers anyway, and the backend hard-overrides.
     */
    accessibleScope: ReportAccessibleScope | null = null;

    get statusLocked(): boolean {
        return this.accessibleScope?.orgScopeRestricted === true;
    }

    onChildScopeChange(scope: ReportAccessibleScope | null): void {
        this.accessibleScope = scope;
        if (scope?.orgScopeRestricted && this.selectedPostingStatus !== 'Servings') {
            this.selectedPostingStatus = 'Servings';
        }
    }

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private commonCodeService: CommonCodeService,
        private reportService: ReportService,
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        // Fetch the caller's access-scope BEFORE any child report runs, so
        // the Status dropdown locks immediately on page load instead of
        // waiting for the first common-code pick to fire a report.
        this.reportService.getMyReportAccessScope().subscribe({
            next: (scope) => this.onChildScopeChange(scope ?? null),
            error: () => { /* silent — leave dropdown editable on failure */ },
        });

        this.loadCommonCodeOptions();
    }

    onReportTypeChange(): void {
        this.selectedCommonCodeId = null;
        this.selectedTradeValues = [];
        this.naCommonCodeIds = [];
        this.updateSelectedCommonCodeIds();
        this.loadCommonCodeOptions();
    }

    /** True when the second filter should render as a multi-select. Trade and
        Gallantry Awards/Decoration both let the user pick several values. */
    get isMultiSelectType(): boolean {
        return this.reportType === 'trade' || this.reportType === 'decoration';
    }

    /** True when enough is selected to render the child report. */
    get hasSelection(): boolean {
        return this.isMultiSelectType ? this.selectedTradeValues.length > 0 : this.selectedCommonCodeId != null;
    }

    /**
     * Multi-select (Trade / Decoration) changed — union every picked option's
     * underlying CodeIds (expanding same-label bundles and the N/A bucket) into
     * selectedCommonCodeIds. Decoration options carry no bundles, so each picked
     * value maps straight to its own CodeId.
     */
    onTradeSelectionChange(): void {
        const ids: number[] = [];
        for (const v of this.selectedTradeValues) {
            if (v === NA_SENTINEL_VALUE) {
                ids.push(...this.naCommonCodeIds);
            } else {
                const bundle = this.labelBundleIds.get(v);
                ids.push(...(bundle ?? [v]));
            }
        }
        this.selectedCommonCodeIds = Array.from(new Set(ids));
    }

    loadCommonCodeOptions(): void {
        this.naCommonCodeIds = [];
        this.labelBundleIds.clear();
        if (this.reportType === 'motherOrg') {
            this.commonCodeService.getAllActiveMotherOrgs().subscribe({
                next: (list: MotherOrganizationModel[]) => {
                    this.commonCodeOptions = (list || []).map((c) => ({
                        label: c.orgNameEN || String(c.orgId),
                        labelBn: c.orgNameBN || c.orgNameEN || String(c.orgId),
                        value: c.orgId,
                    }));
                },
                error: () => {
                    this.commonCodeOptions = [];
                },
            });
            return;
        }
        if (this.reportType === 'bloodGroup') {
            // Blood groups are free-text values on PersonalInfo, not CommonCodes — use a fixed list.
            this.commonCodeOptions = [...BLOOD_GROUP_OPTIONS];
            return;
        }
        const codeType = COMMON_CODE_TYPE_BY_REPORT[this.reportType];
        this.commonCodeService.getAllActiveCommonCodesType(codeType).subscribe({
            next: (list: CommonCodeModel[]) => {
                const raw = list || [];
                if (this.reportType === 'corps' || this.reportType === 'trade') {
                    // Multiple "N/A" CommonCode rows can exist (one per mother org); collapse them into
                    // a single synthetic option whose value is NA_SENTINEL_VALUE. We remember the
                    // underlying CodeIds so selectedCommonCodeIds can return them to the child component.
                    const naIds: number[] = [];
                    // Group non-N/A rows by their (normalised) English label so that the same
                    // trade/corps appearing once per mother org collapses into a single option.
                    const groups = new Map<string, { label: string; labelBn: string; codeIds: number[] }>();
                    for (const c of raw) {
                        if (isNALabel(c.codeValueEN) || isNALabel(c.codeValueBN)) {
                            naIds.push(c.codeId);
                            continue;
                        }
                        const label = c.codeValueEN || String(c.codeId);
                        const key = label.trim().toLowerCase();
                        const existing = groups.get(key);
                        if (existing) {
                            existing.codeIds.push(c.codeId);
                        } else {
                            groups.set(key, {
                                label,
                                labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                                codeIds: [c.codeId],
                            });
                        }
                    }
                    this.labelBundleIds.clear();
                    const nonNa = Array.from(groups.values()).map((g) => {
                        const value = g.codeIds[0];
                        this.labelBundleIds.set(value, g.codeIds);
                        return { label: g.label, labelBn: g.labelBn, value };
                    });
                    this.naCommonCodeIds = naIds;
                    this.commonCodeOptions = nonNa;
                    if (naIds.length > 0) {
                        this.commonCodeOptions.push({
                            label: 'N/A',
                            labelBn: 'N/A',
                            value: NA_SENTINEL_VALUE,
                        });
                    }
                    // Refresh the cached IDs after the N/A list is known.
                    this.updateSelectedCommonCodeIds();
                    return;
                }
                this.commonCodeOptions = raw.map((c) => ({
                    label: c.codeValueEN || String(c.codeId),
                    labelBn: c.codeValueBN || c.codeValueEN || String(c.codeId),
                    value: c.codeId,
                }));
            },
            error: () => {
                this.commonCodeOptions = [];
            },
        });
    }

    /**
     * Recompute the cached array of CommonCodeIds to push down to the Corps / Trade child.
     * Single selection → one-element array. The synthetic "N/A" option → all underlying N/A IDs.
     * Must be called whenever the selection or the N/A list changes.
     */
    private updateSelectedCommonCodeIds(): void {
        if (this.selectedCommonCodeId == null) {
            this.selectedCommonCodeIds = [];
        } else if (this.selectedCommonCodeId === NA_SENTINEL_VALUE) {
            this.selectedCommonCodeIds = [...this.naCommonCodeIds];
        } else {
            // A non-N/A pick may bundle several same-label CodeIds (one per mother org).
            const bundle = this.labelBundleIds.get(this.selectedCommonCodeId);
            this.selectedCommonCodeIds = bundle ? [...bundle] : [this.selectedCommonCodeId];
        }
    }

    onStatusChange(): void {
        // Child components receive [postingStatus] binding and react on input change
    }

    /**
     * Top section (report type card) stays in English only. The second dropdown's label
     * mirrors the selected report type (e.g. "Education" → "Education") instead of a generic
     * "Common Code" caption.
     */
    get commonCodeDropdownLabelEn(): string {
        const opt = this.reportTypes.find((o) => o.value === this.reportType);
        return opt?.label ?? this.L['en']['report.commonCodeLabel'];
    }

    get commonCodePlaceholderEn(): string {
        const opt = this.reportTypes.find((o) => o.value === this.reportType);
        return opt ? `Select ${opt.label}` : this.L['en']['report.placeholderCommonCode'];
    }

    /** Label of the currently selected common code (language-aware, for child report titles). Handles the synthetic N/A bucket. */
    get selectedCommonCodeLabel(): string {
        if (this.isMultiSelectType) {
            const names = this.selectedTradeValues.map((v) => {
                if (v === NA_SENTINEL_VALUE) return 'N/A';
                const opt = this.commonCodeOptions.find((o) => o.value === v);
                return opt ? (this.reportLang === 'bn' ? opt.labelBn : opt.label) : '';
            }).filter(Boolean);
            return names.join(', ');
        }
        if (this.selectedCommonCodeId == null) return '';
        if (this.selectedCommonCodeId === NA_SENTINEL_VALUE) return 'N/A';
        const opt = this.commonCodeOptions.find((o) => o.value === this.selectedCommonCodeId);
        if (!opt) return '';
        return this.reportLang === 'bn' ? opt.labelBn : opt.label;
    }

    /** The report type label for the currently selected report type (language-aware). */
    get selectedReportTypeLabel(): string {
        const opt = this.reportTypes.find((o) => o.value === this.reportType);
        if (!opt) return '';
        return this.reportLang === 'bn' ? opt.labelBn : opt.label;
    }

    /** Selected status label (English). */
    get selectedStatusLabel(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.label ?? '';
    }

    /** Selected status label (Bangla). */
    get selectedStatusLabelBn(): string {
        const opt = this.statusOptions.find((o) => o.value === this.selectedPostingStatus);
        return opt?.labelBn ?? '';
    }

    /** When common code is selected, child report components receive it and run load (filter fires). */
    onCommonCodeChange(): void {
        // Child gets [commonCodeId]="selectedCommonCodeId" and runs load() on input change.
        // Refresh the cached IDs array (used by Corps / Trade) so reference equality holds
        // until the next selection change — prevents repeated child ngOnChanges/load() ticks.
        this.updateSelectedCommonCodeIds();
    }

    toggleReportLang(): void {
        this.reportLang = this.reportLang === 'en' ? 'bn' : 'en';
    }
}
