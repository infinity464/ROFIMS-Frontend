import { BanglaNumerals } from '@/Core/i18n/bangla-numerals';
import type { ReportLang } from '@/Core/i18n/report-labels';

/**
 * Shared composite-cell renderers for the formal-RAB report layout.
 *
 * These functions are pure (lang passed in, no `this`) so they can be reused
 * by `report-address-location` and the upcoming `report-dynamic` component
 * without duplicating the rank/org/SVC and Division/District/Upazila logic.
 *
 * The row-shape interfaces are intentionally narrow — any object that has
 * the listed optional fields can be passed (duck-typed). This lets the
 * dynamic report (which projects rows as `Record<string, unknown>` keyed by
 * SearchFieldRegistry field IDs) call the same helpers as the strongly-typed
 * `AddressLocationReportRow` without an adapter layer.
 */

export interface PersonnelMetaRow {
    rank?: string | null;
    rankBN?: string | null;
    orgName?: string | null;
    orgNameBN?: string | null;
    serviceId?: string | number | null;
}

export interface AddressCrumbRow {
    division?: string | null;
    divisionBN?: string | null;
    district?: string | null;
    districtBN?: string | null;
    upazila?: string | null;
    upazilaBN?: string | null;
}

export interface AddressDetailRow {
    postOffice?: string | null;
    postOfficeBN?: string | null;
    address?: string | null;
    addressBN?: string | null;
}

/** Returns the trimmed BN value when lang=bn and it's non-empty, else EN
    (or BN fallback), else an em-dash placeholder. Single source of truth for
    the bilingual "show whichever is populated" rule used across all reports. */
export function codeValue(
    enVal: string | null | undefined,
    bnVal: string | null | undefined,
    lang: ReportLang,
): string {
    if (lang === 'bn' && bnVal != null && bnVal.trim() !== '') return bnVal.trim();
    return enVal ?? bnVal ?? '—';
}

/** Stringifies a number/id and converts to Bangla digits in bn mode. */
export function displayNum(
    v: number | string | null | undefined,
    lang: ReportLang,
): string {
    if (v == null || v === '') return '-';
    const s = String(v);
    return lang === 'bn' ? BanglaNumerals.toBangla(s) : s;
}

/** Zero-pads a serial to 2 digits and converts to Bangla digits in bn mode. */
export function paddedSer(
    n: number | string | null | undefined,
    lang: ReportLang,
): string {
    if (n == null || n === '') return '—';
    const padded = String(n).padStart(2, '0');
    return lang === 'bn' ? BanglaNumerals.toBangla(padded) : padded;
}

/** "CPL · ARMY · SVC 4045260" — sub-meta line under the personnel name. */
export function personnelMeta(row: PersonnelMetaRow, lang: ReportLang): string {
    const rank = codeValue(row.rank, row.rankBN, lang);
    const org = codeValue(row.orgName, row.orgNameBN, lang);
    const svcId = row.serviceId != null && row.serviceId !== '' ? displayNum(row.serviceId, lang) : '';
    const svc = svcId && svcId !== '-' ? (lang === 'bn' ? `সার্ভিস ${svcId}` : `SVC ${svcId}`) : '';
    return [rank, org, svc].filter((s) => s && s !== '—' && s !== '-').join(' · ');
}

/** Geographic crumbs — each part labelled (Division/District/Upazila) so a
    reader can see what the value names without inferring from position alone. */
export function addressCrumbParts(
    row: AddressCrumbRow,
    lang: ReportLang,
): { label: string; value: string }[] {
    const bn = lang === 'bn';
    const parts = [
        { label: bn ? 'বিভাগ' : 'Division', value: codeValue(row.division, row.divisionBN, lang) },
        { label: bn ? 'জেলা' : 'District', value: codeValue(row.district, row.districtBN, lang) },
        { label: bn ? 'উপজেলা' : 'Upazila', value: codeValue(row.upazila, row.upazilaBN, lang) },
    ];
    return parts.filter((p) => p.value && p.value !== '—');
}

/** "P.O. Bishnapur · Holding 54, Kholla, 3413" — second address line. */
export function addressDetail(row: AddressDetailRow, lang: ReportLang): string {
    const po = codeValue(row.postOffice, row.postOfficeBN, lang);
    const addr = codeValue(row.address, row.addressBN, lang);
    const parts: string[] = [];
    if (po && po !== '—') {
        parts.push(lang === 'bn' ? `ডাকঘর ${po}` : `P.O. ${po}`);
    }
    if (addr && addr !== '—') parts.push(addr);
    return parts.join(' · ');
}
