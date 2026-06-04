export interface MotherOrganizationModel {
  orgId: number;

  orgNameEN: string;
  orgNameBN?: string;

  contactName?: string;
  contactNumber?: string;

  locationCode?: string;
  locationEN?: string;
  locationBN?: string;

  districtId?: number | null;

  email?: string;

  status?: boolean;

  remarks?: string;

  parentOrg?: number;

  /** Backend MotherOrg.SortOrder — drives org-level ordering in reports. */
  sortOrder?: number | null;

  createdBy?: string;
  createdDate?: string;

  lastUpdatedBy?: string;
  lastupdate?: string;
}
