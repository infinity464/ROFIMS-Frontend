export interface AddressInfoModel {
  employeeID: number;
  addressId: number;
  fmid: number;

  locationType: string;
  locationCode: string;
  postCode: string;

  addressAreaEN: string;
  addressAreaBN: string;

  divisionType?: number;
  thanType?: number;
  postOfficeType?: number;

  createdBy: string;
  createdDate: string;

  lastUpdatedBy: string;
  lastupdate: string;
}
