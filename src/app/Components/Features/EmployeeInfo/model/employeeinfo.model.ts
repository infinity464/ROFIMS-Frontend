export interface EmployeeInfoModel {
  employeeID: number;
  lastMotherUnit: number | null;

  memberType: number;
  appointment: number;
  joiningDate: string; 

  rank: number;
  branch: number;
  trade: number;

  tradeMark: string;   
  gender: number;
  prefix: number;

  serviceId: string;   
  rabid: string;       
  nid: string;

  fullNameEN: string;
  fullNameBN: string;

  isReliever: boolean;

  postingStatus: string; 
  status: boolean;

  createdBy: string;
  createdDate: string;   

  lastUpdatedBy: string;
  lastupdate: string;   

  statusDate: string;    
}
