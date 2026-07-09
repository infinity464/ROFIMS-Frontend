import { Component, EventEmitter, HostListener, Input, OnInit, Output, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ReportService } from '@/services/report.service';
import { ServingMembersService } from '@/services/serving-members.service';
import { EmpService } from '@/services/emp-service';
import { PreviousRABServiceService } from '@/services/previous-rab-service.service';
import { PromotionInfoService } from '@/services/promotion-info.service';
import { DisciplineInfoService } from '@/services/discipline-info.service';
import { DraftCourseService } from '@/services/draft-course.service';
import { AddressInfoService } from '@/services/address-info.service';
import { FamilyInfoService } from '@/services/family-info-service';
import { IdentityUserMemberTypeAccessService } from '@/services/identity-user-member-type-access.service';
import { SharedService } from '@/shared/services/shared-service';
import { Router } from '@angular/router';
import { UserMenuService } from '@/services/user-menu.service';
import { type ReportLang } from '@/Core/i18n/report-labels';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';
import { getFormattedMemberName, isNavyMotherOrganization } from '@/shared/utils/member-display-name.util';
import type {
    ReportAccessibleScope,
    DynamicReportCriterion,
    DynamicReportRow,
} from '@/models/report.model';
import {
    AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, PageOrientation,
    Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';

interface BioField { k: string; v: string; span?: 2 | 3; }

/** A pickable field in the bio-data field catalog. */
interface BioCatalogItem {
    key: string;
    labelEN: string;
    labelBN: string;
    section: 1 | 2 | 3 | 4;
    span?: 2;
    kind: 'text' | 'orientation' | 'punishment' | 'chips';
    defaultVisible: boolean;
}

/**
 * Standalone "Short Bio-Data" report — a single-member formal bio-data sheet
 * (not a roster table). Searches by RAB ID / Service ID / NID, resolves the
 * member, pulls the personal/service overview from `members/profile`
 * (vw_EmployeePersonalServiceOverview) plus previous-RAB / promotion /
 * discipline summaries, and renders the Space-Grotesk "Bio-Data" sheet.
 */
@Component({
    selector: 'app-report-bio-data-individual',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, MultiSelectModule, TableModule, DialogModule, Toast],
    providers: [MessageService],
    templateUrl: './report-bio-data.component.html',
    styleUrls: ['../../employee-reports/report-theme.scss', '../../employee-reports/report-card-mtr.scss', './report-bio-data.component.scss'],
})
export class ReportBioDataIndividualComponent implements OnInit, OnDestroy {
    @Input() lang: ReportLang = 'en';
    @Output() langToggle = new EventEmitter<void>();

    searchRabId = '';
    searchServiceId = '';
    searchNid = '';

    profile: EmployeePersonalServiceOverview | null = null;
    profileImageUrl: string | null = null;
    private previousRabUnits: string[] = [];
    private previousRabUnitsBN: string[] = [];
    private promotionPresentDate: string | null = null;
    private presentUnitJoiningDate: string | null = null;
    private hasPunishment: boolean | null = null;
    private hasRfts: boolean | null = null;
    private spouseDistrict: string | null = null;
    private spouseDistrictBN: string | null = null;
    private childrenCount: number | null = null;

    loading = false;
    searched = false;

    exportDropdownOpen = false;
    exporting = false;

    accessibleScope: ReportAccessibleScope | null = null;
    get orgScopeRestricted(): boolean { return this.accessibleScope?.orgScopeRestricted === true; }

    showAccessDeniedDialog = false;
    accessDeniedMessage = 'You do not have permission to view this employee. Either they are outside your accessible scope or no longer presently serving.';
    showNotFoundDialog = false;
    notFoundMessage = 'No member found with the given RAB ID / Service ID / NID.';

    showPickerDialog = false;
    pickerRows: Array<{ employeeId: number; displayName: string; orgName: string; status: string; }> = [];
    private pickerLookupRows: DynamicReportRow[] = [];

    filterOpen = true;
    /** When false, the add/remove + reorder field editor stays collapsed. */
    showFieldEditor = false;

    constructor(
        private reportService: ReportService,
        private servingMembersService: ServingMembersService,
        private empService: EmpService,
        private previousRabService: PreviousRABServiceService,
        private promotionInfoService: PromotionInfoService,
        private disciplineInfoService: DisciplineInfoService,
        private draftCourseService: DraftCourseService,
        private addressInfoService: AddressInfoService,
        private familyInfoService: FamilyInfoService,
        private messageService: MessageService,
        private memberTypeAccess: IdentityUserMemberTypeAccessService,
        private sharedService: SharedService,
        private _router: Router,
        private _userMenuService: UserMenuService
    ) {}

    ngOnInit(): void { this._userMenuService.getPermissionsByRoute(this._router.url); }
    ngOnDestroy(): void { if (this.profileImageUrl) { URL.revokeObjectURL(this.profileImageUrl); this.profileImageUrl = null; } }

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    get isBn(): boolean { return this.lang === 'bn'; }

    // ── value helpers ──────────────────────────────────────────────────
    val(v: string | number | null | undefined): string {
        if (v == null || String(v).trim() === '') return '-';
        return String(v);
    }
    displayNum(v: string | number | null | undefined): string {
        if (v == null || String(v).trim() === '') return '-';
        const s = String(v);
        return this.isBn ? BanglaNumerals.toBangla(s) : s;
    }
    /** True when a family relation is a child (son/daughter), matched loosely
        across EN/BN spellings: son, daughter, child, ছেলে, মেয়ে, পুত্র, কন্যা. */
    private isChildRelation(en: string | null | undefined, bn: string | null | undefined): boolean {
        const text = `${en ?? ''} ${bn ?? ''}`.toLowerCase();
        return /son|daughter|child|ছেলে|মেয়ে|পুত্র|কন্যা/.test(text);
    }
    /** Count children from family rows by relation type. */
    private countChildren(rows: { relation?: string | null; relationBN?: string | null }[]): number {
        return rows.filter(r => this.isChildRelation(r?.relation, r?.relationBN)).length;
    }
    /** Height stored in total inches → "4ft 5.5 inch" (ft dropped when 0). */
    formatHeight(v: string | number | null | undefined): string {
        if (v == null || String(v).trim() === '') return '-';
        const total = Number(v);
        if (isNaN(total)) return '-';
        const feet = Math.floor(total / 12);
        const inches = Math.round((total - feet * 12) * 100) / 100;
        const ft = feet > 0 ? `${this.displayNum(feet)}${this.lx('ft', 'ফুট')} ` : '';
        return `${ft}${this.displayNum(inches)} ${this.lx('inch', 'ইঞ্চি')}`;
    }
    codeValue(en: string | null | undefined, bn: string | null | undefined): string {
        if (this.isBn && bn != null && bn.trim() !== '') return bn.trim();
        const v = en ?? bn;
        return v != null && v.toString().trim() !== '' ? v : '-';
    }
    formatDate(v: string | null | undefined): string {
        if (v == null || v === '') return '-';
        try {
            const d = new Date(v);
            if (isNaN(d.getTime())) return v;
            const s = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            return this.isBn ? BanglaNumerals.toBangla(s) : s;
        } catch { return v; }
    }
    private lx(en: string, bn: string): string { return this.isBn ? bn : en; }
    private joinParts(parts: (string | null | undefined)[], sep: string): string {
        const naTokens = new Set(['-', 'n/a', 'na', 'অপ্রযোজ্য']);
        const list = parts
            .map(p => (p ?? '').toString().trim())
            .filter(p => p && !naTokens.has(p.toLowerCase()));
        return list.length ? list.join(sep) : '-';
    }

