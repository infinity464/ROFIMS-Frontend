/**
 * Single row from vw_EmployeeServiceOverview (basic service info of serving members).
 * API: GET EmployeeInfo/GetBasicServiceInformationOfServingMember
 */
export interface EmployeeServiceOverview {
    employeeID: number;
    serviceId: string | null;
    rabID: string | null;
    prefixId: number | null;
    prefix: string | null;
    nameEnglish: string | null;
    appointmentId: number | null;
    appointment: string | null;
    memberTypeId: number | null;
    memberType: string | null;
    motherOrganizationId: number | null;
    motherOrganization: string | null;
    armyRankId: number | null;
    armyRank: string | null;
    corpsId: number | null;
    corps: string | null;
    tradeId: number | null;
    trade: string | null;
    tradeRemarks: string | null;
    genderId: number | null;
    gender: string | null;
    dateOfCommission: string | null;
    dateOfJoiningInServiceTraining: string | null;
    motherUnitId: number | null;
    motherUnit: string | null;
    location: string | null;
    rabUnitId: number | null;
    rabUnit: string | null;
    status: boolean | null;
    joiningDate: string | null;
    permanentDistrictType: number | null;
    permanentDistrictTypeName: string | null;
    wifePermanentDistrictType: number | null;
    wifePermanentDistrictTypeName: string | null;
}
