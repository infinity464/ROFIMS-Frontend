/**
 * Application Enums
 * Centralized location for all enum definitions
 */

// Address Location Types
export enum LocationType {
    Permanent = 'Permanent',
    Present = 'Present',
    SpousePermanent = 'SpousePermanent',
    SpousePresent = 'SpousePresent'
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
    PendingForJoining = 'PendingForJoining',
    Servings = 'Servings',
    ExMember = 'ExMember'
}

/** IsSendingNotesheetStatus – stored in EmployeeInfo and DraftPostingDetail. */
export enum IsSendingNotesheetStatus {
    Draft = 'draft',
    DraftPosting = 'draftPosting',
    DraftInterPosting = 'draftInterPosting',
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
 * ApproverRoleType – role type for NoteSheet Approver Configuration detail rows.
 * Matches NoteSheetApproverConfigDetail.RoleType (NVARCHAR(50)).
 */
export enum ApproverRoleType {
    Initiator     = 'Initiator',
    Recommender   = 'Recommender',
    FinalApprover = 'FinalApprover'
}

/**
 * ApprovalStep – identifies each step/role in the approval chain.
 * Used as the `step` identifier when loading signatory details.
 */
export enum ApprovalStep {
    PreparedBy    = 'Prepared by',
    Initiator     = 'Initiator',
    Recommender   = 'Recommender',
    FinalApprover = 'Final Approver'
}

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
 * NoteSheetPreviewFrom – value of the `from` query parameter on the notesheet
 * preview routes. Tells the preview page which list the user came from so it
 * can show the right inline actions (e.g. Approve/Decline/Back for `Pending`).
 */
export enum NoteSheetPreviewFrom {
    Pending = 'pending'
}

/** ApprovalLogAction – action type for approval log timeline entries. */
export enum ApprovalLogAction {
    Pending = 'pending',
    Approve = 'approve',
    Cancel  = 'cancel',
    Back    = 'back'
}

export const ApprovalLogActionOptions = [
    { label: 'Pending',  value: ApprovalLogAction.Pending },
    { label: 'Approved', value: ApprovalLogAction.Approve },
    { label: 'Declined', value: ApprovalLogAction.Cancel },
    { label: 'Backed',   value: ApprovalLogAction.Back }
];

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
    SpecialQualification = 'SpecialQualification',
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

// MovementInfo: Movement Type (Permanent / Temporary)
export enum MovementType {
    Permanent = 1,
    Temporary = 2
}
export const MovementTypeOptions = [
    { label: 'Permanent', value: MovementType.Permanent },
    { label: 'Temporary', value: MovementType.Temporary }
];

// MovementInfo: Move Order Type (CC / MO / Article 47 Handover / Article 47 Takeover)
export enum MoveOrderType {
    CC = 1,
    MO = 2,
    Article47Handover = 3,
    Article47Takeover = 4
}
export const MoveOrderTypeOptions = [
    { label: 'CC', value: MoveOrderType.CC },
    { label: 'MO', value: MoveOrderType.MO },
    { label: 'Article 47 (Handover)', value: MoveOrderType.Article47Handover },
    { label: 'Article 47 (Takeover)', value: MoveOrderType.Article47Takeover }
];

// MovementInfo: Vehicle type for CC orders (printed on the CC letter).
export enum MovementVehicle {
    Government = 1,
    NonGovernment = 2
}
export const MovementVehicleOptions = [
    { label: 'সরকারী যানবাহন',   value: MovementVehicle.Government },
    { label: 'বেসরকারী যানবাহন', value: MovementVehicle.NonGovernment }
];

// MovementInfo: Article 47 letter recipients (applies to both Handover & Takeover variants only).
// sortOrder is the position among stored recipients only (1..6). The dynamic
// entries (Adhinayak, RAB-<unit>; FC (Army) Pay-1, Dhaka Cantonment) are injected
// at print time after this list, not numbered here.
export enum Article47LetterRecipient {
    InspectorGeneralBP = 1,
    DirectorGeneralRAB = 2,
    DIGAdminBP = 3,
    ChiefAccountOfficerMOHA = 4,
    PersonalCopy = 5,
    OfficeCopy = 6
}
export const Article47LetterRecipientOptions = [
    { label: 'ইন্সপেক্টর জেনারেল, বাংলাদেশ পুলিশ, পুলিশ হেডকোয়ার্টার্স, ঢাকা।',                value: Article47LetterRecipient.InspectorGeneralBP,      sortOrder: 1 },
    { label: 'মহাপরিচালক, র‍্যাব ফোর্সেস হেডকোয়ার্টার্স, কুর্মিটোলা, ঢাকা।',                  value: Article47LetterRecipient.DirectorGeneralRAB,      sortOrder: 2 },
    { label: 'ডিআইজি (প্রশাসন), বাংলাদেশ পুলিশ, পুলিশ হেডকোয়ার্টার্স, ঢাকা।',                value: Article47LetterRecipient.DIGAdminBP,              sortOrder: 3 },
    { label: 'প্রধান হিসাব রক্ষক কর্মকর্তা, স্বরাষ্ট্র মন্ত্রণালয়, সেগুন বাগিচা, ঢাকা।',         value: Article47LetterRecipient.ChiefAccountOfficerMOHA, sortOrder: 4 },
    { label: 'ব্যক্তিগত কপি।',                                                              value: Article47LetterRecipient.PersonalCopy,            sortOrder: 5 },
    { label: 'অফিস কপি।',                                                                  value: Article47LetterRecipient.OfficeCopy,              sortOrder: 6 }
];

// MovementInfo: MO (Move Order Type = 2) letter recipients.
// sortOrder reflects the position in the printed letter (1..10).
export enum MOLetterRecipient {
    PersonalCopy = 1,
    TrainingWing = 2,
    PersonnelBranch = 3,
    DOMSPersonnelBranch = 4,
    RecordBranch = 5,
    FinanceBranch = 6,
    ForcesMessBranch = 7,
    RationOffice = 8,
    DailyOffice = 9,
    OfficeCopy = 10
}
export const MOLetterRecipientOptions = [
    { label: 'ব্যক্তিগত কপি।',                                                                            value: MOLetterRecipient.PersonalCopy,        sortOrder: 1 },
    { label: 'ট্রেনিং উইং, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                      value: MOLetterRecipient.TrainingWing,        sortOrder: 2 },
    { label: 'পার্সোনেল শাখা, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                   value: MOLetterRecipient.PersonnelBranch,     sortOrder: 3 },
    { label: 'ডিওএমএস, প্রবৃত্তে পার্সোনেল শাখা, র‍্যাব ফোর্সেস সদর দপ্তর।',                                 value: MOLetterRecipient.DOMSPersonnelBranch, sortOrder: 4 },
    { label: 'রেকর্ড শাখা, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                      value: MOLetterRecipient.RecordBranch,        sortOrder: 5 },
    { label: 'অর্থ শাখা, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                        value: MOLetterRecipient.FinanceBranch,       sortOrder: 6 },
    { label: 'ফোর্সেস মেস শাখা, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                 value: MOLetterRecipient.ForcesMessBranch,    sortOrder: 7 },
    { label: 'রেশন অফিস, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                        value: MOLetterRecipient.RationOffice,        sortOrder: 8 },
    { label: 'ডেইলি অফিস, র‍্যাব ফোর্সেস সদর দপ্তর।',                                                       value: MOLetterRecipient.DailyOffice,         sortOrder: 9 },
    { label: 'অফিস কপি।',                                                                                value: MOLetterRecipient.OfficeCopy,          sortOrder: 10 }
];

