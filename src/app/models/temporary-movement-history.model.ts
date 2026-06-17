import { TemporaryMovementDestinationType } from '@/models/temporary-movement-return.model';

/**
 * A member currently out on a Temporary movement (IsReturn = 0), with the destined
 * unit resolved. Powers the profile "on movement" banner and the On-Movement list.
 */
export interface TemporaryMovementOnMovement {
    id: number;
    employeeId: number;
    movementId: number;
    movementLetterNo: string | null;
    /** ISO date (yyyy-MM-dd). */
    letterDate: string | null;

    destinationType: TemporaryMovementDestinationType;
    unitId: number;
    destinedUnitName: string | null;
    destinedUnitNameBN: string | null;

    isReturn: boolean;
    returnDate: string | null;
    createdDate: string;

    serviceId: string | null;
    rabId: string | null;
    fullNameEN: string | null;
    fullNameBN: string | null;
}
