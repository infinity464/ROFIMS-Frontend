export interface OrganizationModel {
  orgId: number;

  orgNameEN: string;
  orgNameBN: string;

  contactName?: string;
  contactNumber?: string;

  locationCode?: string;
  locationEN?: string;
  locationBN?: string;

  email?: string;

  status?: boolean;

  remarks?: string;

  parentOrg?: number;

  createdBy: string;
  createdDate: string; // or Date

  lastUpdatedBy: string;
  lastupdate: string; // or Date
}
