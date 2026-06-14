import { Injectable } from '@angular/core';
import { environment } from '@/Core/Environments/environment';
// @ts-ignore - browser-client ships without typings for the singleton's settable props
import jsreport from '@jsreport/browser-client';

// Dev: http://localhost:5488 (Node process on the dev machine).
// Prod: '/jsreport-api' (relative) — IIS reverse-proxies to localhost:5488 on
// the server, so the browser sees same-origin (no CORS, no mixed-content).
//
// @jsreport/browser-client runs `new URL(serverUrl)` internally, which throws
// on a relative path ("Failed to construct 'URL': Invalid URL"). So resolve a
// relative value against the current page origin → absolute, still same-origin.
const JSREPORT_SERVER_URL = /^https?:\/\//i.test(environment.jsreportUrl)
    ? environment.jsreportUrl
    : `${window.location.origin}${environment.jsreportUrl.startsWith('/') ? '' : '/'}${environment.jsreportUrl}`;

/** Default chrome-pdf options shared across previews. Margins must leave space
 * for the footer (page numbers). 1cm bottom is enough at 9pt footer text. */
const DEFAULT_CHROME: Record<string, unknown> = {
    format: 'A4',
    landscape: true,
    marginTop: '0.6cm',
    marginBottom: '1.2cm',
    marginLeft: '0.6cm',
    marginRight: '0.6cm',
    printBackground: true,
    displayHeaderFooter: true,
    // Chromium strips most CSS from header/footer templates; keep it inline and
    // simple. Empty header avoids printing the default "page title" string.
    headerTemplate: '<span></span>',
    footerTemplate:
        '<div style="font-size:9px;color:#8a96b0;width:100%;text-align:center;padding:0 8px;">' +
        'Page <span class="pageNumber"></span> of <span class="totalPages"></span>' +
        '</div>',
};

/**
 * Thin wrapper around `@jsreport/browser-client`. Points the singleton at the
 * local JsReport CE server.
 *
 * Trial mode: the render method sends the template INLINE (HTML for chrome-pdf)
 * so JsReport never has to look up a saved template by name — sidesteps
 * JsReport's authorization layer, so no users/credentials are needed.
 *
 * The JsReport server is a separate Node.js process. Start it from `jsreport/`:
 *   start.cmd      (or  npm start  — wraps start.cmd)
 */
@Injectable({ providedIn: 'root' })
export class JsReportService {
    constructor() {
        (jsreport as any).serverUrl = JSREPORT_SERVER_URL;
    }

    /**
     * PDF preview via chrome-pdf. Opens in a new browser tab. Chrome's PDF
     * viewer renders the footerTemplate's <span class="pageNumber"/> and
     * <span class="totalPages"/> automatically — no further client work needed.
     */
    async previewPdfInNewTab(
        content: string,
        data: unknown,
        title: string,
        chromeOverrides: Record<string, unknown> = {},
    ): Promise<void> {
        const res = await (jsreport as any).render({
            template: {
                content,
                engine: 'handlebars',
                recipe: 'chrome-pdf',
                chrome: { ...DEFAULT_CHROME, ...chromeOverrides },
            },
            data,
        });
        await res.openInWindow({ title });
    }

    /**
     * Render the SAME chrome-pdf template as `previewPdfInNewTab` but download
     * the result as a file instead of opening it in a tab. Use this for a
     * "PDF" download button that must look identical to the print preview.
     */
    async downloadPdf(
        content: string,
        data: unknown,
        filename: string,
        chromeOverrides: Record<string, unknown> = {},
    ): Promise<void> {
        const res = await (jsreport as any).render({
            template: {
                content,
                engine: 'handlebars',
                recipe: 'chrome-pdf',
                chrome: { ...DEFAULT_CHROME, ...chromeOverrides },
            },
            data,
        });
        const blob: Blob = await res.toBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
