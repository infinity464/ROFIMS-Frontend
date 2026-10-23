import { Injectable } from '@angular/core';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const BN_MONTHS = [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

/** One group band and its rows. */
export interface BanglaRollSection {
    title: string;
    rows: string[][];
}

export interface BanglaRollDocument {
    /** Centred heading under the memo block. */
    title: string;
    /** Right-aligned lines above the title. Empty array renders nothing. */
    memoLines: string[];
    /** Centred lines below the title (e.g. the তারিখঃ line). */
    subLines?: string[];
    columns: string[];
    /** Column widths as CSS percentages, one per column. Should total 100. */
    colWidths: number[];
    /** Per-column text alignment. Defaults to left where unspecified. */
    align?: ('left' | 'center' | 'right')[];
    sections: BanglaRollSection[];
    /** Shown when there are no rows at all. */
    emptyText?: string;
    /** Body font size in pt. Defaults to 11. */
    fontSizePt?: number;
}

/**
 * Renders a Bangla nominal-roll style document in a print window: right-aligned
 * memo block, centred title, then one table whose group bands are full-width
 * heading rows.
 *
 * Pagination and the "পাতা-১/২" footer come from CSS Paged Media, not from
 * manual measurement — the browser breaks the table and `counter(page)` supplies
 * the number, rendered in Bangla via a custom counter style.
 */
@Injectable({ providedIn: 'root' })
export class BanglaRollPrintService {
    /** Western digits → Bangla. Non-digits (dots, slashes, dashes) pass through. */
    toBnDigits(value: string | number | null | undefined): string {
        if (value == null || value === '') return '';
        return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
    }

    /**
     * "2026-07-15" → "১৫ জুলাই ২০২৬".
     * Parsed from parts so it stays a local date — new Date('2026-07-15') is
     * UTC midnight and can render as the previous day west of Greenwich.
     */
    toBnDate(iso: string | null | undefined): string {
        if (!iso) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!m) return '';
        const [, y, mo, d] = m;
        return `${this.toBnDigits(String(Number(d)))} ${BN_MONTHS[Number(mo) - 1] ?? ''} ${this.toBnDigits(y)}`;
    }

    /** "2026-07-15" → "১৫-০৭-২৬", the short form the roll tables use. */
    toBnShortDate(iso: string | null | undefined): string {
        if (!iso) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
        if (!m) return '';
        const [, y, mo, d] = m;
        return this.toBnDigits(`${d}-${mo}-${y.slice(2)}`);
    }

    /** Returns false when a popup blocker stopped the window opening. */
    print(doc: BanglaRollDocument): boolean {
        const win = window.open('', '_blank');
        if (!win) return false;

        win.document.open();
        win.document.write(this.buildHtml(doc));
        win.document.close();
        win.focus();
        return true;
    }

    private esc(s: string): string {
        return (s ?? '').replace(/[&<>"]/g, (c) =>
            c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;');
    }

    private buildHtml(doc: BanglaRollDocument): string {
        // Absolute, because a window.open('') document has no base URL to
        // resolve '/assets/...' against.
        const origin = window.location.origin;
        const colCount = doc.columns.length;
        const fontPt = doc.fontSizePt ?? 11;

        const head = doc.columns.map((c) => `<th>${this.esc(c)}</th>`).join('');

        const body = doc.sections
            .map((s) => {
                const band = s.title
                    ? `<tr class="band"><td colspan="${colCount}">${this.esc(s.title)}</td></tr>`
                    : '';
                const rows = s.rows
                    .map((cells) => `<tr>${cells.map((c, i) => `<td class="c${i}">${this.esc(c)}</td>`).join('')}</tr>`)
                    .join('');
                return band + rows;
            })
            .join('');

        const empty = `<tr><td colspan="${colCount}" class="empty">${this.esc(doc.emptyText ?? 'কোন তথ্য নেই।')}</td></tr>`;

        const memo = doc.memoLines.map((l) => `<div>${this.esc(l)}</div>`).join('');
        const sub = (doc.subLines ?? []).map((l) => `<div>${this.esc(l)}</div>`).join('');

        const colgroup = doc.colWidths.map((w, i) => `<col class="w${i}" style="width:${w}%">`).join('');
        const alignCss = (doc.align ?? [])
            .map((a, i) => (a ? `.c${i} { text-align: ${a}; }` : ''))
            .join('\n  ');

        return `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<title>${this.esc(doc.title)}</title>
<style>
  /* Served by the app, so the roll prints in SolaimanLipi even where the font
     is not installed — it commonly sits in C:\\Windows\\Fonts unregistered,
     which leaves it invisible to the browser. */
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
    font-family: 'SolaimanLipi', 'Nirmala UI', 'Kalpurush', 'Nikosh', 'Noto Sans Bengali', serif;
    font-size: ${fontPt}pt; color: #000; margin: 0;
  }
  .memo { text-align: right; line-height: 1.55; margin-bottom: 14px; }
  .memo div { white-space: nowrap; }
  h1 { font-size: 12.5pt; font-weight: bold; text-align: center; margin: 0 0 6px; line-height: 1.5; }
  /* Centred under the title. nowrap so a date range never splits across lines. */
  .subhead { text-align: center; margin: 0 0 12px; line-height: 1.5; }
  .subhead div { white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  /* break-word only breaks a word that cannot fit a line by itself; anywhere /
     word-break also drive min-content sizing, which shatters Bangla conjuncts. */
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
  .empty { text-align: center; padding: 18px; }
  ${alignCss}
</style>
</head>
<body>
  ${memo ? `<div class="memo">${memo}</div>` : ''}

  <h1>${this.esc(doc.title)}</h1>
  ${sub ? `<div class="subhead">${sub}</div>` : ''}

  <table>
    <colgroup>${colgroup}</colgroup>
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
