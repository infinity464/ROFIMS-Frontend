import type { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';

const NA_VALUES = new Set(['', 'n/a', 'na', 'অপ্রযোজ্য']);

function isDisplayable(value: string | null | undefined): boolean {
    const v = String(value ?? '').trim();
    return v !== '' && v !== 'N/A' && !NA_VALUES.has(v.toLowerCase());
}

export function isNavyMotherOrganization(profile: Pick<EmployeePersonalServiceOverview, 'motherOrganization'>): boolean {
    return (profile.motherOrganization ?? '').trim().toLowerCase() === 'navy';
}

/**
 * Bilingual value pick, matching the profile page's `codeValue()`: in Bangla take the
 * BN column only when it actually holds something and otherwise fall back to English.
 * `??` alone is not enough — these columns come back as empty strings far more often
 * than as null, and treating '' as a real value silently dropped the decoration and
 * qualification from the Bangla name (note-sheet main text, office-order body) while
 * the English profile still showed them.
 */
function pick(isBn: boolean, bnVal: string | null | undefined, enVal: string | null | undefined): string | null | undefined {
    if (isBn && isDisplayable(bnVal)) return bnVal;
    return enVal;
}

/** Name line: default `Name, Award, Qualification, Corps`; Navy `Name, Corps, Award, Qualification, BN` (suffix localized: বিএন in Bangla). */
export function getFormattedMemberName(profile: EmployeePersonalServiceOverview | null, isBn: boolean): string {
    if (!profile) return '-';
    const namePart = pick(isBn, profile.nameBN, profile.nameEnglish);
    const deco = pick(isBn, profile.gallantryAwardsDecorationBN, profile.gallantryAwardsDecoration);
    const prof = pick(isBn, profile.professionalQualificationBN, profile.professionalQualification);
    const crps = pick(isBn, profile.corpsBN, profile.corps);
    const bnSuffix = isBn ? 'বিএন' : 'BN';
    const parts = isNavyMotherOrganization(profile) ? [namePart, crps, deco, prof, bnSuffix] : [namePart, deco, prof, crps];
    const filtered = parts.filter(isDisplayable);
    return filtered.length ? filtered.join(', ') : '-';
}
