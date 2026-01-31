export interface TrainingInstituteModel {
  trainingInstituteId: number;

  trainingInstituteNameEN: string;
  trainingInstituteNameBN: string;

  countryId: number;
  location: string;

  createdBy: string;
  createdDate: Date;

  lastUpdatedBy: string;
  lastUpdate: Date;
}
