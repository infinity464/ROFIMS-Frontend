import { MovementType, MoveOrderType } from './enums';

export interface MovementInfoModel {
    movementId: number;
    /** JSON-serialised array of EmployeeIds (one or many) */
    employeeIds: string;
    movementType: MovementType | number;
    moveOrderType: MoveOrderType | number;
    movementReasonId: number | null;
    currentUnitId: number | null;
    destinedMotherUnitId: number | null;
    destinedRABUnitId: number | null;
    dateOfRelease: string | null;
    dateOfReduce: string | null;
    takeoverDate: string | null;
    handoverDate: string | null;
    takeoverPersonEmpId: number | null;
    isJoiningLeave: boolean;
    joiningLeaveFrom: string | null;
    joiningLeaveTo: string | null;
    auth: string | null;
    detailsInformation: string | null;
    remarks: string | null;
    status: boolean;
    createdBy: string;
    createdDate?: string;
    lastUpdatedBy?: string;
    lastupdate?: string | null;
}
