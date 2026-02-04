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
    'A+' = 1,
    'A-' = 2,
    'B+' = 3,
    'B-' = 4,
    'AB+' = 5,
    'AB-' = 6,
    'O+' = 7,
    'O-' = 8
}

// Blood Group Labels Helper (value is string to match backend varchar(5))
export const BloodGroupOptions = [
    { label: 'A+', value: 'A+' },
    { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' },
    { label: 'B-', value: 'B-' },
    { label: 'AB+', value: 'AB+' },
    { label: 'AB-', value: 'AB-' },
    { label: 'O+', value: 'O+' },
    { label: 'O-', value: 'O-' }
];

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
    Pending = 'Pending',
    Servings='Servings',
    ExMember='ExMember'
}

// Form Mode
export enum FormMode {
    Create = 'create',
    Edit = 'edit',
    View = 'view'
}

// Medical Category
export enum MedicalCategory {
    A_AYEE = 'A (AYEE)',
    B_BEE = 'B (BEE)',
    C_CEE = 'C (CEE)',
    D_DEE = 'D (DEE)',
    E_EEE = 'E (EEE)'
}

// Medical Category Options for dropdown (value is integer ID for backend)
export const MedicalCategoryOptions = [
    { label: 'A (AYEE)', value: 1 },
    { label: 'B (BEE)', value: 2 },
    { label: 'C (CEE)', value: 3 },
    { label: 'D (DEE)', value: 4 },
    { label: 'E (EEE)', value: 5 }
];

// Master Basic Setup Code Types
// Used for common code lookups in basic-setup components
export enum CodeType {
    AppointmentCategory = 'AppointmentCategory',
    Batch = 'Batch',
    BloodGroup = 'BloodGroup',
    Country = 'Country',
    Corps = 'Corps',
    CourseGrade = 'CourseGrade',
    CourseName = 'CourseName',
    CourseType = 'CourseType',
    Decoration = 'Decoration',
    District = 'District',
    Division = 'Division',
    EducationInstitution = 'EducationInstitution',
    EducationInstitutionType = 'EducationInstitutionType',
    EducationQualification = 'EducationQualification',
    EducationResult = 'EducationResult',
    EducationSubject = 'EducationSubject',
    EducationalDepartment = 'EducationalDepartment',
    EmployeeStatusType = 'EmployeeStatusType',
    EmployeeType = 'EmployeeType',
    EquivalentName = 'EquivalentName',
    Gender = 'Gender',
    LeaveType = 'LeaveType',
    MaritalStatus = 'MaritalStatus',
    MotherOrgRank = 'MotherOrgRank',
    Occupation = 'Occupation',
    OfficerType = 'OfficerType',
    PersonalQualification = 'PersonalQualification',
    PostOffice = 'PostOffice',
    Prefix = 'Prefix',
    ProfessionalQualification = 'ProfessionalQualification',
    PunishmentType = 'PunishmentType',
    RabBranch = 'RabBranch',
    RabId = 'RabId',
    RabUnit = 'RabUnit',
    RabWing = 'RabWing',
    Relationship = 'Relationship',
    Religion = 'Religion',
    Trade = 'Trade',
    Upazila = 'Upazila',
    VisitType = 'VisitType'
}
