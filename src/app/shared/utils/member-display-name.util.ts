import type { EmployeePersonalServiceOverview } from '@/models/employee-personal-service-overview.model';

const NA_VALUES = new Set(['', 'n/a', 'na', 'অপ্রযোজ্য']);

function isDisplayable(value: string | null | undefined): boolean {
    const v = String(value ?? '').trim();
    return v !== '' && v !== 'N/A' && !NA_VALUES.has(v.toLowerCase());
}

export function isNavyMotherOrganization(profile: Pick<EmployeePersonalServiceOverview, 'motherOrganization'>): boolean {
    return (profile.motherOrganization ?? '').trim().toLowerCase() === 'navy';
}

/** Name line: default `Name, Award, Qualification, Corps`; Navy `Name, Corps, Award, Qualification, BN` (suffix localized: বিএন in Bangla). */
export function getFormattedMemberName(profile: EmployeePersonalServiceOverview | null, isBn: boolean): string {
    if (!profile) return '-';
    const namePart = isBn ? (profile.nameBN ?? profile.nameEnglish) : profile.nameEnglish;
    const deco = isBn ? (profile.gallantryAwardsDecorationBN ?? profile.gallantryAwardsDecoration) : profile.gallantryAwardsDecoration;
    const prof = isBn ? (profile.professionalQualificationBN ?? profile.professionalQualification) : profile.professionalQualification;
    const crps = isBn ? (profile.corpsBN ?? profile.corps) : profile.corps;
    const bnSuffix = isBn ? 'বিএন' : 'BN';
    const parts = isNavyMotherOrganization(profile) ? [namePart, crps, deco, prof, bnSuffix] : [namePart, deco, prof, crps];
    const filtered = parts.filter(isDisplayable);
    return filtered.length ? filtered.join(', ') : '-';
}