    // ── Header ─────────────────────────────────────────────────────────
    get docTypeLabel(): string { return this.lx('Bio-Data', 'জীবনবৃত্তান্ত'); }
    get confidentialLine(): string { return this.lx('Confidential · Personnel Record', 'গোপনীয়'); }
    get heroName(): string {
        const p = this.profile;
        if (!p) return '-';
        if (isNavyMotherOrganization(p)) return getFormattedMemberName(p, this.isBn);
        return this.isBn ? this.val(p.nameBN ?? p.nameEnglish) : this.val(p.nameEnglish);
    }
    /** Secondary name line — shows the OTHER language so both names appear
        and swap when the language toggles (bn primary → en secondary, etc.). */
    get heroNameAlt(): string {
        const p = this.profile;
        if (!p) return '-';
        return this.isBn ? this.val(p.nameEnglish) : this.val(p.nameBN);
    }
    /** Post-nominals: gallantry · professional qualification · corps (Navy uses heroName). */
    get postNom(): string {
        const p = this.profile;
        if (!p || isNavyMotherOrganization(p)) return '';
        const s = this.joinParts([
            this.codeValue(p.gallantryAwardsDecoration, p.gallantryAwardsDecorationBN),
            this.codeValue(p.professionalQualification, p.professionalQualificationBN),
            this.codeValue(p.corps, p.corpsBN),
        ], ' · ');
        return s === '-' ? '' : s;
    }
    get headMetaParts(): string[] {
        const p = this.profile;
        if (!p) return [];
        const orgUnitLoc = this.joinParts([
            this.codeValue(p.motherOrganization, p.motherOrganizationBN),
            this.codeValue(p.motherUnit, p.motherUnitBN),
            this.codeValue(p.location, p.locationBN),
        ], ' · ');
        return [
            this.codeValue(p.armyRank, p.armyRankBN),
            this.codeValue(p.appointment, p.appointmentBN),
            orgUnitLoc,
        ].filter(s => s && s !== '-');
    }
    /** Service ID with its prefix, e.g. "BA-482190037745". */
    get personalNoDisplay(): string {
        const p = this.profile;
        if (!p) return '-';
        const sid = this.displayNum(p.serviceId);
        if (sid === '-') return '-';
        const prefix = this.codeValue(p.prefix, p.prefixBN);
        return prefix && prefix !== '-' ? `${prefix}-${sid}` : sid;
    }

    get idStrip(): { k: string; v: string }[] {
        const p = this.profile;
        if (!p) return [];
        return [
            { k: this.lx('Personal No', 'ব্যক্তিগত নম্বর'), v: this.personalNoDisplay },
            { k: this.lx('RAB ID', 'র‍্যাব আইডি'),          v: this.displayNum(p.rabId) },
        ];
    }

