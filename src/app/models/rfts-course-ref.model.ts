/**
 * RFTS Course / Reference master — the lookup of Course No (Reference No) + Date
 * that the RFTS screens pick from, together with the members selected onto it.
 * A single date, no from/to range.
 */

/** One employee selected onto a course. */
export interface RftsCourseRefMember {
    id?: number;
    employeeId: number;
    serviceId: string | null;
    rabId: string | null;
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
    /**
     * Live RFTS-completion state. Completed members cannot be removed from a
     * course — the UI disables their remove action, the server rejects it too.
     */
    isRftsCompleted?: boolean;
}

export interface RftsCourseRefModel {
    id: number;
    /** Course No / Reference No — unique across live rows. */
    courseRefNo: string;
    /** ISO date string (yyyy-MM-dd). */
    courseDate: string;
    remarks: string | null;
    status: boolean;
    /** Populated on every read; the grid shows this instead of the rows. */
    memberCount: number;
    /** Only populated by the by-id read (the edit screen). */
    members: RftsCourseRefMember[];
}

/** Payload sent on create / update. */
export interface RftsCourseRefPayload {
    id?: number;
    courseRefNo: string;
    courseDate: string;
    remarks: string | null;
    status: boolean;
    /** Replaces the whole member set. Omit on a header-only edit. */
    members?: RftsCourseRefMember[];
}
