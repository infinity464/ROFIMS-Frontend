/**
 * Application Enums
 * Centralized location for all enum definitions
 */

// Address Location Types
export enum LocationType {
  Permanent = 'Permanent',
  Present = 'Present',
  WifePermanent = 'WifePermanent',
  WifePresent = 'WifePresent'
}

// Gender Types
export enum Gender {
  Male = 1,
  Female = 2,
  Other = 3
}

// Marital Status
export enum MaritalStatus {
  Single = 1,
  Married = 2,
  Divorced = 3,
  Widowed = 4
}

// Blood Group
export enum BloodGroup {
  APositive = 1,
  ANegative = 2,
  BPositive = 3,
  BNegative = 4,
  ABPositive = 5,
  ABNegative = 6,
  OPositive = 7,
  ONegative = 8
}

// Religion
export enum Religion {
  Islam = 1,
  Hinduism = 2,
  Buddhism = 3,
  Christianity = 4,
  Other = 5
}

// Employee Status
export enum EmployeeStatus {
  Active = 1,
  Inactive = 2,
  OnLeave = 3,
  Retired = 4,
  Terminated = 5
}

// Posting Status
export enum PostingStatus {
  Supernumerary = 'Supernumerary',
  NewPosting = 'NewPosting'
}

// Form Mode
export enum FormMode {
  Create = 'create',
  Edit = 'edit',
  View = 'view'
}
