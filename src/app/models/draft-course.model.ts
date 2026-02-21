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
    courseType?: number | null;
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
    courseNameId: number;
    courseName: string;
    members: DraftCourseMemberRow[];
    createdBy: string;
    createdDate: string;
}
