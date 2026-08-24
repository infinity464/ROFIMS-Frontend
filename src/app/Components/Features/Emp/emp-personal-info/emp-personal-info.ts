import { Component, EventEmitter, Input, OnInit, Output, ViewChild , inject } from '@angular/core';
import { UserMenuService } from '@/services/user-menu.service';
import { SharedService } from '@/shared/services/shared-service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Fluid } from 'primeng/fluid';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TooltipModule } from 'primeng/tooltip';

import { EmpService } from '@/services/emp-service';
import { buildUploadOwnerTag } from '@/shared/utils/upload-file-name.util';
import { CommonCodeService } from '@/services/common-code-service';
import { EmployeeSearchComponent, EmployeeBasicInfo } from '@/Components/Shared/employee-search/employee-search';
import { FileReferencesFormComponent, FileRowData } from '@components/Common/file-references-form/file-references-form';
import { FlexibleDateDirective } from '@/shared/directives/flexible-date.directive';
import { PostingStatus, PresentStatusType, PresentStatusTypeOptions } from '@/models/enums';
import { PresentStatusInfoService } from '@/services/present-status-info.service';
import { PreviousRABServiceService, VwPreviousRABServiceInfoModel } from '@/services/previous-rab-service.service';
import { OrganizationService } from '@/Components/basic-setup/organization-setup/services/organization-service';

@Component({
    selector: 'app-emp-personal-info',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        InputTextModule,
        ButtonModule,
        Fluid,
        SelectModule,
        MultiSelectModule,
        DatePickerModule,
        InputNumberModule,
        TextareaModule,
        FileUploadModule,
        RadioButtonModule,
        TooltipModule,
        DialogModule,
        EmployeeSearchComponent,
        FileReferencesFormComponent,
        FlexibleDateDirective
    ],
    templateUrl: './emp-personal-info.html',
    styleUrl: './emp-personal-info.scss'
})
export class EmpPersonalInfo implements OnInit {
    private _router = inject(Router);
    private _userMenuService = inject(UserMenuService);
    private sharedService = inject(SharedService);

    /** Logged-in user for CreatedBy / LastUpdatedBy. Falls back to 'system' only when nobody is signed in. */
    private get auditUser(): string {
        return this.sharedService.getCurrentUser() ?? 'system';
    }

    canInsert = true;
    canUpdate = true;
    canDelete = true;

    @ViewChild('fileReferencesForm') fileReferencesForm!: any; // FileReferencesFormComponent

    @ViewChild('employeeSearch') employeeSearch?: EmployeeSearchComponent;

    /** When true (e.g. inside tab view), the "Employee Personal Info" title and header actions are hidden. */
    @Input() hideTitle = false;

    /** When true, component is embedded (e.g. in ex-member profile). Use externalEmployeeId, hide search, emit saved/cancelled. */
    @Input() embedMode = false;

    /** When embedMode is true, load and edit this employee's personal info. */
    @Input() externalEmployeeId: number | null = null;

    /** Emitted after successful save when embedMode is true. */
    @Output() saved = new EventEmitter<void>();

    /** Emitted when user cancels edit when embedMode is true. */
    @Output() cancelled = new EventEmitter<void>();

    // Employee lookup
    employeeFound: boolean = false;
    selectedEmployeeId: number | null = null;

    // Ex-Member notice dialog
    showExMemberNotice: boolean = false;
    exMemberNoticeName: string = '';
    exMemberNoticeRows: { label: string; value: string }[] = [];
    private pendingExMember: EmployeeBasicInfo | null = null;

    // File references (FilesReferences JSON) – same approach as emp-basic-info
    fileRows: FileRowData[] = [];

    // Employee basic info (auto-loaded from search)
    employeeBasicInfo: any = null;

    // Personal Info Form
    personalInfoForm!: FormGroup;

