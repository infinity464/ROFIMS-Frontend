import { Injectable, inject } from '@angular/core';
import { ExportService, ReportSection, SectionedReportConfig } from '@/services/export.service';
import { RftsNominalRoll, RftsNominalRollRow } from '@/models/rfts-course-ref-report.model';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const BN_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

/** Bangla column headings, in the order the printed roll uses. */
const COLUMNS_BN = ['ক্রমিক', 'ব্যক্তিগত নং', 'পদবি', 'নাম', 'মাতৃ ইউনিট', 'র‍্যাব আইডি'];

const DOC_TITLE_BN = 'র‍্যাব ওরিয়েন্টেশন ট্রেনিং এ অংশগ্রহণের নিমিত্তে সংযুক্তকৃত র‍্যাব সদস্যদের নামীয় তালিকা';

/** Default first line of the memo block. */
const ANNEXURE_LABEL_BN = 'ক্রোড়পত্র ক';

/** Per-caller tweaks to the roll. */
export interface NominalRollOptions {
    /**
     * First line of the memo block. Defaults to 'ক্রোড়পত্র ক'; pass null to
     * omit it entirely (the draft-list roll is not an annexure).
     */
    annexureLabel?: string | null;
}

/**
 * Builds the RFTS orientation-training nominal roll — the annexure listing the
 * members attached to one RFTS selection, grouped by their root mother
 * organisation and rendered in Bangla.
 *
 * Three outputs share one row model: Print (browser → PDF), Word and Excel.
 */
@Injectable({ providedIn: 'root' })
export class RftsNominalRollService {
    private exportService = inject(ExportService);

    // ---------- Bangla formatting ----------
    /** Western digits → Bangla. Non-digits (dots, slashes, dashes) pass through. */
    toBnDigits(value: string | number | null | undefined): string {
        if (value == null || value === '') return '';
        return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
    }

