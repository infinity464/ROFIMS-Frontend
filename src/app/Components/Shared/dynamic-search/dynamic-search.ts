import { Component, OnInit } from '@angular/core';
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
export class DynamicSearchComponent implements OnInit {
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

    // Track whether user has performed a search (prevents onLazyLoad from firing before first search)
    private hasSearched = false;

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

    constructor(
        private searchService: DynamicSearchService,
        private messageService: MessageService,
        private _router: Router,
        private _userMenuService: UserMenuService,
        private reportService: ReportService,
        private commonCodeService: CommonCodeService
    ) {}

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

    /**
     * Cascade dependency wiring — when the parent field's value changes,
     * its dependent fields reload from a scoped endpoint. Called by the
     * template (onChange). Triggers a fresh option-list fetch for each
     * dependent and clears any stale picked value.
     */
    onCriterionIdChange(fieldKey: string): void {
        const cv = this.criteriaValues.get(fieldKey);
        if (fieldKey === 'motherOrg') {
            // Mother Org → reload Corps options for the picked org
            // and Rank options (per-org MotherOrgRank).
            this.reloadCorpsByMotherOrg(cv?.idValue ?? null);
            this.reloadRankByMotherOrg(cv?.idValue ?? null);
        } else if (fieldKey === 'corps') {
            // Corps → reload Trade options for the picked corps's children.
            this.reloadTradeByCorps(cv?.idValue ?? null);
        }
    }

    private reloadCorpsByMotherOrg(orgId: number | null): void {
        const corpsField = this.availableFields.find(f => f.fieldKey === 'corps');
        if (!corpsField) return;
        // Restore the original full list when org is cleared.
        if (orgId == null || orgId <= 0) {
            const original = this.originalOptionsByField.get('corps');
            if (original) corpsField.options = original;
        } else {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Corps').subscribe({
                next: (codes: any[]) => {
                    corpsField.options = this.collapseNa(codes, 'corps');
                },
                error: () => { corpsField.options = []; },
            });
        }
        this.clearStaleCriterionId('corps', corpsField.options);
        // Corps changed implicitly → cascade Trade too.
        this.reloadTradeByCorps(this.criteriaValues.get('corps')?.idValue ?? null);
    }

    private reloadRankByMotherOrg(orgId: number | null): void {
        const rankField = this.availableFields.find(f => f.fieldKey === 'rank');
        if (!rankField) return;
        if (orgId == null || orgId <= 0) {
            const original = this.originalOptionsByField.get('rank');
            if (original) rankField.options = original;
        } else {
            this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'MotherOrgRank').subscribe({
                next: (codes: any[]) => {
                    rankField.options = (Array.isArray(codes) ? codes : [])
                        .map((c: any) => ({ label: c?.codeValueEN ?? String(c?.codeId ?? ''), value: c?.codeId ?? 0 }));
                },
                error: () => { rankField.options = []; },
            });
        }
        this.clearStaleCriterionId('rank', rankField.options);
    }

    private reloadTradeByCorps(corpsId: number | null): void {
        const tradeField = this.availableFields.find(f => f.fieldKey === 'trade');
        if (!tradeField) return;
        if (corpsId == null || corpsId <= 0) {
            const original = this.originalOptionsByField.get('trade');
            if (original) tradeField.options = original;
        } else if (corpsId === -1) {
            // User picked the N/A corps — Trade options would be the N/A
            // trade rows. The simplest behaviour: keep the global Trade
            // list so the user can narrow further (or wipe the trade pick
            // if it's no longer meaningful). Leave options as-is.
            const original = this.originalOptionsByField.get('trade');
            if (original) tradeField.options = original;
        } else {
            this.commonCodeService.getAllActiveCommonCodesByParentId(corpsId).subscribe({
                next: (codes: any[]) => {
                    tradeField.options = this.collapseNa(codes, 'trade');
                },
                error: () => { tradeField.options = []; },
            });
        }
        this.clearStaleCriterionId('trade', tradeField.options);
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

    private loadFields(): void {
        this.searchService.getSearchFields(this.selectedCategory).subscribe({
            next: (fields) => {
                this.availableFields = fields;
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
        // If the user picked search fields, they MUST fill each one.
        // Without this check, an empty field is silently dropped from the
        // request and the page returns an effectively unfiltered result
        // set — surprising and (with no upper bound on the FE side)
        // potentially huge.
        const empty = this.selectedFields.filter((f) => !this.hasCriterionValue(f));
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
    private readonly personalKeys = new Set(['nameEnglish', 'nameBangla', 'prefix', 'mobileNo', 'email', 'dob', 'gender', 'bloodGroup', 'religion', 'maritalStatus']);
    private readonly serviceKeys = new Set([
        'rank', 'corps', 'trade', 'tradeRemarks', 'appointment', 'memberType',
        'motherOrg', 'motherUnit', 'rabUnit', 'location',
        'joiningDate', 'commissionDate', 'dateOfJoinService',
        'rabServiceFrom', 'rabServiceTo', 'permanentDistrict'
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