    // Dropdown options (all loaded from CommonCode database)
    bloodGroups: any[] = [];
    religions: any[] = [];
    maritalStatuses: any[] = [];
    batches: any[] = [];
    professionalQualifications: any[] = [];
    personalQualifications: any[] = [];
    gallantryAwards: any[] = [];
    educationQualifications: any[] = [];
    medicalCategories: { label: string; value: number }[] = [];
    tribalOptions: any[] = [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 }
    ];
    freedomFighterOptions: any[] = [
        { label: 'No', value: 0 },
        { label: 'Yes', value: 1 }
    ];
    yesNoOptions: any[] = [
        { label: 'No', value: false },
        { label: 'Yes', value: true }
    ];
    leavingStatusOptions: { label: string; value: boolean }[] = [
        { label: 'In Leaving', value: true },
        { label: 'Out Leaving', value: false }
    ];
    presentStatusTypes: any[] = PresentStatusTypeOptions;

    // Investigation Experience toggle
    showInvestigationExperience: boolean = false;

    // Mode: 'search' (default), 'view' (readonly), 'edit'
    mode: 'search' | 'view' | 'edit' = 'search';
    isReadonly: boolean = false;

    // Track if personal info record exists (for save vs update)
    personalInfoExists: boolean = false;

    // Tracks the last employeeId we fetched, so route mode-only changes (e.g., view → edit
    // via Edit button) don't trigger a redundant refetch that would snap mode back to view.
    private _lastLoadedEmployeeId: number | null = null;

    constructor(
        private fb: FormBuilder,
        private empService: EmpService,
        private commonCodeService: CommonCodeService,
        private messageService: MessageService,
        private presentStatusService: PresentStatusInfoService,
        private previousRabService: PreviousRABServiceService,
        private organizationService: OrganizationService,
        private route: ActivatedRoute,
        private router: Router
    ) {}

    ngOnInit(): void {
        const _perms = this._userMenuService.getPermissionsByRoute(this._router.url);
        this.canInsert = _perms.canInsert;
        this.canUpdate = _perms.canUpdate;
        this.canDelete = _perms.canDelete;

        this.initializeForm();
        this.loadDropdownData();
        if (this.embedMode && this.externalEmployeeId != null) {
            this.mode = 'edit';
            this.isReadonly = false;
            this.selectedEmployeeId = this.externalEmployeeId;
            this._lastLoadedEmployeeId = this.externalEmployeeId;
            this.employeeFound = true;
            this.loadEmployeeById(this.externalEmployeeId);
            return;
        }
        this.checkRouteParams();
    }

    checkRouteParams(): void {
        this.route.queryParams.subscribe((params) => {
            const employeeId = params['id'];
            const mode = params['mode'];

            if (employeeId) {
                const idNum = parseInt(employeeId, 10);
                const newMode: 'view' | 'edit' = mode === 'edit' ? 'edit' : 'view';

                if (this._lastLoadedEmployeeId !== idNum) {
                    // New employee — load fresh.
                    this._lastLoadedEmployeeId = idNum;
                    this.mode = newMode;
                    this.isReadonly = this.mode === 'view';
                    this.loadEmployeeById(idNum);
                } else {
                    // Same employee, mode-only change (e.g., user clicked Edit) — just
                    // toggle form state without refetching.
                    this.mode = newMode;
                    this.isReadonly = this.mode === 'view';
                    if (this.isReadonly) {
                        this.personalInfoForm.disable();
                    } else {
                        this.personalInfoForm.enable();
                    }
                }
            } else {
                this._lastLoadedEmployeeId = null;
                this.mode = 'search';
                this.isReadonly = false;
            }
        });
    }

    loadEmployeeById(employeeId: number): void {
        console.log('Loading employee by id', employeeId);
        this.empService.getEmployeeById(employeeId).subscribe({
            next: (employee: any) => {
                if (employee) {
                    this.employeeFound = true;
                    this.selectedEmployeeId = employee.employeeID || employee.EmployeeID;
                    this.employeeBasicInfo = employee;

                    // Load personal info
                    this.loadPersonalInfo(employee);

                    // Load batches by mother org
                    const orgId = employee.orgId;
                    console.log('orgId', orgId);

                    if (orgId) {
                        this.loadBatchesByMotherOrg(orgId);
                    }

                    // Disable form in view mode
                    if (this.isReadonly) {
                        this.personalInfoForm.disable();
                    }
                }
            },
            error: (err) => {
                console.error('Failed to load employee', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err?.error?.message || 'Failed to load employee data'
                });
            }
        });
    }

    enableEditMode(): void {
        this.mode = 'edit';
        this.isReadonly = false;
        this.personalInfoForm.enable();
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { id: this.selectedEmployeeId, mode: 'edit' },
            queryParamsHandling: 'merge'
        });
    }

    goBack(): void {
        if (this.embedMode) {
            this.cancelled.emit();
            return;
        }
        this.router.navigate(['/emp-list']);
    }

    initializeForm(): void {
        this.personalInfoForm = this.fb.group({
            bloodGroup: [null],
            nidOld: ['', [Validators.pattern('^[0-9]{0,17}$'), Validators.maxLength(17)]],
            nid: ['', [Validators.pattern('^[0-9]{0,17}$'), Validators.maxLength(17)]],
            mobileNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            mobileNoOfficial: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            emailAddress: ['', [Validators.email]],
            dateOfBirth: [null],
            religion: [null],
            passportNo: [''],
            identificationMark: [''],
            maritalStatus: [null],
            emergencyContactNo: ['', [Validators.pattern('^01[3-9][0-9]{8}$')]],
            dateOfJoining: [null],
            dateOfCommission: [null],
            batch: [null],
            investigationExperience: [false],
            investigationExperienceDetails: [''],
            professionalQualification: [[] as number[]],
            personalQualification: [[] as number[]],
            gallantryAward: [[] as number[]],
            lastEducationQualification: [null],
            medicalCategory: [null], // Loaded from API (Medical Category Type)
            tribal: [null],
            freedomFighter: [null],
            heightFeet: [null, [Validators.min(0), Validators.max(8)]],
            heightInch: [null, [Validators.min(0), Validators.max(11.5)]],
            weightKg: [null, [Validators.min(0), Validators.max(200)]],
            weightLbs: [null, [Validators.min(0), Validators.max(440)]],
            leavingStatus: [null],
            drivingLicenseNo: [''],
            serviceIdCardNo: [''],
            presentStatus: [null]
        });

        // Weight auto-conversion: KG to Lbs
        this.personalInfoForm.get('weightKg')?.valueChanges.subscribe((kg) => {
            if (kg !== null && kg !== undefined) {
                const lbs = Math.round(kg * 2.20462);
                this.personalInfoForm.patchValue({ weightLbs: lbs }, { emitEvent: false });
            }
        });

        // Weight auto-conversion: Lbs to KG
        this.personalInfoForm.get('weightLbs')?.valueChanges.subscribe((lbs) => {
            if (lbs !== null && lbs !== undefined) {
                const kg = Math.round(lbs / 2.20462);
                this.personalInfoForm.patchValue({ weightKg: kg }, { emitEvent: false });
            }
        });

        // Watch for investigation experience change
        this.personalInfoForm.get('investigationExperience')?.valueChanges.subscribe((value) => {
            this.showInvestigationExperience = value;
            if (!value) {
                this.personalInfoForm.patchValue({ investigationExperienceDetails: '' });
            }
        });
    }

    loadDropdownData(): void {
        // Load Blood Groups from database (BloodGroup field is varchar(5), stores actual value like "A+", "B+")
        this.commonCodeService.getAllActiveCommonCodesType('BloodGroup').subscribe({
            next: (data) => (this.bloodGroups = data.map((d) => ({ label: d.codeValueEN, value: d.codeValueEN }))),
            error: (err) => console.error('Failed to load blood groups', err)
        });

        // Load Religions
        this.commonCodeService.getAllActiveCommonCodesType('Religion').subscribe({
            next: (data) => {
                this.religions = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }));
                // Set default to Islam if found
                const islam = this.religions.find((r) => r.label?.toLowerCase() === 'islam');
                if (islam && !this.personalInfoForm.get('religion')?.value) {
                    this.personalInfoForm.patchValue({ religion: islam.value });
                }
            },
            error: (err) => console.error('Failed to load religions', err)
        });

        // Load Marital Statuses
        this.commonCodeService.getAllActiveCommonCodesType('MaritalStatus').subscribe({
            next: (data) => (this.maritalStatuses = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load marital statuses', err)
        });

        // Batches will be loaded based on Mother Organization when employee is searched
        // Initial load is skipped - batches shown as per Mother Organization only

        // Load Professional Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('ProfessionalQualification').subscribe({
            next: (data) => (this.professionalQualifications = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load professional qualifications', err)
        });

        // Load Personal Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('PersonalQualification').subscribe({
            next: (data) => (this.personalQualifications = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load personal qualifications', err)
        });

        // Load Gallantry Awards / Decorations
        this.commonCodeService.getAllActiveCommonCodesType('Decoration').subscribe({
            next: (data) => (this.gallantryAwards = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load gallantry awards', err)
        });

        // Load Education Qualifications
        this.commonCodeService.getAllActiveCommonCodesType('EducationQualification').subscribe({
            next: (data) => (this.educationQualifications = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load education qualifications', err)
        });

        // Load Medical Category Type from API (Basic Setup → Medical Category Type)
        this.commonCodeService.getAllActiveCommonCodesType('MedicalCategoryType').subscribe({
            next: (data) => (this.medicalCategories = (data || []).map((d) => ({ label: d.codeValueEN || String(d.codeId), value: d.codeId }))),
            error: (err) => console.error('Failed to load medical categories', err)
        });
    }

    loadBatchesByMotherOrg(orgId: number): void {
        console.log('Loading batches by mother org', orgId);
        this.commonCodeService.getAllActiveCommonCodesByOrgIdAndType(orgId, 'Batch').subscribe({
            next: (data) => (this.batches = data.map((d) => ({ label: d.codeValueEN, value: d.codeId }))),
            error: (err) => console.error('Failed to load batches by org', err)
        });
    }

    // Handle employee search component events
    onEmployeeSearchFound(employee: EmployeeBasicInfo): void {
        // An ex-member's record is closed history, so the user is warned — with the details of
        // the status that moved them off RAB strength — before the form is opened.
        if (this.isExMember(employee)) {
            this.confirmExMemberThenLoad(employee);
            return;
        }
        this.applyFoundEmployee(employee);
    }

    private applyFoundEmployee(employee: EmployeeBasicInfo): void {
        this.employeeFound = true;
        this.selectedEmployeeId = employee.employeeID;
        this._lastLoadedEmployeeId = employee.employeeID;
        this.employeeBasicInfo = employee;

        // Load personal info if exists
        this.loadPersonalInfo(employee);

        // Load batches by mother org if available
        const orgId = (employee as any).orgId;
        if (orgId) {
            this.loadBatchesByMotherOrg(orgId);
        }
    }

    private isExMember(employee: EmployeeBasicInfo): boolean {
        const status = (employee.postingStatus ?? '').trim().toLowerCase();
        return status === PostingStatus.ExMember.toLowerCase() || status === 'ex-member';
    }

    /**
     * Gathers the ex-member context (last RAB unit, the posting/RTU unit they were sent to and
     * the date they came off RAB strength) and asks the user to confirm before loading the form.
     */
    private confirmExMemberThenLoad(employee: EmployeeBasicInfo): void {
        const employeeId = employee.employeeID;

        // Each lookup fails soft: a missing section only blanks its own line in the notice.
        forkJoin({
            previousRabService: this.previousRabService.getViewByEmployeeId(employeeId).pipe(catchError(() => of([] as VwPreviousRABServiceInfoModel[]))),
            presentStatuses: this.presentStatusService.getAllByEmployeeId(employeeId).pipe(catchError(() => of([] as any[]))),
            orgUnits: this.organizationService.getOrgUnitsByEmployeeId(employeeId).pipe(catchError(() => of([] as any[])))
        }).subscribe(({ previousRabService, presentStatuses, orgUnits }) => {
            this.pendingExMember = employee;
            this.exMemberNoticeName = employee.fullNameEN || '';
            this.exMemberNoticeRows = this.buildExMemberRows(previousRabService, presentStatuses, orgUnits);
            this.showExMemberNotice = true;
        });
    }

    /**
     * Ex-Member notice rows. "Posted Unit" and "Reduce Date" come from the Present Status record
     * that performed the profile shift when that was a Regular Posting Out / RTU; for any other
     * shifting status (Deceased, Absent, Arrested) the status itself and its date are shown
     * instead, because those carry no transferred unit.
     */
    private buildExMemberRows(
        previousRabService: VwPreviousRABServiceInfoModel[],
        presentStatuses: any[],
        orgUnits: any[]
    ): { label: string; value: string }[] {
        const rows: { label: string; value: string }[] = [{ label: 'Last RAB Unit', value: this.lastRabUnitName(previousRabService) }];

        const shift = this.profileShiftRecord(presentStatuses);
        const statusType = shift?.presentStatusType ?? null;

        if (statusType === PresentStatusType.RegularPostingOut || statusType === PresentStatusType.RTUOnDisciplineIssue) {
            rows.push({ label: 'Posted Unit', value: this.orgUnitName(shift.motherOrgTransferredUnitID ?? shift.transferredUnitID, orgUnits) });
            rows.push({ label: 'Reduce Date', value: this.shortDate(shift.reduceFromRABStrength ?? shift.dateOfRelease ?? shift.dated) });
        } else if (statusType) {
            rows.push({ label: 'Status', value: PresentStatusTypeOptions.find((o) => o.value === statusType)?.label ?? statusType });
            rows.push({ label: 'Date', value: this.shortDate(shift.dated) });
        }

        return rows;
    }

    /** Continue into the personal-info form for the ex-member. */
    acceptExMemberNotice(): void {
        const employee = this.pendingExMember;
        this.closeExMemberNotice();
        if (employee) this.applyFoundEmployee(employee);
    }

    /**
     * Dismissed via the header X (or Esc / mask) without choosing an action — clear the search so
     * the ex-member is not left selected. Continue / View Profile already cleared the pending
     * member before hiding, so this no-ops for them.
     */
    onExMemberNoticeHide(): void {
        if (this.pendingExMember) this.cancelExMemberNotice();
    }

    private cancelExMemberNotice(): void {
        this.closeExMemberNotice();
        this.employeeSearch?.reset();
        this.resetForm();
    }

    /** Open the member's full (ex-member) profile page instead of editing personal info. */
    viewExMemberProfile(): void {
        const employeeId = this.pendingExMember?.employeeID ?? null;
        this.closeExMemberNotice();
        if (employeeId != null) this.router.navigate(['/members/profile', employeeId]);
    }

    private closeExMemberNotice(): void {
        this.showExMemberNotice = false;
        this.pendingExMember = null;
    }

    /** The Present Status record that moved this employee to the Ex Member list. */
    private profileShiftRecord(presentStatuses: any[]): any | null {
        const shifted = (presentStatuses ?? [])
            .map((d) => ({
                presentStatusType: d.PresentStatusType ?? d.presentStatusType,
                dated: d.Dated ?? d.dated,
                profileShift: d.ProfileShift ?? d.profileShift ?? false,
                transferredUnitID: d.TransferredUnitID ?? d.transferredUnitID,
                motherOrgTransferredUnitID: d.MotherOrgTransferredUnitID ?? d.motherOrgTransferredUnitID,
                dateOfRelease: d.DateOfRelease ?? d.dateOfRelease,
                reduceFromRABStrength: d.ReduceFromRABStrength ?? d.reduceFromRABStrength
            }))
            .filter((r) => !!r.profileShift);
        if (!shifted.length) return null;
        // Newest first, so a re-entered member shows the shift that made them an ex-member now.
        shifted.sort((a, b) => String(b.dated ?? '').localeCompare(String(a.dated ?? '')));
        return shifted[0];
    }

    /** Most recent Previous RAB Service unit, matching the ex-member profile page. */
    private lastRabUnitName(list: VwPreviousRABServiceInfoModel[]): string {
        if (!list?.length) return 'N/A';
        const sorted = [...list].sort((a, b) => (b.serviceFrom ?? '').localeCompare(a.serviceFrom ?? ''));
        return sorted[0]?.rabUnitName || sorted[0]?.rabUnitNameBN || 'N/A';
    }

    private orgUnitName(orgId: number | null | undefined, orgUnits: any[]): string {
        if (orgId == null) return 'N/A';
        const match = (orgUnits ?? []).find((o) => (o.orgId ?? o.OrgId) === orgId);
        return match?.orgNameEN ?? match?.OrgNameEN ?? String(orgId);
    }

    private shortDate(value: string | null | undefined): string {
        if (!value) return 'N/A';
        const d = new Date(value);
        return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB');
    }

    onEmployeeSearchReset(): void {
        this.resetForm();
    }

    loadPersonalInfo(employee: any): void {
        const employeeId = employee.employeeID || employee.EmployeeID;
        if (!employeeId) return;

        // Fetch personal info from PersonalInfo API
        this.empService.getPersonalInfoByEmployeeId(employeeId).subscribe({
            next: (personalInfo: any) => {
                if (personalInfo) {
                    this.personalInfoExists = true;
                    this.populateFormWithPersonalInfo(personalInfo);
                    // When a record already exists, start in view (readonly) mode so the user
                    // explicitly opts into editing via the Edit button. Skip for embedMode,
                    // which is intentionally direct-edit (e.g., ex-member profile).
                    if (!this.embedMode) {
                        this.mode = 'view';
                        this.isReadonly = true;
                        this.personalInfoForm.disable();
                    }
                } else {
                    this.personalInfoExists = false;
                    this.fileRows = [];
                }
            },
            error: (err) => {
                console.error('Failed to load personal info', err);
                this.personalInfoExists = false;
            }
        });
    }

    populateFormWithPersonalInfo(data: any): void {
        // Convert Height (stored in inches) to Feet and Inch
        const heightInches = data.Height || data.height || 0;
        const heightFeet = Math.floor(heightInches / 12);
        const heightInch = heightInches % 12;

        // Convert Weight (stored in KG) to KG and Lbs
        const weightKg = data.Weight || data.weight || null;
        const weightLbs = weightKg ? Math.round(weightKg * 2.20462) : null;

        // Parse dropdown values - they may be stored as strings but need to match dropdown values
        const parseDropdownValue = (val: any) => {
            if (val === null || val === undefined || val === '') return null;
            const num = parseInt(val, 10);
            return isNaN(num) ? val : num;
        };

        // Multi-select fields are stored as a comma-separated id CSV (e.g. "12,45").
        // Parse into number[] for p-multiSelect; tolerate already-array values.
        const parseCsvIds = (val: any): number[] => {
            if (val === null || val === undefined || val === '') return [];
            if (Array.isArray(val)) return val.map((v) => parseInt(v, 10)).filter((n) => !isNaN(n));
            return String(val)
                .split(',')
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !isNaN(n));
        };

        this.personalInfoForm.patchValue(
            {
                bloodGroup: data.BloodGroup || data.bloodGroup || null,
                nidOld: data.NidOld || data.nidOld || '',
                nid: data.Nid || data.nid || '',
                mobileNo: data.MobileNo || data.mobileNo || '',
                mobileNoOfficial: data.MobileNoOfficial || data.mobileNoOfficial || '',
                emailAddress: data.Email || data.email || '',
                dateOfBirth: data.DOB ? new Date(data.DOB) : data.dob ? new Date(data.dob) : null,
                religion: parseDropdownValue(data.Religion || data.religion),
                passportNo: data.PassportNo || data.passportNo || '',
                identificationMark: data.IdentificationMark || data.identificationMark || '',
                maritalStatus: parseDropdownValue(data.MaritalStatus || data.maritalStatus),
                emergencyContactNo: data.EmergencyContact || data.emergencyContact || '',
                dateOfJoining: data.JoiningDate ? new Date(data.JoiningDate) : data.joiningDate ? new Date(data.joiningDate) : null,
                dateOfCommission: data.CommissionDate ? new Date(data.CommissionDate) : data.commissionDate ? new Date(data.commissionDate) : null,
                batch: parseDropdownValue(data.Batch || data.batch),
                investigationExperience: data.HasInvestigationExp || data.hasInvestigationExp || false,
                investigationExperienceDetails: data.InvestigationExpDetails || data.investigationExpDetails || '',
                professionalQualification: parseCsvIds(data.ProfessionalQualification || data.professionalQualification),
                personalQualification: parseCsvIds(data.PersonalQualification || data.personalQualification),
                gallantryAward: parseCsvIds(data.Awards || data.awards),
                lastEducationQualification: parseDropdownValue(data.LastEducationalQualification || data.lastEducationalQualification),
                medicalCategory: data.MedicalCategory ?? data.medicalCategory ?? null,
                tribal: data.Tribal !== undefined ? data.Tribal : data.tribal !== undefined ? data.tribal : null,
                freedomFighter: data.FreedomFighter !== undefined ? data.FreedomFighter : data.freedomFighter !== undefined ? data.freedomFighter : null,
                heightFeet: heightFeet || null,
                heightInch: heightInch || null,
                weightKg: weightKg,
                weightLbs: weightLbs,
                leavingStatus: data.LeavingStatus !== undefined ? data.LeavingStatus : data.leavingStatus !== undefined ? data.leavingStatus : null,
                drivingLicenseNo: data.DrivingLicenseNo || data.drivingLicenseNo || '',
                serviceIdCardNo: data.ServiceIdCardNo || data.serviceIdCardNo || '',
                presentStatus: data.PresentStatus || data.presentStatus || null
            },
            { emitEvent: false }
        ); // Prevent auto-conversion trigger during load

        this.showInvestigationExperience = data.HasInvestigationExp || data.hasInvestigationExp || false;

        // Load file references (same shape as emp-basic-info: [{ FileId, fileName }])
        const refsJson = data.FilesReferences || data.filesReferences;
        if (refsJson && typeof refsJson === 'string') {
            try {
                const refs = JSON.parse(refsJson) as { FileId?: number; fileName?: string }[];
                if (Array.isArray(refs)) {
                    this.fileRows = refs.map((r) => ({ displayName: r.fileName || '', file: null, fileId: r.FileId }));
                } else {
                    this.fileRows = [];
                }
            } catch {
                this.fileRows = [];
            }
        } else {
            this.fileRows = [];
        }
    }

    onFileRowsChange(event: FileRowData[]): void {
        if (event && Array.isArray(event)) {
            this.fileRows = event;
        }
    }

    onDownloadFile(payload: { fileId: number; fileName: string }): void {
        this.empService.downloadFile(payload.fileId).subscribe({
            next: (blob) => this.empService.triggerFileDownload(blob, payload.fileName || 'download'),
            error: (err) => {
                console.error('Download failed', err);
                this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message || 'Failed to download file' });
            }
        });
    }

    // Save or Update personal information (with file uploads like emp-basic-info)
    saveAll(): void {
        if (!this.selectedEmployeeId) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Warning',
                detail: 'Please search and select an employee first'
            });
            return;
        }

        const existingRefs = this.fileReferencesForm?.getExistingFileReferences() || [];
        const filesToUpload = this.fileReferencesForm?.getFilesToUpload() || [];

        const doSave = (filesReferencesJson: string | null) => {
            const personalInfoPayload = this.buildPersonalInfoPayload(filesReferencesJson);
            const saveOrUpdate$ = this.personalInfoExists ? this.empService.updatePersonalInfo(personalInfoPayload) : this.empService.savePersonalInfo(personalInfoPayload);

            saveOrUpdate$.subscribe({
                next: (res) => {
                    this.personalInfoExists = true;
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Personal information saved successfully!'
                    });
                    if (this.embedMode) {
                        this.saved.emit();
                    }
                },
                error: (err) => {
                    console.error('Failed to save/update personal info', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to save personal information'
                    });
                }
            });
        };

        if (filesToUpload.length > 0) {
            const uploads = filesToUpload.map((r: FileRowData) => this.empService.uploadEmployeeFile(r.file!, r.displayName?.trim() || r.file!.name, buildUploadOwnerTag(this.employeeBasicInfo?.rabid, this.selectedEmployeeId)));
            forkJoin(uploads).subscribe({
                next: (results: unknown) => {
                    const resultsArray = Array.isArray(results) ? results : [];
                    const newRefs = (resultsArray as { fileId: number; fileName: string }[]).map((r) => ({ FileId: r.fileId, fileName: r.fileName }));
                    const allRefs: { FileId: number; fileName: string }[] = [...existingRefs.map((r: { FileId: number; fileName: string }) => ({ FileId: r.FileId, fileName: r.fileName })), ...newRefs];
                    const filesReferencesJson = allRefs.length > 0 ? JSON.stringify(allRefs) : null;
                    doSave(filesReferencesJson);
                },
                error: (err) => {
                    console.error('Error uploading files', err);
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: err?.error?.message || 'Failed to upload one or more files'
                    });
                }
            });
            return;
        }

        const filesReferencesJson = existingRefs.length > 0 ? JSON.stringify(existingRefs) : null;
        doSave(filesReferencesJson);
    }

    /**
     * Formats a picked date as YYYY-MM-DD using local Y/M/D.
     * toISOString() would convert to UTC first and shift the date back a day in UTC+ zones.
     */
    private toLocalDateOnly(date: Date | string | null | undefined): string | null {
        if (!date) return null;
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    buildPersonalInfoPayload(filesReferencesJson?: string | null): any {
        const formValue = this.personalInfoForm.getRawValue();

        // Convert Feet/Inch to total inches for Height
        const heightFeet = formValue.heightFeet || 0;
        const heightInch = formValue.heightInch || 0;
        const totalHeightInches = heightFeet * 12 + heightInch;

        // Weight stored in KG
        const weightKg = formValue.weightKg || null;

        return {
            EmployeeID: this.selectedEmployeeId,
            Nid: formValue.nid,
            NidOld: formValue.nidOld,
            Email: formValue.emailAddress,
            BloodGroup: formValue.bloodGroup, // varchar(5) - value from CommonCode (e.g., "A+", "B+")
            MobileNo: formValue.mobileNo,
            MobileNoOfficial: formValue.mobileNoOfficial,
            DOB: this.toLocalDateOnly(formValue.dateOfBirth),
            Religion: formValue.religion ? formValue.religion.toString() : null,
            PassportNo: formValue.passportNo,
            IdentificationMark: formValue.identificationMark,
            MaritalStatus: formValue.maritalStatus ? formValue.maritalStatus.toString() : null,
            EmergencyContact: formValue.emergencyContactNo,
            JoiningDate: this.toLocalDateOnly(formValue.dateOfJoining),
            CommissionDate: this.toLocalDateOnly(formValue.dateOfCommission),
            Batch: formValue.batch ? formValue.batch.toString() : null,
            HasInvestigationExp: formValue.investigationExperience,
            InvestigationExpDetails: formValue.investigationExperienceDetails,
            // Multi-select: join selected ids into a CSV string, null when empty.
            ProfessionalQualification: formValue.professionalQualification?.length ? formValue.professionalQualification.join(',') : null,
            PersonalQualification: formValue.personalQualification?.length ? formValue.personalQualification.join(',') : null,
            Awards: formValue.gallantryAward?.length ? formValue.gallantryAward.join(',') : null,
            LastEducationalQualification: formValue.lastEducationQualification ? formValue.lastEducationQualification.toString() : null,
            MedicalCategory: formValue.medicalCategory,
            Tribal: formValue.tribal,
            FreedomFighter: formValue.freedomFighter,
            Height: totalHeightInches > 0 ? totalHeightInches : null,
            Weight: weightKg,
            LeavingStatus: formValue.leavingStatus,
            DrivingLicenseNo: formValue.drivingLicenseNo,
            ServiceIdCardNo: formValue.serviceIdCardNo,
            PresentStatus: formValue.presentStatus || null,
            FilesReferences: filesReferencesJson ?? undefined,
            CreatedBy: this.auditUser,
            CreatedDate: new Date().toISOString(),
            LastUpdatedBy: this.auditUser,
            Lastupdate: new Date().toISOString()
        };
    }

    resetForm(): void {
        this.personalInfoForm.reset({
            tribal: null,
            freedomFighter: null,
            investigationExperience: false,
            heightFeet: null,
            heightInch: null,
            weightKg: null,
            weightLbs: null,
            medicalCategory: null
        });
        this.employeeFound = false;
        this.selectedEmployeeId = null;
        this.employeeBasicInfo = null;
        this.fileRows = [];
        this.showInvestigationExperience = false;
        this.personalInfoExists = false;
    }
}