    /**
     * "2026-07-15" → "১৫ জুলাই ২০২৬".
     * Parsed from parts so it stays a local date — `new Date('2026-07-15')` is
     * UTC midnight and can render as the previous day west of Greenwich.
     */
    toBnDate(iso: string | null | undefined): string {
        if (!iso) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!m) return '';
        const [, y, mo, d] = m;
        const monthName = BN_MONTHS[Number(mo) - 1] ?? '';
        return `${this.toBnDigits(String(Number(d)))} ${monthName} ${this.toBnDigits(y)}`;
    }

    /** Bangla value when present, else the English one, else an em dash. */
    private pick(bn: string | null, en: string | null): string {
        const v = (bn ?? '').trim() || (en ?? '').trim();
        return v || '—';
    }

    // ---------- Grouping ----------
    /**
     * Groups rows into bands by root mother organisation, preserving the order the
     * server sorted them in. The serial number runs continuously across bands, as
     * on the printed roll — it does not restart per group.
     */
    buildSections(roll: RftsNominalRoll): ReportSection[] {
        const sections: ReportSection[] = [];
        let serial = 0;
        let currentKey: string | null = null;
        let current: ReportSection | null = null;

        for (const r of roll.rows ?? []) {
            const label = this.pick(r.groupNameBN, r.groupNameEN);
            // Keyed on the rendered label so two orgs that display identically
            // don't split into two bands with the same heading.
            if (current === null || label !== currentKey) {
                current = { title: label, rows: [] };
                sections.push(current);
                currentKey = label;
            }
            serial++;
            current.rows.push(this.toRow(r, serial));
        }

        return sections;
    }

    private toRow(r: RftsNominalRollRow, serial: number): string[] {
        return [
            this.toBnDigits(serial) + '।',
            this.toBnDigits(r.serviceId ?? ''),
            this.pick(r.rankNameBN, r.rankNameEN),
            this.pick(r.fullNameBN, r.fullNameEN),
            this.pick(r.motherUnitNameBN, r.motherUnitNameEN),
            this.toBnDigits(r.rabId ?? '')
        ];
    }

    private filenameFor(roll: RftsNominalRoll): string {
        // Course numbers can carry slashes and dots (govt memo format); strip
        // anything a filesystem would reject.
        const safe = (roll.courseRefNo || 'rfts').replace(/[^\p{L}\p{N}_-]+/gu, '_');
        return `RFTS_Nominal_Roll_${safe}`;
    }

    // ---------- Memo block ----------
    /**
     * The lines above the title. `annexureLabel` is the "ক্রোড়পত্র ক" line —
     * pass null to drop it, which the draft-list roll does since a draft is not
     * an annexure to anything yet.
     */
    private memoLines(roll: RftsNominalRoll, opts?: NominalRollOptions): string[] {
        const label = opts && 'annexureLabel' in opts ? opts.annexureLabel : ANNEXURE_LABEL_BN;
        return [
            ...(label ? [label] : []),
            'র‍্যাব ফোর্সেস সদর দপ্তর',
            // The course / reference no stands on its own — no "স্মারক নং-" label,
            // since these numbers are not government memo numbers.
            this.toBnDigits(roll.courseRefNo),
            `তারিখঃ ${this.toBnDate(roll.courseDate)}`
        ];
    }

    // ---------- Word / Excel ----------
    private sectionedConfig(roll: RftsNominalRoll, opts?: NominalRollOptions): SectionedReportConfig {
        return {
            title: DOC_TITLE_BN,
            lang: 'bn',
            columns: COLUMNS_BN,
            sections: this.buildSections(roll),
            showPageNumbers: true,
            filename: this.filenameFor(roll),
            // Nirmala UI ships with Windows and is always registered. SolaimanLipi
            // (the shared default) is often only dropped into the Fonts folder
            // without being registered, and Word then renders every Bengali glyph
            // as a tofu box with no warning.
            bnFont: 'Nirmala UI',
            // The memo block. It goes in filterLines, NOT preDateLines: the
            // sectioned Word and Excel writers only render filterLines, so
            // preDateLines would be dropped silently from both.
            filterLines: this.memoLines(roll, opts)
        };
    }

    async exportWord(roll: RftsNominalRoll, opts?: NominalRollOptions): Promise<void> {
        await this.exportService.exportWordSectioned(this.sectionedConfig(roll, opts));
    }

    exportExcel(roll: RftsNominalRoll, opts?: NominalRollOptions): void {
        this.exportService.exportExcelSectioned(this.sectionedConfig(roll, opts));
    }

    // ---------- Print / PDF ----------
    /**
     * Opens the roll in a print window laid out like the paper annexure: the memo
     * block top-right, the centred title, then one continuous table whose group
     * bands are full-width heading rows.
     */
    print(roll: RftsNominalRoll, opts?: NominalRollOptions): boolean {
        const win = window.open('', '_blank');
        // Blocked by a popup blocker — the caller surfaces a message.
        if (!win) return false;

        win.document.open();
        win.document.write(this.buildPrintHtml(roll, opts));
        win.document.close();
        win.focus();
        return true;
    }

    private esc(s: string): string {
        return (s ?? '').replace(/[&<>"]/g, (c) =>
            c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');
    }

    /**
     * Natural-flow document — no manual pagination. The page number comes from
     * the CSS Paged Media `@bottom-center` margin box, the same mechanism
     * /report-confidential-remarks uses, with a `bn-digits` counter style so
     * `counter(page)` renders as Bangla numerals.
     *
     * The @page bottom margin is what reserves room for the footer, so content
     * can never collide with it — the reason the earlier hand-rolled pagination
     * kept overlapping.
     */
    private buildPrintHtml(roll: RftsNominalRoll, opts?: NominalRollOptions): string {
        const sections = this.buildSections(roll);
        const colCount = COLUMNS_BN.length;
        // Absolute, because a window.open('') document has no base URL to
        // resolve '/assets/...' against.
        const origin = window.location.origin;

        const head = COLUMNS_BN.map((c) => `<th>${this.esc(c)}</th>`).join('');

        const body = sections
            .map((s) => {
                const band = `<tr class="band"><td colspan="${colCount}">${this.esc(s.title ?? '')}</td></tr>`;
                const rows = s.rows
                    .map((cells) => `<tr>${cells.map((c, i) => `<td class="c${i}">${this.esc(c)}</td>`).join('')}</tr>`)
                    .join('');
                return band + rows;
            })
            .join('');

        const empty = `<tr><td colspan="${colCount}" class="empty">কোন সদস্য নেই।</td></tr>`;

        const memo = this.memoLines(roll, opts)
            .map((l) => `<div>${this.esc(l)}</div>`)
            .join('');

        return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<title>${this.esc(DOC_TITLE_BN)}</title>
<style>
  /* The print window is opened blank, so it inherits none of the app's styles
     and has no base URL — hence the absolute origin. Serving the font this way
     means the roll prints in SolaimanLipi even on machines where the font is
     not installed (it commonly sits in C:\\Windows\\Fonts unregistered, which
     leaves it invisible to both the browser and Word). */
  @font-face {
    font-family: 'SolaimanLipi';
    src: url('${origin}/assets/fonts/SolaimanLipi.ttf') format('truetype');
    font-weight: 400; font-style: normal; font-display: swap;
  }
  @font-face {
    font-family: 'SolaimanLipi';
    src: url('${origin}/assets/fonts/SolaimanLipi-Bold.ttf') format('truetype');
    font-weight: 700; font-style: normal; font-display: swap;
  }
  /* Bangla numerals for counter(page) / counter(pages). */
  @counter-style bn-digits {
    system: numeric;
    symbols: '০' '১' '২' '৩' '৪' '৫' '৬' '৭' '৮' '৯';
  }
  @page {
    size: A4 portrait;
    /* The 18mm bottom margin is the footer's reserved band. */
    margin: 12mm 10mm 18mm 10mm;
    @bottom-center {
      content: "পাতা-" counter(page, bn-digits) "/" counter(pages, bn-digits);
      font-family: 'SolaimanLipi', 'Nirmala UI', 'Kalpurush', serif;
      font-size: 11pt; font-weight: bold; color: #000;
      padding-top: 4mm; vertical-align: top;
    }
  }
  * { box-sizing: border-box; }
  body {
    /* SolaimanLipi first — it is served by the @font-face above, so it applies
       regardless of what is installed locally. The rest are fallbacks for the
       case where the app is not reachable to serve the file. */
    font-family: 'SolaimanLipi', 'Nirmala UI', 'Kalpurush', 'Nikosh', 'Noto Sans Bengali', serif;
    font-size: 11pt; color: #000; margin: 0;
  }
  .memo { text-align: right; line-height: 1.55; margin-bottom: 14px; }
  .memo div { white-space: nowrap; }
  h1 { font-size: 12.5pt; font-weight: bold; text-align: center; margin: 0 0 12px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* table-layout is fixed, so anything that cannot wrap spills past its cell
     border. break-word breaks ONLY a word that cannot fit on a line by itself.
     Avoid overflow-wrap:anywhere and word-break:break-word here — both also
     drive min-content sizing, which shatters Bangla mid-conjunct even when
     there is plenty of room. */
  th, td {
    border: 1px solid #000; padding: 3px 5px; vertical-align: middle;
    overflow-wrap: break-word;
  }
  thead th { font-weight: bold; text-align: center; }
  /* Repeat the column headings on every sheet the table runs onto. */
  thead { display: table-header-group; }
  /* Never split a row — or a group heading — across two sheets. */
  tr { page-break-inside: avoid; break-inside: avoid; }
  .band td { font-weight: bold; text-align: left; }
  .c0 { text-align: center; }
  /* No nowrap: a long personal / RAB number must wrap rather than spill out. */
  .c1 { text-align: left; }   /* ব্যক্তিগত নং */
  .c5 { text-align: center; } /* র‍্যাব আইডি */
  .empty { text-align: center; padding: 18px; }
  /* Widths are %, because the table is 100% of the printable width. On A4
     portrait with 10mm side margins that is 190mm ≈ 718px, so 1% ≈ 7.2px.
     ক্রমিক +5px, ব্যক্তিগত নং +15px, পদবি -20px — a net zero, so the row still
     totals 100%. */
  col.w0 { width: 7.7%; }  col.w1 { width: 17.1%; } col.w2 { width: 16.2%; }
  col.w3 { width: 24%; }   col.w4 { width: 23%; }   col.w5 { width: 12%; }
</style>
</head>
<body>
  <div class="memo">${memo}</div>

  <h1>${this.esc(DOC_TITLE_BN)}</h1>

  <table>
    <colgroup>
      <col class="w0"><col class="w1"><col class="w2"><col class="w3"><col class="w4"><col class="w5">
    </colgroup>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || empty}</tbody>
  </table>

  <script>
    // Wait for SolaimanLipi to arrive before printing — firing the dialog while
    // the face is still loading would capture the fallback font instead.
    window.onload = function () {
      var go = function () { window.focus(); window.print(); };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(go).catch(go);
      } else {
        go();
      }
    };
  </script>
</body>
</html>`;
    }
}
