/**
 * Draft Course module models - employees to be sent to a specific course.
 */

/** Single member in a draft course list. */
export interface DraftCourseMemberRow {
    employeeId: number;
    serviceId: string | null;
    rabId: string | null;
    fullNameEN: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
}

/** Optional course details when sending from draft to course. */
export interface SendToCourseDetails {
    courseNo?: string | null;
    courseType?: number | null;
    courseName?: number | null;
    trainingInstituteId?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    result?: string | null;
    auth?: string | null;
    remarks?: string | null;
}

/** Draft course list - employees pending send to course. */
export interface DraftCourseList {
    id: number;
    listNo: string;
    listDate: string;
    courseNameId: number | null;
    courseName: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    members: DraftCourseMemberRow[];
    createdBy: string;
    createdDate: string;
}

/** RFTS Training completed record. */
export interface RftsTrainingRow {
    id: number;
    employeeId: number;
    fullNameEN: string | null;
    rabId: string | null;
    serviceId: string | null;
    rankName: string | null;
    corpsName: string | null;
    tradeName: string | null;
    motherUnitName: string | null;
    courseTypeName: string | null;
    courseNameDisplay: string | null;
    courseNo: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    result: string | null;
    auth: string | null;
    remarks: string | null;
    createdBy: string | null;
    createdDate: string | null;
}

/** Course-group header for /emp-rfts-completed — members loaded lazily on click. */
export interface RftsCourseSummary {
    courseNo: string | null;
    courseTypeName: string | null;
    courseNameDisplay: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    memberCount: number;
}
