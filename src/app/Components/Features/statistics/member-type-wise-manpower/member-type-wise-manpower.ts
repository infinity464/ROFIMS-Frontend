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

type Lang = 'en' | 'bn';

@Component({
    selector: 'app-member-type-wise-manpower',
    standalone: true,
    imports: [CommonModule, FormsModule, MultiSelectModule],
    templateUrl: './member-type-wise-manpower.html',
    styleUrl: './member-type-wise-manpower.scss'
})
export class MemberTypeWiseManpowerComponent implements OnInit {
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

    /** Options for p-multiselect */
    orgOptions: { label: string; value: number }[] = [];
    selectedOrgIds: number[] = [];

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
        private exportService: ExportService
    ) {}

    @HostListener('document:click')
    onDocumentClick(): void { this.exportDropdownOpen = false; }

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.loadData();
    }

    loadData(): void {
        this.loading = true;
        this.statisticsService.getMemberTypeWiseManpower().subscribe({
            next: (res: MemberTypeWiseManpowerResponse) => {
                this.allOrgs = res.orgs ?? [];
                this.filteredOrgs = [...this.allOrgs];
                this.grandTotal = res.grandTotal ?? this.emptyRow();
                this.orgOptions = this.allOrgs.map(o => ({
                    label: o.orgName,
                    value: o.orgId
                }));
                this.accessibleRabUnitNames   = res.accessibleRabUnitNames ?? null;
                this.accessibleRabUnitNamesBN = res.accessibleRabUnitNamesBN ?? null;
                this.loading = false;
            },
            error: () => { this.loading = false; }
        });
    }

    /** Comma-separated unit-scope line shown under the report title; null when unrestricted. */
    get scopeLine(): string | null {
        const names = this.lang === 'bn'
            ? (this.accessibleRabUnitNamesBN ?? this.accessibleRabUnitNames)
            : this.accessibleRabUnitNames;
        if (!names || names.length === 0) return null;
        return names.join(', ');
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
            filename: 'org-member-type-wise-manpower',
            filterLines: scope ? [scope] : undefined,
            landscape: true
        };

        try {
            this.exporting = true;
            switch (type) {
                case 'word':
                    await this.exportService.exportWordSectioned(sectionedConfig);
                    break;
                case 'excel':
                    this.exportService.exportExcelSectioned(sectionedConfig);
                    break;
                case 'pdf':
                case 'print': {
                    // PDF opens as a preview tab; Print opens a popup with the PDF
                    // in an iframe and auto-triggers the browser's print dialog.
                    const doc = this.exportService.buildSectionedWordDoc(sectionedConfig);
                    const docxBlob = await Packer.toBlob(doc);
                    const pdfBlob = await this.convertDocxToPdf(docxBlob);
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    if (type === 'pdf') {
                        window.open(pdfUrl, '_blank');
                    } else {
                        this.exportService.openPdfPrintPopup(pdfUrl);
                    }
                    break;
                }
            }
        } catch (err) {
            console.error(`${type} export failed`, err);
        } finally {
            this.exporting = false;
        }
    }

    /** POST the in-memory docx to the backend's LibreOffice-based conversion endpoint. */
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
            ? 'ORGANIZATION & MEMBER TYPE WISE MANPOWER STATE'
            : 'বাহিনী এবং সদস্য প্রকার অনুযায়ী জনবলের সারাংশ';
    }

    get dateLine(): string {
        const now = new Date();
        const day  = now.getDate();
        const mon  = now.getMonth();
        const year = now.getFullYear();
        if (this.lang === 'en') {
            return `${day} ${MemberTypeWiseManpowerComponent.EN_MONTHS[mon]} ${year}`;
        }
        return `${BanglaNumerals.toBangla(String(day))} ${MemberTypeWiseManpowerComponent.BN_MONTHS[mon]} ${BanglaNumerals.toBangla(String(year))}`;
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