    // ── Section field lists ────────────────────────────────────────────
    private get orgUnitLocation(): string {
        const p = this.profile;
        if (!p) return '-';
        return this.joinParts([
            this.codeValue(p.motherOrganization, p.motherOrganizationBN),
            this.codeValue(p.motherUnit, p.motherUnitBN),
            this.codeValue(p.location, p.locationBN),
        ], ' – ');
    }
    get previousServiceInRab(): string {
        const arr = this.isBn && this.previousRabUnitsBN.length ? this.previousRabUnitsBN : this.previousRabUnits;
        const uniq = Array.from(new Set(arr.filter(Boolean)));
        return uniq.length ? uniq.join(', ') : '-';
    }
    get specialTrainingChips(): string[] {
        const p = this.profile;
        const raw = this.isBn ? (p?.specialQualificationsBN ?? p?.specialQualifications) : p?.specialQualifications;
        if (!raw) return [];
        return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    get punishmentLabel(): string {
        if (this.hasPunishment == null) return '-';
        return this.hasPunishment ? this.lx('Yes', 'হ্যাঁ') : this.lx('No', 'না');
    }
    get punishmentHasValue(): boolean { return this.hasPunishment != null; }

    /** Orientation Training — "Yes" when the member has any RFTS training record. */
    get orientationLabel(): string {
        if (this.hasRfts == null) return '-';
        return this.hasRfts ? this.lx('Yes', 'হ্যাঁ') : this.lx('No', 'না');
    }
    get orientationHasValue(): boolean { return this.hasRfts != null; }

    // ── Field catalog (drives the add/remove + reorder picker) ─────────
    // Every field the bio-data can show, drawn from the Personal Info /
    // Employee Basic Info overview. `section` 1-4 maps to the sheet sections;
    // `kind` picks the renderer; `defaultVisible` is the out-of-the-box set.
    readonly fieldCatalog: BioCatalogItem[] = [
        // 01 — Service & Posting
        { key: 'orgUnitLocation',     labelEN: 'Mother Organization, Unit & Location', labelBN: 'মাতৃ সংস্থা, ইউনিট ও অবস্থান', section: 1, span: 2, kind: 'text', defaultVisible: true },
        { key: 'rank',                labelEN: 'Rank',                  labelBN: 'পদবি',                   section: 1, kind: 'text', defaultVisible: true },
        { key: 'corps',               labelEN: 'Corps / Regiment',      labelBN: 'কোর / রেজিমেন্ট',        section: 1, kind: 'text', defaultVisible: true },
        { key: 'trade',               labelEN: 'Trade',                 labelBN: 'ট্রেড',                  section: 1, kind: 'text', defaultVisible: true },
        { key: 'batch',               labelEN: 'Long Course / BCS',     labelBN: 'লং কোর্স / বিসিএস',      section: 1, kind: 'text', defaultVisible: true },
        { key: 'dateOfCommission',    labelEN: 'Date of Commission',    labelBN: 'কমিশনের তারিখ',          section: 1, kind: 'text', defaultVisible: true },
        { key: 'enrolment',           labelEN: 'Enrolment in Service',  labelBN: 'চাকরিতে যোগদান',         section: 1, kind: 'text', defaultVisible: true },
        { key: 'promotionPresent',    labelEN: 'Promotion in Present Rank', labelBN: 'বর্তমান পদবিতে পদোন্নতি', section: 1, kind: 'text', defaultVisible: true },
        { key: 'joiningRab',          labelEN: 'Joining in RAB',        labelBN: 'র‍্যাবে যোগদান',         section: 1, kind: 'text', defaultVisible: true },
        { key: 'rabUnit',             labelEN: 'RAB Present Unit',      labelBN: 'র‍্যাব বর্তমান ইউনিট',   section: 1, kind: 'text', defaultVisible: true },
        { key: 'joiningPresentUnit',  labelEN: 'Joining in Present Unit', labelBN: 'বর্তমান ইউনিটে যোগদান', section: 1, kind: 'text', defaultVisible: true },
        { key: 'appointment',         labelEN: 'Appointment',           labelBN: 'নিয়োগ',                 section: 1, kind: 'text', defaultVisible: false },
        { key: 'memberType',          labelEN: 'Member Type',           labelBN: 'সদস্যের ধরন',            section: 1, kind: 'text', defaultVisible: false },
        { key: 'motherOrganization',  labelEN: 'Mother Organization',   labelBN: 'মাতৃ সংস্থা',            section: 1, kind: 'text', defaultVisible: false },
        { key: 'motherUnit',          labelEN: 'Mother Unit',           labelBN: 'মাতৃ ইউনিট',             section: 1, kind: 'text', defaultVisible: false },
        { key: 'location',            labelEN: 'Location',              labelBN: 'অবস্থান',                section: 1, kind: 'text', defaultVisible: false },
        // 02 — Personal Information
        { key: 'dateOfBirth',         labelEN: 'Date of Birth',         labelBN: 'জন্ম তারিখ',             section: 2, kind: 'text', defaultVisible: true },
        { key: 'bloodGroup',          labelEN: 'Blood Group',           labelBN: 'রক্তের গ্রুপ',            section: 2, kind: 'text', defaultVisible: true },
        { key: 'height',              labelEN: 'Height',                labelBN: 'উচ্চতা',                 section: 2, kind: 'text', defaultVisible: true },
        { key: 'religion',            labelEN: 'Religion',              labelBN: 'ধর্ম',                   section: 2, kind: 'text', defaultVisible: true },
        { key: 'maritalStatus',       labelEN: 'Marital Status',        labelBN: 'বৈবাহিক অবস্থা',         section: 2, kind: 'text', defaultVisible: true },
        { key: 'gallantry',           labelEN: 'Gallantry Award',       labelBN: 'বীরত্বসূচক পদক',         section: 2, kind: 'text', defaultVisible: true },
        { key: 'professionalQual',    labelEN: 'Professional Qualification', labelBN: 'পেশাগত যোগ্যতা',    section: 2, kind: 'text', defaultVisible: true },
        { key: 'personalQual',        labelEN: 'Personal Qualification', labelBN: 'ব্যক্তিগত যোগ্যতা',     section: 2, kind: 'text', defaultVisible: true },
        { key: 'mobileNo',            labelEN: 'Mobile No',             labelBN: 'মোবাইল নম্বর',           section: 2, kind: 'text', defaultVisible: true },
        { key: 'officeMobile',        labelEN: 'Office Mobile No',      labelBN: 'অফিস মোবাইল নম্বর',      section: 2, kind: 'text', defaultVisible: true },
        { key: 'email',               labelEN: 'Email Address',         labelBN: 'ইমেইল',                  section: 2, kind: 'text', defaultVisible: true },
        { key: 'nid',                 labelEN: 'NID',                   labelBN: 'এনআইডি',                 section: 2, kind: 'text', defaultVisible: true },
        { key: 'educationQual',       labelEN: 'Last Educational Qualification', labelBN: 'সর্বশেষ শিক্ষাগত যোগ্যতা', section: 2, kind: 'text', defaultVisible: true },
        { key: 'identificationMark',  labelEN: 'Identification Marks',  labelBN: 'সনাক্তকরণ চিহ্ন',        section: 2, span: 2, kind: 'text', defaultVisible: true },
        { key: 'weight',              labelEN: 'Weight',                labelBN: 'ওজন',                    section: 2, kind: 'text', defaultVisible: false },
        { key: 'gender',              labelEN: 'Gender',                labelBN: 'লিঙ্গ',                  section: 2, kind: 'text', defaultVisible: false },
        { key: 'medicalCategory',     labelEN: 'Medical Category',      labelBN: 'মেডিকেল ক্যাটাগরি',      section: 2, kind: 'text', defaultVisible: false },
        { key: 'emergencyContact',    labelEN: 'Emergency Contact',     labelBN: 'জরুরি যোগাযোগ',          section: 2, kind: 'text', defaultVisible: false },
        { key: 'nidOld',              labelEN: 'NID (Old)',             labelBN: 'পুরাতন এনআইডি',          section: 2, kind: 'text', defaultVisible: false },
        { key: 'passport',            labelEN: 'Passport No',           labelBN: 'পাসপোর্ট নম্বর',         section: 2, kind: 'text', defaultVisible: false },
        // 03 — District, Family & Education
        { key: 'ownDistrict',         labelEN: 'Own District',          labelBN: 'নিজ জেলা',               section: 3, kind: 'text', defaultVisible: true },
        { key: 'wifeDistrict',        labelEN: 'Spouse District',       labelBN: 'স্বামী/স্ত্রীর জেলা',     section: 3, kind: 'text', defaultVisible: true },
        { key: 'noOfChildren',        labelEN: 'No. of Children',       labelBN: 'সন্তান সংখ্যা',          section: 3, kind: 'text', defaultVisible: true },
        // 04 — RAB Experience & Training
        { key: 'orientation',         labelEN: 'Orientation Training',  labelBN: 'ওরিয়েন্টেশন প্রশিক্ষণ', section: 4, kind: 'orientation', defaultVisible: true },
        { key: 'punishment',          labelEN: 'Punishment Details',    labelBN: 'শাস্তির বিবরণ',          section: 4, kind: 'punishment', defaultVisible: true },
        { key: 'prevService',         labelEN: 'Service in RAB',        labelBN: 'র‍্যাবে চাকরি',          section: 4, span: 2, kind: 'text', defaultVisible: true },
        { key: 'specialTraining',     labelEN: 'Special Training',      labelBN: 'বিশেষ প্রশিক্ষণ',        section: 4, span: 2, kind: 'chips', defaultVisible: true },
    ];

    /** Ordered source of truth for which fields show and in what order.
        Drag-reorder mutates THIS directly. */
    selectedFieldKeys: string[] = this.fieldCatalog.filter(c => c.defaultVisible).map(c => c.key);

    /** MultiSelect binding — controls membership only. Adding/removing in the
        dropdown never reorders the existing selection (which the drag strip
        owns); new picks are appended in catalog order. This keeps drag-reorder
        from being reverted when the MultiSelect writes its value back. */
    get pickerModel(): string[] { return this.selectedFieldKeys; }
    set pickerModel(keys: string[]) {
        const set = new Set(keys);
        const kept = this.selectedFieldKeys.filter(k => set.has(k));
        const existing = new Set(kept);
        const added = this.fieldCatalog.map(c => c.key).filter(k => set.has(k) && !existing.has(k));
        this.selectedFieldKeys = [...kept, ...added];
    }

    readonly sections: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

    sectionLabel(section: 1 | 2 | 3 | 4): string {
        switch (section) {
            case 1: return this.secService;
            case 2: return this.secPersonal;
            case 3: return this.secDistrict;
            case 4: return this.secRabExp;
        }
    }

    /** Add/remove options for the MultiSelect, grouped by the 4 sections. */
    get groupedFieldOptions(): { label: string; items: { label: string; value: string }[] }[] {
        return this.sections.map(sec => ({
            label: this.sectionLabel(sec),
            items: this.fieldCatalog
                .filter(c => c.section === sec)
                .map(c => ({ label: this.isBn ? c.labelBN : c.labelEN, value: c.key })),
        }));
    }

    fieldLabel(it: BioCatalogItem): string { return this.isBn ? it.labelBN : it.labelEN; }

    /** Selected fields belonging to a section, in the user-picked order. */
    visibleFields(section: 1 | 2 | 3 | 4): BioCatalogItem[] {
        const byKey = new Map(this.fieldCatalog.map(c => [c.key, c]));
        return this.selectedFieldKeys
            .map(k => byKey.get(k))
            .filter((c): c is BioCatalogItem => c != null && c.section === section);
    }
    get visibleColumns(): BioCatalogItem[] {
        const byKey = new Map(this.fieldCatalog.map(c => [c.key, c]));
        return this.selectedFieldKeys.map(k => byKey.get(k)).filter((c): c is BioCatalogItem => c != null);
    }
    sectionHasFields(section: 1 | 2 | 3 | 4): boolean { return this.visibleFields(section).length > 0; }

    /** Resolve a text field's value from the profile. */
    valueFor(key: string): string {
        const p = this.profile;
        if (!p) return '-';
        switch (key) {
            case 'orgUnitLocation':    return this.orgUnitLocation;
            case 'rank':               return this.codeValue(p.armyRank, p.armyRankBN);
            case 'corps':              return this.codeValue(p.corps, p.corpsBN);
            case 'trade':              return this.codeValue(p.trade, p.tradeBN);
            case 'batch':              return this.codeValue(p.batch ?? p.courseBatch, p.batchBN);
            case 'dateOfCommission':   return this.formatDate(p.dateOfCommission);
            case 'enrolment':          return this.formatDate(p.dateOfJoiningInServiceTraining);
            case 'promotionPresent':   return this.formatDate(this.promotionPresentDate);
            case 'joiningRab':         return this.formatDate(p.joiningDate);
            case 'rabUnit':            return this.codeValue(p.rabUnit, p.rabUnitBN);
            case 'joiningPresentUnit': return this.formatDate(this.presentUnitJoiningDate);
            case 'appointment':        return this.codeValue(p.appointment, p.appointmentBN);
            case 'memberType':         return this.codeValue(p.memberType, p.memberTypeBN);
            case 'motherOrganization': return this.codeValue(p.motherOrganization, p.motherOrganizationBN);
            case 'motherUnit':         return this.codeValue(p.motherUnit, p.motherUnitBN);
            case 'location':           return this.codeValue(p.location, p.locationBN);
            case 'dateOfBirth':        return this.formatDate(p.dateOfBirth);
            case 'bloodGroup':         return this.val(p.bloodGroup);
            case 'height':             return this.formatHeight(p.height);
            case 'weight':             return p.weight != null ? `${this.displayNum(p.weight)} ${this.lx('lbs', 'পাউন্ড')}` : '-';
            case 'religion':           return this.codeValue(p.religion, p.religionBN);
            case 'maritalStatus':      return this.codeValue(p.maritalStatus, p.maritalStatusBN);
            case 'gallantry':          return this.codeValue(p.gallantryAwardsDecoration, p.gallantryAwardsDecorationBN);
            case 'professionalQual':   return this.codeValue(p.professionalQualification, p.professionalQualificationBN);
            case 'personalQual':       return this.codeValue(p.personalQualification, p.personalQualificationBN);
            case 'educationQual':      return this.codeValue(p.educationQualification, p.educationQualificationBN);
            case 'medicalCategory':    return this.codeValue(p.medicalCategory, p.medicalCategoryBN);
            case 'gender':             return this.codeValue(p.gender, p.genderBN);
            case 'mobileNo':           return this.displayNum(p.mobileNo);
            case 'officeMobile':       return this.displayNum(p.mobileNoOfficial);
            case 'email':              return this.val(p.emailAddress);
            case 'emergencyContact':   return this.displayNum(p.emergencyContactNo);
            case 'nid':                return this.displayNum(p.nid);
            case 'nidOld':             return this.displayNum(p.nidOld);
            case 'passport':           return this.displayNum(p.passportNo);
            case 'identificationMark': return this.val(p.identificationMark);
            case 'ownDistrict':        return this.codeValue(p.permanentDistrictTypeName, p.permanentDistrictTypeNameBN);
            case 'wifeDistrict':       return this.codeValue(this.spouseDistrict, this.spouseDistrictBN);
            case 'noOfChildren':       return this.childrenCount == null ? '-' : this.displayNum(this.childrenCount);
            case 'prevService':        return this.previousServiceInRab;
            default:                   return '-';
        }
    }

    /** Plain-text value for any field (used by exports). */
    fieldDisplayValue(it: BioCatalogItem): string {
        switch (it.kind) {
            case 'orientation': return this.orientationLabel;
            case 'punishment':  return this.punishmentLabel;
            case 'chips':       return this.specialTrainingChips.length ? this.specialTrainingChips.join(', ') : '-';
            default:            return this.valueFor(it.key);
        }
    }

    // ── Column/field picker — drag reorder of the chip strip ───────────
    draggingFieldKey: string | null = null;
    onColumnDragStart(key: string, event: DragEvent): void {
        this.draggingFieldKey = key;
        event.dataTransfer?.setData('text/plain', key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    }
    onColumnDragOver(event: DragEvent): void { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; }
    onColumnDrop(targetKey: string, event: DragEvent): void {
        event.preventDefault();
        const sourceKey = this.draggingFieldKey;
        this.draggingFieldKey = null;
        if (!sourceKey || sourceKey === targetKey) return;
        // Reorder is confined to a single section — a field cannot move into
        // another section.
        const byKey = new Map(this.fieldCatalog.map(c => [c.key, c]));
        const src = byKey.get(sourceKey);
        const tgt = byKey.get(targetKey);
        if (!src || !tgt || src.section !== tgt.section) return;
        const arr = [...this.selectedFieldKeys];
        const fromIdx = arr.indexOf(sourceKey);
        const toIdx = arr.indexOf(targetKey);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        this.selectedFieldKeys = arr;
    }
    onColumnDragEnd(): void { this.draggingFieldKey = null; }
    removeColumn(key: string): void { this.selectedFieldKeys = this.selectedFieldKeys.filter(k => k !== key); }

    // ── Section / sheet labels ─────────────────────────────────────────
    get secService(): string { return this.lx('Service & Posting', 'চাকরি ও পদায়ন'); }
    get secPersonal(): string { return this.lx('Personal Information', 'ব্যক্তিগত তথ্য'); }
    get secDistrict(): string { return this.lx('District & Family', 'জেলা ও পরিবার'); }
    get secRabExp(): string { return this.lx('RAB Experience & Training', 'র‍্যাব অভিজ্ঞতা ও প্রশিক্ষণ'); }
    get lblOrientation(): string { return this.lx('Orientation Training', 'ওরিয়েন্টেশন প্রশিক্ষণ'); }
    get lblPunishment(): string { return this.lx('Punishment Details', 'শাস্তির বিবরণ'); }
    get lblPrevService(): string { return this.lx('Service in RAB', 'র‍্যাবে চাকরি'); }
    get lblSpecialTraining(): string { return this.lx('Special Training', 'বিশেষ প্রশিক্ষণ'); }

    // ── Search / lookup ────────────────────────────────────────────────
    get activeFilterCount(): number {
        let c = 0;
        if (this.searchRabId.trim()) c++;
        if (this.searchServiceId.trim()) c++;
        if (this.searchNid.trim()) c++;
        return c;
    }
    toggleFilter(): void { this.filterOpen = !this.filterOpen; }
    filterSubtitle(): string {
        if (this.activeFilterCount === 0) return 'Enter RAB ID, Service ID or NID to begin';
        const n = this.isBn ? BanglaNumerals.toBangla(String(this.activeFilterCount)) : String(this.activeFilterCount);
        return n + ' active filter(s)';
    }
    clearFilters(): void { this.searchRabId = ''; this.searchServiceId = ''; this.searchNid = ''; }

    private isMemberTypeAllowed(memberTypeId: number | null | undefined): boolean {
        if (memberTypeId == null) return true;
        const userId = this.sharedService.getCurrentUserId?.() ?? null;
        if (!userId) return true;
        const allowed = this.memberTypeAccess.getCachedMemberTypeIds(userId);
        if (allowed === null) return true;
        return allowed.includes(memberTypeId as number);
    }

    load(): void {
        if (!this.searchRabId.trim() && !this.searchServiceId.trim() && !this.searchNid.trim()) {
            this.messageService.add({ severity: 'warn', summary: 'Search', detail: 'Enter RAB ID, Service ID or NID.' });
            return;
        }
        this.loading = true;

        const lookupCriteria: DynamicReportCriterion[] = [];
        if (this.searchRabId.trim())     lookupCriteria.push({ fieldKey: 'rabId',     textValue: this.searchRabId.trim() });
        if (this.searchServiceId.trim()) lookupCriteria.push({ fieldKey: 'serviceId', textValue: this.searchServiceId.trim() });
        if (this.searchNid.trim())       lookupCriteria.push({ fieldKey: 'nid',       textValue: this.searchNid.trim() });

        const lookupColumns = ['rabId', 'serviceId', 'nameEnglish', 'nameBangla', 'armyRank', 'corps', 'trade', 'motherOrganization', 'rabUnit', 'prefix', 'postingStatus'];

        this.reportService.runDynamicEmployeeBaseReport({
            columns: lookupColumns, criteria: lookupCriteria, pagination: { page_no: 1, row_per_page: 100 },
        }).subscribe({
            next: (lookup) => {
                this.searched = true;
                this.accessibleScope = lookup.accessibleScope ? {
                    rabUnitNames: null, rabUnitNamesBN: null, memberTypeNames: null, memberTypeNamesBN: null,
                    orgScopeRestricted: lookup.accessibleScope.orgScopeRestricted,
                } as ReportAccessibleScope : null;

                const employees = (lookup.datalist ?? []) as Array<DynamicReportRow>;
                if (employees.length === 0) {
                    this.resetResults();
                    this.loading = false;
                    const unrestrictedHasMatches = (lookup.accessibleScope as any)?.unrestrictedHasMatches === true;
                    if (unrestrictedHasMatches) this.showAccessDeniedDialog = true; else this.showNotFoundDialog = true;
                    return;
                }
                const allowed = employees.filter((d) => this.isMemberTypeAllowed(d['memberTypeId'] as number | null | undefined));
                if (allowed.length === 0) { this.resetResults(); this.loading = false; this.showAccessDeniedDialog = true; return; }
                if (allowed.length === 1) { this.fetchForEmployee(allowed[0]['employeeId'] as number); return; }
                this.loading = false;
                this.openPickerForCandidates(allowed);
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to look up member' });
                this.loading = false;
            },
        });
    }

    private resetResults(): void {
        this.profile = null;
        this.previousRabUnits = [];
        this.previousRabUnitsBN = [];
        this.promotionPresentDate = null;
        this.presentUnitJoiningDate = null;
        this.hasPunishment = null;
        this.hasRfts = null;
        this.spouseDistrict = null;
        this.spouseDistrictBN = null;
        this.childrenCount = null;
        if (this.profileImageUrl) { URL.revokeObjectURL(this.profileImageUrl); this.profileImageUrl = null; }
    }

    private fetchForEmployee(employeeId: number): void {
        this.loading = true;
        this.resetResults();

        forkJoin({
            profile: this.servingMembersService.getEmployeePersonalServiceOverview(employeeId).pipe(catchError(() => of(null))),
            previousRab: this.previousRabService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            promotion: this.promotionInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            discipline: this.disciplineInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            rfts: this.draftCourseService.getRftsTrainingByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            address: this.addressInfoService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            family: this.familyInfoService.getFamilyInfoByEmployeeView(employeeId).pipe(catchError(() => of([] as any[]))),
        }).subscribe({
            next: ({ profile, previousRab, promotion, discipline, rfts, address, family }) => {
                if (!profile) { this.profile = null; this.loading = false; this.showAccessDeniedDialog = true; return; }
                this.profile = profile;

                const prev = (previousRab ?? []).filter((r: any) => (r.employeeID ?? r.EmployeeID) === employeeId);
                this.previousRabUnits = prev.map((r: any) => (r.rabUnitName ?? r.RABUnitName ?? '')).filter(Boolean);
                this.previousRabUnitsBN = prev.map((r: any) => (r.rabUnitNameBN ?? r.RABUnitNameBN ?? '')).filter(Boolean);

                // Joining in present unit = serviceFrom of the currently-active
                // RAB-service posting; fall back to the latest serviceFrom.
                const active = prev.find((r: any) => (r.isCurrentlyActive ?? r.IsCurrentlyActive) === true);
                const latest = [...prev]
                    .map((r: any) => r.serviceFrom ?? r.ServiceFrom ?? null)
                    .filter(Boolean)
                    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
                this.presentUnitJoiningDate = (active?.serviceFrom ?? active?.ServiceFrom) ?? latest;

                // Promotion to present rank: prefer a record whose promoted rank
                // matches the member's current rank; else the most recent promotion.
                const proms = (promotion ?? []).filter((r: any) => (r.employeeID ?? r.EmployeeID) === employeeId);
                const matchRank = proms.filter((r: any) => (r.promotedRankId ?? r.PromotedRankId) === profile.armyRankId);
                const pool = matchRank.length ? matchRank : proms;
                this.promotionPresentDate = pool
                    .map((r: any) => (r.promotedDate ?? r.PromotedDate ?? null))
                    .filter(Boolean)
                    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

                const disc = (discipline ?? []).filter((r: any) => (r.employeeID ?? r.EmployeeID) === employeeId);
                this.hasPunishment = disc.length > 0;

                this.hasRfts = (rfts ?? []).length > 0;

                // Spouse district comes from the spouse permanent address row
                // (the profile overview only carries the member's own district).
                const addrRows = (address ?? []).filter((r: any) => (r.employeeID ?? r.EmployeeID) === employeeId);
                const isSpousePerm = (r: any) => {
                    const t = String(r?.locationType ?? '').toLowerCase();
                    return t.includes('spouse') && t.includes('perm');
                };
                const spouseAddr = addrRows.find(isSpousePerm) ?? addrRows.find((r: any) => String(r?.locationType ?? '').toLowerCase().includes('spouse'));
                this.spouseDistrict = spouseAddr?.district ?? null;
                this.spouseDistrictBN = spouseAddr?.districtBN ?? null;

                this.childrenCount = this.countChildren((family ?? []) as any[]);

                this.loadProfileImage(profile);
                this.loading = false;
            },
            error: (err) => {
                console.error(err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to load bio-data' });
                this.loading = false;
            },
        });
    }

    private loadProfileImage(profile: EmployeePersonalServiceOverview): void {
        const json = profile?.profileImages ?? (profile as { ProfileImages?: string })?.ProfileImages ?? null;
        if (!json || typeof json !== 'string') return;
        let refs: { FileId?: number; fileName?: string }[];
        try { refs = JSON.parse(json); } catch { return; }
        const first = Array.isArray(refs) && refs.length > 0 ? refs[0] : null;
        const fileId = first?.FileId ?? (first as { fileId?: number })?.fileId;
        if (fileId == null || fileId <= 0) return;
        this.empService.downloadFile(fileId).subscribe({
            next: (blob) => { if (blob && blob.size > 0) this.profileImageUrl = URL.createObjectURL(blob); },
            error: () => {},
        });
    }

    private openPickerForCandidates(candidates: DynamicReportRow[]): void {
        const sansEmptyDash = (s: string) => (!s || s === '-' || s === '—' ? '' : s);
        this.pickerRows = candidates.map((d) => {
            const prefix    = sansEmptyDash(this.codeValue(d['prefix'] as string, d['prefixBN'] as string));
            const serviceId = d['serviceId'] ? this.displayNum(d['serviceId'] as string) : '';
            const rank      = sansEmptyDash(this.codeValue(d['armyRank'] as string, d['armyRankBN'] as string));
            const name      = this.codeValue(d['nameEnglish'] as string, d['nameBangla'] as string);
            const parts: string[] = [];
            if (prefix && serviceId) parts.push(`${prefix}-${serviceId}`);
            else if (prefix)         parts.push(prefix);
            else if (serviceId)      parts.push(serviceId);
            if (rank) parts.push(rank);
            if (name) parts.push(name);
            return {
                employeeId: d['employeeId'] as number,
                displayName: parts.join(' '),
                orgName:     this.codeValue(d['motherOrganization'] as string, d['motherOrganizationBN'] as string),
                status:      this.formatPostingStatus(d['postingStatus']),
            };
        });
        this.showPickerDialog = true;
        this.pickerLookupRows = candidates;
    }

    pickerSelect(employeeId: number): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.fetchForEmployee(employeeId);
    }
    pickerClose(): void {
        this.showPickerDialog = false;
        this.pickerRows = [];
        this.pickerLookupRows = [];
        this.resetResults();
    }

    private static readonly statusDisplayMap: Record<string, { en: string; bn: string }> = {
        Servings: { en: 'Serving', bn: 'কর্মরত' }, Serving: { en: 'Serving', bn: 'কর্মরত' },
        ExMember: { en: 'Ex-Member', bn: 'সাবেক সদস্য' },
        Pending: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' }, PendingForJoining: { en: 'Pending for Joining', bn: 'যোগদানের অপেক্ষায়' },
        Supernumerary: { en: 'Supernumerary', bn: 'সুপারনিউমারারি' },
    };
    private formatPostingStatus(raw: unknown): string {
        const s = (raw ?? '').toString().trim();
        if (!s) return '-';
        const mapped = ReportBioDataIndividualComponent.statusDisplayMap[s];
        if (mapped) return this.isBn ? mapped.bn : mapped.en;
        return s;
    }

    // ── Export ─────────────────────────────────────────────────────────
    toggleExportDropdown(event: Event): void { event.stopPropagation(); this.exportDropdownOpen = !this.exportDropdownOpen; }

    async exportAs(type: 'print' | 'word'): Promise<void> {
        this.exportDropdownOpen = false;
        if (!this.profile) return;
        if (type === 'print') { this.printBioData(); return; }
        await this.exportWord();
    }

    private printBioData(): void {
        const win = window.open('', '_blank', 'width=1100,height=900');
        if (!win) {
            this.messageService.add({ severity: 'warn', summary: 'Popup blocked', detail: 'Allow popups for this site to use Print.', life: 6000 });
            return;
        }
        const html = this.buildPrintHtml();
        win.document.open(); win.document.write(html); win.document.close();
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* user can Ctrl+P */ } }, 600);
    }

    private buildPrintHtml(): string {
        const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        const isBn = this.isBn;
        const grotesk = isBn ? "'Times New Roman', 'Nirmala UI', sans-serif" : "'Space Grotesk', 'Helvetica Neue', Helvetica, sans-serif";
        const mono = isBn ? "'Times New Roman', 'Nirmala UI', monospace" : "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

        const renderItem = (it: BioCatalogItem): string => {
            const cls = 'f' + (it.span === 2 ? ' span2' : '');
            let inner: string;
            if (it.kind === 'chips') {
                inner = this.specialTrainingChips.length
                    ? `<span class="chips">${this.specialTrainingChips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</span>`
                    : `<span class="v empty">—</span>`;
            } else if (it.kind === 'orientation' || it.kind === 'punishment') {
                const label = it.kind === 'orientation' ? this.orientationLabel : this.punishmentLabel;
                const has = it.kind === 'orientation' ? this.orientationHasValue : this.punishmentHasValue;
                inner = has ? `<span class="pill">${esc(label)}</span>` : `<span class="v empty">—</span>`;
            } else {
                const v = this.valueFor(it.key);
                inner = v === '-' ? `<span class="v empty">—</span>` : `<span class="v">${esc(v)}</span>`;
            }
            return `<div class="${cls}"><span class="k">${esc(this.fieldLabel(it))}</span>${inner}</div>`;
        };
        const section = (num: string, title: string, sec: 1 | 2 | 3 | 4): string => {
            const items = this.visibleFields(sec);
            if (!items.length) return '';
            const gridCls = sec === 4 ? 'grid two' : 'grid';
            return `<section class="section"><div class="sec-head"><span class="sec-num">${num}</span><span class="sec-title">${esc(title)}</span><span class="sec-rule"></span></div><div class="${gridCls}">${items.map(renderItem).join('')}</div></section>`;
        };
        const photo = this.profileImageUrl
            ? `<div class="photo"><img src="${this.profileImageUrl}" alt="Photo" /></div>`
            : `<div class="photo photo-ph">${esc(this.lx('PHOTO', 'ছবি'))}</div>`;
        const headMeta = this.headMetaParts.map(p => `<span>${esc(p)}</span>`).join('<span class="dot"></span>');
        const idStrip = this.idStrip.map(b => `<div class="blk"><span class="ik">${esc(b.k)}</span><span class="iv">${esc(b.v)}</span></div>`).join('');

        return `<!DOCTYPE html>
<html lang="${isBn ? 'bn' : 'en'}">
<head><meta charset="UTF-8" /><title>${esc(this.docTypeLabel)} — ${esc(this.heroName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root { --paper:#fbfbf9; --sheet:#fff; --ink:#141413; --ink-soft:#3c3c39; --muted:#8d8d88; --faint:#bcbcb6; --line:#e8e7e3; --line-strong:#d3d2cc; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:${grotesk}; background:var(--paper); color:var(--ink); -webkit-font-smoothing:antialiased; display:flex; justify-content:center; padding:40px 20px 72px; }
  .sheet { background:var(--sheet); width:100%; max-width:860px; border:1px solid var(--line); box-shadow:0 36px 70px -48px rgba(0,0,0,0.3); padding:44px 48px 40px; }
  .meta-bar { display:flex; justify-content:space-between; align-items:baseline; gap:16px; font-family:${mono}; font-size:10px; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); padding-bottom:18px; border-bottom:1.5px solid var(--ink); flex-wrap:wrap; }
  .meta-bar .lead { color:var(--ink); font-weight:600; }
  .head { display:grid; grid-template-columns:1fr 118px; gap:36px; align-items:start; padding:18px 0 20px; border-bottom:1px solid var(--line); }
  .name { font-size:33px; font-weight:600; letter-spacing:-0.025em; line-height:1.02; }
  .postnom { font-family:${mono}; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-soft); margin-top:9px; }
  .name-bn { font-size:14px; color:var(--ink-soft); margin-top:6px; }
  .head-meta { display:flex; flex-wrap:wrap; gap:7px 12px; margin-top:16px; font-family:${mono}; font-size:10.5px; letter-spacing:0.05em; text-transform:uppercase; color:var(--ink); }
  .head-meta .dot { width:4px; height:4px; border-radius:50%; background:var(--line-strong); align-self:center; }
  .id-strip { display:flex; flex-wrap:wrap; gap:12px 40px; margin-top:18px; }
  .id-strip .blk { display:grid; gap:3px; min-width:0; max-width:100%; }
  .id-strip .ik { font-family:${mono}; font-size:9px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
  .id-strip .iv { font-family:${mono}; font-size:14px; font-weight:600; letter-spacing:0.02em; line-height:1.35; word-break:break-all; }
  .photo { width:118px; height:142px; border:1px solid var(--line-strong); overflow:hidden; }
  .photo img { width:100%; height:100%; object-fit:cover; display:block; }
  .photo-ph { display:flex; align-items:center; justify-content:center; font-family:${mono}; font-size:10px; letter-spacing:0.2em; color:var(--muted); background:#fafafa; }
  .section { padding:16px 0 2px; border-bottom:1px solid var(--line); }
  .section:last-of-type { border-bottom:none; }
  .sec-head { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
  .sec-num { font-family:${mono}; font-size:9.5px; font-weight:600; letter-spacing:0.06em; color:var(--paper); background:var(--ink); padding:3px 6px; line-height:1; }
  .sec-title { font-family:${mono}; font-size:11px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; white-space:nowrap; }
  .sec-rule { flex:1; height:1px; background:var(--line); }
  .grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:13px 40px; }
  .grid.two { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .f { min-width:0; }
  .f.span2 { grid-column:span 2; }
  .f.span3 { grid-column:span 3; }
  .k { display:block; font-family:${mono}; font-size:9px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:5px; }
  .v { display:block; font-size:13.5px; font-weight:400; color:var(--ink); line-height:1.4; padding-bottom:5px; border-bottom:1px solid var(--line); min-height:1.4em; word-break:break-word; }
  .v.empty { color:var(--faint); }
  .pill { display:inline-block; font-family:${mono}; font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; padding:4px 14px; background:var(--ink); color:#fff; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; padding-bottom:4px; }
  .chip { font-size:12px; line-height:1.3; padding:3px 10px; border:1px solid var(--line-strong); color:var(--ink); white-space:nowrap; }
  @media print { body { background:#fff; padding:0; } .sheet { border:none; box-shadow:none; max-width:none; padding:12mm 14mm; } @page { size:A4; margin:0; } .section { break-inside:avoid; } }
</style></head>
<body>
  <div class="sheet">
    <div class="meta-bar"><span class="lead">${esc(this.docTypeLabel)}</span><span>${esc(this.confidentialLine)}</span></div>
    <header class="head">
      <div>
        <div class="name">${esc(this.heroName)}</div>
        ${this.postNom ? `<div class="postnom">${esc(this.postNom)}</div>` : ''}
        ${this.heroNameAlt !== '-' ? `<div class="name-bn">${esc(this.heroNameAlt)}</div>` : ''}
        <div class="head-meta">${headMeta}</div>
        <div class="id-strip">${idStrip}</div>
      </div>
      ${photo}
    </header>
    ${section('01', this.secService, 1)}
    ${section('02', this.secPersonal, 2)}
    ${section('03', this.secDistrict, 3)}
    ${section('04', this.secRabExp, 4)}
  </div>
</body></html>`;
    }

    private async exportWord(): Promise<void> {
        this.exporting = true;
        try {
            const isBn = this.isBn;
            // Bangla glyphs are complex-script — the run must carry a cs (and
            // eastAsia) font + sizeComplexScript, otherwise Word falls back to a
            // non-Bangla cs font and renders boxes. Nirmala UI ships with Windows.
            const bnFont = { ascii: 'Times New Roman', hAnsi: 'Times New Roman', cs: 'Nirmala UI', eastAsia: 'Nirmala UI', hint: 'cs' as const };
            const bnLang = { value: 'bn-BD', bidirectional: 'bn-BD', eastAsia: 'bn-BD' } as any;
            const sans = isBn ? (bnFont as any) : 'Calibri';
            const serif = isBn ? (bnFont as any) : 'Cambria';
            const mono = isBn ? (bnFont as any) : 'Consolas';
            const ext = (size: number) => isBn ? { language: bnLang, sizeComplexScript: size } : {};
            const ws = (s: string | null | undefined) => s ?? '';
            const C = { ink: '141413', muted: '8D8D88', line: 'D3D2CC', soft: '3C3C39' };

            const noBorder = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
            const cellBorder = { top: { style: BorderStyle.SINGLE, size: 2, color: C.line }, bottom: { style: BorderStyle.SINGLE, size: 2, color: C.line }, left: { style: BorderStyle.SINGLE, size: 2, color: C.line }, right: { style: BorderStyle.SINGLE, size: 2, color: C.line } };

            // Header block
            const headerPars: Paragraph[] = [
                new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: ws(this.docTypeLabel) + '   ·   ' + ws(this.confidentialLine), font: mono, size: 16, ...ext(16), color: C.muted, allCaps: !isBn, characterSpacing: isBn ? 0 : 30 })] }),
                new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.heroName), font: serif, size: 40, ...ext(40), bold: true, color: C.ink })] }),
            ];
            if (this.postNom) headerPars.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.postNom), font: mono, size: 18, ...ext(18), color: C.soft, allCaps: !isBn, characterSpacing: isBn ? 0 : 24 })] }));
            if (this.heroNameAlt !== '-') headerPars.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: ws(this.heroNameAlt), font: serif, size: 22, ...ext(22), color: C.soft })] }));
            headerPars.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: this.headMetaParts.join('   ·   '), font: mono, size: 18, ...ext(18), color: C.ink, allCaps: !isBn })] }));
            headerPars.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: this.idStrip.map(b => `${b.k}: ${b.v}`).join('     '), font: mono, size: 18, ...ext(18), bold: true, color: C.ink })] }));

            const kvTable = (items: { k: string; v: string }[]): Table => new Table({
                width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3400, 6600],
                rows: items.map(it => new TableRow({ cantSplit: true, children: [
                    new TableCell({ borders: cellBorder, width: { size: 34, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, shading: { type: 'clear' as const, fill: 'F7F7F5', color: 'auto' }, children: [new Paragraph({ children: [new TextRun({ text: ws(it.k), font: mono, size: 16, ...ext(16), color: C.muted, allCaps: !isBn, characterSpacing: isBn ? 0 : 16 })] })] }),
                    new TableCell({ borders: cellBorder, width: { size: 66, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: ws(it.v), font: serif, size: 20, ...ext(20), color: C.ink })] })] }),
                ] })),
            });

            const sectionHeading = (num: string, title: string): Paragraph => new Paragraph({
                spacing: { before: 260, after: 100 },
                children: [new TextRun({ text: `${num}  ·  ${title}`, font: mono, size: 19, ...ext(19), bold: true, color: C.ink, allCaps: !isBn, characterSpacing: isBn ? 0 : 28 })],
            });

            // Only sections that have at least one selected field are emitted.
            const sectionToKV = (sec: 1 | 2 | 3 | 4) => this.visibleFields(sec).map(it => {
                const v = this.fieldDisplayValue(it);
                return { k: this.fieldLabel(it), v: v === '-' ? '—' : v };
            });
            const sectionBlocks: (Paragraph | Table)[] = [];
            const addSection = (num: string, title: string, sec: 1 | 2 | 3 | 4) => {
                const kv = sectionToKV(sec);
                if (!kv.length) return;
                sectionBlocks.push(sectionHeading(num, title), kvTable(kv));
            };
            addSection('01', this.secService, 1);
            addSection('02', this.secPersonal, 2);
            addSection('03', this.secDistrict, 3);
            addSection('04', this.secRabExp, 4);

            const doc = new Document({
                sections: [{
                    properties: { page: { size: { orientation: PageOrientation.PORTRAIT }, margin: { top: 720, bottom: 720, left: 800, right: 800 } } },
                    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${isBn ? 'পৃষ্ঠা' : 'PAGE'} `, PageNumber.CURRENT, ` ${isBn ? '/' : 'OF'} `, PageNumber.TOTAL_PAGES], font: mono, size: 13, ...ext(13), color: C.muted, allCaps: !isBn })] })] }) },
                    children: [...headerPars, ...sectionBlocks],
                }],
            });
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `bio-data_${this.lang}.docx`);
        } finally {
            this.exporting = false;
        }
    }
}
