/**
 * RFTS orientation-training nominal roll — the printable/exportable form of an
 * RFTS selection.
 *
 * Values come from the live employee records rather than the member snapshot,
 * because the snapshot stores English only and this report is printed in Bangla.
 */

export interface RftsNominalRollRow {
    employeeId: number;
    /** Root mother organisation — the band this row is grouped under. */
    groupNameEN: string | null;
    groupNameBN: string | null;
    groupSortOrder: number | null;
    /** মাতৃ ইউনিট */
    motherUnitNameEN: string | null;
    motherUnitNameBN: string | null;
    /** ব্যক্তিগত নং */
    serviceId: string | null;
    /** র‍্যাব আইডি */
    rabId: string | null;
    /** পদবি */
    rankNameEN: string | null;
    rankNameBN: string | null;
    rankSortOrder: number | null;
    /** নাম */
    fullNameEN: string | null;
    fullNameBN: string | null;
}

export interface RftsNominalRoll {
    id: number;
    /** Becomes the স্মারক নং line. */
    courseRefNo: string;
    /** Becomes the তারিখ line. ISO yyyy-MM-dd. */
    courseDate: string;
    remarks: string | null;
    /** Pre-sorted by group, then rank, then name. */
    rows: RftsNominalRollRow[];
}
