import { Injectable, inject } from '@angular/core';
import { ExportService, ReportSection, SectionedReportConfig } from '@/services/export.service';
import { BanglaRollPrintService } from '@/services/bangla-roll-print.service';
import { SupernumeraryRoll, SupernumeraryRollRow } from '@/models/supernumerary-roll.model';

const DOC_TITLE_BN = 'নতুন আগত সদস্যদের নামের তালিকা';

/** Bangla column headings, in the order the printed roll uses. */
const COLUMNS_BN = [
    'ক্রমিক', 'ব্যক্তিগত নং', 'পদবি', 'নাম', 'নিজ জেলা',
    "স্ত্রী'র জেলা", 'পূর্ববর্তী কর্মস্থল', 'যোগদানে তারিখ', 'র‍্যাব আইডি'
];

/**
 * Percentages, one per column — must total 100. The print table spans the
 * printable width: A4 portrait less the 10mm side margins is 190mm ≈ 718px,
 * so 1% ≈ 7.2px.
 *
 * Cumulative adjustments, each a net zero so the row still totals 100:
 *   ব্যক্তিগত নং +15px, পূর্ববর্তী কর্মস্থল -7.5px, র‍্যাব আইডি -7.5px
 *   র‍্যাব আইডি +4px, নিজ জেলা -2px, স্ত্রী'র জেলা -2px
 *   পদবি -2px, নিজ জেলা +1px, স্ত্রী'র জেলা +1px
 */
const COL_WIDTHS = [6, 13.1, 11.72, 15, 9.86, 9.86, 16, 10, 8.46];

const COL_ALIGN: ('left' | 'center' | 'right')[] =
    ['center', 'left', 'left', 'left', 'left', 'left', 'left', 'center', 'center'];

/** Date window shown under the title. Both null renders no date line at all. */
export interface SupernumeraryRollDates {
    /** ISO yyyy-MM-dd */
    entryDateFrom?: string | null;
    /** ISO yyyy-MM-dd */
    entryDateTo?: string | null;
}

/**
 * Builds the supernumerary RAB-ID allocation roll — members grouped by their
 * root mother organisation and rendered in Bangla.
 *
 * Three outputs share one row model: Print (browser → PDF), Word and Excel.
 */
@Injectable({ providedIn: 'root' })
export class SupernumeraryRollService {
    private exportService = inject(ExportService);
    private rollPrint = inject(BanglaRollPrintService);

    /** Bangla value when present, else the English one, else an em dash. */
    private pick(bn: string | null, en: string | null): string {
        const v = (bn ?? '').trim() || (en ?? '').trim();
        return v || '—';
    }

    /**
     * পূর্ববর্তী কর্মস্থল — the unit, then its district. The comma only appears
     * when a district is actually known, so a unit alone never trails one.
     */
    private prevWorkplace(r: SupernumeraryRollRow): string {
        const unit = (r.motherUnitNameBN ?? '').trim() || (r.motherUnitNameEN ?? '').trim();
        const district = (r.motherUnitDistrictBN ?? '').trim() || (r.motherUnitDistrictEN ?? '').trim();
        if (!unit) return '—';
        return district ? `${unit}, ${district}` : unit;
    }

    /**
     * The তারিখঃ line. Both dates unset renders nothing; one set shows that date;
     * both set shows the range, collapsing to a single date when they match.
     */
    private dateLines(dates?: SupernumeraryRollDates): string[] {
        const from = dates?.entryDateFrom ?? null;
        const to = dates?.entryDateTo ?? null;
        if (!from && !to) return [];

        const fromBn = from ? this.rollPrint.toBnDate(from) : '';
        const toBn = to ? this.rollPrint.toBnDate(to) : '';

        if (!from) return [`তারিখঃ ${toBn}`];
        if (!to) return [`তারিখঃ ${fromBn}`];
        if (from === to) return [`তারিখঃ ${fromBn}`];
        return [`তারিখঃ ${fromBn} - ${toBn}`];
    }

    /**
     * Groups rows into bands by root mother organisation, preserving the order
     * the server sorted them in. The serial runs continuously across bands, as
     * on the printed roll — it does not restart per group.
     */
    buildSections(roll: SupernumeraryRoll): ReportSection[] {
        const sections: ReportSection[] = [];
        let serial = 0;
        let currentKey: string | null = null;
        let current: ReportSection | null = null;

        for (const r of roll.rows ?? []) {
            const label = this.pick(r.groupNameBN, r.groupNameEN);
            // Keyed on the rendered label so two orgs that display identically
            // do not split into two bands with the same heading.
            if (current === null || label !== currentKey) {
                current = { title: label, rows: [] };
                sections.push(current);
                currentKey = label;
            }
            serial++;
            current.rows.push([
                this.rollPrint.toBnDigits(serial) + '।',
                this.rollPrint.toBnDigits(r.serviceId ?? ''),
                this.pick(r.rankNameBN, r.rankNameEN),
                this.pick(r.fullNameBN, r.fullNameEN),
                this.pick(r.ownDistrictBN, r.ownDistrictEN),
                this.pick(r.spouseDistrictBN, r.spouseDistrictEN),
                this.prevWorkplace(r),
                this.rollPrint.toBnShortDate(r.joiningDate) || '—',
                this.rollPrint.toBnDigits(r.rabId ?? '') || '—'
            ]);
        }

        return sections;
    }

    // ---------- Print ----------
    /** Returns false when a popup blocker stopped the window opening. */
    print(roll: SupernumeraryRoll, dates?: SupernumeraryRollDates): boolean {
        return this.rollPrint.print({
            title: DOC_TITLE_BN,
            memoLines: [],
            // Centred under the title, as on the paper form — not in the
            // right-aligned memo block the RFTS rolls use.
            subLines: this.dateLines(dates),
            columns: COLUMNS_BN,
            colWidths: COL_WIDTHS,
            align: COL_ALIGN,
            sections: this.buildSections(roll),
            emptyText: 'কোন সদস্য নেই।',
            fontSizePt: 9.75
        });
    }

    // ---------- Word / Excel ----------
    private sectionedConfig(roll: SupernumeraryRoll, dates?: SupernumeraryRollDates): SectionedReportConfig {
        return {
            title: DOC_TITLE_BN,
            lang: 'bn',
            columns: COLUMNS_BN,
            sections: this.buildSections(roll),
            showPageNumbers: true,
            filename: 'RAB_ID_Allocation',
            // Nirmala UI ships with Windows and is always registered. SolaimanLipi
            // is often only dropped into the Fonts folder without being installed,
            // and Word then renders every Bengali glyph as a tofu box.
            bnFont: 'Nirmala UI',
            // The date line goes in filterLines, NOT preDateLines: the sectioned
            // Word and Excel writers only render filterLines.
            filterLines: this.dateLines(dates),
            landscape: true
        };
    }

    async exportWord(roll: SupernumeraryRoll, dates?: SupernumeraryRollDates): Promise<void> {
        await this.exportService.exportWordSectioned(this.sectionedConfig(roll, dates));
    }

    exportExcel(roll: SupernumeraryRoll, dates?: SupernumeraryRollDates): void {
        this.exportService.exportExcelSectioned(this.sectionedConfig(roll, dates));
    }
}
