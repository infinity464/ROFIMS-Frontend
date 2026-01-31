export interface BankModel {
  bankId: number;

  bankNameEN: string;
  bankNameBN: string;

  branchName: string;
  routingNumber: string;
  swiftCode: string;

  createdBy: string;
  createdDate: Date;

  lastUpdatedBy: string;
  lastUpdate: Date;
}
