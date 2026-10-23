/**
 * Friendliness layer for the audit timeline.
 *
 * Two editable lookup dictionaries map raw database identifiers to human labels,
 * each with a sensible auto-formatting fallback so unmapped names still read well.
 * Add entries here as new tables/columns appear - no component changes needed.
 */

/** Raw table / view name -> human label. */
export const TABLE_LABELS: Record<string, string> = {
    vw_ReportLongStayNominalRoll: 'Long Stay Nominal Roll',
    EmployeeInfo: 'Employee',
    PersonalInfo: 'Personal Information',
    AddressInfo: 'Address',
    FamilyInfo: 'Family Member',
    NomineeInfo: 'Nominee',
    LeaveApplication: 'Leave Application',
    LeaveInfo: 'Leave',
    MovementInfo: 'Movement',
    PromotionInfo: 'Promotion',
    PostingOrderMaster: 'Posting Order',
    NoteSheetInfo: 'Note Sheet',
    BankAccInfo: 'Bank Account',
    EducationInfo: 'Education',
    CourseInfo: 'Course',
    DisciplineInfo: 'Discipline',
    MedicalInfo: 'Medical',
};

/** Raw column name -> human label. */
export const FIELD_LABELS: Record<string, string> = {
    created_at: 'Created Date',
    createdAt: 'Created Date',
    CreatedDate: 'Created Date',
    updated_at: 'Updated Date',
    UpdatedDate: 'Updated Date',
    LeaveStatus: 'Leave Status',
    NameEnglish: 'Name (English)',
    NameBangla: 'Name (Bangla)',
    MobileNo: 'Mobile No',
    Status: 'Status',
    IsActive: 'Active',
    Remarks: 'Remarks',
};

/** Strips a leading view prefix and trailing "Id"/"ID" noise where harmless. */
function stripNoise(name: string): string {
    return name.replace(/^vw_/i, '');
}

/**
 * Converts snake_case / camelCase / PascalCase to Title Case as a fallback when no
 * explicit mapping exists. e.g. "leaveStartDate" -> "Leave Start Date".
 */
export function titleCaseFromRaw(raw: string): string {
    if (!raw) return '';
    return stripNoise(raw)
        .replace(/[_\-]+/g, ' ')                       // snake/kebab -> spaces
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')        // camel/Pascal boundaries
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')     // acronym boundaries (IDNumber -> ID Number)
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Friendly table/view label, with Title Case fallback. */
export function friendlyTable(name: string): string {
    if (!name) return '';
    return TABLE_LABELS[name] ?? titleCaseFromRaw(name);
}

/** Friendly field/column label, with Title Case fallback. */
export function friendlyField(name: string): string {
    if (!name) return '';
    return FIELD_LABELS[name] ?? titleCaseFromRaw(name);
}
