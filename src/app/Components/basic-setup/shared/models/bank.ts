export interface BankModel {
  bankId: number;

  bankNameEN: string;
  bankNameBN: string;

  branchName: string;
  swiftCode: string;

  createdBy: string;
  createdDate: Date;

  lastUpdatedBy: string;
  lastUpdate: Date;
}
