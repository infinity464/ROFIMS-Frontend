import { Component, HostListener, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { firstValueFrom } from 'rxjs';
import { Packer } from 'docx';
import { ExportService } from '@/services/export.service';
import { UserMenuService } from '@/services/user-menu.service';
import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import { environment } from '@/Core/Environments/environment';
import {
    StatisticsService,
    type MemberTypeWiseOrgBlock,
    type MemberTypeWiseRow,
    type MemberTypeWiseManpowerResponse
} from '@/services/statistics.service';
import { OrgTreeFilterComponent } from '../shared/org-tree-filter/org-tree-filter.component';
import { RabReportPrintService } from '../shared/rab-report-print.service';

type Lang = 'en' | 'bn';

/**
 * Equivalent-name variant of the member-type-wise manpower report. Identical to
 * MemberTypeWiseManpowerComponent except Auth (and therefore Def/Sur) is sourced from
 * the equivalent-name man-power setup. Reuses the original template/styles via relative
 * paths so the base report stays untouched.
 */
@Component({
    selector: 'app-member-type-wise-equivalent-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule, OrgTreeFilterComponent],
    templateUrl: '../member-type-wise-manpower/member-type-wise-manpower.html',
    styleUrl: '../member-type-wise-manpower/member-type-wise-manpower.scss'
})
export class MemberTypeWiseEquivalentManpowerComponent implements OnInit {
    canInsert = true;
    canUpdate = true;
    canDelete = true;

    lang: Lang = 'en';
    loading = false;
    exporting = false;
    exportDropdownOpen = false;

    allOrgs: MemberTypeWiseOrgBlock[] = [];
    filteredOrgs: MemberTypeWiseOrgBlock[] = [];
    grandTotal: MemberTypeWiseRow = this.emptyRow();

    /** Names of the RAB Units the user is restricted to. null/empty = full access. */
    accessibleRabUnitNames: string[] | null = null;
    accessibleRabUnitNamesBN: string[] | null = null;
    /** Names of the Member Types the user is restricted to. null/empty = full access on this axis. */
    accessibleMemberTypeNames: string[] | null = null;
    accessibleMemberTypeNamesBN: string[] | null = null;

    /** Options for p-multiselect */
    orgOptions: { label: string; value: number }[] = [];
    selectedOrgIds: number[] = [];

    /** Org-tree node filter (Unit/Wing/Branch/…) — scopes Auth + Held server-side. */
    filterRabCodeId: number | null = null;
    filterLabel: string | null = null;

    private static readonly EN_MONTHS = [
        'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
        'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'
    ];
    private static readonly BN_MONTHS = [
        'জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন',
        'জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'
    ];

    private http = inject(HttpClient);

    constructor(
        private _router: Router,
        private _userMenuService: UserMenuService,
        private statisticsService: StatisticsService,
        private exportService: ExportService,
        private rabPrint: RabReportPrintService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    onOrgTreeFilter(e: { codeId: number | null; label: string | null }): void {
        this.filterRabCodeId = e.codeId;
        this.filterLabel = e.label;
        this.loadData();
    }

    private buildCriteriaItems(): { label: string; value: string }[] {
        const bn = this.lang === 'bn';
        const items: { label: string; value: string }[] = [];
        if (this.selectedOrgIds.length > 0) {
            const names = this.orgOptions.filter(o => this.selectedOrgIds.includes(o.value)).map(o => o.label);
            if (names.length) items.push({ label: bn ? 'বাহিনী' : 'ORGANIZATION', value: names.join(', ') });
        }
        if (this.filterLabel) items.push({ label: bn ? 'অফিস' : 'OFFICE', value: this.filterLabel });
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames) ?? this.accessibleRabUnitNames;
        if (unitNames && unitNames.length > 0) items.push({ label: bn ? 'ইউনিট' : 'UNITS', value: unitNames.join(', ') });
        const mtNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames) ?? this.accessibleMemberTypeNames;
        if (mtNames && mtNames.length > 0) items.push({ label: bn ? 'সদস্য ধরণ' : 'MEMBER TYPES', value: mtNames.join(', ') });
        if (items.length === 0) items.push({ label: bn ? 'পরিসর' : 'SCOPE', value: bn ? 'সকল ইউনিট' : 'All Unit' });
        return items;
    }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getMemberTypeWiseManpowerByEquivalentName(this.filterRabCodeId).subscribe({
            next: (res: MemberTypeWiseManpowerResponse) => {
                this.allOrgs = res.orgs ?? [];
                this.filteredOrgs = [...this.allOrgs];
                this.grandTotal = res.grandTotal ?? this.emptyRow();
                this.orgOptions = this.allOrgs.map(o => ({ label: o.orgName, value: o.orgId }));
                this.accessibleRabUnitNames      = res.accessibleRabUnitNames      ?? null;
                this.accessibleRabUnitNamesBN    = res.accessibleRabUnitNamesBN    ?? null;
                this.accessibleMemberTypeNames   = res.accessibleMemberTypeNames   ?? null;
                this.accessibleMemberTypeNamesBN = res.accessibleMemberTypeNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    get scopeLine(): string | null {
        const bn = this.lang === 'bn';
        const unitNames = (bn ? this.accessibleRabUnitNamesBN : this.accessibleRabUnitNames)
            ?? this.accessibleRabUnitNames;
        const memberTypeNames = (bn ? this.accessibleMemberTypeNamesBN : this.accessibleMemberTypeNames)
            ?? this.accessibleMemberTypeNames;

        const parts: string[] = [];
        if (unitNames && unitNames.length > 0) {
            parts.push(unitNames.join(', '));
        }
        if (memberTypeNames && memberTypeNames.length > 0) {
            const label = bn ? 'সদস্য ধরণ' : 'Member Types';
            parts.push(`${label}: ${memberTypeNames.join(', ')}`);
        }
        return parts.length === 0 ? null : parts.join('  |  ');
    }

    onOrgFilterChange(): void {
        if (!this.selectedOrgIds || this.selectedOrgIds.length === 0) {
            this.filteredOrgs = [...this.allOrgs];
        } else {
            this.filteredOrgs = this.allOrgs.filter(o => this.selectedOrgIds.includes(o.orgId));
        }
        this.grandTotal = this.computeGrandTotal(this.filteredOrgs);
    }

    toggleLang(): void { this.lang = this.lang === 'en' ? 'bn' : 'en'; }

    toggleExportDropdown(event: Event): void {
        event.stopPropagation();
        this.exportDropdownOpen = !this.exportDropdownOpen;
    }

    async exportAs(type: 'pdf' | 'print' | 'word' | 'excel'): Promise<void> {
        this.exportDropdownOpen = false;

        const scope = this.scopeLine;
        const sectionedConfig = {
            title: this.titleLabel,
            lang: this.lang,
            columns: this.colHeaders,
            sections: this.filteredOrgs.map(org => ({
                title: this.orgLabel(org),
                rows: org.rows.map((row, i) => [
                    this.fmt(i + 1),
                    this.memberTypeLabel(row),
                    this.fmt(row.auth),
                    this.fmt(row.held),
                    this.fmt(row.def),
                    this.fmt(row.sur),
                    this.fmt(row.postedOut),
                    row.remarks ?? ''
                ]),
                subtotalRow: [
                    '',
                    this.subtotalLabel,
                    this.fmt(org.subtotal.auth),
                    this.fmt(org.subtotal.held),
                    this.fmt(org.subtotal.def),
                    this.fmt(org.subtotal.sur),
                    this.fmt(org.subtotal.postedOut),
                    ''
                ]
            })),
            grandTotalRow: [
                '',
                this.grandTotalLabel,
                this.fmt(this.grandTotal.auth),
                this.fmt(this.grandTotal.held),
                this.fmt(this.grandTotal.def),
                this.fmt(this.grandTotal.sur),
                this.fmt(this.grandTotal.postedOut),
                ''
            ],
            showPageNumbers: true,
            filename: 'org-member-type-wise-equivalent-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true,
            rabLetterhead: true,
            criteriaItems: this.buildCriteriaItems()
        };

        if (type === 'print') {
            this.rabPrint.print({
                lang: this.lang,
                reportTitle: this.titleLabel,
                criteriaItems: this.buildCriteriaItems(),
                columns: sectionedConfig.columns.map((label, i) => ({
                    label, align: (i <= 1 || i === 7) ? 'left' : 'center', mono: i >= 2 && i <= 6
                })),
                sections: sectionedConfig.sections.map(s => ({
                    title: s.title, rows: s.rows, totalRow: s.subtotalRow
                })),
                grandTotalRow: sectionedConfig.grandTotalRow
            });
            return;
        }

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordSectioned(sectionedConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelSectioned(sectionedConfig);
                    break;
                case 'pdf': {
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    window.open(pdfUrl, '_blank');
                    break;
                }
            }
        } catch (err) {
            console.error(`${type} export failed`, err);
        } finally {
            this.exporting = false;
        }
    }

    private async convertDocxToPdf(docxBlob: Blob): Promise<Blob> {
        const form = new FormData();
        form.append('file', docxBlob, 'document.docx');
        return await firstValueFrom(
            this.http.post(`${environment.apis.core}/Document/ConvertToPdf`, form, { responseType: 'blob' })
        );
    }

    // ── Computed labels ───────────────────────────────────────────────────────

    get titleLabel(): string {
        return this.lang === 'en'
            ? 'ORGANIZATION & MEMBER TYPE WISE MANPOWER STATE (EQUIVALENT NAME)'
            : 'বাহিনী এবং সদস্য প্রকার অনুযায়ী জনবলের সারাংশ (সমতুল্য নাম)';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MemberTypeWiseEquivalentManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MemberTypeWiseEquivalentManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
    }

    get colHeaders(): string[] {
        return this.lang === 'en'
            ? ['Ser', 'Rank', 'Auth', 'Held', 'Def', 'Sur', 'Posted Out', 'Rmks']
            : ['ক্রমিক', 'পদবী', 'প্রাধিকার', 'বিদ্যমান', 'ঘাটতি', 'অতিরিক্ত', 'পোস্টিং আউট', 'মন্তব্য'];
    }

    get subtotalLabel(): string { return this.lang === 'en' ? 'Total' : 'মোট'; }
    get grandTotalLabel(): string { return this.lang === 'en' ? 'Grand Total' : 'সর্ব মোট'; }

    orgLabel(org: MemberTypeWiseOrgBlock): string {
        return this.lang === 'en' ? org.orgName : (org.orgNameBN || org.orgName);
    }

    memberTypeLabel(row: MemberTypeWiseRow): string {
        return this.lang === 'en' ? row.memberTypeName : (row.memberTypeNameBN || row.memberTypeName);
    }

    fmt(n: number | undefined | null): string {
        const s = String(n ?? 0);
        return this.lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private emptyRow(): MemberTypeWiseRow {
        return {
            memberTypeId: 0, memberTypeName: '', memberTypeNameBN: '',
            auth: 0, held: 0, def: 0, sur: 0, postedOut: 0, remarks: ''
        };
    }

    private computeGrandTotal(orgs: MemberTypeWiseOrgBlock[]): MemberTypeWiseRow {
        const auth      = orgs.reduce((s, o) => s + o.subtotal.auth,      0);
        const held      = orgs.reduce((s, o) => s + o.subtotal.held,      0);
        const def       = orgs.reduce((s, o) => s + o.subtotal.def,       0);
        const sur       = orgs.reduce((s, o) => s + o.subtotal.sur,       0);
        const postedOut = orgs.reduce((s, o) => s + o.subtotal.postedOut, 0);
        return {
            memberTypeId: 0, memberTypeName: '', memberTypeNameBN: '',
            auth, held, def, sur, postedOut, remarks: ''
        };
    }
}
