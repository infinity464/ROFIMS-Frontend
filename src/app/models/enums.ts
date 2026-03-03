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

/** IsSendingNotesheetStatus – stored in EmployeeInfo and DraftPostingDetail. */
export enum IsSendingNotesheetStatus {
    Draft = 'draft',
    DraftPosting = 'draftPosting',
    DraftNotesheet = 'draftNotesheet'
}

/** NoteSheetType – type of note-sheet (General, ExBDLeave, NewPosting, InterPosting). */
export enum NoteSheetType {
    General      = 'General',
    ExBDLeave    = 'ExBDLeave',
    NewPosting   = 'NewPosting',
    InterPosting = 'InterPosting'
}

export const NoteSheetTypeOptions = [
    { label: 'General',       value: NoteSheetType.General },
    { label: 'Ex-BD Leave',   value: NoteSheetType.ExBDLeave },
    { label: 'New Posting',   value: NoteSheetType.NewPosting },
    { label: 'Inter Posting', value: NoteSheetType.InterPosting }
];

/**
 * NoteSheetCurrentStatus – overall workflow position of a note-sheet.
 * Flow: Draft → Initiator → Recommender → FinalApproval | Cancel
 * Matches NoteSheetInfo.CurrentStatus (NVARCHAR(20)).
 */
export enum NoteSheetCurrentStatus {
    Draft         = 'draft',
    Initiator     = 'initiator',
    Recommender   = 'recommender',
    FinalApproval = 'final_approval',
    Cancel        = 'cancel'
}

export const NoteSheetCurrentStatusOptions = [
    { label: 'Draft',          value: NoteSheetCurrentStatus.Draft },
    { label: 'Initiator',      value: NoteSheetCurrentStatus.Initiator },
    { label: 'Recommender',    value: NoteSheetCurrentStatus.Recommender },
    { label: 'Final Approval', value: NoteSheetCurrentStatus.FinalApproval },
    { label: 'Cancelled',      value: NoteSheetCurrentStatus.Cancel }
];

/**
 * ApprovalStatus – individual step approval state.
 * Used by InitiatorStatus, RecomenderStatus, FinalApprovalStatus (NVARCHAR(20)).
 */
export enum ApprovalStatus {
    Pending = 'pending',
    Approve = 'approve',
    Cancel  = 'cancel'
}

export const ApprovalStatusOptions = [
    { label: 'Pending',   value: ApprovalStatus.Pending },
    { label: 'Approved',  value: ApprovalStatus.Approve },
    { label: 'Cancelled', value: ApprovalStatus.Cancel }
];

/** NoteSheetRemarkAction – action type for the approve/decline/back remark dialog. */
export enum NoteSheetRemarkAction {
    Approve = 'approve',
    Decline = 'decline',
    Back    = 'back'
}

/**
 * NoteSheetOperationType – how the note-sheet was created.
 * Matches NoteSheetInfo.NoteSheetOperationType (NVARCHAR(50)).
 */
export enum NoteSheetOperationType {
    Manual         = 'manual',
    SystemGenerate = 'system_generate'
}

export const NoteSheetOperationTypeOptions = [
    { label: 'Manual',          value: NoteSheetOperationType.Manual },
    { label: 'System Generate', value: NoteSheetOperationType.SystemGenerate }
];

/** DraftPostingStatus – status of a Draft New Posting master (new, approved, decline). */
export enum DraftPostingStatus {
    New = 'new',
    Approved = 'approved',
    Decline = 'decline'
}

export const DraftPostingStatusOptions = [
    { label: 'New', value: DraftPostingStatus.New },
    { label: 'Approved', value: DraftPostingStatus.Approved },
    { label: 'Decline', value: DraftPostingStatus.Decline }
];

// Present Status Type
export enum PresentStatusType {
    OnDuty = 'OnDuty',
    RegularPostingOut = 'RegularPostingOut',
    RTUOnDisciplineIssue = 'RTUOnDisciplineIssue',
    Deceased = 'Deceased',
    Absent = 'Absent',
    Arrested = 'Arrested'
}

export const PresentStatusTypeOptions = [
    { label: 'On Duty', value: PresentStatusType.OnDuty },
    { label: 'Regular Posting Out', value: PresentStatusType.RegularPostingOut },
    { label: 'RTU on Discipline Issue', value: PresentStatusType.RTUOnDisciplineIssue },
    { label: 'Deceased', value: PresentStatusType.Deceased },
    { label: 'Absent', value: PresentStatusType.Absent },
    { label: 'Arrested', value: PresentStatusType.Arrested }
];

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
    BriefStatementOfOffence = 'BriefStatementOfOffence',
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
    PurposeOfVisitType = 'PurposeOfVisitType',
    Gender = 'Gender',
    LeaveType = 'LeaveType',
    MaritalStatus = 'MaritalStatus',
    MedicalCategoryType = 'MedicalCategoryType',
    MotherOrgRank = 'MotherOrgRank',
    Occupation = 'Occupation',
    OffenceType = 'OffenceType',
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
    SubjectType = 'SubjectType',
    Trade = 'Trade',
    Upazila = 'Upazila',
    VisitType = 'VisitType'
}

// Menu Type (matches backend TINYINT: 0=Header/Group, 1=AngularRoute, 2=ExternalLink, 3=Action)
export enum MenuType {
    Header = 0,
    AngularRoute = 1,
    ExternalLink = 2,
    Action = 3
}

export const MenuTypeOptions = [
    { label: 'Header / Group', value: MenuType.Header },
    { label: 'Angular Route', value: MenuType.AngularRoute },
    { label: 'External Link', value: MenuType.ExternalLink },
    { label: 'Action', value: MenuType.Action }
];

// Icon Type for menu icons
export enum IconType {
    PrimeIcon = 'pi',
    Material = 'material',
    FontAwesome = 'fa'
}

export const IconTypeOptions = [
    { label: 'PrimeNG Icon (pi)', value: IconType.PrimeIcon },
    { label: 'Material Icon', value: IconType.Material },
    { label: 'Font Awesome (fa)', value: IconType.FontAwesome }
];

// Link Target for external links
export const LinkTargetOptions = [
    { label: 'Same Window (_self)', value: '_self' },
    { label: 'New Tab (_blank)', value: '_blank' }
];
