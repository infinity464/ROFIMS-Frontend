export interface EquivalentRankModel {
  equivalentNameID: number;
  motherOrgRankId: number;
  motherOrgId: number;
  sortOrder?: number | null;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  /** Matches backend property name (Lastupdate) */
  lastupdate: string;
}
