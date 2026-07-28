/**
 * "নতুন আগত সদস্যদের র‍্যাব আইডি বরাদ্দকরণ" — the printable/exportable form of
 * the supernumerary list. Values are read live from the employee records
 * because the list view carries English only.
 */
export interface SupernumeraryRollRow {
    employeeId: number;
    /** Root mother organisation — the band this row is grouped under. */
    groupNameEN: string | null;
    groupNameBN: string | null;
    groupSortOrder: number | null;
    /** ব্যক্তিগত নং */
    serviceId: string | null;
    /** পদবি */
    rankNameEN: string | null;
    rankNameBN: string | null;
    rankSortOrder: number | null;
    /** নাম */
    fullNameEN: string | null;
    fullNameBN: string | null;
    /** নিজ জেলা */
    ownDistrictEN: string | null;
    ownDistrictBN: string | null;
    /** স্ত্রী'র জেলা */
    spouseDistrictEN: string | null;
    spouseDistrictBN: string | null;
    /** পূর্ববর্তী কর্মস্থল = unit, then its district. */
    motherUnitNameEN: string | null;
    motherUnitNameBN: string | null;
    motherUnitDistrictEN: string | null;
    motherUnitDistrictBN: string | null;
    /** যোগদানে তারিখ — ISO yyyy-MM-dd. */
    joiningDate: string | null;
    /** র‍্যাব আইডি */
    rabId: string | null;
}

export interface SupernumeraryRoll {
    /** Pre-sorted by group, then rank, then name. */
    rows: SupernumeraryRollRow[];
}
