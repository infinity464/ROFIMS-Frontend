export interface EquivalentRankModel {
  equivalentNameID: number;
  motherOrgRankId: number;
  motherOrgId: number;
  createdBy: string;
  createdDate: string;
  lastUpdatedBy: string;
  /** Matches backend property name (Lastupdate) */
  lastupdate: string;
}
